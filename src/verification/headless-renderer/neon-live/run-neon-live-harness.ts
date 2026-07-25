/**
 * Gated Neon live QA harness — production Neon adapters + isolated run identity.
 * Migration apply is a separate operator action; this harness never migrates.
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

import {
  checksumPrefix,
  createNotTestedEvidence,
  defaultNeonLiveEvidencePath,
  preserveOrInitializeNeonLiveEvidence,
  writeNeonLiveEvidence,
  type NeonLiveCaseEvidence,
  type NeonLiveEvidenceDocument,
} from "./evidence";
import { validatePassNeonLiveEvidence } from "./evidence-authority";
import { runNeonLiveMatrix } from "./live-matrix";
import {
  assertExactRequiredLiveCasePassAuthority,
  REQUIRED_NEON_LIVE_CASE_IDS,
  validateNeonLiveCaseEvidenceShape,
  type NeonLiveFailureCategory,
} from "./required-cases";
import type { NeonLiveMatrixContext } from "./types";

export type { NeonLiveMatrixContext } from "./types";

export type NeonLiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | { readonly exitCode: 1; readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE" };

export type NeonLiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly createSqlExecutor?: (connectionString: string) => HeadlessSqlExecutor;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly writeEvidence?: typeof writeNeonLiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeNeonLiveEvidence;
  readonly nowIso?: () => string;
  readonly randomUUID?: () => string;
  readonly forceGateOn?: boolean;
  readonly injectedExecutor?: HeadlessSqlExecutor;
  readonly assumeConfigured?: boolean;
  readonly preserveQaRows?: boolean;
  readonly caseRunner?: (
    ctx: NeonLiveMatrixContext,
  ) => Promise<readonly NeonLiveCaseEvidence[]>;
  readonly cleanupRunner?: (
    ctx: NeonLiveMatrixContext,
  ) => Promise<"ok" | "failed" | "preserved">;
};

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_NEON_QA === "1";
  } catch {
    return false;
  }
}

function isPreserveFlag(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_NEON_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function caseFail(
  caseId: string,
  category: NeonLiveFailureCategory,
): NeonLiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function sanitizeCasesForEvidence(
  cases: readonly unknown[],
): readonly NeonLiveCaseEvidence[] {
  const out: NeonLiveCaseEvidence[] = [];
  for (const raw of cases) {
    const shaped = validateNeonLiveCaseEvidenceShape(raw);
    if (shaped.ok) out.push(shaped.case);
  }
  if (out.length === 0) {
    out.push(caseFail("matrix.exception", "CASE_SHAPE_INVALID"));
  }
  return out;
}

async function defaultCleanup(
  ctx: NeonLiveMatrixContext,
  preserve: boolean,
): Promise<"ok" | "failed" | "preserved"> {
  if (preserve) return "preserved";
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

    // Verify zero run-owned rows remain.
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

/**
 * Execute the gated Neon live harness.
 * Gate-off: zero DB calls, NOT_TESTED, exit 0, preserve prior evidence.
 * Gate-on: exit 0 only when exact required cases PASS and cleanup policy holds.
 */
