/**
 * QA-only isolated provisional-create probe for Sprint 11E Phase 2B.2D.
 * Never runs the other 28 live cases. Never prints secrets, SQL, IDs, or payloads.
 */

import { randomUUID } from "node:crypto";

import { Pool } from "@neondatabase/serverless";

import {
  classifyHeadlessNeonEnvironment,
  readConfiguredHeadlessDatabaseUrl,
} from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import {
  extractHeadlessPgConstraintId,
  extractHeadlessPgSqlState,
  HEADLESS_CREATE_INSERT_SAVEPOINT,
  HEADLESS_PG_SQLSTATE,
} from "@/features/headless-renderer/control-plane/runtime/map-database-failure";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { runHeadlessSchemaPreflight } from "@/features/headless-renderer/control-plane/runtime/neon-schema-preflight";
import {
  HEADLESS_JOB_SELECT_SQL,
  mapHeadlessJobSqlRow,
  serializeProvisionalJsonPayload,
} from "@/features/headless-renderer/control-plane/services/map-headless-job-sql-row";
import { validateHeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane/services/validate-provisional-stored-job";
import {
  NeonHeadlessJobStoreAdapter,
  NeonHeadlessProjectAuthorizationAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import { isPlainObject } from "@/features/headless-renderer/domain/headless-hostile-guard";

import { buildLiveDraft } from "./live-fixtures";

export type ProbeSafeStage =
  | "input_validation"
  | "insert"
  | "returning_row_mapping"
  | "stored_record_validation"
  | "transaction";

export type ProvisionalCreateProbeReport = {
  readonly ok: boolean;
  readonly stage: ProbeSafeStage | "complete";
  readonly controlPlaneCode: string | null;
  readonly sqlState: string | null;
  readonly sqlStateClass: string | null;
  readonly constraintId: string | null;
  readonly errorName: string | null;
  readonly failedAt:
    | "begin"
    | "search_path"
    | "savepoint"
    | "insert"
    | "release"
    | "commit"
    | "map"
    | "adapter_create"
    | "readback"
    | "cleanup"
    | "preflight"
    | "claim"
    | "draft"
    | null;
  readonly durableRowCreated: boolean;
  readonly createKind: "created" | "existing" | "conflict" | null;
  readonly rowIsPlainObject: boolean | null;
  readonly provisionalJsonIsPlainObject: boolean | null;
  readonly profileJsonIsPlainObject: boolean | null;
  readonly bigintFieldsWireKind: string | null;
  readonly cleanup: "ok" | "failed" | "not_run";
};

const ALLOWLISTED_CONSTRAINT_IDS = new Set([
  "headless_jobs_pkey",
  "headless_jobs_fk_project_owner",
  "headless_jobs_job_id_nonempty",
  "headless_jobs_owner_id_nonempty",
  "headless_jobs_project_id_nonempty",
  "headless_jobs_operation_id_nonempty",
  "headless_jobs_idempotency_key_format",
  "headless_jobs_store_version_positive",
  "headless_jobs_timestamps_nonneg",
  "headless_jobs_stage_valid",
  "headless_jobs_provisional_state_valid",
  "headless_jobs_canonical_state_valid",
  "headless_jobs_canonical_state_matches_json",
  "headless_jobs_provisional_payload_only",
  "headless_jobs_canonical_payload_required",
  "headless_jobs_provisional_requested_output",
  "headless_jobs_canonical_no_provisional_columns",
  "headless_jobs_render_claim_paired",
  "headless_jobs_verification_claim_paired",
  "headless_jobs_provisional_no_render_claim",
  "headless_jobs_binding_state_rules",
  "headless_jobs_provisional_terminal_reason",
  "uidx_headless_jobs_idempotency_authority",
]);

const ALLOWLISTED_SQLSTATES = new Set<string>([
  ...Object.values(HEADLESS_PG_SQLSTATE),
]);

/** Extra diagnostic SQLSTATEs (probe-only; not production branch keys). */
const DIAGNOSTIC_SQLSTATES = new Set([
  ...ALLOWLISTED_SQLSTATES,
  "0A000", // feature_not_supported
  "25006", // read_only_sql_transaction
  "25P01", // no_active_sql_transaction
  "3F000", // invalid_schema_name
  "42P01", // undefined_table
  "42703", // undefined_column
  "42883", // undefined_function
  "42P10", // invalid_column_reference (ON CONFLICT)
  "XX000", // internal_error
]);

function readRawCode(error: unknown): string | null {
  if (error == null || typeof error !== "object") return null;
  try {
    const code = (error as { code?: unknown }).code;
    if (typeof code !== "string" || code.length === 0 || code.length > 8) {
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

function allowlistedSqlState(error: unknown): string | null {
  const bounded = extractHeadlessPgSqlState(error);
  if (bounded != null) {
    if (
      DIAGNOSTIC_SQLSTATES.has(bounded) ||
      bounded.startsWith("08") ||
      /^22[0-9A-Z]{3}$/.test(bounded) ||
      /^23[0-9A-Z]{3}$/.test(bounded) ||
      /^42[0-9A-Z]{3}$/.test(bounded)
    ) {
      return bounded;
    }
  }
  const raw = readRawCode(error);
  if (raw == null) return null;
  if (
    DIAGNOSTIC_SQLSTATES.has(raw) ||
    raw.startsWith("08") ||
    /^22[0-9A-Z]{3}$/.test(raw) ||
    /^23[0-9A-Z]{3}$/.test(raw) ||
    /^42[0-9A-Z]{3}$/.test(raw)
  ) {
    return raw;
  }
  return null;
}

function sqlStateClassOf(error: unknown): string | null {
  const raw = readRawCode(error) ?? extractHeadlessPgSqlState(error);
  if (raw == null) return null;
  if (/^[0-9A-Z]{5}$/.test(raw)) return raw.slice(0, 2);
  if (raw.startsWith("08")) return "08";
  return null;
}

function safeErrorName(error: unknown): string | null {
  if (error == null || typeof error !== "object") return typeof error;
  try {
    const name = (error as { name?: unknown }).name;
    if (typeof name !== "string" || name.length === 0 || name.length > 64) {
      return "Error";
    }
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) return "Error";
    return name;
  } catch {
    return "Error";
  }
}

function wireKind(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return "bigint";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return typeof value;
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function printReport(report: ProvisionalCreateProbeReport): void {
  console.log("\nSprint 11E Phase 2B.2D — provisional create probe\n");
  console.log(`  ok=${report.ok ? "true" : "false"}`);
  console.log(`  stage=${report.stage}`);
  console.log(`  failedAt=${report.failedAt ?? "none"}`);
  console.log(`  controlPlaneCode=${report.controlPlaneCode ?? "none"}`);
  console.log(`  sqlState=${report.sqlState ?? "none"}`);
  console.log(`  sqlStateClass=${report.sqlStateClass ?? "none"}`);
  console.log(`  constraintId=${report.constraintId ?? "none"}`);
  console.log(`  errorName=${report.errorName ?? "none"}`);
  console.log(
    `  durableRowCreated=${report.durableRowCreated ? "true" : "false"}`,
  );
  console.log(`  createKind=${report.createKind ?? "none"}`);
  console.log(
    `  rowIsPlainObject=${
      report.rowIsPlainObject == null ? "n/a" : String(report.rowIsPlainObject)
    }`,
  );
  console.log(
    `  provisionalJsonIsPlainObject=${
      report.provisionalJsonIsPlainObject == null
        ? "n/a"
        : String(report.provisionalJsonIsPlainObject)
    }`,
  );
  console.log(
    `  profileJsonIsPlainObject=${
      report.profileJsonIsPlainObject == null
        ? "n/a"
        : String(report.profileJsonIsPlainObject)
    }`,
  );
  console.log(
    `  bigintFieldsWireKind=${report.bigintFieldsWireKind ?? "n/a"}`,
  );
  console.log(`  cleanup=${report.cleanup}`);
  console.log("");
}

function baseFail(
  partial: Partial<ProvisionalCreateProbeReport> &
    Pick<ProvisionalCreateProbeReport, "stage" | "controlPlaneCode">,
): Omit<ProvisionalCreateProbeReport, "cleanup" | "durableRowCreated"> {
  return {
    ok: false,
    stage: partial.stage,
    controlPlaneCode: partial.controlPlaneCode,
    sqlState: partial.sqlState ?? null,
    sqlStateClass: partial.sqlStateClass ?? null,
    constraintId: partial.constraintId ?? null,
    errorName: partial.errorName ?? null,
    failedAt: partial.failedAt ?? null,
    createKind: partial.createKind ?? null,
    rowIsPlainObject: partial.rowIsPlainObject ?? null,
    provisionalJsonIsPlainObject: partial.provisionalJsonIsPlainObject ?? null,
    profileJsonIsPlainObject: partial.profileJsonIsPlainObject ?? null,
    bigintFieldsWireKind: partial.bigintFieldsWireKind ?? null,
  };
}

export async function runProvisionalCreateProbe(
  env: NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): Promise<{
  readonly exitCode: number;
  readonly report: ProvisionalCreateProbeReport;
}> {
  const gateOn = (env as Record<string, unknown>).HEADLESS_NEON_QA === "1";
  if (!gateOn) {
    const report: ProvisionalCreateProbeReport = {
      ok: false,
      stage: "transaction",
      controlPlaneCode: "GATE_OFF",
      sqlState: null,
      sqlStateClass: null,
      constraintId: null,
      errorName: null,
      failedAt: null,
      durableRowCreated: false,
      createKind: null,
      rowIsPlainObject: null,
      provisionalJsonIsPlainObject: null,
      profileJsonIsPlainObject: null,
      bigintFieldsWireKind: null,
      cleanup: "not_run",
    };
    printReport(report);
    return { exitCode: 0, report };
  }

  if (classifyHeadlessNeonEnvironment(env) !== "configured") {
    const report: ProvisionalCreateProbeReport = {
      ok: false,
      stage: "transaction",
      controlPlaneCode: "CONFIGURATION_UNAVAILABLE",
      sqlState: null,
      sqlStateClass: null,
      constraintId: null,
      errorName: null,
      failedAt: null,
      durableRowCreated: false,
      createKind: null,
      rowIsPlainObject: null,
      provisionalJsonIsPlainObject: null,
      profileJsonIsPlainObject: null,
      bigintFieldsWireKind: null,
      cleanup: "not_run",
    };
    printReport(report);
    return { exitCode: 1, report };
  }

  const url = readConfiguredHeadlessDatabaseUrl(env);
  if (!url) {
    const report: ProvisionalCreateProbeReport = {
      ok: false,
      stage: "transaction",
      controlPlaneCode: "CONFIGURATION_UNAVAILABLE",
      sqlState: null,
      sqlStateClass: null,
      constraintId: null,
      errorName: null,
      failedAt: null,
      durableRowCreated: false,
      createKind: null,
      rowIsPlainObject: null,
      provisionalJsonIsPlainObject: null,
      profileJsonIsPlainObject: null,
      bigintFieldsWireKind: null,
      cleanup: "not_run",
    };
    printReport(report);
    return { exitCode: 1, report };
  }

  const sql = createNeonSqlExecutor({ connectionString: url });
  const runId = randomUUID();
  const ownerId = `owner_probe_${runId.replace(/-/g, "").slice(0, 16)}`;
  const projectId = randomUUID();
  let jobId: string | null = null;
  let cleanup: ProvisionalCreateProbeReport["cleanup"] = "not_run";

  const finish = async (
    partial: Omit<
      ProvisionalCreateProbeReport,
      "cleanup" | "durableRowCreated"
    > & {
      readonly durableRowCreated?: boolean;
    },
  ): Promise<{
    readonly exitCode: number;
    readonly report: ProvisionalCreateProbeReport;
  }> => {
    let durable = partial.durableRowCreated ?? false;
    try {
      if (jobId != null) {
        const count = await sql.withClient(async (client) => {
          await client.query(
            "SELECT set_config('search_path', 'public, pg_temp', true)",
          );
          const result = await client.query<{ n: string }>(
            `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE job_id = $1 AND owner_id = $2
`,
            [jobId, ownerId],
          );
          return Number(result.rows[0]?.n ?? "0");
        });
        durable = count > 0;
      }
    } catch {
      // ignore
    }

    try {
      await sql.withTransaction(async (client) => {
        await client.query(
          "SELECT set_config('search_path', 'public, pg_temp', true)",
        );
        if (jobId != null) {
          await client.query(
            `
DELETE FROM public.headless_jobs
WHERE job_id = $1 AND owner_id = $2
`,
            [jobId, ownerId],
          );
        }
        await client.query(
          `
DELETE FROM public.headless_project_ownership
WHERE project_id = $1 AND owner_id = $2
`,
          [projectId, ownerId],
        );
      });
      const remaining = await sql.withClient(async (client) => {
        await client.query(
          "SELECT set_config('search_path', 'public, pg_temp', true)",
        );
        const jobs = await client.query<{ n: string }>(
          `
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE job_id = $1 AND owner_id = $2
`,
          [jobId ?? "__none__", ownerId],
        );
        const ownership = await client.query<{ n: string }>(
          `
SELECT COUNT(*)::text AS n
FROM public.headless_project_ownership
WHERE project_id = $1 AND owner_id = $2
`,
          [projectId, ownerId],
        );
        return {
          jobs: Number(jobs.rows[0]?.n ?? "1"),
          ownership: Number(ownership.rows[0]?.n ?? "1"),
        };
      });
      cleanup =
        remaining.jobs === 0 && remaining.ownership === 0 ? "ok" : "failed";
    } catch {
      cleanup = "failed";
    }

    const report: ProvisionalCreateProbeReport = {
      ...partial,
      durableRowCreated: durable,
      cleanup,
    };
    printReport(report);
    return { exitCode: report.ok && cleanup === "ok" ? 0 : 1, report };
  };

  try {
    const preflight = await runHeadlessSchemaPreflight({ sql });
    if (!preflight.ok) {
      return finish({
        ok: false,
        stage: "transaction",
        controlPlaneCode: preflight.code,
        sqlState: null,
        sqlStateClass: null,
        constraintId: null,
        errorName: null,
        failedAt: null,
        createKind: null,
        rowIsPlainObject: null,
        provisionalJsonIsPlainObject: null,
        profileJsonIsPlainObject: null,
        bigintFieldsWireKind: null,
      });
    }

    const auth = new NeonHeadlessProjectAuthorizationAdapter(sql);
    const claim = await auth.claimUnownedProject(
      { ownerId, sessionId: `sess-probe-${runId}` },
      projectId,
    );
    if (!claim.ok) {
      return finish({
        ok: false,
        stage: "transaction",
        controlPlaneCode: claim.issues[0]?.code ?? "CLAIM_FAILED",
        sqlState: null,
        sqlStateClass: null,
        constraintId: null,
        errorName: null,
        failedAt: null,
        createKind: null,
        rowIsPlainObject: null,
        provisionalJsonIsPlainObject: null,
        profileJsonIsPlainObject: null,
        bigintFieldsWireKind: null,
      });
    }

    const draftCtx = await buildLiveDraft({
      runId,
      ownerId,
      projectId,
    });
    jobId = draftCtx.jobId;

    const validated = validateHeadlessProvisionalStoredJobRecord(
      { ...draftCtx.draft, storeVersion: 1 },
      { requireStoreVersion: true },
    );
    if (!validated.ok) {
      return finish({
        ok: false,
        stage: "input_validation",
        controlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
        sqlState: null,
        sqlStateClass: null,
        constraintId: null,
        errorName: null,
        failedAt: null,
        createKind: null,
        rowIsPlainObject: null,
        provisionalJsonIsPlainObject: null,
        profileJsonIsPlainObject: null,
        bigintFieldsWireKind: null,
      });
    }

    const record = validated.record;
    const provisionalJson = serializeProvisionalJsonPayload(record);
    const insertSql = `
INSERT INTO public.headless_jobs (
  job_id, stage, state, owner_id, project_id, store_version,
  operation_id, idempotency_authority_key, creator_idempotency_key,
  requested_renderer_profile, requested_renderer_build_id,
  provisional, canonical_job, canonical_request,
  claim_token, claimed_at_ms, artifact_object_binding,
  created_at_ms, updated_at_ms, expires_at_ms, terminal_reason,
  verification_claim_token, verification_claimed_at_ms
)
VALUES (
  $1, 'provisional', $2, $3, $4, 1,
  $5, $6, $7,
  $8::jsonb, $9,
  $10::jsonb, NULL, NULL,
  NULL, NULL, NULL,
  $11, $12, $13, $14::jsonb,
  $15, $16
)
ON CONFLICT (owner_id, project_id, idempotency_authority_key)
DO NOTHING
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`;
    const insertParams = [
      record.jobId,
      record.state,
      record.ownerId,
      record.projectId,
      record.operationId,
      record.idempotencyAuthorityKey,
      record.creatorIdempotencyKey,
      toJson(record.requestedRendererProfile),
      record.requestedRendererBuildId,
      toJson(provisionalJson),
      record.createdAtMs,
      record.updatedAtMs,
      record.expiresAtMs,
      record.terminalReason ? toJson(record.terminalReason) : null,
      record.verificationClaimToken,
      record.verificationClaimedAtMs,
    ] as const;

    let returningRow: Record<string, unknown> | null = null;
    let insertSqlState: string | null = null;
    let insertSqlStateClass: string | null = null;
    let insertConstraint: string | null = null;
    let insertErrorName: string | null = null;
    let failedAt: ProvisionalCreateProbeReport["failedAt"] = "begin";

    // Raw Pool path preserves allowlisted SQLSTATE/constraint before bounding.
    const pool = new Pool({ connectionString: url });
    try {
      const client = await pool.connect();
      try {
        failedAt = "begin";
        await client.query("BEGIN");
        failedAt = "search_path";
        await client.query(
          "SELECT set_config('search_path', 'public, pg_temp', true)",
        );
        failedAt = "savepoint";
        await client.query(`SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`);
        try {
          failedAt = "insert";
          const inserted = await client.query(insertSql, [...insertParams]);
          failedAt = "release";
          await client.query(
            `RELEASE SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`,
          );
          if (inserted.rows.length !== 1) {
            insertSqlState = HEADLESS_PG_SQLSTATE.UNIQUE_VIOLATION;
            insertSqlStateClass = "23";
            await client.query("ROLLBACK");
            return finish({
              ...baseFail({
                stage: "insert",
                controlPlaneCode: "INTERNAL_ERROR",
                sqlState: insertSqlState,
                sqlStateClass: insertSqlStateClass,
                failedAt: "insert",
              }),
              durableRowCreated: false,
            });
          }
          returningRow = inserted.rows[0] as Record<string, unknown>;
          failedAt = "commit";
          await client.query("COMMIT");
        } catch (error) {
          insertSqlState = allowlistedSqlState(error);
          insertSqlStateClass = sqlStateClassOf(error);
          insertConstraint = extractHeadlessPgConstraintId(
            error,
            ALLOWLISTED_CONSTRAINT_IDS,
          );
          insertErrorName = safeErrorName(error);
          try {
            await client.query("ROLLBACK");
          } catch {
            // ignore
          }
          return finish({
            ...baseFail({
              stage: "insert",
              controlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
              sqlState: insertSqlState,
              sqlStateClass: insertSqlStateClass,
              constraintId: insertConstraint,
              errorName: insertErrorName,
              failedAt,
            }),
            durableRowCreated: false,
          });
        }
      } catch (error) {
        return finish({
          ...baseFail({
            stage: "insert",
            controlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
            sqlState: allowlistedSqlState(error),
            sqlStateClass: sqlStateClassOf(error),
            constraintId: extractHeadlessPgConstraintId(
              error,
              ALLOWLISTED_CONSTRAINT_IDS,
            ),
            errorName: safeErrorName(error),
            failedAt,
          }),
          durableRowCreated: false,
        });
      } finally {
        client.release();
      }
    } finally {
      await pool.end().catch(() => undefined);
    }

    if (returningRow == null) {
      return finish({
        ...baseFail({
          stage: "insert",
          controlPlaneCode: "INTERNAL_ERROR",
          sqlState: insertSqlState,
          sqlStateClass: insertSqlStateClass,
          constraintId: insertConstraint,
          errorName: insertErrorName,
          failedAt,
        }),
      });
    }

    const row = returningRow;
    const rowPlain = isPlainObject(row);
    const provisionalPlain = isPlainObject(row.provisional);
    const profilePlain = isPlainObject(row.requested_renderer_profile);
    const bigintWire = [
      `store_version:${wireKind(row.store_version)}`,
      `created_at_ms:${wireKind(row.created_at_ms)}`,
      `updated_at_ms:${wireKind(row.updated_at_ms)}`,
      `expires_at_ms:${wireKind(row.expires_at_ms)}`,
    ].join(",");

    const mapped = mapHeadlessJobSqlRow(row);
    if (!mapped.ok) {
      return finish({
        ...baseFail({
          stage:
            rowPlain && provisionalPlain && profilePlain
              ? "stored_record_validation"
              : "returning_row_mapping",
          controlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
          failedAt: "map",
          rowIsPlainObject: rowPlain,
          provisionalJsonIsPlainObject: provisionalPlain,
          profileJsonIsPlainObject: profilePlain,
          bigintFieldsWireKind: bigintWire,
        }),
      });
    }
    if (mapped.record.stage !== "provisional") {
      return finish({
        ...baseFail({
          stage: "stored_record_validation",
          controlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
          failedAt: "map",
          rowIsPlainObject: rowPlain,
          provisionalJsonIsPlainObject: provisionalPlain,
          profileJsonIsPlainObject: profilePlain,
          bigintFieldsWireKind: bigintWire,
        }),
      });
    }

    // Remove diagnostic insert so the production adapter can observe `created`.
    await sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      await client.query(
        `
DELETE FROM public.headless_jobs
WHERE job_id = $1 AND owner_id = $2
`,
        [jobId, ownerId],
      );
    });

    const store = new NeonHeadlessJobStoreAdapter(sql);
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    if (!created.ok || created.value.kind !== "created") {
      return finish({
        ...baseFail({
          stage: "transaction",
          controlPlaneCode: created.ok
            ? `KIND_${created.value.kind.toUpperCase()}`
            : (created.issues[0]?.code ?? "CREATE_FAILED"),
          failedAt: "adapter_create",
          createKind: created.ok ? created.value.kind : null,
          rowIsPlainObject: rowPlain,
          provisionalJsonIsPlainObject: provisionalPlain,
          profileJsonIsPlainObject: profilePlain,
          bigintFieldsWireKind: bigintWire,
        }),
      });
    }

    const readBack = await store.getByJobIdAndOwner(jobId, ownerId);
    if (!readBack.ok || readBack.value == null) {
      return finish({
        ...baseFail({
          stage: "stored_record_validation",
          controlPlaneCode: readBack.ok
            ? "READ_MISSING"
            : (readBack.issues[0]?.code ?? "READ_FAILED"),
          failedAt: "readback",
          createKind: "created",
          rowIsPlainObject: rowPlain,
          provisionalJsonIsPlainObject: provisionalPlain,
          profileJsonIsPlainObject: profilePlain,
          bigintFieldsWireKind: bigintWire,
        }),
      });
    }

    return finish({
      ok: true,
      stage: "complete",
      controlPlaneCode: null,
      sqlState: null,
      sqlStateClass: null,
      constraintId: null,
      errorName: null,
      failedAt: null,
      createKind: "created",
      rowIsPlainObject: rowPlain,
      provisionalJsonIsPlainObject: provisionalPlain,
      profileJsonIsPlainObject: profilePlain,
      bigintFieldsWireKind: bigintWire,
    });
  } catch (error) {
    return finish({
      ...baseFail({
        stage: "transaction",
        controlPlaneCode: "UNEXPECTED",
        sqlState: allowlistedSqlState(error),
        sqlStateClass: sqlStateClassOf(error),
        constraintId: extractHeadlessPgConstraintId(
          error,
          ALLOWLISTED_CONSTRAINT_IDS,
        ),
        errorName: safeErrorName(error),
        failedAt: null,
      }),
    });
  }
}
