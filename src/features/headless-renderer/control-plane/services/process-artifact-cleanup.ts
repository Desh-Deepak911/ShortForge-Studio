/**
 * Maintenance/recovery: claim cleanup intents and run the durable deletion saga.
 * Never the normal Export trigger — only orphan recovery.
 *
 * Authority per intent: objectId + digest + job/attempt coherence.
 * Locator possession alone never authorizes cleanup.
 * Batch processing constructs authority per intent (no cross-job adapter reuse).
 *
 * Terminal no-delete dispositions (protected/rejected) are durable and immutable —
 * never returned to pending via failClaim.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import { deleteArtifactUnderDurableAuthority } from "./delete-artifact-under-durable-authority";
import { validateHeadlessArtifactCleanupIntent } from "./validate-artifact-cleanup-intent";
import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

const DEFAULT_CLAIM_LEASE_MS = 60_000;

export type HeadlessArtifactCleanupProcessResult = {
  readonly processed: number;
  readonly completed: number;
  readonly protected: number;
  readonly rejected: number;
  /** Retryable saga outcomes released back to pending after confirmed failClaim. */
  readonly retryableFailed: number;
  /** CAS disposition/release failures that cannot be treated as durable. */
  readonly unconfirmed: number;
};

/**
 * Process up to `limit` retryable cleanup intents for an owner.
 */
export async function processHeadlessArtifactCleanupOnce(input: {
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly objectIo: HeadlessArtifactObjectIOPort;
  readonly ownerId: string;
  readonly nowMs: () => number;
  readonly limit?: number;
  readonly claimLeaseMs?: number;
}): Promise<HeadlessControlPlaneResult<HeadlessArtifactCleanupProcessResult>> {
  const listed = await input.cleanup.listRetryableForOwner(input.ownerId);
  if (!listed.ok) return listed;

  const limit = input.limit ?? 8;
  const leaseMs = input.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
  let processed = 0;
  let completed = 0;
  let protectedCount = 0;
  let rejected = 0;
  let retryableFailed = 0;
  let unconfirmed = 0;

  for (const record of listed.value) {
    if (processed >= limit) break;
    const claimToken = randomUUID();
    const claimed = await input.cleanup.claimPending({
      cleanupId: record.intent.cleanupId,
      ownerId: input.ownerId,
      claimToken,
      nowMs: input.nowMs(),
      claimLeaseMs: leaseMs,
    });
    if (!claimed.ok) {
      unconfirmed += 1;
      processed += 1;
      continue;
    }
    if (claimed.value.kind === "already_terminal") {
      processed += 1;
      continue;
    }
    if (claimed.value.kind !== "claimed") {
      processed += 1;
      continue;
    }

    const claimedRecord = claimed.value.record;
    const revalidated = validateHeadlessArtifactCleanupIntent(
      claimedRecord.intent,
    );
    if (!revalidated.ok || claimedRecord.intent.ownerId !== input.ownerId) {
      // Hostile/incoherent claimed payload → durable terminal rejected (no delete).
      const resolved = await input.cleanup.resolveWithoutDelete({
        cleanupId: claimedRecord.intent.cleanupId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion: claimedRecord.storeVersion,
        nowMs: input.nowMs(),
        disposition: "rejected",
      });
      if (
        resolved.ok &&
        (resolved.value.kind === "resolved" ||
          (resolved.value.kind === "already_terminal" &&
            resolved.value.record.state === "rejected"))
      ) {
        rejected += 1;
      } else {
        unconfirmed += 1;
      }
      processed += 1;
      continue;
    }

    const saga = await deleteArtifactUnderDurableAuthority({
      intent: revalidated.intent,
      ownedObjectStore: input.ownedObjectStore,
      jobStore: input.jobStore,
      objectIo: input.objectIo,
      nowMs: input.nowMs(),
      allowLiveStagingCleanup: false,
    });

    if (saga.status === "completed") {
      const done = await input.cleanup.complete({
        cleanupId: claimedRecord.intent.cleanupId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion: claimedRecord.storeVersion,
        nowMs: input.nowMs(),
      });
      if (done.ok && done.value.kind === "completed") {
        completed += 1;
      } else if (
        done.ok &&
        done.value.kind === "already_terminal" &&
        done.value.record.state === "completed"
      ) {
        completed += 1;
      } else {
        // Deletion confirmed in saga but intent complete failed — attempt release.
        const released = await input.cleanup.failClaim({
          cleanupId: claimedRecord.intent.cleanupId,
          ownerId: input.ownerId,
          claimToken,
          expectedStoreVersion: claimedRecord.storeVersion,
        });
        if (released.ok && released.value.kind === "pending") {
          retryableFailed += 1;
        } else {
          unconfirmed += 1;
        }
      }
    } else if (saga.status === "protected") {
      const resolved = await input.cleanup.resolveWithoutDelete({
        cleanupId: claimedRecord.intent.cleanupId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion: claimedRecord.storeVersion,
        nowMs: input.nowMs(),
        disposition: "protected",
      });
      if (
        resolved.ok &&
        (resolved.value.kind === "resolved" ||
          (resolved.value.kind === "already_terminal" &&
            resolved.value.record.state === "protected"))
      ) {
        protectedCount += 1;
      } else {
        unconfirmed += 1;
      }
    } else if (saga.status === "rejected") {
      const resolved = await input.cleanup.resolveWithoutDelete({
        cleanupId: claimedRecord.intent.cleanupId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion: claimedRecord.storeVersion,
        nowMs: input.nowMs(),
        disposition: "rejected",
      });
      if (
        resolved.ok &&
        (resolved.value.kind === "resolved" ||
          (resolved.value.kind === "already_terminal" &&
            resolved.value.record.state === "rejected"))
      ) {
        rejected += 1;
      } else {
        unconfirmed += 1;
      }
    } else {
      // retryable | stale | unconfirmed saga → release only when failClaim confirms.
      const released = await input.cleanup.failClaim({
        cleanupId: claimedRecord.intent.cleanupId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion: claimedRecord.storeVersion,
      });
      if (released.ok && released.value.kind === "pending") {
        retryableFailed += 1;
      } else {
        unconfirmed += 1;
      }
    }
    processed += 1;
  }

  return cpOk({
    processed,
    completed,
    protected: protectedCount,
    rejected,
    retryableFailed,
    unconfirmed,
  });
}

export function artifactCleanupUnconfirmedFailure() {
  return cpFail(
    "ARTIFACT_CLEANUP_UNCONFIRMED",
    "Orphan artifact cleanup could not be confirmed.",
  );
}
