/**
 * Neon-backed HeadlessJobStorePort — memory-adapter behavioral parity.
 * Inject HeadlessSqlExecutor for fixture tests; production uses createNeonSqlExecutor.
 */

import { applyHeadlessJobTransition } from "../../domain/headless-job-lifecycle";
import { isHeadlessTerminalState } from "../../domain/headless-render-constants";
import { isLegalHeadlessJobTransition } from "../../domain/headless-job-lifecycle";
import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import {
  HEADLESS_CREATE_INSERT_SAVEPOINT,
  extractHeadlessPgConstraintId,
  extractHeadlessPgSqlState,
  isPostgresUniqueViolation,
  mapHeadlessDatabaseFailure,
} from "../runtime/map-database-failure";
import type { HeadlessSqlClient, HeadlessSqlExecutor } from "../runtime/sql-client";
import { assertStoredBindingStateRules } from "../services/validate-artifact-object-binding";
import {
  alreadyPromotedAuthorityMatches,
  assertCanonicalIdentityPreserved,
  assertProvisionalIdentityPreserved,
  legacyToCanonicalWrite,
  provisionalSemanticFingerprint,
} from "../services/job-store-authority";
import {
  HEADLESS_JOB_SELECT_SQL,
  mapHeadlessJobSqlRow,
  serializeProvisionalJsonPayload,
} from "../services/map-headless-job-sql-row";
import { assertProvisionalCasWriteRules } from "../services/provisional-staging-monotonicity";
import {
  emptyPromotionAttribution,
  type HeadlessPromotionAttributedResult,
  type HeadlessPromotionAttribution,
} from "../services/promotion-attribution";
import { evaluateHeadlessPromotionPreflight } from "../services/promotion-preflight-authority";
import {
  validateHeadlessCanonicalStoredJobRecord,
  validateHeadlessProvisionalStoredJobRecord,
} from "../services/validate-provisional-stored-job";
import { cpFail, cpOk } from "../types/control-plane.types";
import { HEADLESS_STORED_JOB_RECORD_VERSION } from "../types/stored-job-record";
import type {
  HeadlessCanonicalCreateLegacyWrite,
  HeadlessCanonicalStoredJobRecord,
  HeadlessJobStorePort,
  HeadlessPromoteProvisionalInput,
  HeadlessProvisionalStoreWrite,
  HeadlessStoredJobRecord,
} from "../ports/job-store.port";
import { insertPendingDispatchOutboxInTransaction } from "./neon-render-dispatch-outbox.adapter";
import { stableHeadlessDeliveryId } from "../services/stable-delivery-id";
import { parseHeadlessPgSafeInteger } from "../services/parse-headless-pg-safe-integer";

/** Repository-owned constraint names that promotion attribution may expose. */
const PROMOTION_CONSTRAINT_ALLOWLIST = new Set<string>([
  "headless_jobs_pkey",
  "headless_jobs_fk_project_owner",
  "uidx_headless_jobs_idempotency_authority",
  "headless_jobs_stage_valid",
  "headless_jobs_canonical_state_matches_json",
  "headless_jobs_canonical_payload_required",
]);

const SELECT_BY_JOB_OWNER = `
SELECT ${HEADLESS_JOB_SELECT_SQL}
FROM headless_jobs
WHERE job_id = $1 AND owner_id = $2
`;

const SELECT_BY_JOB_OWNER_FOR_UPDATE = `${SELECT_BY_JOB_OWNER} FOR UPDATE`;

const SELECT_BY_IDEMPOTENCY_FOR_SHARE = `
SELECT ${HEADLESS_JOB_SELECT_SQL}
FROM headless_jobs
WHERE owner_id = $1
  AND project_id = $2
  AND idempotency_authority_key = $3
FOR SHARE
`;

const SELECT_BY_JOB_ID = `
SELECT ${HEADLESS_JOB_SELECT_SQL}
FROM headless_jobs
WHERE job_id = $1
`;

function coherenceRejected(message: string) {
  return cpFail("JOB_STORE_COHERENCE_REJECTED", message);
}

async function readMapped(
  client: HeadlessSqlClient,
  text: string,
  params: readonly unknown[],
): Promise<
  | { readonly ok: true; readonly record: HeadlessStoredJobRecord }
  | { readonly ok: false; readonly fail: ReturnType<typeof cpFail> }
