/**
 * QA-only targeted Neon promotion probe — Sprint 11E Phase 2B.2D.3.
 * Chain: ownership → provisional create → same-snapshot staging → coverage →
 * canonical pair → attributed promote → authoritative reread → cleanup.
 * Never runs later required cases / progressive / official live matrix.
 */

import { randomUUID } from "node:crypto";

import {
  appendProvisionalStagingObjectRefs,
  type HeadlessProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  emptyPromotionAttribution,
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
  type HeadlessPromotionAttribution,
} from "@/features/headless-renderer/control-plane/testing";

import { checksumPrefix } from "./evidence";
import {
  buildLiveCanonicalPair,
  buildLiveDraft,
  casLiveCoverage,
  LIVE_CLOCK_MS,
} from "./live-fixtures";
import {
  assertPromotionProbeEvidenceSafe,
  createNotTestedPromotionProbeEvidence,
  defaultNeonPromotionProbeEvidencePath,
  preserveOrInitializeNeonPromotionProbeEvidence,
  PROMOTION_PROBE_ELIGIBILITY,
  PROMOTION_PROBE_EVIDENCE_TITLE,
  promotionProbeCannotFalsePass,
  writeNeonPromotionProbeEvidence,
  type NeonPromotionProbeEvidenceDocument,
} from "./promotion-probe-evidence";

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (env as Record<string, unknown>).HEADLESS_NEON_QA_PROMOTION_PROBE === "1";
}

async function cleanupProbeOwned(options: {
  readonly sql: ReturnType<typeof createNeonSqlExecutor>;
  readonly ownerId: string;
  readonly jobIds: readonly string[];
  readonly projectIds: readonly string[];
}): Promise<"ok" | "failed"> {
  const owners = [options.ownerId];
  try {
    await options.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      if (options.jobIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [options.jobIds, owners],
        );
      }
      if (options.projectIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [options.projectIds, owners],
        );
      }
    });
    const remaining = await options.sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const jobs = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
        [options.jobIds, owners],
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
        [options.projectIds, owners],
      );
      return {
        jobs: Number(jobs.rows[0]?.n ?? "1"),
        ownership: Number(ownership.rows[0]?.n ?? "1"),
      };
    });
    return remaining.jobs === 0 && remaining.ownership === 0 ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

function printAttribution(attribution: HeadlessPromotionAttribution): void {
  console.log(`  stage=${attribution.safeOperationStage}`);
  console.log(
    `  promotionResultKind=${attribution.promotionResultKind ?? "none"}`,
  );
  console.log(
    `  safeControlPlaneCode=${attribution.safeControlPlaneCode ?? "none"}`,
  );
  console.log(
    `  allowlistedSqlState=${attribution.allowlistedSqlState ?? "none"}`,
  );
  console.log(
    `  allowlistedConstraint=${attribution.allowlistedConstraint ?? "none"}`,
  );
  console.log(
    `  promotionReasonId=${attribution.promotionReasonId ?? "none"}`,
  );
  console.log(
    `  durableCanonicalRowExists=${
      attribution.durableCanonicalRowExists == null
        ? "none"
        : String(attribution.durableCanonicalRowExists)
    }`,
  );
  console.log(
    `  storeVersionDelta=${attribution.storeVersionDelta ?? "none"}`,
  );
  console.log(
    `  stageClassification=${attribution.stageClassification ?? "none"}`,
  );
}

