/**
 * Dual-lease verify delivery consume — same split as render.
 *
 * Order: validate → load → terminal/rejected XACK → live claim no-steal XACK
 * → acquireVerificationClaim → on success XACK → claimed_and_acked.
 * On claim fail before ACK → leave_pending unless terminal/duplicate.
 *
 * Malformed/DLQ (2D.1G.1): moveToDlq then inspect ACK — same truthfulness as
 * render (`dlq_acked` / `dlq_written_ack_pending`). At-least-once DLQ under
 * ACK-pending redelivery; not exactly-once. claimed_and_acked Neon/verify
 * claim authority unchanged.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import type { HeadlessStoredOwnedObject } from "../ports/owned-object-store.port";
import {
  validateHeadlessStreamQueueEntry,
  type HeadlessVerifyQueueMessage,
} from "../ports/queue.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import type { HeadlessQueueLeaseSettings } from "../runtime/upstash-environment";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";
import {
  freezeDlqAckObservation,
  type DualLeaseDlqAckObservation,
  type DualLeaseMalformedDlqAction,
} from "./dual-lease-dlq-ack-disposition";

export type DualLeaseVerifyConsumeAction =
  | "acked_noop_terminal"
  | "acked_duplicate_live"
  | "claimed_and_acked"
  | "left_pending"
  | DualLeaseMalformedDlqAction;

export type DualLeaseVerifyConsumeSuccess = {
  readonly action: DualLeaseVerifyConsumeAction;
  readonly claimedObject?: HeadlessStoredOwnedObject;
  readonly claimToken?: string;
  /** Present on malformed/DLQ disposition paths only. Bounded enums. */
  readonly dlqAckObservation?: Readonly<DualLeaseDlqAckObservation>;
};

export type ConsumeVerifyDeliveryOnceInput = {
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly entry: HeadlessVerifyQueueMessage | unknown;
  readonly streamId: string;
  readonly nowMs: number;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly consumerName: string;
  /** QA/harness-only mutable observation bag. Bounded enums only. */
  readonly qaDlqAckObservation?: DualLeaseDlqAckObservation;
};

