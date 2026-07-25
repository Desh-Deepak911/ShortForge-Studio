/**
 * Dual-lease render delivery consume — pre-XACK Redis idle vs post-XACK Neon claim.
 *
 * Order (exact):
 * 1. validate entry
 * 2. load job
 * 3. terminal → XACK (acked_noop_terminal)
 * 4. live claim → XACK no-steal (acked_duplicate_live)
 * 5. claimQueuedJob
 * 6. on success → XACK then claimed_and_acked (ACK failure still executes)
 * 7. on claim fail before ACK → leave_pending (unless terminal/duplicate)
 * Expired claim token → leave_pending (Neon recovery, not Redis steal)
 *
 * Malformed/DLQ (2D.1G.1): moveToDlq then inspect ACK.
 * - dlq_acked only when both DLQ write and source ACK succeed.
 * - dlq_written_ack_pending when DLQ write succeeded but ACK did not confirm
 *   (source stays pending; redelivery may duplicate DLQ under at-least-once —
 *   not exactly-once; no Redis dedupe invented here).
 * claimed_and_acked Neon-claim authority is unchanged.
 */

import { randomUUID } from "node:crypto";

import { isHeadlessTerminalState } from "../../domain/headless-render-constants";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import {
  validateHeadlessStreamQueueEntry,
  type HeadlessRenderQueueMessage,
} from "../ports/queue.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import type { HeadlessQueueLeaseSettings } from "../runtime/upstash-environment";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessCanonicalStoredJobRecord } from "../ports/job-store.port";
import {
  freezeDlqAckObservation,
  type DualLeaseDlqAckObservation,
  type DualLeaseMalformedDlqAction,
} from "./dual-lease-dlq-ack-disposition";

export type DualLeaseRenderConsumeAction =
  | "acked_noop_terminal"
  | "acked_duplicate_live"
  | "claimed_and_acked"
  | "left_pending"
  | DualLeaseMalformedDlqAction;

export type DualLeaseRenderConsumeSuccess = {
  readonly action: DualLeaseRenderConsumeAction;
  readonly claimedRecord?: HeadlessCanonicalStoredJobRecord;
  readonly claimToken?: string;
  /** Present on malformed/DLQ disposition paths only. Bounded enums. */
  readonly dlqAckObservation?: Readonly<DualLeaseDlqAckObservation>;
};

export type ConsumeRenderDeliveryOnceInput = {
  readonly streamQueue: HeadlessStreamQueuePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly entry: HeadlessRenderQueueMessage | unknown;
  readonly streamId: string;
  readonly nowMs: number;
  readonly leaseSettings: HeadlessQueueLeaseSettings;
  readonly consumerName: string;
  /**
   * QA/harness-only mutable observation bag. Never logged as secrets.
   * Distinguishes writer/ACK call outcomes when the Result is a hard fail.
   */
  readonly qaDlqAckObservation?: DualLeaseDlqAckObservation;
};

