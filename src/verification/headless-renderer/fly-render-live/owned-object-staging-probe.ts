/**
 * QA-only targeted owned-object staging probe — Sprint 11E Phase 2E.2D.8C.1.
 * Stages manifest, bundle, and asset_bytes records then rereads for coherence.
 * Stops before R2 upload, reconciliation, promotion, outbox, or enqueue.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
} from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultFlyRenderLiveCleanup } from "./cleanup";
import { buildLiveDraft } from "../neon-live/live-fixtures";
import { trackJobId, trackProjectId } from "../r2-live/live-fixtures";
import { deriveFlyRenderJobCreateStagingPayloads } from "./job-create-fixture-identity";
import { runOwnedObjectStagingRecordChain } from "./owned-object-staging-chain";
import {
  buildOwnedObjectStagingAttributionSnapshot,
  classifyStagingSlotKeyLengthClass,
} from "./owned-object-staging-attribution";
import {
  assertOwnedObjectStagingProbeEvidenceSafe,
  createNotTestedFlyRenderOwnedObjectStagingProbeEvidence,
  defaultFlyRenderOwnedObjectStagingProbeEvidencePath,
  OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY,
  ownedObjectStagingProbeCannotFalsePass,
  preserveOrInitializeFlyRenderOwnedObjectStagingProbeEvidence,
  writeFlyRenderOwnedObjectStagingProbeEvidence,
  type FlyRenderOwnedObjectStagingProbeEvidenceDocument,
} from "./owned-object-staging-probe-evidence";
import {
  attributeFlyRenderLiveEnvironment,
  isFlyRenderLiveConfigAttributionEligible,
  validateFlyRenderLiveQaEnvContract,
} from "./qa-secret-contract";
import { emptyFlyRenderLiveSession } from "./types";
import type { FlyRenderLiveMatrixContext } from "./types";

export const HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_STAGING_PROBE_GATE =
  "HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_STAGING_PROBE" as const;

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  return (
    (env as Record<string, unknown>)[
      HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_STAGING_PROBE_GATE
    ] === "1"
  );
}

export type FlyRenderOwnedObjectStagingProbeDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly forceGateOn?: boolean;
  readonly injectedSql?: HeadlessSqlExecutor;
  readonly cleanupRunner?: typeof defaultFlyRenderLiveCleanup;
  readonly nowIso?: () => string;
  readonly connectionProbe?: () => void;
};

export async function runFlyRenderOwnedObjectStagingProbe(
  deps: FlyRenderOwnedObjectStagingProbeDeps = {},
): Promise<{
  readonly exitCode: number;
  readonly overall: FlyRenderOwnedObjectStagingProbeEvidenceDocument["overall"];
  readonly connectionFactoryCalls: number;
  readonly providerMutationCalls: number;
}> {
  console.log(
    "\nSprint 11E Phase 2E.2D.8C.1 — Fly render owned-object staging probe\n",
  );
  const env = deps.env ?? process.env;
  const evidencePath =
    deps.evidencePath ?? defaultFlyRenderOwnedObjectStagingProbeEvidencePath();
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  let connectionFactoryCalls = 0;
  let providerMutationCalls = 0;

  if (!deps.forceGateOn && !isGateOn(env)) {
    const preserved = preserveOrInitializeFlyRenderOwnedObjectStagingProbeEvidence(
      evidencePath,
    );
    console.log(
      "  NOT TESTED — set HEADLESS_FLY_RENDER_QA_OWNED_OBJECT_STAGING_PROBE=1 with Neon staging.",
    );
    console.log(
      `  Staging probe evidence ${preserved.action} (overall=${preserved.overall}). Zero connections.`,
    );
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      connectionFactoryCalls: 0,
      providerMutationCalls: 0,
    };
  }

  const configAttribution = attributeFlyRenderLiveEnvironment(env);
  const envContract = validateFlyRenderLiveQaEnvContract(env);
  if (
    !isFlyRenderLiveConfigAttributionEligible(configAttribution) ||
    !envContract.ok
  ) {
    writeFlyRenderOwnedObjectStagingProbeEvidence({
      evidencePath,
      document: {
        ...createNotTestedFlyRenderOwnedObjectStagingProbeEvidence([
          "Gate on but Neon QA secret contract incomplete.",
          "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY.FAIL_CONFIG,
        startedAtIso: nowIso(),
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
      },
    });
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls: 0,
      providerMutationCalls: 0,
    };
  }

  const startedAtIso = nowIso();
  let sql: HeadlessSqlExecutor | null = null;
  let matrixCtx: FlyRenderLiveMatrixContext | null = null;
  let substages: FlyRenderOwnedObjectStagingProbeEvidenceDocument["substages"] =
    [];
  let failureSubstage: string | null = null;
  let failureReasonId: string | null = null;
  let stagingAttribution:
    | FlyRenderOwnedObjectStagingProbeEvidenceDocument["stagingAttribution"]
    | null = null;
  let stagedRecordCount = 0;
  let cleanupStatus: FlyRenderOwnedObjectStagingProbeEvidenceDocument["cleanupStatus"] =
    "not_run";

  try {
    if (deps.injectedSql != null) {
      sql = deps.injectedSql;
    } else {
      deps.connectionProbe?.();
      connectionFactoryCalls += 1;
      providerMutationCalls += 1;
      const connectionString = readConfiguredHeadlessDatabaseUrl(env);
      if (connectionString == null) throw new Error("neon_unconfigured");
      sql = createNeonSqlExecutor({ connectionString });
    }

    if (classifyHeadlessNeonEnvironment(env) !== "configured") {
      throw new Error("neon_unconfigured");
    }
    if (classifyHeadlessR2Environment(env) !== "configured") {
      throw new Error("r2_unconfigured");
    }

    const preflight = await runHeadlessSchemaPreflight({ sql: sql! });
    if (!preflight.ok) throw new Error("schema_preflight_failed");

    readConfiguredHeadlessR2Config(env);

    const runId = randomUUID();
    const ownerId = `owner_oosp_${runId.replace(/-/g, "").slice(0, 16)}`;
    const projectId = randomUUID();

    const ctx: FlyRenderLiveMatrixContext = {
      runId,
      ownerId,
      otherOwnerId: `other_oosp_${runId.slice(0, 8)}`,
      projectId,
      nowMs: Date.now(),
      sql: sql!,
      jobStore: new NeonHeadlessJobStoreAdapter(sql!),
      ownedObjectStore: new NeonHeadlessOwnedObjectStoreAdapter(sql!),
      projectAuthorization: new NeonHeadlessProjectAuthorizationAdapter(sql!),
      io: {
        writeUploadStream: async () => ({
          ok: false as const,
          issues: [{ code: "PROBE_BLOCKED", message: "blocked" }],
        }),
      } as never,
      uploadCapability: {
        issueDirectPutCapability: async () => ({
          ok: false as const,
          issues: [{ code: "PROBE_BLOCKED", message: "blocked" }],
        }),
      } as never,
      downloadCapability: null,
      r2Config: readConfiguredHeadlessR2Config(env)!,
      createdJobIds: [],
      createdProjectIds: [],
      createdObjectIds: [],
      createdR2Locators: [],
      session: emptyFlyRenderLiveSession(),
      env,
      flyAppName: "staging-probe-local-only",
      acceptedImageDigestSha256: "probe",
      restProducer: null,
      tcpConsumer: null,
      streamNames: deriveHeadlessQueueStreamNames("staging"),
      streamAuthority: "production_env",
      dispatchOutbox: {
        createIntentIfAbsent: async () => ({
          ok: false as const,
          issues: [{ code: "PROBE_BLOCKED", message: "blocked" }],
        }),
      } as never,
      preflightFingerprint: null,
      trackedStreamIds: [],
      runOwnedActiveStreamIds: [],
      smokePollTimeoutMs: 180_000,
      smokeContentDurationMs: 2_000,
      resourceObservation: null,
    };
    matrixCtx = ctx;

    trackProjectId(ctx, projectId);
    const claimed = await ctx.projectAuthorization.claimUnownedProject(
      { ownerId, sessionId: `oosp_${runId.slice(0, 8)}` },
      projectId,
    );
    if (!claimed.ok) {
      const access = await ctx.projectAuthorization.assertProjectAccess(
        { ownerId, sessionId: `oosp_${runId.slice(0, 8)}` },
        projectId,
      );
      if (!access.ok) throw new Error("project_ownership_failed");
    }

    const draftCtx = await buildLiveDraft({
      runId,
      ownerId,
      projectId,
      emptyStaging: true,
      creatorKey: `fly-render-staging-probe-${runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    if (!created.ok || created.value.kind !== "created") {
      throw new Error("provisional_create_failed");
    }
    ctx.session.jobId = draftCtx.jobId;
    ctx.session.operationId = draftCtx.operationId;
    trackJobId(ctx, draftCtx.jobId);

    const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx);
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads,
      jobId: draftCtx.jobId,
      operationId: draftCtx.operationId,
    });
    substages = chain.substages;
    if (!chain.ok) {
      failureSubstage = chain.failureSubstage;
      failureReasonId = chain.failureReasonId;
      stagingAttribution = chain.stagingAttribution;
      throw new Error("PROBE_ATTRIBUTED_FAIL");
    }
    stagedRecordCount = chain.staged.length;
    const lastAsset = payloads.filter((p) => p.purpose === "asset_bytes").at(-1);
    stagingAttribution = buildOwnedObjectStagingAttributionSnapshot({
      stagingSubstage: "staging_coherence_assertion",
      objectPurposeClass: "asset_bytes",
      slotKeyClass: lastAsset?.slotKey == null ? "null" : "hslot_v2",
      slotKeyLengthClass: classifyStagingSlotKeyLengthClass({
        slotKey: lastAsset?.slotKey,
      }),
      storeClass: "assets",
      resultKind: "created",
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message !== "PROBE_ATTRIBUTED_FAIL" &&
      failureSubstage == null
    ) {
      failureSubstage = "staging_input_construction";
      failureReasonId = "staging_input_construction_failed";
    }
  } finally {
    if (matrixCtx != null) {
      const cleanupRunner = deps.cleanupRunner ?? defaultFlyRenderLiveCleanup;
      cleanupStatus = await cleanupRunner(matrixCtx, false);
    }
  }

  const pass =
    failureSubstage == null &&
    failureReasonId == null &&
    stagedRecordCount >= 5 &&
    (cleanupStatus === "ok" || cleanupStatus === "preserved");

  const overall: FlyRenderOwnedObjectStagingProbeEvidenceDocument["overall"] =
    pass ? "PASS" : "FAIL";
  const eligibilityVerdict =
    cleanupStatus === "failed"
      ? OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY.FAIL_CLEANUP
      : pass
        ? OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY.PASS
        : OWNED_OBJECT_STAGING_PROBE_ELIGIBILITY.FAIL;

  const document: FlyRenderOwnedObjectStagingProbeEvidenceDocument = {
    title:
      "Sprint 11E Phase 2E.2D.8C.1 — Fly render owned-object staging probe",
    overall,
    eligibilityVerdict,
    startedAtIso,
    endedAtIso: nowIso(),
    failureSubstage,
    failureReasonId,
    substages,
    stagingAttribution,
    stagedRecordCount,
    cleanupStatus,
    notes: [
      "Uses the same single-materialization fixture as the official matrix.",
      "Stages manifest, asset_bundle_record, and asset_bytes in canonical order.",
      "Stops before R2 upload, reconciliation, promotion, outbox, or enqueue.",
      "Safe with active workers — no queued job or dispatch intent created.",
      "Does not overwrite docs/evidence/headless/current/HEADLESS_11E_FLY_RENDER_LIVE_EVIDENCE.md.",
    ],
  };

  writeFlyRenderOwnedObjectStagingProbeEvidence({ evidencePath, document });
  const safe = assertOwnedObjectStagingProbeEvidenceSafe(
    readFileSync(evidencePath, "utf8"),
  );
  if (!safe.ok) {
    console.error(`  Evidence safety rejected: ${safe.message}`);
    return {
      exitCode: 1,
      overall: "FAIL",
      connectionFactoryCalls,
      providerMutationCalls,
    };
  }

  if (overall === "PASS") {
    const authority = ownedObjectStagingProbeCannotFalsePass(document);
    if (!authority.ok) {
      console.error(`  False PASS rejected: ${authority.message}`);
      return {
        exitCode: 1,
        overall: "FAIL",
        connectionFactoryCalls,
        providerMutationCalls,
      };
    }
  }

  console.log(`  Overall: ${overall}`);
  console.log(`  Staged records: ${stagedRecordCount}`);
  console.log(`  Cleanup: ${cleanupStatus}`);
  if (failureSubstage != null) {
    console.log(`  Failure substage: ${failureSubstage}`);
    console.log(`  Failure reasonId: ${failureReasonId ?? "none"}`);
  }

  return {
    exitCode: overall === "PASS" ? 0 : 1,
    overall,
    connectionFactoryCalls,
    providerMutationCalls,
  };
}
