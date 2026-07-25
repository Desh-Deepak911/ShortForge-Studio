/**
 * Gated R2 live QA harness — Neon owned-object + R2 adapters + isolated run identity.
 * Migration apply is a separate operator action; this harness NEVER migrates.
 * NEVER uses DATABASE_URL_UNPOOLED for QA.
 *
 * Gate: HEADLESS_R2_QA=1
 * Preserve: HEADLESS_R2_QA_PRESERVE=1
 * Requires: DATABASE_URL + R2 configured (when gate on)
 *
 * Phase 2C.1A: NOT RUN against remote Neon/R2. Gate-off → NOT_TESTED / exit 0.
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

import {
  checksumPrefix,
  createNotTestedR2Evidence,
  defaultR2LiveEvidencePath,
  preserveOrInitializeR2LiveEvidence,
  writeR2LiveEvidence,
  type R2LiveCaseEvidence,
  type R2LiveEvidenceDocument,
} from "./evidence";
import { validatePassR2LiveEvidence } from "./evidence-authority";
import {
  DEFAULT_R2_LIVE_CASE_RUNNERS,
  runR2LiveMatrix,
  type R2LiveCaseRunner,
} from "./live-matrix";
import {
  assertExactRequiredR2LiveCasePassAuthority,
  REQUIRED_R2_LIVE_CASE_IDS,
  validateR2LiveCaseEvidenceShape,
  type R2LiveFailureCategory,
} from "./required-cases";
import type { R2LiveMatrixContext, R2LiveSessionState } from "./types";

export type { R2LiveMatrixContext } from "./types";

export const R2_LIVE_PLACEHOLDER_SUCCESS_BAN =
  "R2 live harness must not claim PASS without exact membership + fingerprint authority.";

export type R2LiveHarnessExit =
  | { readonly exitCode: 0; readonly overall: "NOT_TESTED" | "PASS" }
  | { readonly exitCode: 1; readonly overall: "FAIL" | "CONFIGURATION_UNAVAILABLE" };

export type R2LiveHarnessDeps = {
  readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
  readonly evidencePath?: string;
  readonly createSqlExecutor?: (connectionString: string) => HeadlessSqlExecutor;
  readonly runSchemaPreflight?: typeof runHeadlessSchemaPreflight;
  readonly writeEvidence?: typeof writeR2LiveEvidence;
  readonly preserveEvidence?: typeof preserveOrInitializeR2LiveEvidence;
  readonly nowIso?: () => string;
  readonly randomUUID?: () => string;
  readonly forceGateOn?: boolean;
  readonly injectedExecutor?: HeadlessSqlExecutor;
  readonly assumeConfigured?: boolean;
  readonly preserveQaRows?: boolean;
  readonly caseRunner?: (
    ctx: R2LiveMatrixContext,
  ) => Promise<readonly R2LiveCaseEvidence[]>;
  readonly caseRunners?: Readonly<
    Partial<Record<(typeof REQUIRED_R2_LIVE_CASE_IDS)[number], R2LiveCaseRunner>>
  >;
  readonly cleanupRunner?: (
    ctx: R2LiveMatrixContext,
    preserve?: boolean,
  ) => Promise<"ok" | "failed" | "preserved">;
};

function isGateOn(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_R2_QA === "1";
  } catch {
    return false;
  }
}

function isPreserveFlag(env: NodeJS.ProcessEnv | Record<string, unknown>): boolean {
  try {
    return (env as Record<string, unknown>).HEADLESS_R2_QA_PRESERVE === "1";
  } catch {
    return false;
  }
}

function caseFail(
  caseId: string,
  category: R2LiveFailureCategory,
): R2LiveCaseEvidence {
  return { caseId, status: "FAIL", failureCategory: category };
}

function sanitizeCasesForEvidence(
  cases: readonly unknown[],
): readonly R2LiveCaseEvidence[] {
  const out: R2LiveCaseEvidence[] = [];
  for (const raw of cases) {
    const shaped = validateR2LiveCaseEvidenceShape(raw);
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
    // (1) Delete tracked R2 objects (best-effort; missing objects are ok).
    for (const locator of ctx.createdR2Locators) {
      try {
        await ctx.io.deleteObject(locator, ctx.ownerId);
      } catch {
        // continue — Neon cleanup + verification still required
      }
    }

    // (2) Delete Neon owned_objects / jobs / ownership rows for run-scoped IDs.
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

    // (3) Verify zero remaining for run-scoped IDs.
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

export async function runR2LiveHarness(
  deps: R2LiveHarnessDeps = {},
): Promise<R2LiveHarnessExit> {
  const env = deps.env ?? process.env;
  const evidencePath = deps.evidencePath ?? defaultR2LiveEvidencePath();
  const preserveEvidence =
    deps.preserveEvidence ?? preserveOrInitializeR2LiveEvidence;
  const writeEvidence = deps.writeEvidence ?? writeR2LiveEvidence;
  const nowIso = deps.nowIso ?? (() => new Date().toISOString());
  const makeUuid = deps.randomUUID ?? randomUUID;

  const gateOn = deps.forceGateOn === true || isGateOn(env);

  if (!gateOn) {
    const preserved = preserveEvidence({ evidencePath });
    void preserved;
    return { exitCode: 0, overall: "NOT_TESTED" };
  }

  // Refuse DATABASE_URL_UNPOOLED for live QA — migrate-only.
  if (
    typeof (env as Record<string, unknown>).DATABASE_URL_UNPOOLED === "string" &&
    (env as Record<string, unknown>).DATABASE_URL_UNPOOLED !== "" &&
    !deps.assumeConfigured
  ) {
    // Presence alone is fine; we simply never read it for QA connections.
  }

  const neonStatus = classifyHeadlessNeonEnvironment(env);
  const r2Status = classifyHeadlessR2Environment(env);
  if (
    !deps.assumeConfigured &&
    (neonStatus !== "configured" || r2Status !== "configured")
  ) {
    writeEvidence({
      evidencePath,
      document: {
        ...createNotTestedR2Evidence([
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
        ...createNotTestedR2Evidence(["Schema preflight failed."]),
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
  const ownerId = `r2qa_owner_${runId.slice(0, 8)}`;
  const otherOwnerId = `r2qa_other_${runId.slice(0, 8)}`;
  // Neon ownership CHECK requires UUID v4 project identities.
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

  let cases: readonly R2LiveCaseEvidence[];
  try {
    if (deps.caseRunner) {
      cases = await deps.caseRunner(ctx);
    } else {
      cases = await runR2LiveMatrix(
        ctx,
        deps.caseRunners ?? DEFAULT_R2_LIVE_CASE_RUNNERS,
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
  const passAuthority = assertExactRequiredR2LiveCasePassAuthority(cases);
  const overallPass = passAuthority.ok && cleanupStatus !== "failed";

  const document: R2LiveEvidenceDocument = {
    title: "Sprint 11E Phase 2C.1A — R2 live QA evidence",
    overall: overallPass ? "PASS" : "FAIL",
    eligibilityVerdict: overallPass
      ? "ELIGIBLE — exact required R2 live membership PASS."
      : "NOT ELIGIBLE — one or more required cases failed.",
    startedAtIso,
    endedAtIso,
    cases,
    schemaFingerprint: {
      migrationIds: expectedMigrationIds,
      checksumPrefixes: expectedChecksumPrefixes,
    },
    cleanupStatus,
    notes: [
      R2_LIVE_PLACEHOLDER_SUCCESS_BAN,
      "Harness never migrates and never uses the migrate-only unpooled connection.",
      "Default case runners are implemented; LIVE matrix NOT RUN in this phase.",
    ],
  };

  if (overallPass) {
    const validated = validatePassR2LiveEvidence({
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
