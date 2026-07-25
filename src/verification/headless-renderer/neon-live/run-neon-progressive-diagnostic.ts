/**
 * Gated progressive Neon diagnostic — same production adapters, stop-on-first-fail.
 * Writes only canonical validated evidence; never overwrites official live evidence.
 * Gate off → zero Neon connections; preserves prior progressive PASS/FAIL.
 */

import { randomUUID } from "node:crypto";

import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import type { NeonLiveSessionAttribution } from "./case-step";
import { checksumPrefix } from "./evidence";
import type { NeonLiveInjectionPoint } from "./injection";
import { runNeonLiveMatrix } from "./live-matrix";
import {
  sanitizeProgressiveControlPlaneCode,
} from "./progressive-diagnostic-allowlists";
import {
  defaultNeonProgressiveEvidencePath,
  preserveOrInitializeNeonProgressiveEvidence,
  writeNeonProgressiveEvidence,
  type NeonProgressiveDiagnosticDocument,
} from "./progressive-evidence";
import {
  buildProgressiveEvidenceNotes,
  PROGRESSIVE_ELIGIBILITY,
  PROGRESSIVE_EVIDENCE_TITLE,
  PROGRESSIVE_NOTE_REGISTRY,
  validateNeonProgressiveEvidence,
} from "./progressive-evidence-authority";
import {
  emptyPromotionDiagnosticFields,
  sanitizePromotionDiagnosticFields,
} from "./promotion-diagnostic";
import { REQUIRED_NEON_LIVE_CASE_IDS } from "./required-cases";
import type { NeonLiveMatrixContext } from "./types";

export type NeonProgressiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | { readonly exitCode: 1; readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE" };

export type NeonProgressiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly createSqlExecutor?: (connectionString: string) => HeadlessSqlExecutor;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly writeEvidence?: typeof writeNeonProgressiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeNeonProgressiveEvidence;
  readonly nowIso?: () => string;
  readonly randomUUID?: () => string;
  readonly forceGateOn?: boolean;
  readonly injectedExecutor?: HeadlessSqlExecutor;
  readonly assumeConfigured?: boolean;
  readonly injectThrowAt?: NeonLiveInjectionPoint;
  readonly caseRunner?: (
    ctx: NeonLiveMatrixContext,
  ) => Promise<{
    readonly cases: NeonProgressiveDiagnosticDocument["cases"];
    readonly attribution: NeonLiveSessionAttribution;
  }>;
  readonly cleanupRunner?: (
    ctx: NeonLiveMatrixContext,
  ) => Promise<"ok" | "failed" | "preserved">;
};

function isProgressiveGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_NEON_QA_PROGRESSIVE === "1";
  } catch {
    return false;
  }
}

