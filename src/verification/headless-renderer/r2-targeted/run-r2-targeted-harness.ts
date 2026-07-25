/**
 * Gated R2 targeted QA harness — minimum same-snapshot chain.
 * Migration apply is a separate operator action; this harness NEVER migrates.
 * NEVER uses DATABASE_URL_UNPOOLED for QA.
 * NEVER writes official docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md.
 *
 * Gate: HEADLESS_R2_QA_TARGETED=1
 * Preserve: HEADLESS_R2_QA_PRESERVE=1
 * Requires: DATABASE_URL + R2 configured (when gate on)
 *
 * Gate-off → NOT_TESTED / exit 0 / zero connections.
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
  classifyHeadlessR2Environment,
  readConfiguredHeadlessR2Config,
} from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { R2UploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import { R2DownloadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-download-capability.adapter";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessOwnedObjectStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import { discoverHeadlessMigrationSources } from "@/features/headless-renderer/control-plane/migrations/migration-catalog";

import type { R2LiveMatrixContext, R2LiveSessionState } from "../r2-live/types";

import {
  checksumPrefix,
  createNotTestedR2TargetedEvidence,
  defaultR2TargetedEvidencePath,
  preserveOrInitializeR2TargetedEvidence,
  writeR2TargetedEvidence,
  type R2TargetedCaseEvidence,
  type R2TargetedEvidenceDocument,
} from "./evidence";
import { validatePassR2TargetedEvidence } from "./evidence-authority";
import {
  DEFAULT_R2_TARGETED_CASE_RUNNERS,
  runR2TargetedMatrix,
  type R2TargetedCaseRunner,
} from "./targeted-matrix";
import {
  assertExactRequiredR2TargetedCasePassAuthority,
  REQUIRED_R2_TARGETED_CASE_IDS,
  validateR2TargetedCaseEvidenceShape,
  type R2TargetedFailureCategory,
} from "./required-cases";

export type { R2LiveMatrixContext as R2TargetedMatrixContext } from "../r2-live/types";

export const R2_TARGETED_PLACEHOLDER_SUCCESS_BAN =
  "R2 targeted harness must not claim PASS without exact membership + fingerprint authority.";

export type R2TargetedHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | {
      readonly exitCode: 1;
      readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE";
    };

export type R2TargetedHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly createSqlExecutor?: (connectionString: string) => HeadlessSqlExecutor;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly writeEvidence?: typeof writeR2TargetedEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeR2TargetedEvidence;
  readonly nowIso?: () => string;
  readonly randomUUID?: () => string;
  readonly forceGateOn?: boolean;
  readonly injectedExecutor?: HeadlessSqlExecutor;
  readonly assumeConfigured?: boolean;
  readonly preserveQaRows?: boolean;
  readonly caseRunner?: (
    ctx: R2LiveMatrixContext,
  ) => Promise<readonly R2TargetedCaseEvidence[]>;
  readonly caseRunners?: Readonly<
    Partial<
      Record<(typeof REQUIRED_R2_TARGETED_CASE_IDS)[number], R2TargetedCaseRunner>
    >
  >;
  readonly cleanupRunner?: (
    ctx: R2LiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
};

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_R2_QA_TARGETED === "1";
  } catch {
    return false;
  }
}

function isPreserveFlag(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_R2_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function caseFail(
  caseId: string,
  category: R2TargetedFailureCategory,
): R2TargetedCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function sanitizeCasesForEvidence(
  cases: readonly unknown[],
): readonly R2TargetedCaseEvidence[] {
  const out: R2TargetedCaseEvidence[] = [];
  for (const raw of cases) {
    const shaped = validateR2TargetedCaseEvidenceShape(raw);
    if (shaped.ok) out.push(shaped.case);
  }
  if (out.length === 0) {
    out.push(caseFail("env.config", "CASE_SHAPE_INVALID"));
  }
  return out;
}

function emptySession(): R2LiveSessionState {
  return {
    jobId: null,
    operationId: null,
    objectId: null,
    objectKey: null,
    storeId: null,
    bytes: null,
    digest: null,
    mime: "application/json",
    expectedByteLength: 0,
    artifactObjectId: null,
    artifactObjectKey: null,
    uploadCapabilityIssued: false,
  };
}

async function defaultCleanup(
  ctx: R2LiveMatrixContext,
  preserve: boolean,
): Promise<"ok" | "failed" | "preserved"> {
  if (preserve) return "preserved";
  const owners = [ctx.ownerId, ctx.otherOwnerId];
  try {
    for (const locator of ctx.createdR2Locators) {
      try {
        await ctx.io.deleteObject(locator, ctx.ownerId);
      } catch {
        // continue
      }
    }

    await ctx.sql.withTransaction(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      if (ctx.createdObjectIds.length > 0) {
        await client.query(
          `
DELETE FROM public.headless_owned_objects
WHERE object_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
          [ctx.createdObjectIds, owners],
        );
      }
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
      const objects =
        ctx.createdObjectIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_owned_objects
WHERE object_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdObjectIds, owners],
            );
      const jobs =
        ctx.createdJobIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE job_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdJobIds, owners],
            );
      const ownership =
        ctx.createdProjectIds.length === 0
          ? { rows: [{ n: "0" }] }
          : await client.query<{ n: string }>(
              `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE project_id = ANY($1::text[])
  AND owner_id = ANY($2::text[])
`,
              [ctx.createdProjectIds, owners],
            );
      return {
        objects: Number(objects.rows[0]?.n ?? "1"),
        jobs: Number(jobs.rows[0]?.n ?? "1"),
        ownership: Number(ownership.rows[0]?.n ?? "1"),
      };
    });

    if (
      remaining.objects !== 0 ||
      remaining.jobs !== 0 ||
      remaining.ownership !== 0
    ) {
      return "failed";
    }
    return "ok";
  } catch {
    return "failed";
  }
}

export async function runR2TargetedHarness(
  deps: R2TargetedHarnessDeps = {},
): Promise<R2TargetedHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultR2TargetedEvidencePath();
  const preserveEvidence =
    deps.preserveEvidence ?? preserveOrInitializeR2TargetedEvidence;
  const writeEvidence = deps.writeEvidence ?? writeR2TargetedEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const makeUuid = deps.randomUUID ?? randomUUID;

  const gateOn = deps.forceGateOn === true || isGateOn(env);

  if (!gateOn) {
    const preserved = preserveEvidence({ evidencePath });
    void preserved;
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  // Refuse DATABASE_URL_UNPOOLED for targeted QA — migrate-only.
  // Presence alone is fine; we simply never read it for QA connections.
  void (env as Record<string, unknown>).DATABASE_URL_UNPOOLED;

  const neonStatus = classifyHeadlessNeonEnvironment(env);
  const r2Status = classifyHeadlessR2Environment(env);
  if (
    !deps.assumeConfigured &&
    (neonStatus !== "configured" || r2Status !== "configured")
  ) {
    writeEvidence({
      evidencePath,
      document: {
        ...createNotTestedR2TargetedEvidence([
          "Gate on but Neon or R2 environment is not configured.",
        ]),
        overall: "FAIL",
        eligibilityVerdict: "NOT ELIGIBLE — configuration unavailable.",
        cleanupStatus: "not_run",
      },
    });
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const connectionString =
    deps.injectedExecutor != null
      ? "injected"
      : readConfiguredHeadlessDatabaseUrl(env);
  if (connectionString == null && deps.injectedExecutor == null) {
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const r2Config = readConfiguredHeadlessR2Config(env);
  if (r2Config == null && !deps.assumeConfigured) {
    return { exitCode: 1, overall: "CONFIGURATION_UNAVAILABLE" };
  }

  const createSql =
    deps.createSqlExecutor ??
    ((url: string) => createNeonSqlExecutor({ connectionString: url }));
  const sql =
    deps.injectedExecutor ?? createSql(connectionString ?? "injected");
  const runPreflight = deps.runSchemaPreflight ?? runHeadlessSchemaPreflight;

  const startedAtIso = nowIso();
  const sources = discoverHeadlessMigrationSources();
  const expectedMigrationIds = sources.map((s) => s.migrationId);
  const expectedChecksumPrefixes = sources.map((s) =>
    checksumPrefix(s.checksumSha256),
  );

  // Schema preflight only — harness NEVER applies migrations.
  const preflight = await runPreflight({ sql });
  if (!preflight.ok) {
    writeEvidence({
      evidencePath,
      document: {
        ...createNotTestedR2TargetedEvidence(["Schema preflight failed."]),
        overall: "FAIL",
        eligibilityVerdict: "NOT ELIGIBLE — schema preflight failed.",
        startedAtIso,
        endedAtIso: nowIso(),
        cleanupStatus: "not_run",
      },
    });
    return { exitCode: 1, overall: "FAIL" };
  }

  const runId = makeUuid();
  const ownerId = `r2t_owner_${runId.slice(0, 8)}`;
  const otherOwnerId = `r2t_other_${runId.slice(0, 8)}`;
  const projectId = makeUuid();
  const ownedObjectStore = new NeonHeadlessOwnedObjectStoreAdapter(sql);
  const jobStore = new NeonHeadlessJobStoreAdapter(sql);
  const projectAuthorization = new NeonHeadlessProjectAuthorizationAdapter(sql);
  const config = r2Config ?? {
    accountId: "test",
    accessKeyId: "test",
    secretAccessKey: "testsecretvalue0123456789",
    bucketAssets: "assets-bucket",
    bucketArtifacts: "artifacts-bucket",
    endpoint: "https://example.r2.cloudflarestorage.com",
    allowedOrigins: Object.freeze(["https://app.example.com"]),
  };
  const io = new R2StorageAdapter({
    configOverride: config,
    authorizeOwner: () => true,
  });
  const uploadCapability = new R2UploadCapabilityAdapter({
    ownedObjectStore,
    configOverride: config,
  });
  const downloadCapability = new R2DownloadCapabilityAdapter({
    ownedObjectStore,
    jobStore,
    configOverride: config,
  });

  const ctx: R2LiveMatrixContext = {
    runId,
    ownerId,
    otherOwnerId,
    projectId,
    nowMs: Date.now(),
    sql,
    jobStore,
    ownedObjectStore,
    projectAuthorization,
    io,
    uploadCapability,
    downloadCapability,
    r2Config: config,
    createdJobIds: [],
    createdProjectIds: [],
    createdObjectIds: [],
    createdR2Locators: [],
    session: emptySession(),
  };

  let cases: readonly R2TargetedCaseEvidence[];
  try {
    if (deps.caseRunner) {
      cases = await deps.caseRunner(ctx);
    } else {
      cases = await runR2TargetedMatrix(
        ctx,
        deps.caseRunners ?? DEFAULT_R2_TARGETED_CASE_RUNNERS,
      );
    }
  } catch {
    cases = [caseFail("env.config", "MATRIX_EXCEPTION")];
  }
  cases = sanitizeCasesForEvidence(cases);

  const preserve = deps.preserveQaRows === true || isPreserveFlag(env);
  const cleanupRunner = deps.cleanupRunner ?? defaultCleanup;
  const cleanupStatus = await cleanupRunner(ctx, preserve);

  const endedAtIso = nowIso();
  const passAuthority = assertExactRequiredR2TargetedCasePassAuthority(cases);
  const overallPass = passAuthority.ok && cleanupStatus !== "failed";

  const document: R2TargetedEvidenceDocument = {
    title: "Sprint 11E Phase 2C.1B — R2 targeted QA evidence",
    overall: overallPass ? "PASS" : "FAIL",
    eligibilityVerdict: overallPass
      ? "ELIGIBLE — exact required R2 targeted membership PASS."
      : "NOT ELIGIBLE — one or more required cases failed or not tested.",
    startedAtIso,
    endedAtIso,
    cases,
    schemaFingerprint: {
      migrationIds: expectedMigrationIds,
      checksumPrefixes: expectedChecksumPrefixes,
    },
    cleanupStatus,
    notes: [
      R2_TARGETED_PLACEHOLDER_SUCCESS_BAN,
      "Harness never migrates and never uses the migrate-only unpooled connection.",
      "Never writes official docs/HEADLESS_11E_R2_LIVE_EVIDENCE.md.",
      "Matrix stops on first failure; remaining cases are NOT_TESTED.",
    ],
  };

  if (overallPass) {
    const validated = validatePassR2TargetedEvidence({
      document,
      expectedMigrationIds,
      expectedChecksumPrefixes,
    });
    if (!validated.ok) {
      writeEvidence({
        evidencePath,
        document: {
          ...document,
          overall: "FAIL",
          eligibilityVerdict: `NOT ELIGIBLE — ${validated.message}`,
        },
      });
      return { exitCode: 1, overall: "FAIL" };
    }
    writeEvidence({ evidencePath, document: validated.document });
    return { exitCode: 0, overall: "PASS" };
  }

  writeEvidence({ evidencePath, document });
  return { exitCode: 1, overall: "FAIL" };
}
