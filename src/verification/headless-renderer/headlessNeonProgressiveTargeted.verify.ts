/**
 * Authorized targeted progressive Neon prefix.
 *
 * Gate: HEADLESS_NEON_QA_PROGRESSIVE=1 + DATABASE_URL
 * Stop: HEADLESS_NEON_QA_PROGRESSIVE_STOP_AFTER=<required case id>
 *
 * Writes docs/HEADLESS_11E_NEON_PROGRESSIVE_TARGETED_2B2D2.md
 * Does not overwrite official progressive or live evidence.
 * Does not claim exact-29 progressive PASS.
 */

import { randomUUID } from "node:crypto";

import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { checksumPrefix } from "./neon-live/evidence";
import { runNeonLiveMatrix } from "./neon-live/live-matrix";
import {
  REQUIRED_NEON_LIVE_CASE_IDS,
  type RequiredNeonLiveCaseId,
} from "./neon-live/required-cases";
import {
  defaultNeonTargetedProgressiveEvidencePath,
  writeNeonTargetedProgressiveEvidence,
  type NeonTargetedProgressiveEvidenceDocument,
} from "./neon-live/targeted-evidence";
import type { NeonLiveMatrixContext } from "./neon-live/types";

function isGateOn(env: NodeJS.ProcessEnv): boolean {
  return env.HEADLESS_NEON_QA_PROGRESSIVE === "1";
}

function readStopAfter(env: NodeJS.ProcessEnv): RequiredNeonLiveCaseId | null {
  const raw = env.HEADLESS_NEON_QA_PROGRESSIVE_STOP_AFTER;
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!(REQUIRED_NEON_LIVE_CASE_IDS as readonly string[]).includes(raw)) {
    return null;
  }
  return raw as RequiredNeonLiveCaseId;
}