export async function runNeonPromotionProbe(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
  options?: {
    readonly evidencePath?: string;
    readonly createSqlExecutor?: (
      connectionString: string,
    ) => ReturnType<typeof createNeonSqlExecutor>;
  },
): Promise<{
  readonly exitCode: number;
  readonly overall: NeonPromotionProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
}> {
  console.log("\nSprint 11E Phase 2B.2D.3 — Neon promotion probe\n");
  const evidencePath =
    options?.evidencePath ?? defaultNeonPromotionProbeEvidencePath();
  let connectionFactoryCalls = 0;

  if (!isGateOn(env)) {
    const preserved = preserveOrInitializeNeonPromotionProbeEvidence({
      evidencePath,
    });
    console.log(
      "  NOT TESTED — set HEADLESS_NEON_QA_PROMOTION_PROBE=1 and DATABASE_URL.",
    );
    console.log(
      `  Promotion-probe evidence ${preserved.action} (overall=${preserved.overall}). Zero database calls.`,
    );
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      connectionFactoryCalls: 0,
    };
  }

  if (classifyHeadlessNeonEnvironment(env) !== "configured") {
    const doc: NeonPromotionProbeEvidenceDocument = {
      ...createNotTestedPromotionProbeEvidence(),
      overall: "FAIL",
      eligibilityVerdict: PROMOTION_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: new Date().toISOString(),
      endedAtIso: new Date().toISOString(),
      cleanupStatus: "not_run",
      notes: [
        "Promotion probe evidence — does not overwrite progressive or official live evidence.",
        "CONFIGURATION UNAVAILABLE — no connection attempted.",
      ],
    };
    writeNeonPromotionProbeEvidence({ evidencePath, document: doc });
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
  }

  const connectionString = readConfiguredHeadlessDatabaseUrl(env);
  if (connectionString == null) {
    const doc: NeonPromotionProbeEvidenceDocument = {
      ...createNotTestedPromotionProbeEvidence(),
      overall: "FAIL",
      eligibilityVerdict: PROMOTION_PROBE_ELIGIBILITY.FAIL_CONFIG,
      startedAtIso: new Date().toISOString(),
      endedAtIso: new Date().toISOString(),
      cleanupStatus: "not_run",
      notes: [
        "Promotion probe evidence — does not overwrite progressive or official live evidence.",
        "CONFIGURATION UNAVAILABLE.",
      ],
    };
    writeNeonPromotionProbeEvidence({ evidencePath, document: doc });
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls: 0 };
  }

  const startedAtIso = new Date().toISOString();
  const createExecutor =
    options?.createSqlExecutor ??
    ((url: string) => {
      connectionFactoryCalls += 1;
      return createNeonSqlExecutor({ connectionString: url });
    });
  const sql = createExecutor(connectionString);

  console.log("  schema preflight…");
  const preflight = await runHeadlessSchemaPreflight({ sql });
  if (!preflight.ok) {
    const doc: NeonPromotionProbeEvidenceDocument = {
      title: PROMOTION_PROBE_EVIDENCE_TITLE,
      overall: "FAIL",
      eligibilityVerdict: PROMOTION_PROBE_ELIGIBILITY.FAIL,
      startedAtIso,
      endedAtIso: new Date().toISOString(),
      attribution: {
        ...emptyPromotionAttribution("promotion"),
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode:
          preflight.code === "DATABASE_UNAVAILABLE"
            ? "DATABASE_UNAVAILABLE"
            : null,
        promotionReasonId: "unknown_safe_failure",
      },
      cleanupStatus: "not_run",
      schemaFingerprint: null,
      notes: [
        "Promotion probe evidence — does not overwrite progressive or official live evidence.",
        "Schema preflight failed before promotion chain.",
      ],
    };
    writeNeonPromotionProbeEvidence({ evidencePath, document: doc });
    console.log(`  FAIL — schema preflight: ${preflight.code}`);
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
  }
  console.log("  schema preflight: ok");

  const runId = randomUUID();
  const ownerId = `owner_pp_${runId.replace(/-/g, "").slice(0, 16)}`;
  const projectId = randomUUID();
  const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
  const store = new NeonHeadlessJobStoreAdapter(sql);
  const createdJobIds: string[] = [];
  const createdProjectIds: string[] = [projectId];

  let attribution = emptyPromotionAttribution("promotion");
  let durablePass = false;

  const principal = {
    ownerId,
    sessionId: `sess-pp-${runId}`,
  };

  try {
    const claimed = await auth.claimUnownedProject(principal, projectId);
    if (!claimed.ok) {
      attribution = {
        ...emptyPromotionAttribution("promotion"),
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode: claimed.issues[0]?.code ?? null,
        promotionReasonId: "unknown_safe_failure",
      };
      throw new Error("PROBE_STOP");
    }

    const draftCtx = await buildLiveDraft({
      runId,
      ownerId,
      projectId,
      emptyStaging: true,
      randomUUID,
    });
    createdJobIds.push(draftCtx.jobId);

    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    if (!created.ok || created.value.kind !== "created") {
      attribution = {
        ...emptyPromotionAttribution("promotion"),
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode: created.ok
          ? null
          : (created.issues[0]?.code ?? null),
        promotionReasonId: "unknown_safe_failure",
        stageClassification: "provisional",
        durableCanonicalRowExists: false,
      };
      throw new Error("PROBE_STOP");
    }

    let provisional = created.value.record as HeadlessProvisionalStoredJobRecord;
    const fullRefs = draftCtx.authoritativeStagingObjectRefs;
    const appended = appendProvisionalStagingObjectRefs(
      provisional,
      fullRefs,
      LIVE_CLOCK_MS + 500,
    );
    if (!appended.ok) {
      attribution = {
        ...emptyPromotionAttribution("promotion"),
        promotionResultKind: "rejected",
        promotionReasonId: "unknown_safe_failure",
        stageClassification: "provisional",
        durableCanonicalRowExists: false,
      };
      throw new Error("PROBE_STOP");
    }
    const staged = await store.compareAndSetProvisional({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: provisional.storeVersion,
      next: appended.record,
    });
    if (!staged.ok || staged.value.kind !== "updated") {
      attribution = {
        ...emptyPromotionAttribution("promotion"),
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode: staged.ok
          ? null
          : (staged.issues[0]?.code ?? null),
        promotionReasonId: "unknown_safe_failure",
        stageClassification: "provisional",
        durableCanonicalRowExists: false,
      };
      throw new Error("PROBE_STOP");
    }
    provisional = staged.value.record as HeadlessProvisionalStoredJobRecord;

    const coverage = await casLiveCoverage(
      store,
      provisional,
      provisional.verificationCoverage.requiredTargets,
    );
    if (!coverage.ok) {
      attribution = {
        ...emptyPromotionAttribution("promotion_preflight"),
        promotionResultKind: "rejected",
        promotionReasonId: "coverage_incomplete",
        stageClassification: "provisional",
        durableCanonicalRowExists: false,
        storeVersionDelta: "unchanged",
      };
      throw new Error("PROBE_STOP");
    }
    provisional = coverage.record;

    attribution = emptyPromotionAttribution("canonical_pair_construction");
    const pair = buildLiveCanonicalPair(
      draftCtx.manifest,
      draftCtx.seeded.bundle,
      provisional,
    );
    if (!pair.ok) {
      attribution = {
        ...emptyPromotionAttribution("canonical_pair_construction"),
        promotionResultKind: "rejected",
        promotionReasonId: "canonical_pair_invalid",
        stageClassification: "provisional",
        durableCanonicalRowExists: false,
        storeVersionDelta: "unchanged",
      };
      throw new Error("PROBE_STOP");
    }

    const attributed = await store.promoteProvisionalToCanonicalAttributed({
      jobId: provisional.jobId,
      ownerId: provisional.ownerId,
      expectedStoreVersion: provisional.storeVersion,
      expectedOperationId: provisional.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    attribution = attributed.attribution;

    const promoted = attributed.result;
    if (!promoted.ok || promoted.value.kind !== "updated") {
      throw new Error("PROBE_STOP");
    }

    const reread = await store.getByJobIdAndOwner(
      provisional.jobId,
      provisional.ownerId,
    );
    if (
      !reread.ok ||
      reread.value.stage !== "canonical" ||
      reread.value.storeVersion !== provisional.storeVersion + 1
    ) {
      attribution = {
        ...attribution,
        safeOperationStage: "promotion_post_write",
        promotionResultKind: "control_plane_failure",
        promotionReasonId: "post_write_coherence_failed",
        durableCanonicalRowExists: reread.ok && reread.value.stage === "canonical",
        storeVersionDelta:
          reread.ok && reread.value.storeVersion === provisional.storeVersion + 1
            ? "plus_one"
            : "unexpected",
        stageClassification:
          reread.ok && reread.value.stage === "canonical"
            ? "canonical"
            : "provisional",
      };
      throw new Error("PROBE_STOP");
    }

    durablePass =
      attribution.promotionResultKind === "updated" &&
      attribution.durableCanonicalRowExists === true &&
      attribution.stageClassification === "canonical" &&
      attribution.storeVersionDelta === "plus_one";
  } catch {
    // attribution already set; continue to cleanup
  }

  const cleanupStatus = await cleanupProbeOwned({
    sql,
    ownerId,
    jobIds: createdJobIds,
    projectIds: createdProjectIds,
  });

  let overall: NeonPromotionProbeEvidenceDocument["overall"] =
    durablePass && cleanupStatus === "ok" ? "PASS" : "FAIL";
  let eligibilityVerdict =
    overall === "PASS"
      ? PROMOTION_PROBE_ELIGIBILITY.PASS
      : cleanupStatus === "failed"
        ? PROMOTION_PROBE_ELIGIBILITY.FAIL_CLEANUP
        : PROMOTION_PROBE_ELIGIBILITY.FAIL;

  if (
    !promotionProbeCannotFalsePass({
      overall,
      attribution,
      cleanupStatus,
    })
  ) {
    overall = "FAIL";
    eligibilityVerdict = PROMOTION_PROBE_ELIGIBILITY.FAIL;
  }

  const document: NeonPromotionProbeEvidenceDocument = {
    title: PROMOTION_PROBE_EVIDENCE_TITLE,
    overall,
    eligibilityVerdict,
    startedAtIso,
    endedAtIso: new Date().toISOString(),
    attribution,
    cleanupStatus,
    schemaFingerprint: {
      migrationIds: preflight.fingerprint.migrationIds,
      checksumPrefixes: preflight.fingerprint.checksums.map(checksumPrefix),
    },
    notes: [
      "Promotion probe evidence — does not overwrite progressive or official live evidence.",
      "Stops after promotion attribution; does not run later required cases.",
      `connectionFactoryCalls=${connectionFactoryCalls}`,
    ],
  };

  const serialized = JSON.stringify(document);
  if (!assertPromotionProbeEvidenceSafe(serialized)) {
    writeNeonPromotionProbeEvidence({
      evidencePath,
      document: {
        ...createNotTestedPromotionProbeEvidence(),
        overall: "FAIL",
        eligibilityVerdict: PROMOTION_PROBE_ELIGIBILITY.FAIL,
        startedAtIso,
        endedAtIso: new Date().toISOString(),
        attribution: emptyPromotionAttribution("promotion"),
        cleanupStatus,
        notes: [
          "Promotion probe evidence — does not overwrite progressive or official live evidence.",
          "Evidence rejected — unsafe content.",
        ],
      },
    });
    console.log("  FAIL — evidence rejected as unsafe.");
    return { exitCode: 1, overall: "FAIL", connectionFactoryCalls };
  }

  writeNeonPromotionProbeEvidence({ evidencePath, document });
  printAttribution(attribution);
  console.log(`  cleanup=${cleanupStatus}`);
  console.log(`  evidence=${evidencePath}`);
  console.log(
    overall === "PASS"
      ? "  PASS — promotion durably canonical; later matrix blocked."
      : "  FAIL — promotion probe stopped after attribution.",
  );
  return {
    exitCode: overall === "PASS" ? 0 : 1,
    overall,
    connectionFactoryCalls,
  };
}
