/**
 * Neon-backed HeadlessArtifactCleanupPort — durable orphan cleanup intents.
 * Inject HeadlessSqlExecutor for fixture tests; production uses createNeonSqlExecutor.
 * Schema-qualified public.headless_cleanup_intents. Parameterized SQL only.
 * Success paths ALWAYS rehydrate via mapHeadlessCleanupIntentSqlRow.
 */

import {
  HEADLESS_CREATE_INSERT_SAVEPOINT,
  isPostgresUniqueViolation,
  mapHeadlessDatabaseFailure,
} from "../runtime/map-database-failure";
import type { HeadlessSqlClient, HeadlessSqlExecutor } from "../runtime/sql-client";
import {
  HEADLESS_CLEANUP_INTENT_SELECT_SQL,
  mapHeadlessCleanupIntentSqlRow,
} from "../services/map-headless-cleanup-intent-sql-row";
import { validateHeadlessArtifactCleanupIntent } from "../services/validate-artifact-cleanup-intent";
import { cpFail, cpOk } from "../types/control-plane.types";
import type {
  HeadlessArtifactCleanupIntentV1,
  HeadlessArtifactCleanupNoDeleteDisposition,
} from "../types/artifact-cleanup-intent";
import { isHeadlessArtifactCleanupTerminalState } from "../types/artifact-cleanup-intent";
import type {
  HeadlessArtifactCleanupPort,
  HeadlessStoredCleanupIntent,
} from "../ports/artifact-cleanup.port";

const SELECT_BY_CLEANUP_OWNER = `
SELECT ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
FROM public.headless_cleanup_intents
WHERE cleanup_id = $1 AND owner_id = $2
`;

const SELECT_BY_CLEANUP_OWNER_FOR_UPDATE = `${SELECT_BY_CLEANUP_OWNER} FOR UPDATE`;

const SELECT_BY_IDEMPOTENCY = `
SELECT ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
FROM public.headless_cleanup_intents
WHERE idempotency_key = $1
`;

const SELECT_BY_CLEANUP_ID = `
SELECT ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
FROM public.headless_cleanup_intents
WHERE cleanup_id = $1
`;

const LIST_RETRYABLE_FOR_OWNER = `
SELECT ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
FROM public.headless_cleanup_intents
WHERE owner_id = $1
  AND state IN ('pending', 'claimed')
ORDER BY created_at_ms ASC, cleanup_id ASC
LIMIT 100
`;

function coherenceRejected(message: string) {
  return cpFail("JOB_STORE_COHERENCE_REJECTED", message);
}

function intentsEquivalent(
  a: HeadlessArtifactCleanupIntentV1,
  b: HeadlessArtifactCleanupIntentV1,
): boolean {
  return (
    a.version === b.version &&
    a.cleanupId === b.cleanupId &&
    a.jobId === b.jobId &&
    a.attempt === b.attempt &&
    a.ownerId === b.ownerId &&
    a.projectId === b.projectId &&
    a.objectId === b.objectId &&
    a.storageLocator.kind === b.storageLocator.kind &&
    a.storageLocator.storeId === b.storageLocator.storeId &&
    a.storageLocator.objectKey === b.storageLocator.objectKey &&
    a.contentDigest === b.contentDigest &&
    a.reasonId === b.reasonId &&
    a.createdAtMs === b.createdAtMs &&
    a.expiresAtMs === b.expiresAtMs
  );
}

async function mapRow(
  row: unknown,
): Promise<
  | { readonly ok: true; readonly stored: HeadlessStoredCleanupIntent }
  | { readonly ok: false; readonly fail: ReturnType<typeof cpFail> }
> {
  const mapped = mapHeadlessCleanupIntentSqlRow(row);
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
  | { readonly kind: "conflict" }
> {
  await client.query(`SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`);
  try {
    const result = await client.query(insertSql, params);
    await client.query(`RELEASE SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`);
    const row = result.rows[0];
    if (row == null || typeof row !== "object") {
      throw new Error("INSERT_RETURNING_MISSING");
    }
    return { kind: "inserted", row: row as Record<string, unknown> };
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) {
      throw error;
    }
    await client.query(
      `ROLLBACK TO SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`,
    );
    await client.query(
      `RELEASE SAVEPOINT ${HEADLESS_CREATE_INSERT_SAVEPOINT}`,
    );
    return { kind: "conflict" };
  }
}