export async function consumeVerifyDeliveryOnce(
  input: ConsumeVerifyDeliveryOnceInput,
): Promise<HeadlessControlPlaneResult<DualLeaseVerifyConsumeSuccess>> {
  void input.consumerName;

  const validated = validateHeadlessStreamQueueEntry(input.entry);
  if (!validated.ok || validated.entry.deliveryKind !== "verify") {
    return moveMalformedVerify(input, input.entry);
  }
  const entry = validated.entry;

  const loaded = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: entry.ownedObjectId,
    ownerId: entry.ownerId,
  });
  if (!loaded.ok) {
    const code = loaded.issues[0]?.code;
    if (code === "JOB_NOT_FOUND" || code === "FORBIDDEN") {
      return moveMalformedVerify(input, entry);
    }
    return cpOk({ action: "left_pending" });
  }
  if (loaded.value == null) {
    return moveMalformedVerify(input, entry);
  }

  const stored = loaded.value;
  const record = stored.record;

  // Terminal stages — noop ack.
  if (
    record.stage === "finalized" ||
    record.stage === "rejected" ||
    record.stage === "cleanup_pending"
  ) {
    const ack = await input.streamQueue.ack({
      kind: "verify",
      streamId: input.streamId,
      deliveryId: entry.deliveryId,
    });
    if (!ack.ok) return ack;
    return cpOk({ action: "acked_noop_terminal" });
  }

  if (record.stage !== "staging") {
    return moveMalformedVerify(input, entry);
  }

  if (record.verificationState === "failed") {
    const ack = await input.streamQueue.ack({
      kind: "verify",
      streamId: input.streamId,
      deliveryId: entry.deliveryId,
    });
    if (!ack.ok) return ack;
    return cpOk({ action: "acked_noop_terminal" });
  }

  // Live verify claim within lease — do not steal.
  if (record.verificationState === "claimed") {
    const claimedAt = record.verificationClaimedAtMs;
    const leaseMs = input.leaseSettings.verifyClaimMs;
    const live =
      typeof claimedAt === "number" &&
      Number.isSafeInteger(claimedAt) &&
      input.nowMs - claimedAt < leaseMs;
    if (live) {
      const ack = await input.streamQueue.ack({
        kind: "verify",
        streamId: input.streamId,
        deliveryId: entry.deliveryId,
      });
      if (!ack.ok) return ack;
      return cpOk({ action: "acked_duplicate_live" });
    }
    // Stale claim — acquireVerificationClaim may reclaim below.
  }

  const claimToken = `vclaim_hfq_${randomUUID()}`;
  const claimed = await input.ownedObjectStore.acquireVerificationClaim({
    objectId: entry.ownedObjectId,
    ownerId: entry.ownerId,
    claimToken,
    nowMs: input.nowMs,
    expectedStoreVersion: stored.storeVersion,
    claimLeaseMs: input.leaseSettings.verifyClaimMs,
  });
  if (!claimed.ok) {
    const code = claimed.issues[0]?.code;
    if (code === "TERMINAL_IMMUTABLE" || code === "CLAIM_REJECTED") {
      // Re-check for terminal / live duplicate.
      const again = await input.ownedObjectStore.getByObjectIdAndOwner({
        objectId: entry.ownedObjectId,
        ownerId: entry.ownerId,
      });
      if (again.ok && again.value != null) {
        const r = again.value.record;
        if (
          r.stage !== "staging" ||
          (r.stage === "staging" && r.verificationState === "failed")
        ) {
          const ack = await input.streamQueue.ack({
            kind: "verify",
            streamId: input.streamId,
            deliveryId: entry.deliveryId,
          });
          if (!ack.ok) return ack;
          return cpOk({ action: "acked_noop_terminal" });
        }
        if (
          r.stage === "staging" &&
          r.verificationState === "claimed" &&
          r.verificationClaimToken !== claimToken
        ) {
          const claimedAt = r.verificationClaimedAtMs;
          const live =
            typeof claimedAt === "number" &&
            input.nowMs - claimedAt < input.leaseSettings.verifyClaimMs;
          if (live) {
            const ack = await input.streamQueue.ack({
              kind: "verify",
              streamId: input.streamId,
              deliveryId: entry.deliveryId,
            });
            if (!ack.ok) return ack;
            return cpOk({ action: "acked_duplicate_live" });
          }
        }
      }
    }
    return cpOk({ action: "left_pending" });
  }

  const ack = await input.streamQueue.ack({
    kind: "verify",
    streamId: input.streamId,
    deliveryId: entry.deliveryId,
  });
  // Durable verify claim is authority. ACK failure leaves Redis pending for a
  // peer duplicate-ACK; this winner still executes under verifyClaimMs.
  void ack;

  return cpOk({
    action: "claimed_and_acked",
    claimedObject: claimed.value,
    claimToken,
  });
}

async function moveMalformedVerify(
  input: ConsumeVerifyDeliveryOnceInput,
  entry: unknown,
): Promise<HeadlessControlPlaneResult<DualLeaseVerifyConsumeSuccess>> {
  const obs = input.qaDlqAckObservation;
  const validated = validateHeadlessStreamQueueEntry(entry);
  if (validated.ok && validated.entry.deliveryKind === "verify") {
    const dlq = await input.streamQueue.moveToDlq({
      kind: "verify",
      entry: validated.entry,
      class: "malformed_unauthorized",
      reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
    });
    if (!dlq.ok) {
      if (obs != null) obs.dlqWrite = "called_failed";
      return dlq;
    }
    if (obs != null) obs.dlqWrite = "succeeded";

    const ack = await input.streamQueue.ack({
      kind: "verify",
      streamId: input.streamId,
      deliveryId: validated.entry.deliveryId,
    });
    if (!ack.ok) {
      if (obs != null) obs.sourceAck = "called_failed";
      return cpOk({
        action: "dlq_written_ack_pending",
        dlqAckObservation:
          obs != null ? freezeDlqAckObservation(obs) : undefined,
      });
    }
    if (obs != null) obs.sourceAck = "succeeded";
    return cpOk({
      action: "dlq_acked",
      dlqAckObservation:
        obs != null ? freezeDlqAckObservation(obs) : undefined,
    });
  }
  return cpOk({ action: "left_pending" });
}
