/**
 * Neon-backed HeadlessOwnedObjectStorePort — memory-adapter behavioral parity.
 * Inject HeadlessSqlExecutor for fixture tests; production uses createNeonSqlExecutor.
 * Schema-qualified public.headless_owned_objects. Parameterized SQL only.
 * Success paths ALWAYS rehydrate via mapHeadlessOwnedObjectSqlRow — never assemble
 * from local input after RETURNING.
 */

import {
  HEADLESS_CREATE_INSERT_SAVEPOINT,
  isPostgresUniqueViolation,
  mapHeadlessDatabaseFailure,
} from "../runtime/map-database-failure";
import type { HeadlessSqlClient, HeadlessSqlExecutor } from "../runtime/sql-client";
import {
  HEADLESS_OWNED_OBJECT_SELECT_SQL,
  mapHeadlessOwnedObjectSqlRow,
} from "../services/map-headless-owned-object-sql-row";
import { validateHeadlessOwnedObjectRecord } from "../services/validate-owned-object-record";
import { cpFail, cpOk } from "../types/control-plane.types";
import {
  HEADLESS_OWNED_OBJECT_RECORD_VERSION,
  type HeadlessStagingOwnedObjectRecordV1,
} from "../types/owned-object-record";
import type {
  HeadlessCreateStagingOwnedObjectInput,
  HeadlessFinalizeStagingOwnedObjectInput,
  HeadlessOwnedObjectStorePort,
  HeadlessStoredOwnedObject,
} from "../ports/owned-object-store.port";

const SELECT_BY_OBJECT_OWNER = `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE object_id = $1 AND owner_id = $2
`;

const SELECT_BY_OBJECT_OWNER_FOR_UPDATE = `${SELECT_BY_OBJECT_OWNER} FOR UPDATE`;

const SELECT_BY_OBJECT_ID = `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE object_id = $1
`;

const SELECT_BY_STORE_KEY = `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE store_id = $1 AND object_key = $2
`;

function coherenceRejected(message: string) {
  return cpFail("JOB_STORE_COHERENCE_REJECTED", message);
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

function sameStagingIdentity(
  existing: HeadlessStoredOwnedObject,
  input: HeadlessCreateStagingOwnedObjectInput,
): boolean {
  const r = existing.record;
  return (
    r.stage === "staging" &&
    r.objectId === input.objectId &&
    r.ownerId === input.ownerId &&
    r.projectId === input.projectId &&
    r.jobId === input.jobId &&
    r.operationId === input.operationId &&
    r.purpose === input.purpose &&
    r.slotKey === input.slotKey &&
    r.storeId === input.storeId &&
    r.objectKey === input.objectKey &&
    r.expectedContentDigestClaim === input.expectedContentDigestClaim &&
    r.expectedByteLength === input.expectedByteLength &&
    r.expectedMimeType === input.expectedMimeType
  );
}

async function mapRow(
  row: unknown,
): Promise<
  | { readonly ok: true; readonly stored: HeadlessStoredOwnedObject }
  | { readonly ok: false; readonly fail: ReturnType<typeof cpFail> }
> {
  const mapped = mapHeadlessOwnedObjectSqlRow(row);
  if (!mapped.ok) {
    return { ok: false, fail: coherenceRejected(mapped.message) };
  }
  return { ok: true, stored: mapped.stored };
}

async function insertWithCreateSavepoint(
  client: HeadlessSqlClient,
  insertSql: string,
  params: readonly unknown[],
): Promise<
  | { readonly kind: "inserted"; readonly row: Record<string, unknown> }
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
    return { kind: "unique_violation" };
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
      // Savepoint already released — transaction usable again.
    }
    return { kind: "unique_violation" };
  }
}

function boundLimit(limit: number): number | null {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  return limit;
}