> {
  const result = await client.query(text, params);
  if (result.rows.length === 0) {
    return {
      ok: false,
      fail: cpFail("JOB_NOT_FOUND", "Job not found for owner."),
    };
  }
  const mapped = mapHeadlessJobSqlRow(result.rows[0]);
  if (!mapped.ok) {
    return { ok: false, fail: coherenceRejected(mapped.message) };
  }
  return { ok: true, record: mapped.record };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Create-if-absent insert with SAVEPOINT so a PK unique violation does not
 * leave the surrounding transaction aborted for subsequent reads.
 */
async function insertWithCreateSavepoint(
  client: HeadlessSqlClient,
  insertSql: string,
  params: readonly unknown[],
): Promise<
  | { readonly kind: "inserted"; readonly row: Record<string, unknown> }
  | { readonly kind: "conflict_noop" }
  | { readonly kind: "unique_violation" }
> {
  await client.query(`SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`);
  try {
    const inserted = await client.query(insertSql, params);
    await client.query(`RELEASE SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`);
    if (inserted.rows.length === 1) {
      return {
        kind: "inserted",
        row: inserted.rows[0] as Record<string, unknown>,
      };
    }
    return { kind: "conflict_noop" };
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) {
      throw error;
    }
    await client.query(
      `ROLLBACK TO SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`,
    );
    try {
      await client.query(
        `RELEASE SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`,
      );
    } catch {
      // Savepoint already released or cleared — transaction is usable again.
    }
    return { kind: "unique_violation" };
  }
}