export class NeonHeadlessArtifactCleanupAdapter
  implements HeadlessArtifactCleanupPort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  async createIfAbsent(input: {
    readonly idempotencyKey: string;
    readonly intent: HeadlessArtifactCleanupIntentV1;
  }) {
    const validated = validateHeadlessArtifactCleanupIntent(input.intent);
    if (!validated.ok) {
      return cpFail("HOSTILE_INPUT", "Cleanup intent rejected.");
    }
    if (validated.intent.cleanupId !== input.intent.cleanupId) {
      return cpFail("INTERNAL_ERROR", "Cleanup intent identity drift.");
    }
    if (
      typeof input.idempotencyKey !== "string" ||
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 512
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup idempotency key rejected.");
    }

    const intent = validated.intent;
    const insertSql = `
INSERT INTO public.headless_cleanup_intents (
  cleanup_id, version, job_id, attempt, owner_id, project_id, object_id,
  locator_kind, store_id, object_key,
  content_digest, reason_id,
  state, claim_token, claimed_at_ms,
  expires_at_ms, store_version, idempotency_key,
  created_at_ms, completed_at_ms
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  $8, $9, $10,
  $11, $12,
  'pending', NULL, NULL,
  $13, 1, $14,
  $15, NULL
)
RETURNING ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
`;
    const params = [
      intent.cleanupId,
      intent.version,
      intent.jobId,
      intent.attempt,
      intent.ownerId,
      intent.projectId,
      intent.objectId,
      intent.storageLocator.kind,
      intent.storageLocator.storeId,
      intent.storageLocator.objectKey,
      intent.contentDigest,
      intent.reasonId,
      intent.expiresAtMs,
      input.idempotencyKey,
      intent.createdAtMs,
    ] as const;

    try {
      return await this.sql.withTransaction(async (client) => {
        const insert = await insertWithCreateSavepoint(
          client,
          insertSql,
          params,
        );
        if (insert.kind === "inserted") {
          const mapped = await mapRow(insert.row);
          if (!mapped.ok) return mapped.fail;
          return cpOk({ kind: "created" as const, record: mapped.stored });
        }

        const byIdem = await client.query(SELECT_BY_IDEMPOTENCY, [
          input.idempotencyKey,
        ]);
        const byId = await client.query(SELECT_BY_CLEANUP_ID, [
          intent.cleanupId,
        ]);
        const existingRow = byIdem.rows[0] ?? byId.rows[0] ?? null;
        if (existingRow == null) {
          return cpFail("INTERNAL_ERROR", "Cleanup identity conflict.");
        }
        const mapped = await mapRow(existingRow);
        if (!mapped.ok) return mapped.fail;
        if (mapped.stored.idempotencyKey !== input.idempotencyKey) {
          return cpFail("INTERNAL_ERROR", "Cleanup id collision.");
        }
        if (!intentsEquivalent(mapped.stored.intent, intent)) {
          return cpFail(
            "IDEMPOTENCY_CONFLICT",
            "Cleanup intent idempotency conflict.",
          );
        }
        return cpOk({ kind: "existing" as const, record: mapped.stored });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async getByCleanupIdAndOwner(cleanupId: string, ownerId: string) {
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(SELECT_BY_CLEANUP_OWNER, [
          cleanupId,
          ownerId,
        ]);
        if (result.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
        }
        const mapped = await mapRow(result.rows[0]);
        if (!mapped.ok) return mapped.fail;
        return cpOk(mapped.stored);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async claimPending(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }) {
    if (
      typeof input.claimToken !== "string" ||
      input.claimToken.length < 8 ||
      input.claimToken.length > 128 ||
      !Number.isSafeInteger(input.nowMs) ||
      !Number.isSafeInteger(input.claimLeaseMs) ||
      input.claimLeaseMs < 1
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup claim input rejected.");
    }

    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_CLEANUP_OWNER_FOR_UPDATE, [
          input.cleanupId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;

        if (isHeadlessArtifactCleanupTerminalState(current.state)) {
          return cpOk({
            kind: "already_terminal" as const,
            record: current,
          });
        }
        if (current.state === "claimed" && current.claimedAtMs != null) {
          const expires = current.claimedAtMs + input.claimLeaseMs;
          if (
            input.nowMs < expires &&
            current.claimToken !== input.claimToken
          ) {
            return cpOk({ kind: "rejected" as const });
          }
        }

        const updated = await client.query(
          `
UPDATE public.headless_cleanup_intents
SET state = 'claimed',
    claim_token = $1,
    claimed_at_ms = $2,
    completed_at_ms = NULL,
    store_version = store_version + 1
WHERE cleanup_id = $3
  AND owner_id = $4
  AND store_version = $5
  AND state IN ('pending', 'claimed')
RETURNING ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
`,
          [
            input.claimToken,
            input.nowMs,
            input.cleanupId,
            input.ownerId,
            current.storeVersion,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "rejected" as const });
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk({ kind: "claimed" as const, record: next.stored });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async complete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_CLEANUP_OWNER_FOR_UPDATE, [
          input.cleanupId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;

        if (isHeadlessArtifactCleanupTerminalState(current.state)) {
          return cpOk({
            kind: "already_terminal" as const,
            record: current,
          });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "stale" as const });
        }
        if (
          current.state !== "claimed" ||
          current.claimToken !== input.claimToken
        ) {
          return cpOk({ kind: "rejected" as const });
        }

        const updated = await client.query(
          `
UPDATE public.headless_cleanup_intents
SET state = 'completed',
    claim_token = NULL,
    completed_at_ms = $1,
    store_version = store_version + 1
WHERE cleanup_id = $2
  AND owner_id = $3
  AND store_version = $4
  AND state = 'claimed'
  AND claim_token = $5
RETURNING ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
`,
          [
            input.nowMs,
            input.cleanupId,
            input.ownerId,
            input.expectedStoreVersion,
            input.claimToken,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "stale" as const });
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk({ kind: "completed" as const, record: next.stored });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async resolveWithoutDelete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly disposition: HeadlessArtifactCleanupNoDeleteDisposition;
  }) {
    if (
      input.disposition !== "protected" &&
      input.disposition !== "rejected"
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup disposition rejected.");
    }
    if (
      typeof input.claimToken !== "string" ||
      input.claimToken.length < 8 ||
      input.claimToken.length > 128 ||
      !Number.isSafeInteger(input.nowMs) ||
      !Number.isSafeInteger(input.expectedStoreVersion) ||
      input.expectedStoreVersion < 1
    ) {
      return cpFail("HOSTILE_INPUT", "Cleanup resolve input rejected.");
    }

    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_CLEANUP_OWNER_FOR_UPDATE, [
          input.cleanupId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;

        if (isHeadlessArtifactCleanupTerminalState(current.state)) {
          if (current.state === input.disposition) {
            return cpOk({
              kind: "already_terminal" as const,
              record: current,
            });
          }
          return cpOk({ kind: "rejected" as const });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "stale" as const });
        }
        if (
          current.state !== "claimed" ||
          current.claimToken !== input.claimToken
        ) {
          return cpOk({ kind: "rejected" as const });
        }

        const updated = await client.query(
          `
UPDATE public.headless_cleanup_intents
SET state = $1,
    claim_token = NULL,
    completed_at_ms = $2,
    store_version = store_version + 1
WHERE cleanup_id = $3
  AND owner_id = $4
  AND store_version = $5
  AND state = 'claimed'
  AND claim_token = $6
RETURNING ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
`,
          [
            input.disposition,
            input.nowMs,
            input.cleanupId,
            input.ownerId,
            input.expectedStoreVersion,
            input.claimToken,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "stale" as const });
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk({ kind: "resolved" as const, record: next.stored });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async failClaim(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const locked = await client.query(SELECT_BY_CLEANUP_OWNER_FOR_UPDATE, [
          input.cleanupId,
          input.ownerId,
        ]);
        if (locked.rows.length === 0) {
          return cpFail("JOB_NOT_FOUND", "Cleanup intent not found for owner.");
        }
        const mapped = await mapRow(locked.rows[0]);
        if (!mapped.ok) return mapped.fail;
        const current = mapped.stored;

        if (isHeadlessArtifactCleanupTerminalState(current.state)) {
          return cpOk({
            kind: "already_terminal" as const,
            record: current,
          });
        }
        if (current.storeVersion !== input.expectedStoreVersion) {
          return cpOk({ kind: "stale" as const });
        }
        if (
          current.state !== "claimed" ||
          current.claimToken !== input.claimToken
        ) {
          return cpOk({ kind: "rejected" as const });
        }

        const updated = await client.query(
          `
UPDATE public.headless_cleanup_intents
SET state = 'pending',
    claim_token = NULL,
    claimed_at_ms = NULL,
    completed_at_ms = NULL,
    store_version = store_version + 1
WHERE cleanup_id = $1
  AND owner_id = $2
  AND store_version = $3
  AND state = 'claimed'
  AND claim_token = $4
RETURNING ${HEADLESS_CLEANUP_INTENT_SELECT_SQL}
`,
          [
            input.cleanupId,
            input.ownerId,
            input.expectedStoreVersion,
            input.claimToken,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "stale" as const });
        }
        const next = await mapRow(updated.rows[0]);
        if (!next.ok) return next.fail;
        return cpOk({ kind: "pending" as const, record: next.stored });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listRetryableForOwner(ownerId: string) {
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(LIST_RETRYABLE_FOR_OWNER, [ownerId]);
        const out: HeadlessStoredCleanupIntent[] = [];
        for (const row of result.rows) {
          const mapped = await mapRow(row);
          if (!mapped.ok) {
            return mapped.fail;
          }
          out.push(mapped.stored);
        }
        return cpOk(Object.freeze(out) as readonly HeadlessStoredCleanupIntent[]);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
