/**
 * Neon durable render-dispatch outbox adapter.
 * All SQL is schema-qualified to public.*; BIGINT via parseHeadlessPgSafeInteger.
 */

import type { HeadlessSqlClient, HeadlessSqlExecutor } from "../runtime/sql-client";
import type {
  HeadlessEnsureDispatchIntentInput,
  HeadlessRenderDispatchOutboxPort,
} from "../ports/render-dispatch-outbox.port";
import { mapHeadlessRenderDispatchOutboxSqlRow } from "../services/map-headless-render-dispatch-outbox-sql-row";
import { mapHeadlessDatabaseFailure } from "../runtime/map-database-failure";
import {
  headlessDispatchBackoffMs,
  type HeadlessStoredRenderDispatchOutbox,
} from "../types/render-dispatch-outbox";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import { HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION } from "../types/render-dispatch-outbox";

const SELECT_SQL = `
  dispatch_id, version, job_id, attempt, owner_id, project_id, delivery_id,
  state, claim_token, claimed_at_ms, retry_count, next_attempt_at_ms,
  store_version, created_at_ms, updated_at_ms, dispatched_at_ms, reject_reason_id
`;

type MappedOutboxRow =
  | {
      readonly ok: true;
      readonly record: HeadlessStoredRenderDispatchOutbox;
    }
  | {
      readonly ok: false;
      readonly fail: HeadlessControlPlaneResult<never>;
    };

async function mapOne(
  client: HeadlessSqlClient,
  sql: string,
  params: unknown[],
): Promise<MappedOutboxRow | null> {
  const result = await client.query(sql, params);
  if (result.rows.length === 0) return null;
  const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
    result.rows[0] as Record<string, unknown>,
  );
  if (!mapped.ok) {
    return {
      ok: false,
      fail: cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message),
    };
  }
  return { ok: true, record: mapped.record };
}

/** Insert pending outbox row inside an existing interactive transaction. */
export async function insertPendingDispatchOutboxInTransaction(
  client: HeadlessSqlClient,
  input: HeadlessEnsureDispatchIntentInput,
): Promise<
  | { readonly ok: true; readonly kind: "created" | "existing" }
  | { readonly ok: false; readonly message: string }
> {
  try {
    const inserted = await client.query(
      `
INSERT INTO public.headless_render_dispatch_outbox (
  dispatch_id, version, job_id, attempt, owner_id, project_id, delivery_id,
  state, claim_token, claimed_at_ms, retry_count, next_attempt_at_ms,
  store_version, created_at_ms, updated_at_ms, dispatched_at_ms, reject_reason_id
)
VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  'pending', NULL, NULL, 0, $8,
  1, $8, $8, NULL, NULL
)
ON CONFLICT (job_id, attempt) DO NOTHING
RETURNING dispatch_id
`,
      [
        input.deliveryId,
        HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
        input.jobId,
        input.attempt,
        input.ownerId,
        input.projectId,
        input.deliveryId,
        input.nowMs,
      ],
    );
    if (inserted.rows.length > 0) {
      return { ok: true, kind: "created" };
    }
    const existing = await client.query(
      `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE job_id = $1 AND attempt = $2 AND owner_id = $3
`,
      [input.jobId, input.attempt, input.ownerId],
    );
    if (existing.rows.length === 0) {
      return { ok: false, message: "Dispatch outbox ensure failed." };
    }
    const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
      existing.rows[0] as Record<string, unknown>,
    );
    if (!mapped.ok) return { ok: false, message: mapped.message };
    if (mapped.record.intent.deliveryId !== input.deliveryId) {
      return { ok: false, message: "Divergent dispatch identity rejected." };
    }
    return { ok: true, kind: "existing" };
  } catch (error) {
    // Never swallow provider/SQL failures inside an interactive transaction.
    // Callers must ROLLBACK rather than COMMIT a promoted job without outbox.
    throw error;
  }
}

