/**
 * Provider deletion for maintenance-eligible owned objects.
 *
 * Follows durable ordering: reload authority → cleanup_pending CAS → provider
 * delete → absence probe → metadata completion. Already-absent objects complete
 * idempotently. Lifecycle policy is never treated as deletion authority.
 */

import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessStoredOwnedObject } from "../ports/owned-object-store.port";
import type { HeadlessOwnedObjectDeletionDecision } from "./evaluate-owned-object-deletion-authority";

export type OwnedObjectMaintenanceDeleteOutcome =
  | { readonly kind: "deleted"; readonly classification: string }
  | { readonly kind: "already_absent"; readonly classification: string }
  | { readonly kind: "retryable"; readonly classification: string }
  | { readonly kind: "unconfirmed"; readonly classification: string }
  | { readonly kind: "rejected"; readonly classification: string };

/**
 * Deletes one owned object after a positive reference-safe deletion decision.
 * Does not accept ownership or reference counts from untrusted callers.
 */
export async function performOwnedObjectMaintenanceDelete(input: {
  readonly stored: HeadlessStoredOwnedObject;
  readonly decision: Extract<HeadlessOwnedObjectDeletionDecision, { readonly ok: true }>;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly objectIo: HeadlessArtifactObjectIOPort;
  readonly nowMs: number;
}): Promise<OwnedObjectMaintenanceDeleteOutcome> {
  const record = input.stored.record;
  const classification = input.decision.deletionClass;
  const locator = Object.freeze({
    kind: "object_storage" as const,
    storeId: record.storeId,
    objectKey: record.objectKey,
  });

  const presenceBefore = await input.objectIo.probeExactObjectPresence({
    locator,
    ownerId: record.ownerId,
  });
  if (!presenceBefore.ok) {
    return {
      kind: "unconfirmed",
      classification: "presence_probe_failed",
    };
  }
  if (presenceBefore.value === "absent") {
    if (record.stage === "cleanup_pending") {
      const completed = await input.ownedObjectStore.completeCleanup({
        objectId: record.objectId,
        ownerId: record.ownerId,
        expectedStoreVersion: input.stored.storeVersion,
        nowMs: input.nowMs,
      });
      if (!completed.ok) {
        return {
          kind: "retryable",
          classification: "metadata_complete_retry",
        };
      }
    }
    return { kind: "already_absent", classification };
  }

  let storeVersion = input.stored.storeVersion;
  if (
    record.stage === "staging" ||
    record.stage === "finalized" ||
    record.stage === "rejected"
  ) {
    const marked = await input.ownedObjectStore.markCleanupPending({
      objectId: record.objectId,
      ownerId: record.ownerId,
      expectedStoreVersion: storeVersion,
      terminalReason: input.decision.terminalReason,
      cleanupScheduledAtMs: input.nowMs,
      nowMs: input.nowMs,
    });
    if (!marked.ok) {
      const code = marked.issues[0]?.code;
      if (code === "STALE_TRANSITION") {
        return { kind: "retryable", classification: "cleanup_pending_stale" };
      }
      return { kind: "unconfirmed", classification: "cleanup_pending_failed" };
    }
    storeVersion = marked.value.storeVersion;
  } else if (record.stage !== "cleanup_pending") {
    return { kind: "rejected", classification: "stage_not_eligible" };
  }

  const deleted = await input.objectIo.deleteExactObject({
    locator,
    ownerId: record.ownerId,
  });
  if (!deleted.ok) {
    return { kind: "retryable", classification: "provider_delete_retry" };
  }

  const presenceAfter = await input.objectIo.probeExactObjectPresence({
    locator,
    ownerId: record.ownerId,
  });
  if (!presenceAfter.ok || presenceAfter.value !== "absent") {
    return { kind: "unconfirmed", classification: "post_delete_presence" };
  }

  const completed = await input.ownedObjectStore.completeCleanup({
    objectId: record.objectId,
    ownerId: record.ownerId,
    expectedStoreVersion: storeVersion,
    nowMs: input.nowMs,
  });
  if (!completed.ok) {
    return { kind: "retryable", classification: "metadata_complete_retry" };
  }

  return { kind: "deleted", classification };
}
