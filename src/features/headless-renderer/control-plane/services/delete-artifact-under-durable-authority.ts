/**
 * Fail-closed artifact deletion saga under durable intent/object/job authority.
 *
 * Ordering:
 * 1. Load + validate intent coherence against durable owned-object + job
 * 2. Re-check deletion eligibility
 * 3. CAS → cleanup_pending BEFORE external delete
 * 4. Delete exact R2/object bytes
 * 5. Confirm absence via exact probe
 * 6. CAS-complete/remove durable metadata
 *
 * Never infer metadata completion from R2 delete success.
 * Never infer R2 absence solely from metadata state.
 */

import type { HeadlessArtifactCleanupIntentV1 } from "../types/artifact-cleanup-intent";
import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessOwnedObjectRecordV1 } from "../types/owned-object-record";
import { validateHeadlessArtifactCleanupIntent } from "./validate-artifact-cleanup-intent";
import { evaluateArtifactDeletionEligibility } from "./evaluate-artifact-deletion-eligibility";

export type ArtifactDeletionSagaStatus =
  | "completed"
  | "retryable"
  | "rejected"
  | "protected"
  | "stale"
  | "unconfirmed";

export type ArtifactDeletionSagaResult = {
  readonly status: ArtifactDeletionSagaStatus;
  readonly message: string;
  /** True only when an external delete was attempted in this invocation. */
  readonly externalDeleteAttempted: boolean;
};

function sameLocator(
  a: { kind: string; storeId: string; objectKey: string },
  b: { kind: string; storeId: string; objectKey: string },
): boolean {
  return (
    a.kind === b.kind &&
    a.storeId === b.storeId &&
    a.objectKey === b.objectKey
  );
}

function durableDigest(record: HeadlessOwnedObjectRecordV1): string {
  if (record.stage === "finalized") {
    return record.contentDigest;
  }
  return record.expectedContentDigestClaim;
}

function fail(
  status: ArtifactDeletionSagaStatus,
  message: string,
  externalDeleteAttempted = false,
): ArtifactDeletionSagaResult {
  return { status, message, externalDeleteAttempted };
}

/**
 * Provider-neutral deletion under a complete validated cleanup intent.
 */
