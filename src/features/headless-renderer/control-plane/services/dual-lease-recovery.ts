/**
 * Post-XACK execution-lease recovery.
 * Neon recoverExpiredClaim / verify-claim expiry → new attempt + new deliveryId XADD.
 * Never uses XAUTOCLAIM to recover already-acknowledged execution.
 */

import { randomUUID } from "node:crypto";

import {
  applyHeadlessJobTransition,
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
} from "../../domain";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import type { HeadlessQueueLeaseSettings } from "../runtime/upstash-environment";
import {
  stableHeadlessDeliveryId,
  stableHeadlessVerifyDeliveryId,
} from "./stable-delivery-id";
import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type RecoverExpiredRenderClaimInput = {
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly expectedClaimToken?: string | null;
};

export type RecoverExpiredRenderClaimSuccess = {
  readonly action:
    | "requeued"
    | "rejected_live_claim"
    | "rejected_terminal"
    | "rejected";
  readonly newJobId?: string;
  readonly newDeliveryId?: string;
  readonly streamId?: string;
};

/**
 * Recover expired Neon render claim → mint recovery job → enqueueRender.
 */
export async function recoverExpiredRenderClaimAndRequeue(
  input: RecoverExpiredRenderClaimInput,
): Promise<HeadlessControlPlaneResult<RecoverExpiredRenderClaimSuccess>> {
  const recovered = await input.jobStore.recoverExpiredClaim({
    jobId: input.jobId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    leaseMs: input.leaseSettings.renderClaimMs,
    expectedClaimToken: input.expectedClaimToken,
  });
  if (!recovered.ok) return recovered;

  if (recovered.value.kind === "rejected_live_claim") {
    return cpOk({ action: "rejected_live_claim" });
  }
  if (recovered.value.kind === "rejected_terminal") {
    return cpOk({ action: "rejected_terminal" });
  }
  if (recovered.value.kind !== "failed_expired") {
    return cpOk({ action: "rejected" });
  }

  const parent = recovered.value.record;
  const recoveryAttempt = parent.canonicalJob.attempt + 1;
  const recoveryIdempotency = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "dual-lease-claim-lease-recovery",
    parentJobId: parent.jobId,
    parentIdempotencyAuthorityKey: parent.idempotencyAuthorityKey,
    recoveryAttempt,
  });
  if (!recoveryIdempotency.ok) {
    return cpFail("INTERNAL_ERROR", "Failed to build recovery idempotency.");
  }

  const accepted = createAcceptedHeadlessRenderJob({
    jobId: `job_${randomUUID()}`,
    requestValue: parent.canonicalRequest,
    createdAtMs: input.nowMs,
  });
  if (!accepted.ok) {
    return cpFail("INTERNAL_ERROR", "Failed to accept recovery job.");
  }

  const stored = await input.jobStore.createIfAbsent({
    idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
    record: {
      job: accepted.job,
      request: accepted.request,
      idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
      operationId: `recover_dl_${parent.jobId}_${recoveryAttempt}`,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    },
  });
  if (!stored.ok) return stored;
  if (stored.value.kind === "conflict") {
    return cpFail(
      "IDEMPOTENCY_CONFLICT",
      "Dual-lease recovery idempotency conflict.",
    );
  }

  let child = stored.value.record;

  if (child.canonicalJob.state !== "queued") {
    const queued = applyHeadlessJobTransition({
      jobValue: child.canonicalJob,
      requestValue: child.canonicalRequest,
      toState: "queued",
      attempt: child.canonicalJob.attempt,
      updatedAtMs: Math.max(input.nowMs, child.canonicalJob.updatedAtMs + 1),
    });
    if (!queued.ok) {
      return cpFail("INTERNAL_ERROR", "Recovery queue transition failed.");
    }
    const cas = await input.jobStore.compareAndSetTransition({
      jobId: child.jobId,
      ownerId: input.ownerId,
      expectedStoreVersion: child.storeVersion,
      next: {
        job: queued.job,
        request: child.canonicalRequest,
        idempotencyAuthorityKey: child.idempotencyAuthorityKey,
        operationId: child.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!cas.ok) return cas;
    if (cas.value.kind !== "updated") {
      return cpFail("STALE_TRANSITION", "Recovery queue CAS rejected.");
    }
    child = cas.value.record;
  }

  const deliveryId = stableHeadlessDeliveryId(
    child.jobId,
    child.canonicalJob.attempt,
  );
  const enqueue = await input.streamQueue.enqueueRender({
    deliveryId,
    jobId: child.jobId,
    ownerId: input.ownerId,
    attempt: child.canonicalJob.attempt,
    enqueuedAtMs: input.nowMs,
    deliveryKind: "render",
  });
  if (!enqueue.ok) return enqueue;

  return cpOk({
    action: "requeued",
    newJobId: child.jobId,
    newDeliveryId: deliveryId,
    streamId: enqueue.value.streamId,
  });
}

export type RecoverExpiredVerifyClaimInput = {
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly ownedObjectId: string;
  readonly ownerId: string;
  readonly previousAttempt: number;
  readonly nowMs: number;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly expectedClaimToken?: string | null;
};

export type RecoverExpiredVerifyClaimSuccess = {
  readonly action:
    | "requeued"
    | "rejected_live_claim"
    | "rejected_terminal"
    | "rejected";
  readonly newDeliveryId?: string;
  readonly streamId?: string;
  readonly nextAttempt?: number;
};

/**
 * Recover expired verify execution claim → new verify delivery identity.
 * Does not use XAUTOCLAIM (post-ACK recovery only).
 */
export async function recoverExpiredVerifyClaimAndRequeue(
  input: RecoverExpiredVerifyClaimInput,
): Promise<HeadlessControlPlaneResult<RecoverExpiredVerifyClaimSuccess>> {
  const loaded = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: input.ownedObjectId,
    ownerId: input.ownerId,
  });
  if (!loaded.ok) return loaded;
  if (loaded.value == null) {
    return cpOk({ action: "rejected" });
  }

  const stored = loaded.value;
  const record = stored.record;
  if (record.stage !== "staging") {
    return cpOk({ action: "rejected_terminal" });
  }
  if (record.verificationState === "failed") {
    return cpOk({ action: "rejected_terminal" });
  }
  if (record.verificationState !== "claimed") {
    return cpOk({ action: "rejected" });
  }
  if (
    input.expectedClaimToken != null &&
    record.verificationClaimToken !== input.expectedClaimToken
  ) {
    return cpOk({ action: "rejected" });
  }

  const claimedAt = record.verificationClaimedAtMs;
  if (
    typeof claimedAt !== "number" ||
    input.nowMs - claimedAt < input.leaseSettings.verifyClaimMs
  ) {
    return cpOk({ action: "rejected_live_claim" });
  }

  if (record.verificationClaimToken != null) {
    const released = await input.ownedObjectStore.releaseVerificationClaim({
      objectId: input.ownedObjectId,
      ownerId: input.ownerId,
      claimToken: record.verificationClaimToken,
      expectedStoreVersion: stored.storeVersion,
      nowMs: input.nowMs,
    });
    if (!released.ok) {
      const code = released.issues[0]?.code;
      if (code === "CLAIM_REJECTED" || code === "STALE_TRANSITION") {
        return cpOk({ action: "rejected" });
      }
      return released;
    }
  }

  const nextAttempt = input.previousAttempt + 1;
  if (!Number.isSafeInteger(nextAttempt) || nextAttempt < 1) {
    return cpFail("INTERNAL_ERROR", "Invalid verify recovery attempt.");
  }
  const deliveryId = stableHeadlessVerifyDeliveryId(
    input.ownedObjectId,
    nextAttempt,
  );
  const enqueue = await input.streamQueue.enqueueVerify({
    deliveryId,
    ownedObjectId: input.ownedObjectId,
    ownerId: input.ownerId,
    attempt: nextAttempt,
    enqueuedAtMs: input.nowMs,
    deliveryKind: "verify",
  });
  if (!enqueue.ok) return enqueue;

  return cpOk({
    action: "requeued",
    newDeliveryId: deliveryId,
    streamId: enqueue.value.streamId,
    nextAttempt,
  });
}