export class NeonHeadlessRenderDispatchOutboxAdapter
  implements HeadlessRenderDispatchOutboxPort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  async ensurePending(
    input: HeadlessEnsureDispatchIntentInput,
  ): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "created";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | {
          readonly kind: "existing";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  > {
    try {
      return await this.sql.withTransaction(async (client) => {
        const ensured = await insertPendingDispatchOutboxInTransaction(
          client,
          input,
        );
        if (!ensured.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", ensured.message);
        }
        const loaded = await mapOne(
          client,
          `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE job_id = $1 AND attempt = $2 AND owner_id = $3
`,
          [input.jobId, input.attempt, input.ownerId],
        );
        if (loaded == null) {
          return cpFail("JOB_NOT_FOUND", "Dispatch intent not found.");
        }
        if (!loaded.ok) return loaded.fail;
        if (ensured.kind === "created") {
          return cpOk({ kind: "created" as const, record: loaded.record });
        }
        return cpOk({ kind: "existing" as const, record: loaded.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async getByDispatchIdAndOwner(
    dispatchId: string,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredRenderDispatchOutbox>> {
    try {
      return await this.sql.withClient(async (client) => {
        const loaded = await mapOne(
          client,
          `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE dispatch_id = $1 AND owner_id = $2
`,
          [dispatchId, ownerId],
        );
        if (loaded == null) {
          return cpFail("JOB_NOT_FOUND", "Dispatch intent not found.");
        }
        if (!loaded.ok) return loaded.fail;
        return cpOk(loaded.record);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async getByJobAttemptAndOwner(input: {
    readonly jobId: string;
    readonly attempt: number;
    readonly ownerId: string;
  }): Promise<
    HeadlessControlPlaneResult<HeadlessStoredRenderDispatchOutbox | null>
  > {
    try {
      return await this.sql.withClient(async (client) => {
        const loaded = await mapOne(
          client,
          `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE job_id = $1 AND attempt = $2 AND owner_id = $3
`,
          [input.jobId, input.attempt, input.ownerId],
        );
        if (loaded == null) return cpOk(null);
        if (!loaded.ok) return loaded.fail;
        return cpOk(loaded.record);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async listDuePending(input: {
    readonly limit: number;
    readonly nowMs: number;
  }) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 1000
    ) {
      return cpFail("INVALID_TRANSPORT", "Outbox list limit is invalid.");
    }
    try {
      return await this.sql.withClient(async (client) => {
        const result = await client.query(
          `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE state = 'pending'
  AND next_attempt_at_ms <= $1
ORDER BY next_attempt_at_ms ASC, dispatch_id ASC
LIMIT $2
`,
          [input.nowMs, input.limit],
        );
        const records = [];
        for (const row of result.rows) {
          const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
            row as Record<string, unknown>,
          );
          if (!mapped.ok) {
            return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
          }
          records.push(mapped.record);
        }
        return cpOk(records);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async claimDue(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const updated = await client.query(
          `
UPDATE public.headless_render_dispatch_outbox
SET
  state = 'claimed',
  claim_token = $1,
  claimed_at_ms = $2,
  store_version = store_version + 1,
  updated_at_ms = $2,
  dispatched_at_ms = NULL,
  reject_reason_id = NULL
WHERE dispatch_id = $3
  AND owner_id = $4
  AND (
    (state = 'pending' AND next_attempt_at_ms <= $2)
    OR (
      state = 'claimed'
      AND claim_token IS NOT NULL
      AND claimed_at_ms IS NOT NULL
      AND claimed_at_ms + $5 <= $2
    )
  )
RETURNING ${SELECT_SQL}
`,
          [
            input.claimToken,
            input.nowMs,
            input.dispatchId,
            input.ownerId,
            input.claimLeaseMs,
          ],
        );
        if (updated.rows.length === 0) {
          const existing = await mapOne(
            client,
            `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE dispatch_id = $1 AND owner_id = $2
`,
            [input.dispatchId, input.ownerId],
          );
          if (existing?.ok === true) {
            if (
              existing.record.state === "dispatched" ||
              existing.record.state === "rejected"
            ) {
              return cpOk({
                kind: "already_terminal" as const,
                record: existing.record,
              });
            }
          }
          return cpOk({ kind: "rejected" as const });
        }
        const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
          updated.rows[0] as Record<string, unknown>,
        );
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        return cpOk({ kind: "claimed" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async markDispatched(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const updated = await client.query(
          `
UPDATE public.headless_render_dispatch_outbox
SET
  state = 'dispatched',
  claim_token = NULL,
  claimed_at_ms = NULL,
  dispatched_at_ms = $1,
  store_version = store_version + 1,
  updated_at_ms = $1,
  reject_reason_id = NULL
WHERE dispatch_id = $2
  AND owner_id = $3
  AND state = 'claimed'
  AND claim_token = $4
  AND store_version = $5
RETURNING ${SELECT_SQL}
`,
          [
            input.nowMs,
            input.dispatchId,
            input.ownerId,
            input.claimToken,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length === 0) {
          const existing = await mapOne(
            client,
            `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE dispatch_id = $1 AND owner_id = $2
`,
            [input.dispatchId, input.ownerId],
          );
          if (existing?.ok === true) {
            if (
              existing.record.state === "dispatched" ||
              existing.record.state === "rejected"
            ) {
              return cpOk({
                kind: "already_terminal" as const,
                record: existing.record,
              });
            }
          }
          return cpOk({ kind: "stale" as const });
        }
        const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
          updated.rows[0] as Record<string, unknown>,
        );
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        return cpOk({ kind: "dispatched" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async releaseWithBackoff(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "pending";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  > {
    try {
      return await this.sql.withTransaction(async (client) => {
        const current = await mapOne(
          client,
          `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE dispatch_id = $1 AND owner_id = $2
FOR UPDATE
`,
          [input.dispatchId, input.ownerId],
        );
        if (current == null) return cpOk({ kind: "rejected" as const });
        if (!current.ok) return current.fail;
        if (
          current.record.state === "dispatched" ||
          current.record.state === "rejected"
        ) {
          return cpOk({
            kind: "already_terminal" as const,
            record: current.record,
          });
        }
        if (
          current.record.state !== "claimed" ||
          current.record.claimToken !== input.claimToken ||
          current.record.storeVersion !== input.expectedStoreVersion
        ) {
          return cpOk({ kind: "stale" as const });
        }
        const retryCount = current.record.retryCount + 1;
        const nextAttempt =
          input.nowMs + headlessDispatchBackoffMs(retryCount);
        const updated = await client.query(
          `
UPDATE public.headless_render_dispatch_outbox
SET
  state = 'pending',
  claim_token = NULL,
  claimed_at_ms = NULL,
  retry_count = $1,
  next_attempt_at_ms = $2,
  store_version = store_version + 1,
  updated_at_ms = $3,
  dispatched_at_ms = NULL,
  reject_reason_id = NULL
WHERE dispatch_id = $4
  AND owner_id = $5
  AND state = 'claimed'
  AND claim_token = $6
  AND store_version = $7
RETURNING ${SELECT_SQL}
`,
          [
            retryCount,
            nextAttempt,
            input.nowMs,
            input.dispatchId,
            input.ownerId,
            input.claimToken,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length === 0) {
          return cpOk({ kind: "stale" as const });
        }
        const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
          updated.rows[0] as Record<string, unknown>,
        );
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        return cpOk({ kind: "pending" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async reject(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly reasonId: import("../types/render-dispatch-outbox").HeadlessRenderDispatchRejectReasonId;
  }) {
    try {
      return await this.sql.withTransaction(async (client) => {
        const updated = await client.query(
          `
UPDATE public.headless_render_dispatch_outbox
SET
  state = 'rejected',
  claim_token = NULL,
  claimed_at_ms = NULL,
  dispatched_at_ms = NULL,
  reject_reason_id = $1,
  store_version = store_version + 1,
  updated_at_ms = $2
WHERE dispatch_id = $3
  AND owner_id = $4
  AND state = 'claimed'
  AND claim_token = $5
  AND store_version = $6
RETURNING ${SELECT_SQL}
`,
          [
            input.reasonId,
            input.nowMs,
            input.dispatchId,
            input.ownerId,
            input.claimToken,
            input.expectedStoreVersion,
          ],
        );
        if (updated.rows.length === 0) {
          const existing = await mapOne(
            client,
            `
SELECT ${SELECT_SQL}
FROM public.headless_render_dispatch_outbox
WHERE dispatch_id = $1 AND owner_id = $2
`,
            [input.dispatchId, input.ownerId],
          );
          if (existing?.ok === true) {
            if (
              existing.record.state === "dispatched" ||
              existing.record.state === "rejected"
            ) {
              return cpOk({
                kind: "already_terminal" as const,
                record: existing.record,
              });
            }
          }
          return cpOk({ kind: "stale" as const });
        }
        const mapped = mapHeadlessRenderDispatchOutboxSqlRow(
          updated.rows[0] as Record<string, unknown>,
        );
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        return cpOk({ kind: "rejected" as const, record: mapped.record });
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