async function defaultCleanup(
  ctx: NeonLiveMatrixContext,
): Promise<"ok" | "failed" | "preserved"> {
  const owners = [ctx.ownerId, ctx.otherOwnerId];
  try {
    await ctx.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      if (ctx.createdJobIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdJobIds, owners],
        );
      }
      if (ctx.createdProjectIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdProjectIds, owners],
        );
      }
    });

    const remaining = await ctx.sql.withClient(async (client) => {
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
        [ctx.createdJobIds, owners],
      );
      const ownership = await client.query<{ n: string }>(
        `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
        [ctx.createdProjectIds, owners],
      );
      return {
        jobs: Number(jobs.rows[0]?.n ?? "1"),
        ownership: Number(ownership.rows[0]?.n ?? "1"),
      };
    });
    if (remaining.jobs !== 0 || remaining.ownership !== 0) {
      return "failed";
    }
    return "ok";
  } catch {
    return "failed";
  }
}

function emptyAttribution(): NeonLiveSessionAttribution {
  return {
    lastCompletedRequiredCase: null,
    activeFailedCase: null,
    safeOperationStage: null,
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
  };
}

function preflightEligibility(
  code: string,
): (typeof PROGRESSIVE_ELIGIBILITY)[keyof typeof PROGRESSIVE_ELIGIBILITY] {
  if (code === "SCHEMA_MISSING") return PROGRESSIVE_ELIGIBILITY.FAIL_PREFLIGHT_MISSING;
  if (code === "SCHEMA_DRIFT") return PROGRESSIVE_ELIGIBILITY.FAIL_PREFLIGHT_DRIFT;
  if (code === "SCHEMA_INCOHERENT") {
    return PROGRESSIVE_ELIGIBILITY.FAIL_PREFLIGHT_INCOHERENT;
  }
  return PROGRESSIVE_ELIGIBILITY.FAIL_MATRIX;
}

function writeValidated(options: {
  readonly evidencePath: string;
  readonly writeEvidence: typeof writeNeonProgressiveEvidence;
  readonly document: NeonProgressiveDiagnosticDocument;
  readonly expectedMigrationIds?: readonly string[];
  readonly expectedChecksumPrefixes?: readonly string[];
}): boolean {
  const validated = validateNeonProgressiveEvidence({
    document: options.document,
    expectedMigrationIds: options.expectedMigrationIds,
    expectedChecksumPrefixes: options.expectedChecksumPrefixes,
  });
  if (!validated.ok) {
    const fallback = validateNeonProgressiveEvidence({
      document: {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_MATRIX,
        startedAtIso: options.document.startedAtIso ?? new Date().toISOString(),
        endedAtIso: options.document.endedAtIso ?? new Date().toISOString(),
        lastCompletedRequiredCase: null,
        activeFailedCase: "matrix.exception",
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases: [
          {
            caseId: "matrix.exception",
            status: "FAIL",
            failureCategory: "MATRIX_EXCEPTION",
          },
        ],
        schemaFingerprint: null,
        cleanupStatus: "not_run",
        notes: [
          PROGRESSIVE_NOTE_REGISTRY[0],
          PROGRESSIVE_NOTE_REGISTRY[1],
          PROGRESSIVE_NOTE_REGISTRY[7],
        ],
      },
    });
    if (fallback.ok) {
      options.writeEvidence({
        evidencePath: options.evidencePath,
        document: fallback.document,
      });
    }
    return false;
  }
  options.writeEvidence({
    evidencePath: options.evidencePath,
    document: validated.document,
  });
  return true;
}

/**
 * Progressive diagnostic harness.
 * Gate-off: exit 0, NOT_TESTED, zero DB calls, preserve prior progressive evidence.
 */
export async function runNeonProgressiveDiagnostic(
  deps: NeonProgressiveHarnessDeps = {},
): Promise<NeonProgressiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultNeonProgressiveEvidencePath();
  const writeEvidence = deps.writeEvidence ?? writeNeonProgressiveEvidence;
  const preserveEvidence =
    deps.preserveEvidence ?? preserveOrInitializeNeonProgressiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const uuid = deps.randomUUID ?? randomUUID;

  const gateOn = deps.forceGateOn === true || isProgressiveGateOn(env);

  if (!gateOn) {
    const preserved = preserveEvidence({ evidencePath });
    console.log(
      "  NOT TESTED — set HEADLESS_NEON_QA_PROGRESSIVE=1 and DATABASE_URL to enable.",
    );
    console.log(
      `  Progressive evidence ${preserved.action} (overall=${preserved.overall}). Zero database calls. Official live evidence untouched.`,
    );
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  const startedAtIso = nowIso();
  let connectionCalls = 0;

  const classify =
    deps.assumeConfigured === true
      ? ("configured" as const)
      : classifyHeadlessNeonEnvironment(env);

  if (deps.injectedExecutor == null && classify !== "configured") {
    writeValidated({
      evidencePath,
      writeEvidence,
      document: {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_CONFIG,
        startedAtIso,
        endedAtIso: nowIso(),
        lastCompletedRequiredCase: null,
        activeFailedCase: null,
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases: [],
        schemaFingerprint: null,
        cleanupStatus: "not_run",
        notes: [
          PROGRESSIVE_NOTE_REGISTRY[0],
          PROGRESSIVE_NOTE_REGISTRY[1],
          PROGRESSIVE_NOTE_REGISTRY[4],
        ],
      },
    });
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const connectionString =
    deps.injectedExecutor != null
      ? "injected"
      : readConfiguredHeadlessDatabaseUrl(env);
  if (deps.injectedExecutor == null && connectionString == null) {
    writeValidated({
      evidencePath,
      writeEvidence,
      document: {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_CONFIG_URL,
        startedAtIso,
        endedAtIso: nowIso(),
        lastCompletedRequiredCase: null,
        activeFailedCase: null,
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases: [],
        schemaFingerprint: null,
        cleanupStatus: "not_run",
        notes: [
          PROGRESSIVE_NOTE_REGISTRY[0],
          PROGRESSIVE_NOTE_REGISTRY[1],
          PROGRESSIVE_NOTE_REGISTRY[5],
        ],
      },
    });
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const createExecutor =
    deps.createSqlExecutor ??
    ((url: string) => {
      connectionCalls += 1;
      return createNeonSqlExecutor({ connectionString: url });
    });

  const sql =
    deps.injectedExecutor ?? createExecutor(connectionString as string);

  const preflightFn = deps.runSchemaPreflight ?? runHeadlessSchemaPreflight;
  const preflight = await preflightFn({ sql });
  if (!preflight.ok) {
    writeValidated({
      evidencePath,
      writeEvidence,
      document: {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: preflightEligibility(preflight.code),
        startedAtIso,
        endedAtIso: nowIso(),
        lastCompletedRequiredCase: null,
        activeFailedCase: null,
        safeOperationStage: "schema_preflight",
        safeControlPlaneCode: sanitizeProgressiveControlPlaneCode(preflight.code),
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases: [],
        schemaFingerprint: null,
        cleanupStatus: "not_run",
        notes: [
          PROGRESSIVE_NOTE_REGISTRY[0],
          PROGRESSIVE_NOTE_REGISTRY[1],
          PROGRESSIVE_NOTE_REGISTRY[6],
        ],
      },
    });
    console.log(`  FAIL — schema preflight: ${preflight.code}`);
    return { exitCode: 1, overall: "FAIL" };
  }

  const runId = uuid();
  const ownerId = `owner_prog_${runId.replace(/-/g, "").slice(0, 16)}`;
  const otherOwnerId = `owner_pother_${runId.replace(/-/g, "").slice(0, 16)}`;
  const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
  const store = new NeonHeadlessJobStoreAdapter(sql);
  const ctx: NeonLiveMatrixContext = {
    runId,
    ownerId,
    otherOwnerId,
    sql,
    auth,
    store,
    createdJobIds: [],
    createdProjectIds: [],
    uuid,
    injectThrowAt: deps.injectThrowAt,
  };

  let attribution = emptyAttribution();
  let cases: NeonProgressiveDiagnosticDocument["cases"] = [];
  let bootstrapException = false;
  try {
    const run = deps.caseRunner
      ? await deps.caseRunner(ctx)
      : await runNeonLiveMatrix(ctx);
    cases = run.cases;
    attribution = run.attribution;
  } catch {
    bootstrapException = true;
    cases = [
      {
        caseId: "matrix.exception",
        status: "FAIL",
        failureCategory: "MATRIX_EXCEPTION",
      },
    ];
    attribution = {
      ...emptyAttribution(),
      activeFailedCase: "matrix.exception",
      safeOperationStage: "matrix_bootstrap",
    };
  }

  let cleanupStatus: NeonProgressiveDiagnosticDocument["cleanupStatus"] =
    "not_run";
  try {
    cleanupStatus = deps.cleanupRunner
      ? await deps.cleanupRunner(ctx)
      : await defaultCleanup(ctx);
  } catch {
    cleanupStatus = "failed";
  }

  const endedAtIso = nowIso();
  const checksumPrefixes = preflight.fingerprint.checksums.map(checksumPrefix);
  const migrationIds = preflight.fingerprint.migrationIds;

  const candidatePass: NeonProgressiveDiagnosticDocument = {
    title: PROGRESSIVE_EVIDENCE_TITLE,
    overall: "PASS",
    eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.PASS,
    startedAtIso,
    endedAtIso,
    lastCompletedRequiredCase:
      REQUIRED_NEON_LIVE_CASE_IDS[REQUIRED_NEON_LIVE_CASE_IDS.length - 1]!,
    activeFailedCase: null,
    safeOperationStage: null,
    safeControlPlaneCode: null,
    allowlistedSqlState: null,
    allowlistedConstraint: null,
    ...emptyPromotionDiagnosticFields(),
    cases,
    schemaFingerprint: { migrationIds, checksumPrefixes },
    cleanupStatus: "ok",
    notes: buildProgressiveEvidenceNotes({
      connectionFactoryCalls: connectionCalls,
      casesRecorded: cases.length,
    }),
  };

  const passValidated =
    !bootstrapException &&
    cleanupStatus === "ok" &&
    validateNeonProgressiveEvidence({
      document: candidatePass,
      expectedMigrationIds: migrationIds,
      expectedChecksumPrefixes: checksumPrefixes,
    });

  if (passValidated && passValidated.ok) {
    writeEvidence({
      evidencePath,
      document: passValidated.document,
    });
    console.log(
      `  lastCompleted=${passValidated.document.lastCompletedRequiredCase}`,
    );
    console.log("  activeFailed=none");
    console.log("  stage=none code=none");
    console.log("  sqlState=none constraint=none");
    console.log("  cleanup=ok");
    console.log("  PASS — progressive matrix complete.");
    return { exitCode: 0, overall: "PASS" };
  }

  const failDoc: NeonProgressiveDiagnosticDocument = bootstrapException
    ? {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict: PROGRESSIVE_ELIGIBILITY.FAIL_BOOTSTRAP,
        startedAtIso,
        endedAtIso,
        lastCompletedRequiredCase: null,
        activeFailedCase: "matrix.exception",
        safeOperationStage: "matrix_bootstrap",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        ...emptyPromotionDiagnosticFields(),
        cases,
        schemaFingerprint: { migrationIds, checksumPrefixes },
        cleanupStatus,
        notes: buildProgressiveEvidenceNotes({
          connectionFactoryCalls: connectionCalls,
          casesRecorded: cases.length,
        }),
      }
    : {
        title: PROGRESSIVE_EVIDENCE_TITLE,
        overall: "FAIL",
        eligibilityVerdict:
          cleanupStatus === "failed"
            ? PROGRESSIVE_ELIGIBILITY.FAIL_CLEANUP
            : PROGRESSIVE_ELIGIBILITY.FAIL_MATRIX,
        startedAtIso,
        endedAtIso,
        lastCompletedRequiredCase: attribution.lastCompletedRequiredCase,
        activeFailedCase: attribution.activeFailedCase,
        safeOperationStage: attribution.safeOperationStage,
        safeControlPlaneCode: sanitizeProgressiveControlPlaneCode(
          attribution.safeControlPlaneCode,
        ),
        allowlistedSqlState: attribution.allowlistedSqlState,
        allowlistedConstraint: attribution.allowlistedConstraint,
        ...sanitizePromotionDiagnosticFields(attribution),
        cases,
        schemaFingerprint: { migrationIds, checksumPrefixes },
        cleanupStatus,
        notes: buildProgressiveEvidenceNotes({
          connectionFactoryCalls: connectionCalls,
          casesRecorded: cases.length,
        }),
      };

  writeValidated({
    evidencePath,
    writeEvidence,
    document: failDoc,
    expectedMigrationIds: migrationIds,
    expectedChecksumPrefixes: checksumPrefixes,
  });

  console.log(
    `  lastCompleted=${failDoc.lastCompletedRequiredCase ?? "none"}`,
  );
  console.log(`  activeFailed=${failDoc.activeFailedCase ?? "none"}`);
  console.log(
    `  stage=${failDoc.safeOperationStage ?? "none"} code=${failDoc.safeControlPlaneCode ?? "none"}`,
  );
  console.log(
    `  sqlState=${failDoc.allowlistedSqlState ?? "none"} constraint=${failDoc.allowlistedConstraint ?? "none"}`,
  );
  console.log(`  cleanup=${cleanupStatus}`);
  console.log("  FAIL — progressive diagnostic stopped.");
  return { exitCode: 1, overall: "FAIL" };
}