async function cleanup(ctx: NeonLiveMatrixContext): Promise<"ok" | "failed"> {
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
    return remaining.jobs === 0 && remaining.ownership === 0 ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

async function main(): Promise<void> {
  console.log(
    "\nSprint 11E Phase 2B.2D.2 — Targeted progressive Neon prefix\n",
  );

  const env = process.env;
  if (!isGateOn(env)) {
    console.log(
      "  NOT TESTED — set HEADLESS_NEON_QA_PROGRESSIVE=1 and DATABASE_URL.",
    );
    process.exitCode = 0;
    return;
  }

  const stopAfter = readStopAfter(env);
  if (stopAfter == null) {
    console.log(
      "  FAIL — HEADLESS_NEON_QA_PROGRESSIVE_STOP_AFTER must be a required case ID.",
    );
    process.exitCode = 1;
    return;
  }

  const classify = classifyHeadlessNeonEnvironment(env);
  if (classify !== "configured") {
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    process.exitCode = 1;
    return;
  }
  const connectionString = readConfiguredHeadlessDatabaseUrl(env);
  if (connectionString == null) {
    console.log("  FAIL — CONFIGURATION UNAVAILABLE.");
    process.exitCode = 1;
    return;
  }

  const startedAtIso = new Date().toISOString();
  const sql = createNeonSqlExecutor({ connectionString });
  console.log("  schema preflight…");
  const preflight = await runHeadlessSchemaPreflight({ sql });
  if (!preflight.ok) {
    console.log(`  FAIL — schema preflight: ${preflight.code}`);
    process.exitCode = 1;
    return;
  }
  console.log("  schema preflight: ok");

  const runId = randomUUID();
  const ctx: NeonLiveMatrixContext = {
    runId,
    ownerId: `owner_tgt_${runId.replace(/-/g, "").slice(0, 16)}`,
    otherOwnerId: `owner_tother_${runId.replace(/-/g, "").slice(0, 16)}`,
    sql,
    auth: new NeonHeadlessProjectAuthorizationAdapter(sql),
    store: new NeonHeadlessJobStoreAdapter(sql),
    createdJobIds: [],
    createdProjectIds: [],
    uuid: randomUUID,
    stopAfterCaseId: stopAfter,
  };

  let cases: NeonTargetedProgressiveEvidenceDocument["cases"] = [];
  let attribution = {
    lastCompletedRequiredCase: null as string | null,
    activeFailedCase: null as string | null,
    safeOperationStage: null as NeonTargetedProgressiveEvidenceDocument["safeOperationStage"],
    safeControlPlaneCode: null as string | null,
    allowlistedSqlState: null as string | null,
    allowlistedConstraint: null as string | null,
  };

  try {
    const run = await runNeonLiveMatrix(ctx);
    cases = run.cases;
    attribution = run.attribution;
  } catch {
    cases = [
      {
        caseId: "matrix.exception",
        status: "FAIL",
        failureCategory: "MATRIX_EXCEPTION",
      },
    ];
    attribution = {
      lastCompletedRequiredCase: null,
      activeFailedCase: "matrix.exception",
      safeOperationStage: "matrix_bootstrap",
      safeControlPlaneCode: null,
      allowlistedSqlState: null,
      allowlistedConstraint: null,
    };
  }

  const cleanupStatus = await cleanup(ctx);
  const endedAtIso = new Date().toISOString();
  const checksumPrefixes = preflight.fingerprint.checksums.map(checksumPrefix);

  const stopIdx = REQUIRED_NEON_LIVE_CASE_IDS.indexOf(stopAfter);
  const expectedPrefix = REQUIRED_NEON_LIVE_CASE_IDS.slice(0, stopIdx + 1);
  const targetedPass =
    cleanupStatus === "ok" &&
    attribution.activeFailedCase == null &&
    cases.length === expectedPrefix.length &&
    cases.every((c, i) => c.caseId === expectedPrefix[i] && c.status === "PASS") &&
    attribution.lastCompletedRequiredCase === stopAfter;

  const document: NeonTargetedProgressiveEvidenceDocument = {
    title: "Sprint 11E Phase 2B.2D.2 — Targeted progressive Neon prefix",
    overall: targetedPass ? "TARGETED_PASS" : "FAIL",
    stopAfterCaseId: stopAfter,
    eligibilityVerdict: targetedPass
      ? "TARGETED PREFIX COMPLETE — remaining progressive matrix not authorized."
      : cleanupStatus === "failed"
        ? "NOT ELIGIBLE — cleanup failed."
        : "NOT ELIGIBLE — targeted progressive prefix failed or incomplete.",
    startedAtIso,
    endedAtIso,
    lastCompletedRequiredCase: attribution.lastCompletedRequiredCase,
    activeFailedCase: attribution.activeFailedCase,
    safeOperationStage: attribution.safeOperationStage,
    safeControlPlaneCode: attribution.safeControlPlaneCode,
    allowlistedSqlState: attribution.allowlistedSqlState,
    allowlistedConstraint: attribution.allowlistedConstraint,
    cases,
    schemaFingerprint: {
      migrationIds: preflight.fingerprint.migrationIds,
      checksumPrefixes,
    },
    cleanupStatus,
    notes: [
      "Targeted progressive evidence — does not overwrite full progressive or official live evidence.",
      "Does not claim exact-29 progressive PASS authority.",
      `stopAfter=${stopAfter}`,
      `casesRecorded=${cases.length}`,
    ],
  };

  const evidencePath = defaultNeonTargetedProgressiveEvidencePath();
  writeNeonTargetedProgressiveEvidence({ evidencePath, document });

  console.log(`  stopAfter=${stopAfter}`);
  console.log(
    `  lastCompleted=${attribution.lastCompletedRequiredCase ?? "none"}`,
  );
  console.log(`  activeFailed=${attribution.activeFailedCase ?? "none"}`);
  console.log(
    `  stage=${attribution.safeOperationStage ?? "none"} code=${attribution.safeControlPlaneCode ?? "none"}`,
  );
  console.log(
    `  sqlState=${attribution.allowlistedSqlState ?? "none"} constraint=${attribution.allowlistedConstraint ?? "none"}`,
  );
  console.log(`  cleanup=${cleanupStatus}`);
  console.log(`  casesRecorded=${cases.length}`);
  console.log(`  evidence=${evidencePath}`);

  if (targetedPass) {
    console.log("  TARGETED_PASS — prefix complete; remaining matrix blocked.");
    process.exitCode = 0;
    return;
  }
  console.log("  FAIL — targeted progressive prefix stopped.");
  process.exitCode = 1;
}

main().catch(() => {
  console.log("\nFAIL — targeted progressive diagnostic terminated unexpectedly.\n");
  process.exitCode = 1;
});