export async function deleteArtifactUnderDurableAuthority(input: {
  readonly intent: HeadlessArtifactCleanupIntentV1;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly objectIo: HeadlessArtifactObjectIOPort;
  readonly nowMs: number;
  /**
   * Immediate worker upload-failure path may delete staging on a live job.
   * Hosted maintenance should leave this false.
   */
  readonly allowLiveStagingCleanup?: boolean;
}): Promise<ArtifactDeletionSagaResult> {
  const validated = validateHeadlessArtifactCleanupIntent(input.intent);
  if (!validated.ok) {
    return fail("rejected", "Cleanup intent validation rejected.");
  }
  const intent = validated.intent;

  if (
    intent.storageLocator.kind !== "object_storage" ||
    intent.storageLocator.storeId !== "artifacts"
  ) {
    return fail("rejected", "Cleanup locator store rejected.");
  }

  const job = await input.jobStore.getByJobIdAndOwner(
    intent.jobId,
    intent.ownerId,
  );
  if (!job.ok) {
    const code = job.issues[0]?.code;
    if (code === "JOB_NOT_FOUND") {
      return fail("rejected", "Owning job missing.");
    }
    return fail("unconfirmed", "Job load failed.");
  }
  if (
    job.value.ownerId !== intent.ownerId ||
    job.value.projectId !== intent.projectId ||
    job.value.jobId !== intent.jobId
  ) {
    return fail("rejected", "Job ownership coherence rejected.");
  }

  const durable = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: intent.objectId,
    ownerId: intent.ownerId,
  });
  if (!durable.ok) {
    return fail("unconfirmed", "Owned object load failed.");
  }

  // Metadata already removed: confirm exact R2 absence, then treat as completed.
  if (durable.value == null) {
    const presence = await input.objectIo.probeExactObjectPresence({
      locator: intent.storageLocator,
      ownerId: intent.ownerId,
    });
    if (!presence.ok) {
      return fail("unconfirmed", "Object presence probe failed.");
    }
    if (presence.value === "absent") {
      return fail("completed", "Durable metadata absent and object absent.");
    }
    return fail(
      "unconfirmed",
      "Object bytes remain without durable metadata.",
    );
  }

  const record = durable.value.record;
  if (
    record.objectId !== intent.objectId ||
    record.ownerId !== intent.ownerId ||
    record.projectId !== intent.projectId ||
    record.jobId !== intent.jobId ||
    record.purpose !== "artifact" ||
    record.storeId !== "artifacts" ||
    !sameLocator(
      {
        kind: "object_storage",
        storeId: record.storeId,
        objectKey: record.objectKey,
      },
      intent.storageLocator,
    ) ||
    durableDigest(record) !== intent.contentDigest
  ) {
    return fail("rejected", "Intent/owned-object coherence rejected.");
  }

  const eligibility = evaluateArtifactDeletionEligibility({
    job: job.value,
    record,
    locator: intent.storageLocator,
    attempt: intent.attempt,
    allowLiveStagingCleanup: input.allowLiveStagingCleanup === true,
  });
  if (!eligibility.ok) {
    return fail(
      eligibility.kind === "protected" ? "protected" : "rejected",
      eligibility.message,
    );
  }

  let storeVersion = durable.value.storeVersion;
  let stage = record.stage;

  if (stage === "staging" || stage === "finalized" || stage === "rejected") {
    const marked = await input.ownedObjectStore.markCleanupPending({
      objectId: intent.objectId,
      ownerId: intent.ownerId,
      expectedStoreVersion: storeVersion,
      terminalReason: eligibility.terminalReason,
      cleanupScheduledAtMs: input.nowMs,
      nowMs: input.nowMs,
    });
    if (!marked.ok) {
      const code = marked.issues[0]?.code;
      if (code === "STALE_TRANSITION") {
        return fail("stale", "Pre-delete cleanup_pending CAS stale.");
      }
      return fail("retryable", "Pre-delete cleanup_pending CAS failed.");
    }
    storeVersion = marked.value.storeVersion;
    stage = "cleanup_pending";
  } else if (stage !== "cleanup_pending") {
    return fail("rejected", "Owned object stage rejected for cleanup.");
  }

  // External delete — only after durable cleanup_pending.
  const deleted = await input.objectIo.deleteExactObject({
    locator: intent.storageLocator,
    ownerId: intent.ownerId,
  });
  if (!deleted.ok) {
    return fail("retryable", "Object delete failed.", true);
  }

  const presence = await input.objectIo.probeExactObjectPresence({
    locator: intent.storageLocator,
    ownerId: intent.ownerId,
  });
  if (!presence.ok) {
    return fail("unconfirmed", "Post-delete presence probe failed.", true);
  }
  if (presence.value !== "absent") {
    return fail("unconfirmed", "Object still present after delete.", true);
  }

  const completed = await input.ownedObjectStore.completeCleanup({
    objectId: intent.objectId,
    ownerId: intent.ownerId,
    expectedStoreVersion: storeVersion,
    nowMs: input.nowMs,
  });
  if (!completed.ok) {
    // R2 absent but metadata CAS failed — retryable; never report success.
    const code = completed.issues[0]?.code;
    if (code === "STALE_TRANSITION") {
      return fail("stale", "Metadata completeCleanup CAS stale.", true);
    }
    return fail(
      "unconfirmed",
      "Object absent but durable metadata completion failed.",
      true,
    );
  }

  return {
    status: "completed",
    message: "Artifact deleted under durable authority.",
    externalDeleteAttempted: true,
  };
}
