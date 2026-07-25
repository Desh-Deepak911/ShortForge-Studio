/**
 * Total mapper for public.headless_cleanup_intents rows.
 * BIGINT columns accept PostgreSQL decimal-string wire form.
 * Success paths always revalidate via validateHeadlessArtifactCleanupIntent.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { guardHeadlessStructure } from "../../domain/headless-hostile-guard";
import type { HeadlessStoredCleanupIntent } from "../ports/artifact-cleanup.port";
import { validateHeadlessArtifactCleanupIntent } from "./validate-artifact-cleanup-intent";
import {
  parseHeadlessPgSafeInteger,
  parseHeadlessPgSafeIntegerOrNull,
} from "./parse-headless-pg-safe-integer";
import type { HeadlessArtifactCleanupIntentState } from "../types/artifact-cleanup-intent";

export const HEADLESS_CLEANUP_INTENT_SELECT_COLUMNS = [
  "cleanup_id",
  "version",
  "job_id",
  "attempt",
  "owner_id",
  "project_id",
  "object_id",
  "locator_kind",
  "store_id",
  "object_key",
  "content_digest",
  "reason_id",
  "state",
  "claim_token",
  "claimed_at_ms",
  "expires_at_ms",
  "store_version",
  "idempotency_key",
  "created_at_ms",
  "completed_at_ms",
] as const;

export const HEADLESS_CLEANUP_INTENT_SELECT_SQL =
  HEADLESS_CLEANUP_INTENT_SELECT_COLUMNS.join(", ");

const STATE_SET = new Set<string>([
  "pending",
  "claimed",
  "completed",
  "protected",
  "rejected",
]);

export function mapHeadlessCleanupIntentSqlRow(
  row: unknown,
):
  | { readonly ok: true; readonly stored: HeadlessStoredCleanupIntent }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(row)) {
      return { ok: false, message: "Hostile cleanup SQL row rejected." };
    }
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, message: "Cleanup SQL row must be an object." };
    }
    const r = row as Record<string, unknown>;

    const version = parseHeadlessPgSafeInteger(r.version, { min: 1, max: 1 });
    if (!version.ok) {
      return { ok: false, message: "Cleanup version rejected." };
    }
    const attempt = parseHeadlessPgSafeInteger(r.attempt, {
      min: 1,
      max: 1_000_000,
    });
    if (!attempt.ok) {
      return { ok: false, message: "Cleanup attempt rejected." };
    }
    const storeVersion = parseHeadlessPgSafeInteger(r.store_version, {
      min: 1,
    });
    if (!storeVersion.ok) {
      return { ok: false, message: "Cleanup store_version rejected." };
    }
    const createdAtMs = parseHeadlessPgSafeInteger(r.created_at_ms, { min: 0 });
    if (!createdAtMs.ok) {
      return { ok: false, message: "Cleanup created_at_ms rejected." };
    }
    const expiresAtMs = parseHeadlessPgSafeInteger(r.expires_at_ms, { min: 0 });
    if (!expiresAtMs.ok) {
      return { ok: false, message: "Cleanup expires_at_ms rejected." };
    }
    const claimedAtMs = parseHeadlessPgSafeIntegerOrNull(r.claimed_at_ms, {
      min: 0,
    });
    if (!claimedAtMs.ok) {
      return { ok: false, message: "Cleanup claimed_at_ms rejected." };
    }
    const completedAtMs = parseHeadlessPgSafeIntegerOrNull(r.completed_at_ms, {
      min: 0,
    });
    if (!completedAtMs.ok) {
      return { ok: false, message: "Cleanup completed_at_ms rejected." };
    }

    if (typeof r.state !== "string" || !STATE_SET.has(r.state)) {
      return { ok: false, message: "Cleanup state rejected." };
    }
    const state = r.state as HeadlessArtifactCleanupIntentState;

    if (typeof r.idempotency_key !== "string") {
      return { ok: false, message: "Cleanup idempotency_key rejected." };
    }
    if (r.claim_token != null && typeof r.claim_token !== "string") {
      return { ok: false, message: "Cleanup claim_token rejected." };
    }

    const draft = {
      version: version.value,
      cleanupId: r.cleanup_id,
      jobId: r.job_id,
      attempt: attempt.value,
      ownerId: r.owner_id,
      projectId: r.project_id,
      objectId: r.object_id,
      storageLocator: {
        kind: r.locator_kind,
        storeId: r.store_id,
        objectKey: r.object_key,
      },
      contentDigest: r.content_digest,
      reasonId: r.reason_id,
      createdAtMs: createdAtMs.value,
      expiresAtMs: expiresAtMs.value,
    };
    const validated = validateHeadlessArtifactCleanupIntent(draft);
    if (!validated.ok) {
      return { ok: false, message: "Cleanup intent revalidation failed." };
    }

    return {
      ok: true,
      stored: deepFreezeHeadlessValue({
        storeVersion: storeVersion.value,
        intent: validated.intent,
        state,
        claimToken: (r.claim_token as string | null) ?? null,
        claimedAtMs: claimedAtMs.value,
        completedAtMs: completedAtMs.value,
        idempotencyKey: r.idempotency_key,
      }),
    };
  } catch {
    return { ok: false, message: "Hostile cleanup SQL row rejected." };
  }
}