export async function consumeRenderDeliveryOnce(
  input: ConsumeRenderDeliveryOnceInput,
): Promise<HeadlessControlPlaneResult<DualLeaseRenderConsumeSuccess>> {
  void input.consumerName;

  const validated = validateHeadlessStreamQueueEntry(input.entry);
  if (!validated.ok || validated.entry.deliveryKind !== "render") {
    return moveMalformedRender(input, input.entry);
  }
  const entry = validated.entry;

  const loaded = await input.jobStore.getByJobIdAndOwner(
    entry.jobId,
    entry.ownerId,
  );
  if (!loaded.ok) {
    const code = loaded.issues[0]?.code;
    if (code === "JOB_NOT_FOUND" || code === "FORBIDDEN") {
      return moveMalformedRender(input, entry);
    }
    // Store outage — leave pending for redelivery.
    return cpOk({ action: "left_pending" });
  }
  const record = loaded.value;
  if (record.stage !== "canonical") {
    return moveMalformedRender(input, entry);
  }

  if (isHeadlessTerminalState(record.canonicalJob.state)) {
    const ack = await input.streamQueue.ack({
      kind: "render",
      streamId: input.streamId,
      deliveryId: entry.deliveryId,
    });
    if (!ack.ok) return ack;
    return cpOk({ action: "acked_noop_terminal" });
  }

  // Live Neon claim — do not steal; safely XACK duplicate delivery.
  // Expired claims (token present, lease elapsed) must NOT be ACK'd —
  // leave pending so recoverExpiredClaimAndRequeue can mint a new delivery.
  if (record.claimToken != null) {
    const claimedAt = record.claimedAtMs;
    const leaseMs = input.leaseSettings.renderClaimMs;
    const live =
      typeof claimedAt === "number" &&
      Number.isSafeInteger(claimedAt) &&
      input.nowMs - claimedAt < leaseMs;
    if (live) {
      const ack = await input.streamQueue.ack({
        kind: "render",
        streamId: input.streamId,
        deliveryId: entry.deliveryId,
      });
      if (!ack.ok) return ack;
      return cpOk({ action: "acked_duplicate_live" });
    }
    return cpOk({ action: "left_pending" });
  }

  if (record.canonicalJob.state !== "queued") {
    // Non-queued non-terminal without claim — leave pending (transient).
    return cpOk({ action: "left_pending" });
  }

  if (record.canonicalJob.attempt !== entry.attempt) {
    // Stale attempt delivery — treat as duplicate no-op ack.
    const ack = await input.streamQueue.ack({
      kind: "render",
      streamId: input.streamId,
      deliveryId: entry.deliveryId,
    });
    if (!ack.ok) return ack;
    return cpOk({ action: "acked_duplicate_live" });
  }

  const claimToken = `claim_hfq_${randomUUID()}`;
  const claimed = await input.jobStore.claimQueuedJob({
    jobId: entry.jobId,
    ownerId: entry.ownerId,
    expectedStoreVersion: record.storeVersion,
    claimToken,
    nowMs: input.nowMs,
  });
  if (!claimed.ok) {
    return cpOk({ action: "left_pending" });
  }
  if (claimed.value.kind !== "claimed") {
    // Lost race — re-check for terminal/live before leaving pending.
    const again = await input.jobStore.getByJobIdAndOwner(
      entry.jobId,
      entry.ownerId,
    );
    if (again.ok && again.value?.stage === "canonical") {
      if (isHeadlessTerminalState(again.value.canonicalJob.state)) {
        const ack = await input.streamQueue.ack({
          kind: "render",
          streamId: input.streamId,
          deliveryId: entry.deliveryId,
        });
        if (!ack.ok) return ack;
        return cpOk({ action: "acked_noop_terminal" });
      }
      if (again.value.claimToken != null) {
        const claimedAt = again.value.claimedAtMs;
        const live =
          typeof claimedAt === "number" &&
          Number.isSafeInteger(claimedAt) &&
          input.nowMs - claimedAt < input.leaseSettings.renderClaimMs;
        if (live) {
          const ack = await input.streamQueue.ack({
            kind: "render",
            streamId: input.streamId,
            deliveryId: entry.deliveryId,
          });
          if (!ack.ok) return ack;
          return cpOk({ action: "acked_duplicate_live" });
        }
      }
    }
    return cpOk({ action: "left_pending" });
  }

  const ack = await input.streamQueue.ack({
    kind: "render",
    streamId: input.streamId,
    deliveryId: entry.deliveryId,
  });
  // Durable Neon claim is authority. ACK failure leaves Redis pending for a
  // peer duplicate-ACK; this winner still executes under renderClaimMs.
  void ack;

  return cpOk({
    action: "claimed_and_acked",
    claimedRecord: claimed.value.record,
    claimToken,
  });
}

async function moveMalformedRender(
  input: ConsumeRenderDeliveryOnceInput,
  entry: unknown,
): Promise<HeadlessControlPlaneResult<DualLeaseRenderConsumeSuccess>> {
  const obs = input.qaDlqAckObservation;
  const validated = validateHeadlessStreamQueueEntry(entry);
  if (validated.ok && validated.entry.deliveryKind === "render") {
    const dlq = await input.streamQueue.moveToDlq({
      kind: "render",
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
      kind: "render",
      streamId: input.streamId,
      deliveryId: validated.entry.deliveryId,
    });
    if (!ack.ok) {
      if (obs != null) obs.sourceAck = "called_failed";
      // DLQ write already succeeded; source stays pending for redelivery.
      // At-least-once: a later consumer may write DLQ again — not exactly-once.
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
  // Cannot build DLQ without safe ids — leave pending.
  return cpOk({ action: "left_pending" });
}