export async function runNeonLiveHarness(
  deps: NeonLiveHarnessDeps = {},
): Promise<NeonLiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultNeonLiveEvidencePath();
  const preserveEvidence =
    deps.preserveEvidence ?? preserveOrInitializeNeonLiveEvidence;
  const writeEvidence = deps.writeEvidence ?? writeNeonLiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const uuid = deps.randomUUID ?? randomUUID;

  const gateOn = deps.forceGateOn === true || isGateOn(env);

  if (!gateOn) {
    const preserved = preserveEvidence({ evidencePath });
    console.log(
      "  NOT TESTED — set HEADLESS_NEON_QA=1 and DATABASE_URL to enable.",
    );
    console.log(
      `  Evidence ${preserved.action} (overall=${preserved.overall}). Zero database calls.`,
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
    writeEvidence({
      evidencePath,
      document: {
        ...createNotTestedEvidence(),
        overall: "FAIL",
        eligibilityVerdict:
          "NOT ELIGIBLE — HEADLESS_NEON_QA=1 but DATABASE_URL is missing or invalid.",
        startedAtIso,
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
        notes: ["CONFIGURATION UNAVAILABLE — no connection attempted."],
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
    writeEvidence({
      evidencePath,
      document: {
        ...createNotTestedEvidence(),
        overall: "FAIL",
        eligibilityVerdict:
          "NOT ELIGIBLE — DATABASE_URL unavailable after classification.",
        startedAtIso,
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
        notes: ["CONFIGURATION UNAVAILABLE."],
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
    writeEvidence({
      evidencePath,
      document: {
        title: "Sprint 11E Phase 2B.2B.1 — Neon live QA evidence",
        overall: "FAIL",
        eligibilityVerdict: `NOT ELIGIBLE — schema preflight failed (${preflight.code}).`,
        startedAtIso,
        endedAtIso: nowIso(),
        cases: [caseFail("schema.preflight", preflight.code)],
        schemaFingerprint: null,
        cleanupStatus: "not_run",
        notes: [
          "Live harness never auto-runs migrations.",
          "Apply migrations via migrate:headless-neon, then re-run live QA.",
        ],
      },
    });
    console.log(`  FAIL — schema preflight: ${preflight.code}`);
    return { exitCode: 1, overall: "FAIL" };
  }

  const runId = uuid();
  const ownerId = `owner_live_${runId.replace(/-/g, "").slice(0, 16)}`;
  const otherOwnerId = `owner_other_${runId.replace(/-/g, "").slice(0, 16)}`;
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
  };

  let cases: readonly NeonLiveCaseEvidence[] = [];
  let caseError: string | null = null;
  try {
    if (deps.caseRunner) {
      cases = await deps.caseRunner(ctx);
    } else {
      const run = await runNeonLiveMatrix(ctx);
      cases = run.cases;
    }
  } catch {
    // Only before any required case begins — mid-matrix throws attribute via session.
    caseError = "MATRIX_EXCEPTION";
    cases = [caseFail("matrix.exception", "MATRIX_EXCEPTION")];
  }

  const preserveRows =
    deps.preserveQaRows === true || isPreserveFlag(env);
  let cleanupStatus: NeonLiveEvidenceDocument["cleanupStatus"] = "not_run";
  try {
    cleanupStatus = deps.cleanupRunner
      ? await deps.cleanupRunner(ctx)
      : await defaultCleanup(ctx, preserveRows);
  } catch {
    cleanupStatus = "failed";
  }

  const endedAtIso = nowIso();
  const checksumPrefixes = preflight.fingerprint.checksums.map(checksumPrefix);
  const caseAuthority = assertExactRequiredLiveCasePassAuthority(cases);
  const cleanupOk = cleanupStatus === "ok" || cleanupStatus === "preserved";
  const canPass =
    caseError == null && caseAuthority.ok === true && cleanupOk;

  const candidate: NeonLiveEvidenceDocument = {
    title: "Sprint 11E Phase 2B.2B.1 — Neon live QA evidence",
    overall: canPass ? "PASS" : "FAIL",
    eligibilityVerdict: canPass
      ? cleanupStatus === "preserved"
        ? "ELIGIBLE — live Neon matrix passed; QA rows preserved by explicit flag."
        : "ELIGIBLE — live Neon matrix passed with cleanup confirmed."
      : cleanupStatus === "failed"
        ? "NOT ELIGIBLE — cleanup failed."
        : caseAuthority.ok
          ? "NOT ELIGIBLE — live matrix authority failed."
          : `NOT ELIGIBLE — ${caseAuthority.message}`,
    startedAtIso,
    endedAtIso,
    cases: caseAuthority.ok
      ? caseAuthority.cases
      : sanitizeCasesForEvidence(cases),
    schemaFingerprint: {
      migrationIds: preflight.fingerprint.migrationIds,
      checksumPrefixes,
    },
    cleanupStatus,
    notes: [
      "Evidence excludes URLs, credentials, SQL, provider text, owner/session IDs, and row payloads.",
      `connectionFactoryCalls=${connectionCalls}`,
      ...(caseError != null ? [`caseError=${caseError}`] : []),
      ...(caseAuthority.ok
        ? []
        : [`caseAuthority=${caseAuthority.code}`]),
    ],
  };

  let overall: "PASS" | "FAIL" = "FAIL";
  if (canPass) {
    const validated = validatePassNeonLiveEvidence({
      document: candidate,
      expectedMigrationIds: preflight.fingerprint.migrationIds,
      expectedChecksumPrefixes: checksumPrefixes,
    });
    if (validated.ok) {
      writeEvidence({ evidencePath, document: validated.document });
      overall = "PASS";
    } else {
      writeEvidence({
        evidencePath,
        document: {
          ...candidate,
          overall: "FAIL",
          eligibilityVerdict: `NOT ELIGIBLE — evidence invalid (${validated.message}).`,
          notes: [...candidate.notes, "EVIDENCE_INVALID"],
        },
      });
      overall = "FAIL";
    }
  } else {
    writeEvidence({ evidencePath, document: candidate });
  }

  if (overall === "PASS") {
    console.log(
      `  PASS — ${REQUIRED_NEON_LIVE_CASE_IDS.length} live cases; cleanup=${cleanupStatus}`,
    );
    return { exitCode: 0, overall: "PASS" };
  }
  console.log(
    `  FAIL — caseAuthority=${caseAuthority.ok} cleanup=${cleanupStatus}`,
  );
  return { exitCode: 1, overall: "FAIL" };
}

/** Source-level guard: placeholder gate-on success must never exist. */
export const NEON_LIVE_PLACEHOLDER_SUCCESS_BAN =
  "Live exercise not implemented";