export class NeonHeadlessOwnedObjectStoreAdapter
  implements HeadlessOwnedObjectStorePort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  async createStagingRecord(input: HeadlessCreateStagingOwnedObjectInput) {
    const staging: HeadlessStagingOwnedObjectRecordV1 = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: input.objectId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      jobId: input.jobId,
      operationId: input.operationId,
      purpose: input.purpose,
      slotKey: input.slotKey,
      provider: "r2",
      storeId: input.storeId,
      objectKey: input.objectKey,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
      stage: "staging",
      expectedContentDigestClaim: input.expectedContentDigestClaim,
      expectedByteLength: input.expectedByteLength,
      expectedMimeType: input.expectedMimeType,
      uploadCapabilityIssuedAtMs: input.uploadCapabilityIssuedAtMs,
      uploadCapabilityExpiresAtMs: input.uploadCapabilityExpiresAtMs,
      uploadedObservedAtMs: null,
      verificationState: "unclaimed",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: null,
      expiresAtMs: input.expiresAtMs,
      contentDigest: null,
      byteLength: null,
      mimeType: null,
      finalizedMetadata: null,
      terminalReason: null,
      cleanupScheduledAtMs: null,
    };
    const validated = validateHeadlessOwnedObjectRecord(staging);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", validated.message);
    }
    const record = validated.record;
    if (record.stage !== "staging") {
      return cpFail("HOSTILE_INPUT", "Staging create rejected.");
    }

    const insertSql = `
INSERT INTO public.headless_owned_objects (
  object_id, owner_id, project_id, job_id, operation_id,
  purpose, slot_key, stage, store_id, object_key, store_version,
  expected_content_digest_claim, expected_byte_length, expected_mime_type,
  content_digest, byte_length, mime_type,
  upload_capability_issued_at_ms, upload_capability_expires_at_ms,
  uploaded_observed_at_ms, verification_state, verification_claim_token,
  verification_claimed_at_ms, verified_at_ms, expires_at_ms,
  finalized_metadata, terminal_reason, cleanup_scheduled_at_ms,
  created_at_ms, updated_at_ms
)
VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, 'staging', $8, $9, 1,
  $10, $11, $12,
  NULL, NULL, NULL,
  $13, $14,
  NULL, 'unclaimed', NULL,
  NULL, NULL, $15,
  NULL, NULL, NULL,
  $16, $17
)
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`;
    const params = [
      record.objectId,
      record.ownerId,
      record.projectId,
      record.jobId,
      record.operationId,
      record.purpose,
      record.slotKey,
      record.storeId,
      record.objectKey,
      record.expectedContentDigestClaim,
      record.expectedByteLength,
      record.expectedMimeType,
      record.uploadCapabilityIssuedAtMs,
      record.uploadCapabilityExpiresAtMs,
      record.expiresAtMs,
      record.createdAtMs,
      record.updatedAtMs,
    ] as const;

    try {
      return await this.sql.withTransaction(async (client) => {
        const insert = await insertWithCreateSavepoint(
          client,
          insertSql,
          params,
        );
        if (insert.kind === "inserted") {
          return mapRow(insert.row).then((m) =>
            m.ok ? cpOk(m.stored) : m.fail,
          );
        }

        const byId = await client.query(SELECT_BY_OBJECT_ID, [input.objectId]);
        const byKey = await client.query(SELECT_BY_STORE_KEY, [
          input.storeId,
          input.objectKey,
        ]);
        const existingRow =
          byId.rows[0] ?? byKey.rows[0] ?? null;
        if (existingRow == null) {
          return cpFail("INTERNAL_ERROR", "Owned object identity conflict.");
        }
        const mapped = await mapRow(existingRow);
        if (!mapped.ok) return mapped.fail;
        if (sameStagingIdentity(mapped.stored, input)) {
          return cpOk(mapped.stored);
        }
        return cpFail(
          "IDEMPOTENCY_CONFLICT",
          "Owned object identity already exists.",
        );
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async getByObjectIdAndOwner(input: {
    objectId: string;
    ownerId: string;
  }) {
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(SELECT_BY_OBJECT_OWNER, [
          input.objectId,
          input.ownerId,
        ]);
        if (result.rows.length === 0) {
          // Cross-owner probe: object exists under different owner → FORBIDDEN
          const any = await client.query(SELECT_BY_OBJECT_ID, [input.objectId]);
          if (any.rows.length > 0) {
            return cpFail("FORBIDDEN", "Owned object access denied.");
          }
          return cpOk(null);
        }
        const mapped = await mapRow(result.rows[0]);
        if (!mapped.ok) return mapped.fail;
        return cpOk(mapped.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async acquireVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    nowMs: number;
    expectedStoreVersion: number;
    claimLeaseMs?: number;
  }) {
    const claimLeaseMs = input.claimLeaseMs ?? 120_000;
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (current.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }
        if (current.record.verificationState === "failed") {
          return cpFail("CLAIM_REJECTED", "Verification previously failed.");
        }
        if (current.record.verificationState === "claimed") {
          const claimedAt = current.record.verificationClaimedAtMs;
          const stale =
            typeof claimedAt === "number" &&
            Number.isSafeInteger(claimedAt) &&
            Number.isSafeInteger(claimLeaseMs) &&
            claimLeaseMs >= 1 &&
            input.nowMs - claimedAt >= claimLeaseMs;
          if (!stale) {
            return cpFail("CLAIM_REJECTED", "Verification claim already held.");
          }
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET verification_state = 'claimed',
    verification_claim_token = $1,
    verification_claimed_at_ms = $2,
    updated_at_ms = $3,
    store_version = store_version + 1
WHERE object_id = $4
  AND owner_id = $5
  AND store_version = $6
  AND stage = 'staging'
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            input.claimToken,
            input.nowMs,
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async releaseVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (current.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }
        if (
          current.record.verificationState !== "claimed" ||
          current.record.verificationClaimToken !== input.claimToken
        ) {
          return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET verification_state = 'unclaimed',
    verification_claim_token = NULL,
    verification_claimed_at_ms = NULL,
    updated_at_ms = $1,
    store_version = store_version + 1
WHERE object_id = $2
  AND owner_id = $3
  AND store_version = $4
  AND stage = 'staging'
  AND verification_claim_token = $5
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
            input.claimToken,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async failVerificationClaim(input: {
    objectId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (current.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }
        if (
          current.record.verificationState !== "claimed" ||
          current.record.verificationClaimToken !== input.claimToken
        ) {
          return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET verification_state = 'failed',
    verification_claim_token = NULL,
    verification_claimed_at_ms = NULL,
    updated_at_ms = $1,
    store_version = store_version + 1
WHERE object_id = $2
  AND owner_id = $3
  AND store_version = $4
  AND stage = 'staging'
  AND verification_claim_token = $5
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
            input.claimToken,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async finalizeStagingRecord(input: HeadlessFinalizeStagingOwnedObjectInput) {
    const verifiedBy =
      input.verifiedBy === "trusted_worker_upload_stream"
        ? ("trusted_worker_upload_stream" as const)
        : ("full_object_stream" as const);
    const finalizedMetadata = {
      verifiedBy,
      sourceStage: "staging" as const,
    };
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (current.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }
        if (
          current.record.verificationState !== "claimed" ||
          current.record.verificationClaimToken !==
            input.verificationClaimToken
        ) {
          return cpFail("CLAIM_REJECTED", "Verification claim mismatch.");
        }
        if (
          input.contentDigest !==
            current.record.expectedContentDigestClaim ||
          input.byteLength !== current.record.expectedByteLength ||
          input.mimeType !== current.record.expectedMimeType
        ) {
          return cpFail(
            "OBJECT_INTEGRITY_FAILED",
            "Trusted facts do not match staging claims.",
          );
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET stage = 'finalized',
    verification_state = 'verified',
    verification_claim_token = NULL,
    verification_claimed_at_ms = NULL,
    content_digest = $1,
    byte_length = $2,
    mime_type = $3,
    verified_at_ms = $4,
    expires_at_ms = $5,
    finalized_metadata = $6::jsonb,
    terminal_reason = NULL,
    cleanup_scheduled_at_ms = NULL,
    updated_at_ms = $7,
    store_version = store_version + 1
WHERE object_id = $8
  AND owner_id = $9
  AND store_version = $10
  AND stage = 'staging'
  AND verification_claim_token = $11
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            input.contentDigest,
            input.byteLength,
            input.mimeType,
            input.verifiedAtMs,
            input.expiresAtMs,
            toJson(finalizedMetadata),
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
            input.verificationClaimToken,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async markRejected(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        if (mapped.stored.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (mapped.stored.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET stage = 'rejected',
    verification_state = 'failed',
    verification_claim_token = NULL,
    verification_claimed_at_ms = NULL,
    content_digest = NULL,
    byte_length = NULL,
    mime_type = NULL,
    verified_at_ms = NULL,
    finalized_metadata = NULL,
    terminal_reason = $1::jsonb,
    cleanup_scheduled_at_ms = NULL,
    updated_at_ms = $2,
    store_version = store_version + 1
WHERE object_id = $3
  AND owner_id = $4
  AND store_version = $5
  AND stage = 'staging'
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            toJson(input.terminalReason),
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async markCleanupPending(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    terminalReason: string;
    cleanupScheduledAtMs: number;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        if (mapped.stored.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (
          mapped.stored.record.stage !== "staging" &&
          mapped.stored.record.stage !== "rejected" &&
          mapped.stored.record.stage !== "finalized"
        ) {
          return cpFail(
            "TERMINAL_IMMUTABLE",
            "Owned object cannot enter cleanup.",
          );
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET stage = 'cleanup_pending',
    verification_state = 'failed',
    verification_claim_token = NULL,
    verification_claimed_at_ms = NULL,
    content_digest = NULL,
    byte_length = NULL,
    mime_type = NULL,
    verified_at_ms = NULL,
    finalized_metadata = NULL,
    terminal_reason = $1::jsonb,
    cleanup_scheduled_at_ms = $2,
    updated_at_ms = $3,
    store_version = store_version + 1
WHERE object_id = $4
  AND owner_id = $5
  AND store_version = $6
  AND stage IN ('staging', 'rejected', 'finalized')
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            toJson(input.terminalReason),
            input.cleanupScheduledAtMs,
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async completeCleanup(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    nowMs: number;
  }) {
    void input.nowMs;
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        if (mapped.stored.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (mapped.stored.record.stage !== "cleanup_pending") {
          return cpFail(
            "TERMINAL_IMMUTABLE",
            "Owned object is not cleanup_pending.",
          );
        }

        const deleted = await client.query(
          `
DELETE FROM public.headless_owned_objects
WHERE object_id = $1
  AND owner_id = $2
  AND store_version = $3
  AND stage = 'cleanup_pending'
`,
          [input.objectId, input.ownerId, input.expectedStoreVersion],
        );
        if ((deleted.rowCount ?? 0) !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        return cpOk(true as const);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listByJobIdAndOwner(input: { jobId: string; ownerId: string }) {
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(
          `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE job_id = $1 AND owner_id = $2
ORDER BY object_id ASC
`,
          [input.jobId, input.ownerId],
        );
        const out: HeadlessStoredOwnedObject[] = [];
        for (const row of result.rows) {
          const mapped = await mapRow(row);
          if (!mapped.ok) return mapped.fail;
          out.push(mapped.stored);
        }
        return cpOk(Object.freeze(out));
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listVerifierCandidates(input: {
    ownerId?: string;
    limit: number;
    nowMs: number;
  }) {
    void input.nowMs;
    const limit = boundLimit(input.limit);
    if (limit == null) {
      return cpFail("HOSTILE_INPUT", "Verifier candidate limit rejected.");
    }
    try {
      return await this.sql.withClient(async (client) => {
        const result =
          input.ownerId != null
            ? await client.query(
                `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE stage = 'staging'
  AND owner_id = $1
  AND (
    uploaded_observed_at_ms IS NOT NULL
    OR verification_state IN ('unclaimed', 'failed')
  )
ORDER BY object_id ASC
LIMIT $2
`,
                [input.ownerId, limit],
              )
            : await client.query(
                `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE stage = 'staging'
  AND (
    uploaded_observed_at_ms IS NOT NULL
    OR verification_state IN ('unclaimed', 'failed')
  )
ORDER BY object_id ASC
LIMIT $1
`,
                [limit],
              );
        const out: HeadlessStoredOwnedObject[] = [];
        for (const row of result.rows) {
          const mapped = await mapRow(row);
          if (!mapped.ok) return mapped.fail;
          out.push(mapped.stored);
        }
        return cpOk(Object.freeze(out));
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listCleanupCandidates(input: { limit: number; nowMs: number }) {
    const limit = boundLimit(input.limit);
    if (limit == null) {
      return cpFail("HOSTILE_INPUT", "Cleanup candidate limit rejected.");
    }
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(
          `
SELECT ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
FROM public.headless_owned_objects
WHERE stage = 'cleanup_pending'
   OR (
     stage = 'staging'
     AND expires_at_ms IS NOT NULL
     AND expires_at_ms <= $1
   )
ORDER BY object_id ASC
LIMIT $2
`,
          [input.nowMs, limit],
        );
        const out: HeadlessStoredOwnedObject[] = [];
        for (const row of result.rows) {
          const mapped = await mapRow(row);
          if (!mapped.ok) return mapped.fail;
          out.push(mapped.stored);
        }
        return cpOk(Object.freeze(out));
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async markUploadedObserved(input: {
    objectId: string;
    ownerId: string;
    expectedStoreVersion: number;
    uploadedObservedAtMs: number;
    nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_OBJECT_OWNER_FOR_UPDATE, [
          input.objectId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Owned object not found.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        if (mapped.stored.storeVersion !== input.expectedStoreVersion) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        if (mapped.stored.record.stage !== "staging") {
          return cpFail("TERMINAL_IMMUTABLE", "Owned object is not staging.");
        }

        const updated = await client.query(
          `
UPDATE public.headless_owned_objects
SET uploaded_observed_at_ms = $1,
    updated_at_ms = $2,
    store_version = store_version + 1
WHERE object_id = $3
  AND owner_id = $4
  AND store_version = $5
  AND stage = 'staging'
RETURNING ${HEADLESS_OWNED_OBJECT_SELECT_SQL}
`,
          [
            input.uploadedObservedAtMs,
            input.nowMs,
            input.objectId,
            input.ownerId,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length !== 1) {
          return cpFail("STALE_TRANSITION", "Owned object store version stale.");
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk(next.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