export class NeonHeadlessJobStoreAdapter implements HeadlessJobStorePort {
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  private async ensureDispatchOutboxForCanonical(
    client: HeadlessSqlClient,
    record: HeadlessCanonicalStoredJobRecord,
    nowMs: number,
  ): Promise<
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string }
  > {
    if (record.canonicalJob.state !== "queued") return { ok: true };
    return insertPendingDispatchOutboxInTransaction(client, {
      jobId: record.jobId,
      ownerId: record.ownerId,
      projectId: record.projectId,
      attempt: record.canonicalJob.attempt,
      deliveryId: stableHeadlessDeliveryId(
        record.jobId,
        record.canonicalJob.attempt,
      ),
      nowMs,
    });
  }

  async createIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessCanonicalCreateLegacyWrite;
  }) {
    const coherent = validateHeadlessRenderJobCoherence(
      input.record.job,
      input.record.request,
    );
    if (!coherent.ok) {
      return coherenceRejected("Create rejected: job/request coherence failed.");
    }
    if (input.record.idempotencyAuthorityKey !== input.idempotencyAuthorityKey) {
      return coherenceRejected("idempotencyAuthorityKey mismatch on create.");
    }
    if (
      coherent.job.ownership.ownerId !== coherent.request.ownership.ownerId ||
      coherent.job.ownership.projectId !== coherent.request.ownership.projectId
    ) {
      return coherenceRejected("Ownership mismatch on create.");
    }

    const bindingRules = assertStoredBindingStateRules({
      job: coherent.job,
      request: coherent.request,
      binding: input.record.artifactObjectBinding ?? null,
    });
    if (!bindingRules.ok) {
      return coherenceRejected(bindingRules.message);
    }

    const writeResult = legacyToCanonicalWrite({
      ...input.record,
      job: coherent.job,
      request: coherent.request,
      artifactObjectBinding: bindingRules.binding,
    });
    if (!writeResult.ok) return writeResult.fail;

    const validated = validateHeadlessCanonicalStoredJobRecord({
      ...writeResult.write,
      storeVersion: 1,
    });
    if (!validated.ok) {
      return coherenceRejected(validated.message);
    }

    const record = validated.record;
    const insertSql = `
INSERT INTO headless_jobs (
  job_id, stage, state, owner_id, project_id, store_version,
  operation_id, idempotency_authority_key, creator_idempotency_key,
  requested_renderer_profile, requested_renderer_build_id,
  provisional, canonical_job, canonical_request,
  claim_token, claimed_at_ms, artifact_object_binding,
  created_at_ms, updated_at_ms, expires_at_ms, terminal_reason,
  verification_claim_token, verification_claimed_at_ms
)
VALUES (
  $1, 'canonical', $2, $3, $4, 1,
  $5, $6, NULL,
  NULL, NULL,
  NULL, $7::jsonb, $8::jsonb,
  $9, $10, $11::jsonb,
  $12, $13, NULL, NULL,
  NULL, NULL
)
ON CONFLICT (owner_id, project_id, idempotency_authority_key)
DO NOTHING
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`;
    const insertParams = [
      record.jobId,
      record.canonicalJob.state,
      record.ownerId,
      record.projectId,
      record.operationId,
      record.idempotencyAuthorityKey,
      toJson(record.canonicalJob),
      toJson(record.canonicalRequest),
      record.claimToken,
      record.claimedAtMs,
      record.artifactObjectBinding
        ? toJson(record.artifactObjectBinding)
        : null,
      record.createdAtMs,
      record.updatedAtMs,
    ] as const;

    try {
      return await this.sql.withTransaction(async (client) => {
        const insert = await insertWithCreateSavepoint(
          client,
          insertSql,
          insertParams,
        );
        if (insert.kind === "inserted") {
          const mapped = mapHeadlessJobSqlRow(insert.row);
          if (!mapped.ok || mapped.record.stage !== "canonical") {
            return coherenceRejected(
              mapped.ok ? "Canonical create rehydrate failed." : mapped.message,
            );
          }
          return cpOk({
            kind: "created" as const,
            record: mapped.record,
          });
        }

        if (insert.kind === "unique_violation") {
          const byId = await client.query(SELECT_BY_JOB_ID, [record.jobId]);
          const byIdem = await client.query(SELECT_BY_IDEMPOTENCY_FOR_SHARE, [
            record.ownerId,
            record.projectId,
            record.idempotencyAuthorityKey,
          ]);
          if (byId.rows.length > 0 && byIdem.rows.length === 0) {
            return cpFail("INTERNAL_ERROR", "Job id collision.");
          }
          if (byId.rows.length > 0 && byIdem.rows.length > 0) {
            const idMapped = mapHeadlessJobSqlRow(byId.rows[0]);
            const idemMapped = mapHeadlessJobSqlRow(byIdem.rows[0]);
            if (
              idMapped.ok &&
              idemMapped.ok &&
              idMapped.record.jobId !== idemMapped.record.jobId
            ) {
              return cpFail("INTERNAL_ERROR", "Job id collision.");
            }
          }
          if (byIdem.rows.length === 0) {
            return cpFail("INTERNAL_ERROR", "Job id collision.");
          }
        }

        const existing = await client.query(SELECT_BY_IDEMPOTENCY_FOR_SHARE, [
          record.ownerId,
          record.projectId,
          record.idempotencyAuthorityKey,
        ]);
        if (existing.rows.length === 0) {
          return cpFail("INTERNAL_ERROR", "Idempotency index corruption.");
        }
        const mapped = mapHeadlessJobSqlRow(existing.rows[0]);
        if (!mapped.ok) {
          return coherenceRejected(mapped.message);
        }
        if (mapped.record.stage !== "canonical") {
          return cpOk({
            kind: "conflict" as const,
            existingRequestFingerprint: "provisional",
          });
        }
        if (
          mapped.record.canonicalRequest.requestFingerprint !==
          coherent.request.requestFingerprint
        ) {
          return cpOk({
            kind: "conflict" as const,
            existingRequestFingerprint:
              mapped.record.canonicalRequest.requestFingerprint,
          });
        }
        return cpOk({
          kind: "existing" as const,
          record: mapped.record,
        });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async createProvisionalIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessProvisionalStoreWrite;
  }) {
    if (input.record.idempotencyAuthorityKey !== input.idempotencyAuthorityKey) {
      return coherenceRejected(
        "idempotencyAuthorityKey mismatch on provisional create.",
      );
    }
    const validated = validateHeadlessProvisionalStoredJobRecord(
      { ...input.record, storeVersion: 1 },
      { requireStoreVersion: true },
    );
    if (!validated.ok) {
      return coherenceRejected(validated.message);
    }
    const record = validated.record;
    const provisionalJson = serializeProvisionalJsonPayload(record);

    const insertSql = `
INSERT INTO headless_jobs (
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

    try {
      return await this.sql.withTransaction(async (client) => {
        const insert = await insertWithCreateSavepoint(
          client,
          insertSql,
          insertParams,
        );
        if (insert.kind === "inserted") {
          const mapped = mapHeadlessJobSqlRow(insert.row);
          if (!mapped.ok || mapped.record.stage !== "provisional") {
            return coherenceRejected(
              mapped.ok
                ? "Provisional create rehydrate failed."
                : mapped.message,
            );
          }
          return cpOk({
            kind: "created" as const,
            record: mapped.record,
          });
        }

        if (insert.kind === "unique_violation") {
          const byId = await client.query(SELECT_BY_JOB_ID, [record.jobId]);
          const byIdem = await client.query(SELECT_BY_IDEMPOTENCY_FOR_SHARE, [
            record.ownerId,
            record.projectId,
            record.idempotencyAuthorityKey,
          ]);
          if (byId.rows.length > 0 && byIdem.rows.length === 0) {
            return cpFail("INTERNAL_ERROR", "Job id collision.");
          }
          if (byId.rows.length > 0 && byIdem.rows.length > 0) {
            const idMapped = mapHeadlessJobSqlRow(byId.rows[0]);
            const idemMapped = mapHeadlessJobSqlRow(byIdem.rows[0]);
            if (
              idMapped.ok &&
              idemMapped.ok &&
              idMapped.record.jobId !== idemMapped.record.jobId
            ) {
              return cpFail("INTERNAL_ERROR", "Job id collision.");
            }
          }
          if (byIdem.rows.length === 0) {
            return cpFail("INTERNAL_ERROR", "Job id collision.");
          }
        }

        const existing = await client.query(SELECT_BY_IDEMPOTENCY_FOR_SHARE, [
          record.ownerId,
          record.projectId,
          record.idempotencyAuthorityKey,
        ]);
        if (existing.rows.length === 0) {
          return cpFail("INTERNAL_ERROR", "Idempotency index corruption.");
        }
        const mapped = mapHeadlessJobSqlRow(existing.rows[0]);
        if (!mapped.ok) {
          return coherenceRejected(mapped.message);
        }
        if (mapped.record.stage === "provisional") {
          if (
            provisionalSemanticFingerprint(mapped.record) !==
            provisionalSemanticFingerprint(record)
          ) {
            return cpOk({
              kind: "conflict" as const,
              existingJobId: mapped.record.jobId,
            });
          }
          return cpOk({
            kind: "existing" as const,
            record: mapped.record,
          });
        }
        return cpOk({
          kind: "conflict" as const,
          existingJobId: mapped.record.jobId,
        });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async getByJobIdAndOwner(jobId: string, ownerId: string) {
    try {
      return await this.sql.withClient(async (client) => {
        const read = await readMapped(client, SELECT_BY_JOB_OWNER, [
          jobId,
          ownerId,
        ]);
        if (!read.ok) return read.fail;
        return cpOk(read.record);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async compareAndSetProvisional(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessProvisionalStoreWrite;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await readMapped(
          client,
          SELECT_BY_JOB_OWNER_FOR_UPDATE,
          [input.jobId, input.ownerId],
        );
        if (!locked.ok) return locked.fail;
        const current = locked.record;

        if (current.stage === "canonical") {
          return cpOk({ kind: "already_promoted" as const });
        }
        if (current.state !== "materializing") {
          return cpOk({ kind: "terminal_locked" as const });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "stale" as const });
        }

        const identity = assertProvisionalIdentityPreserved(current, input.next);
        if (identity) return identity;

        if (input.next.updatedAtMs < current.updatedAtMs) {
          return coherenceRejected("Provisional updatedAtMs must be monotonic.");
        }

        const casRules = assertProvisionalCasWriteRules({
          current,
          next: input.next,
        });
        if (!casRules.ok) {
          return coherenceRejected(casRules.message);
        }

        const validated = validateHeadlessProvisionalStoredJobRecord(
          { ...input.next, storeVersion: current.storeVersion + 1 },
          { requireStoreVersion: true },
        );
        if (!validated.ok) {
          return coherenceRejected(validated.message);
        }

        const next = validated.record;
        const updated = await client.query(
          `
UPDATE headless_jobs
SET
  state = $1,
  store_version = store_version + 1,
  updated_at_ms = $2,
  provisional = $3::jsonb,
  terminal_reason = $4::jsonb,
  verification_claim_token = $5,
  verification_claimed_at_ms = $6
WHERE job_id = $7
  AND owner_id = $8
  AND stage = 'provisional'
  AND state = 'materializing'
  AND store_version = $9
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`,
          [
            next.state,
            next.updatedAtMs,
            toJson(serializeProvisionalJsonPayload(next)),
            next.terminalReason ? toJson(next.terminalReason) : null,
            next.verificationClaimToken,
            next.verificationClaimedAtMs,
            input.jobId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );

        if (updated.rows.length === 0) {
          const again = await readMapped(client, SELECT_BY_JOB_OWNER, [
            input.jobId,
            input.ownerId,
          ]);
          if (!again.ok) return again.fail;
          if (again.record.stage === "canonical") {
            return cpOk({ kind: "already_promoted" as const });
          }
          if (
            again.record.stage === "provisional" &&
            again.record.state !== "materializing"
          ) {
            return cpOk({ kind: "terminal_locked" as const });
          }
          return cpOk({ kind: "stale" as const });
        }

        const mapped = mapHeadlessJobSqlRow(updated.rows[0]);
        if (!mapped.ok || mapped.record.stage !== "provisional") {
          return coherenceRejected(
            mapped.ok ? "Provisional CAS rehydrate failed." : mapped.message,
          );
        }
        return cpOk({ kind: "updated" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async promoteProvisionalToCanonical(input: HeadlessPromoteProvisionalInput) {
    const attributed = await this.promoteProvisionalToCanonicalAttributed(input);
    return attributed.result;
  }

  /**
   * QA/testing attribution surface — identical durable semantics to production promote.
   */
  async promoteProvisionalToCanonicalAttributed(
    input: HeadlessPromoteProvisionalInput,
  ): Promise<HeadlessPromotionAttributedResult> {
    let attribution: HeadlessPromotionAttribution =
      emptyPromotionAttribution("promotion_record_read");
    try {
      return await this.sql.withTransaction(async (client) => {
        attribution = emptyPromotionAttribution("promotion_record_read");
        const locked = await readMapped(
          client,
          SELECT_BY_JOB_OWNER_FOR_UPDATE,
          [input.jobId, input.ownerId],
        );
        if (!locked.ok) {
          return {
            result: locked.fail,
            attribution: {
              ...attribution,
              promotionResultKind: "control_plane_failure",
              safeControlPlaneCode: locked.fail.issues[0]?.code ?? null,
              promotionReasonId: "unknown_safe_failure",
            },
          };
        }
        const current = locked.record;
        const beforeVersion = current.storeVersion;
        attribution = {
          ...attribution,
          stageClassification: current.stage,
          durableCanonicalRowExists: current.stage === "canonical",
        };

        attribution = {
          ...attribution,
          safeOperationStage: "promotion_preflight",
        };
        const preflight = evaluateHeadlessPromotionPreflight({
          current,
          promote: input,
        });
        if (!preflight.ok) {
          if (preflight.outcome === "already_promoted") {
            const ensured = await this.ensureDispatchOutboxForCanonical(
              client,
              preflight.record,
              Math.max(
                preflight.record.updatedAtMs,
                preflight.record.createdAtMs,
              ),
            );
            if (!ensured.ok) {
              return {
                result: cpOk({
                  kind: "rejected" as const,
                  message: ensured.message,
                }),
                attribution: {
                  ...attribution,
                  promotionResultKind: "rejected",
                  promotionReasonId: "dispatch_outbox_ensure_failed",
                  storeVersionDelta: "unchanged",
                },
              };
            }
            return {
              result: cpOk({
                kind: "already_promoted" as const,
                record: preflight.record,
              }),
              attribution: {
                ...attribution,
                promotionResultKind: "already_promoted",
                durableCanonicalRowExists: true,
                stageClassification: "canonical",
                storeVersionDelta: "unchanged",
                promotionReasonId: null,
              },
            };
          }
          if (preflight.outcome === "stale") {
            return {
              result: cpOk({ kind: "stale" as const }),
              attribution: {
                ...attribution,
                promotionResultKind: "stale",
                promotionReasonId: preflight.reasonId,
                storeVersionDelta: "unchanged",
              },
            };
          }
          return {
            result: cpOk({
              kind: "rejected" as const,
              message: preflight.message,
            }),
            attribution: {
              ...attribution,
              promotionResultKind: "rejected",
              promotionReasonId: preflight.reasonId,
              storeVersionDelta: "unchanged",
            },
          };
        }

        const next = preflight.record;
        attribution = {
          ...attribution,
          safeOperationStage: "promotion_update",
        };
        let updated;
        try {
          updated = await client.query(
            `
UPDATE public.headless_jobs
SET
  stage = 'canonical',
  state = $1,
  store_version = store_version + 1,
  updated_at_ms = $2,
  provisional = NULL,
  canonical_job = $3::jsonb,
  canonical_request = $4::jsonb,
  requested_renderer_profile = NULL,
  requested_renderer_build_id = NULL,
  creator_idempotency_key = NULL,
  expires_at_ms = NULL,
  terminal_reason = NULL,
  verification_claim_token = NULL,
  verification_claimed_at_ms = NULL,
  claim_token = NULL,
  claimed_at_ms = NULL,
  artifact_object_binding = NULL
WHERE job_id = $5
  AND owner_id = $6
  AND stage = 'provisional'
  AND state = 'materializing'
  AND store_version = $7
  AND operation_id = $8
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`,
            [
              next.canonicalJob.state,
              next.updatedAtMs,
              toJson(next.canonicalJob),
              toJson(next.canonicalRequest),
              input.jobId,
              input.ownerId,
              input.expectedStoreVersion,
              input.expectedOperationId,
            ],
          );
        } catch (error) {
          const mapped = mapHeadlessDatabaseFailure(error);
          return {
            result: mapped,
            attribution: {
              ...attribution,
              safeOperationStage: "promotion_update",
              promotionResultKind: "control_plane_failure",
              safeControlPlaneCode: mapped.issues[0]?.code ?? null,
              allowlistedSqlState: extractHeadlessPgSqlState(error),
              allowlistedConstraint: extractHeadlessPgConstraintId(
                error,
                PROMOTION_CONSTRAINT_ALLOWLIST,
              ),
              promotionReasonId: "promotion_update_failed",
            },
          };
        }

        if (updated.rows.length === 0) {
          const again = await readMapped(client, SELECT_BY_JOB_OWNER, [
            input.jobId,
            input.ownerId,
          ]);
          if (!again.ok) {
            return {
              result: again.fail,
              attribution: {
                ...attribution,
                safeOperationStage: "promotion_update",
                promotionResultKind: "control_plane_failure",
                safeControlPlaneCode: again.fail.issues[0]?.code ?? null,
                promotionReasonId: "promotion_update_failed",
              },
            };
          }
          if (again.record.stage === "canonical") {
            if (alreadyPromotedAuthorityMatches(again.record, input)) {
              const ensured = await this.ensureDispatchOutboxForCanonical(
                client,
                again.record,
                Math.max(again.record.updatedAtMs, again.record.createdAtMs),
              );
              if (!ensured.ok) {
                return {
                  result: cpOk({
                    kind: "rejected" as const,
                    message: ensured.message,
                  }),
                  attribution: {
                    ...attribution,
                    promotionResultKind: "rejected",
                    promotionReasonId: "dispatch_outbox_ensure_failed",
                    storeVersionDelta: "unchanged",
                  },
                };
              }
              return {
                result: cpOk({
                  kind: "already_promoted" as const,
                  record: again.record,
                }),
                attribution: {
                  ...attribution,
                  promotionResultKind: "already_promoted",
                  durableCanonicalRowExists: true,
                  stageClassification: "canonical",
                  storeVersionDelta: "unchanged",
                  promotionReasonId: null,
                },
              };
            }
            return {
              result: cpOk({
                kind: "rejected" as const,
                message:
                  "Forged or mismatched promotion against an existing canonical job rejected.",
              }),
              attribution: {
                ...attribution,
                promotionResultKind: "rejected",
                durableCanonicalRowExists: true,
                stageClassification: "canonical",
                promotionReasonId: "already_promoted_mismatch",
              },
            };
          }
          return {
            result: cpOk({ kind: "stale" as const }),
            attribution: {
              ...attribution,
              promotionResultKind: "stale",
              promotionReasonId: "stale_store_version",
              storeVersionDelta: "unchanged",
              stageClassification: "provisional",
            },
          };
        }

        attribution = {
          ...attribution,
          safeOperationStage: "promotion_rehydrate",
        };
        const mapped = mapHeadlessJobSqlRow(updated.rows[0]);
        if (!mapped.ok || mapped.record.stage !== "canonical") {
          const fail = coherenceRejected(
            mapped.ok ? "Promotion rehydrate failed." : mapped.message,
          );
          return {
            result: fail,
            attribution: {
              ...attribution,
              promotionResultKind: "control_plane_failure",
              safeControlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
              promotionReasonId: "promotion_rehydrate_failed",
            },
          };
        }

        const ensured = await this.ensureDispatchOutboxForCanonical(
          client,
          mapped.record,
          mapped.record.updatedAtMs,
        );
        if (!ensured.ok) {
          // Fail the transaction — promotion cannot leave queued job without outbox.
          throw new Error("DISPATCH_OUTBOX_ENSURE_FAILED");
        }

        const delta =
          mapped.record.storeVersion === beforeVersion + 1
            ? ("plus_one" as const)
            : ("unexpected" as const);
        return {
          result: cpOk({ kind: "updated" as const, record: mapped.record }),
          attribution: {
            ...attribution,
            safeOperationStage: "promotion_post_write",
            promotionResultKind: "updated",
            durableCanonicalRowExists: true,
            stageClassification: "canonical",
            storeVersionDelta: delta,
            promotionReasonId:
              delta === "plus_one" ? null : "post_write_coherence_failed",
          },
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "DISPATCH_OUTBOX_ENSURE_FAILED"
      ) {
        return {
          result: cpOk({
            kind: "rejected" as const,
            message: "Dispatch outbox ensure failed.",
          }),
          attribution: {
            ...emptyPromotionAttribution("promotion"),
            promotionResultKind: "rejected",
            promotionReasonId: "dispatch_outbox_ensure_failed",
          },
        };
      }
      const mapped = mapHeadlessDatabaseFailure(error);
      return {
        result: mapped,
        attribution: {
          ...emptyPromotionAttribution("promotion"),
          promotionResultKind: "control_plane_failure",
          safeControlPlaneCode: mapped.issues[0]?.code ?? null,
          allowlistedSqlState: extractHeadlessPgSqlState(error),
          allowlistedConstraint: extractHeadlessPgConstraintId(
            error,
            PROMOTION_CONSTRAINT_ALLOWLIST,
          ),
          promotionReasonId: "unknown_safe_failure",
        },
      };
    }
  }

  async compareAndSetTransition(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessCanonicalCreateLegacyWrite;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await readMapped(
          client,
          SELECT_BY_JOB_OWNER_FOR_UPDATE,
          [input.jobId, input.ownerId],
        );
        if (!locked.ok) return locked.fail;
        const current = locked.record;

        if (current.stage !== "canonical") {
          return coherenceRejected(
            "Provisional records cannot use canonical transitions.",
          );
        }
        if (isHeadlessTerminalState(current.canonicalJob.state)) {
          return cpOk({ kind: "terminal_locked" as const });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "stale" as const });
        }
        if (
          current.claimToken != null &&
          input.next.claimToken != null &&
          input.next.claimToken !== current.claimToken
        ) {
          return cpOk({ kind: "stale" as const });
        }

        const identity = assertCanonicalIdentityPreserved(current, input.next);
        if (identity) return identity;

        const coherent = validateHeadlessRenderJobCoherence(
          input.next.job,
          input.next.request,
        );
        if (!coherent.ok) {
          return coherenceRejected("CAS rejected: job/request coherence failed.");
        }
        if (
          !isLegalHeadlessJobTransition(
            current.canonicalJob.state,
            coherent.job.state,
          ) &&
          current.canonicalJob.state !== coherent.job.state
        ) {
          return coherenceRejected(
            "CAS rejected: illegal lifecycle transition.",
          );
        }

        const bindingRules = assertStoredBindingStateRules({
          job: coherent.job,
          request: coherent.request,
          binding: input.next.artifactObjectBinding ?? null,
        });
        if (!bindingRules.ok) {
          return coherenceRejected(bindingRules.message);
        }

        const writeResult = legacyToCanonicalWrite({
          ...input.next,
          job: coherent.job,
          request: coherent.request,
          artifactObjectBinding: bindingRules.binding,
          idempotencyAuthorityKey: current.idempotencyAuthorityKey,
          operationId: current.operationId,
        });
        if (!writeResult.ok) return writeResult.fail;

        const validated = validateHeadlessCanonicalStoredJobRecord({
          ...writeResult.write,
          storeVersion: current.storeVersion + 1,
          createdAtMs: current.createdAtMs,
          updatedAtMs: coherent.job.updatedAtMs,
        });
        if (!validated.ok) {
          return coherenceRejected(validated.message);
        }

        const next = validated.record;
        const updated = await client.query(
          `
UPDATE headless_jobs
SET
  state = $1,
  store_version = store_version + 1,
  updated_at_ms = $2,
  canonical_job = $3::jsonb,
  canonical_request = $4::jsonb,
  claim_token = $5,
  claimed_at_ms = $6,
  artifact_object_binding = $7::jsonb
WHERE job_id = $8
  AND owner_id = $9
  AND stage = 'canonical'
  AND store_version = $10
  AND state NOT IN ('succeeded', 'failed', 'cancelled', 'expired')
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`,
          [
            next.canonicalJob.state,
            next.updatedAtMs,
            toJson(next.canonicalJob),
            toJson(next.canonicalRequest),
            next.claimToken,
            next.claimedAtMs,
            next.artifactObjectBinding
              ? toJson(next.artifactObjectBinding)
              : null,
            input.jobId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );

        if (updated.rows.length === 0) {
          const again = await readMapped(client, SELECT_BY_JOB_OWNER, [
            input.jobId,
            input.ownerId,
          ]);
          if (!again.ok) return again.fail;
          if (
            again.record.stage === "canonical" &&
            isHeadlessTerminalState(again.record.canonicalJob.state)
          ) {
            return cpOk({ kind: "terminal_locked" as const });
          }
          return cpOk({ kind: "stale" as const });
        }

        const mapped = mapHeadlessJobSqlRow(updated.rows[0]);
        if (!mapped.ok || mapped.record.stage !== "canonical") {
          return coherenceRejected(
            mapped.ok ? "Canonical CAS rehydrate failed." : mapped.message,
          );
        }
        return cpOk({ kind: "updated" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async claimQueuedJob(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    claimToken: string;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await readMapped(
          client,
          SELECT_BY_JOB_OWNER_FOR_UPDATE,
          [input.jobId, input.ownerId],
        );
        if (!locked.ok) return cpOk({ kind: "rejected" as const });
        const current = locked.record;
        if (current.stage !== "canonical") {
          return cpOk({ kind: "rejected" as const });
        }
        if (current.canonicalJob.state !== "queued") {
          return cpOk({ kind: "rejected" as const });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "rejected" as const });
        }
        if (current.claimToken != null) {
          return cpOk({ kind: "rejected" as const });
        }

        const updated = await client.query(
          `
UPDATE headless_jobs
SET
  store_version = store_version + 1,
  claim_token = $1,
  claimed_at_ms = $2
WHERE job_id = $3
  AND owner_id = $4
  AND stage = 'canonical'
  AND state = 'queued'
  AND store_version = $5
  AND claim_token IS NULL
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`,
          [
            input.claimToken,
            input.nowMs,
            input.jobId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "rejected" as const });
        }
        const mapped = mapHeadlessJobSqlRow(updated.rows[0]);
        if (!mapped.ok || mapped.record.stage !== "canonical") {
          return cpOk({ kind: "rejected" as const });
        }
        return cpOk({ kind: "claimed" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async recoverExpiredClaim(input: {
    jobId: string;
    ownerId: string;
    nowMs: number;
    leaseMs: number;
    expectedClaimToken?: string | null;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await readMapped(
          client,
          SELECT_BY_JOB_OWNER_FOR_UPDATE,
          [input.jobId, input.ownerId],
        );
        if (!locked.ok) return cpOk({ kind: "rejected" as const });
        const current = locked.record;
        if (current.stage !== "canonical") {
          return cpOk({ kind: "rejected" as const });
        }
        if (isHeadlessTerminalState(current.canonicalJob.state)) {
          return cpOk({ kind: "rejected_terminal" as const });
        }
        if (current.claimToken == null || current.claimedAtMs == null) {
          return cpOk({ kind: "rejected" as const });
        }
        if (
          input.expectedClaimToken != null &&
          current.claimToken !== input.expectedClaimToken
        ) {
          return cpOk({ kind: "rejected" as const });
        }

        const expiresAt = current.claimedAtMs + input.leaseMs;
        if (input.nowMs <= expiresAt) {
          return cpOk({ kind: "rejected_live_claim" as const });
        }

        const failed = applyHeadlessJobTransition({
          jobValue: current.canonicalJob,
          requestValue: current.canonicalRequest,
          toState: "failed",
          attempt: current.canonicalJob.attempt,
          updatedAtMs: Math.max(
            input.nowMs,
            current.canonicalJob.updatedAtMs + 1,
          ),
          terminalReason: { reasonId: "CLAIM_LEASE_EXPIRED", retryable: true },
        });
        if (!failed.ok) {
          return coherenceRejected("Lease recovery failed.");
        }

        const validated = validateHeadlessCanonicalStoredJobRecord({
          version: HEADLESS_STORED_JOB_RECORD_VERSION,
          stage: "canonical",
          storeVersion: current.storeVersion + 1,
          jobId: current.jobId,
          ownerId: current.ownerId,
          projectId: current.projectId,
          createdAtMs: current.createdAtMs,
          updatedAtMs: failed.job.updatedAtMs,
          idempotencyAuthorityKey: current.idempotencyAuthorityKey,
          operationId: current.operationId,
          canonicalJob: failed.job,
          canonicalRequest: current.canonicalRequest,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        });
        if (!validated.ok) {
          return coherenceRejected(validated.message);
        }

        const next = validated.record;
        const updated = await client.query(
          `
UPDATE headless_jobs
SET
  state = 'failed',
  store_version = store_version + 1,
  updated_at_ms = $1,
  canonical_job = $2::jsonb,
  canonical_request = $3::jsonb,
  claim_token = NULL,
  claimed_at_ms = NULL,
  artifact_object_binding = NULL,
  terminal_reason = $4::jsonb
WHERE job_id = $5
  AND owner_id = $6
  AND stage = 'canonical'
  AND store_version = $7
  AND claim_token IS NOT NULL
  AND state NOT IN ('succeeded', 'failed', 'cancelled', 'expired')
RETURNING ${HEADLESS_JOB_SELECT_SQL}
`,
          [
            next.updatedAtMs,
            toJson(next.canonicalJob),
            toJson(next.canonicalRequest),
            toJson({ reasonId: "CLAIM_LEASE_EXPIRED", retryable: true }),
            input.jobId,
            input.ownerId,
            current.storeVersion,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "rejected" as const });
        }
        const mapped = mapHeadlessJobSqlRow(updated.rows[0]);
        if (!mapped.ok || mapped.record.stage !== "canonical") {
          return coherenceRejected(
            mapped.ok ? "Recover rehydrate failed." : mapped.message,
          );
        }
        return cpOk({
          kind: "failed_expired" as const,
          record: mapped.record,
        });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listQueuedJobIds(limit: number) {
    return this.listCanonicalQueuedJobIds(limit);
  }

  async listCanonicalQueuedDispatchCandidates(limit: number) {
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    ) {
      return cpFail("INVALID_TRANSPORT", "Queue list limit is invalid.");
    }
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(
          `
SELECT
  job_id,
  owner_id,
  (canonical_job->>'attempt')::bigint AS attempt,
  store_version,
  updated_at_ms
FROM public.headless_jobs
WHERE stage = 'canonical'
  AND state = 'queued'
  AND claim_token IS NULL
ORDER BY created_at_ms ASC
LIMIT $1
`,
          [limit],
        );
        const candidates: {
          readonly jobId: string;
          readonly ownerId: string;
          readonly attempt: number;
          readonly storeVersion: number;
          readonly updatedAtMs: number;
        }[] = [];
        for (const row of result.rows as Record<string, unknown>[]) {
          const attempt = parseHeadlessPgSafeInteger(row.attempt, {
            min: 1,
            max: 1_000_000,
          });
          const storeVersion = parseHeadlessPgSafeInteger(row.store_version, {
            min: 1,
          });
          const updatedAtMs = parseHeadlessPgSafeInteger(row.updated_at_ms, {
            min: 0,
          });
          if (
            typeof row.job_id !== "string" ||
            row.job_id.trim().length === 0 ||
            typeof row.owner_id !== "string" ||
            row.owner_id.trim().length === 0 ||
            !attempt.ok ||
            !storeVersion.ok ||
            !updatedAtMs.ok
          ) {
            return cpFail(
              "JOB_STORE_COHERENCE_REJECTED",
              "Malformed queued dispatch candidate row.",
            );
          }
          candidates.push(
            Object.freeze({
              jobId: row.job_id,
              ownerId: row.owner_id,
              attempt: attempt.value,
              storeVersion: storeVersion.value,
              updatedAtMs: updatedAtMs.value,
            }),
          );
        }
        return cpOk(candidates);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listCanonicalQueuedJobIds(limit: number) {
    const listed = await this.listCanonicalQueuedDispatchCandidates(limit);
    if (!listed.ok) return listed;
    return cpOk(listed.value.map((c) => c.jobId));
  }
}
