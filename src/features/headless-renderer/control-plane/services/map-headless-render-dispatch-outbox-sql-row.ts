/**
 * Total mapper for public.headless_render_dispatch_outbox rows.
 * PostgreSQL BIGINT values use parseHeadlessPgSafeInteger — never Number().
 */

import {
  parseHeadlessPgSafeInteger,
  parseHeadlessPgSafeIntegerOrNull,
} from "./parse-headless-pg-safe-integer";
import { validateHeadlessStoredRenderDispatchOutbox } from "./validate-render-dispatch-outbox";
import type { HeadlessStoredRenderDispatchOutbox } from "../types/render-dispatch-outbox";
import { HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION } from "../types/render-dispatch-outbox";

export function mapHeadlessRenderDispatchOutboxSqlRow(
  row: Record<string, unknown>,
):
  | { readonly ok: true; readonly record: HeadlessStoredRenderDispatchOutbox }
  | { readonly ok: false; readonly message: string } {
  const attempt = parseHeadlessPgSafeInteger(row.attempt, {
    min: 1,
    max: 1_000_000,
  });
  if (!attempt.ok) return attempt;

  const storeVersion = parseHeadlessPgSafeInteger(row.store_version, {
    min: 1,
  });
  if (!storeVersion.ok) return storeVersion;

  const retryCount = parseHeadlessPgSafeInteger(row.retry_count, { min: 0 });
  if (!retryCount.ok) return retryCount;

  const createdAtMs = parseHeadlessPgSafeInteger(row.created_at_ms, {
    min: 0,
  });
  if (!createdAtMs.ok) return createdAtMs;

  const updatedAtMs = parseHeadlessPgSafeInteger(row.updated_at_ms, {
    min: 0,
  });
  if (!updatedAtMs.ok) return updatedAtMs;

  const nextAttemptAtMs = parseHeadlessPgSafeInteger(row.next_attempt_at_ms, {
    min: 0,
  });
  if (!nextAttemptAtMs.ok) return nextAttemptAtMs;

  const claimedAtMs = parseHeadlessPgSafeIntegerOrNull(row.claimed_at_ms, {
    min: 0,
  });
  if (!claimedAtMs.ok) return claimedAtMs;

  const dispatchedAtMs = parseHeadlessPgSafeIntegerOrNull(
    row.dispatched_at_ms,
    { min: 0 },
  );
  if (!dispatchedAtMs.ok) return dispatchedAtMs;

  const version = parseHeadlessPgSafeInteger(row.version, { min: 1, max: 1 });
  if (!version.ok) return version;

  return validateHeadlessStoredRenderDispatchOutbox({
    intent: {
      version: HEADLESS_RENDER_DISPATCH_OUTBOX_VERSION,
      dispatchId: row.dispatch_id,
      jobId: row.job_id,
      attempt: attempt.value,
      ownerId: row.owner_id,
      projectId: row.project_id,
      deliveryId: row.delivery_id,
      createdAtMs: createdAtMs.value,
    },
    state: row.state,
    claimToken: row.claim_token ?? null,
    claimedAtMs: claimedAtMs.value,
    retryCount: retryCount.value,
    nextAttemptAtMs: nextAttemptAtMs.value,
    storeVersion: storeVersion.value,
    updatedAtMs: updatedAtMs.value,
    dispatchedAtMs: dispatchedAtMs.value,
    rejectReasonId: row.reject_reason_id ?? null,
  });
}
