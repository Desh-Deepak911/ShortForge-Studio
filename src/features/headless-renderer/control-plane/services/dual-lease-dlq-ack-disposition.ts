/**
 * Malformed/DLQ disposition outcomes (Sprint 11E 2D.1G.1).
 *
 * Ordering: moveToDlq first, then source ACK.
 * - dlq_acked: DLQ write succeeded AND source ACK succeeded.
 * - dlq_written_ack_pending: DLQ write succeeded but source ACK did not confirm.
 *
 * Duplicate-DLQ policy (at-least-once): when ACK remains pending, the source
 * entry stays pending for controlled redelivery. A later consumer may call
 * moveToDlq again. This harness/protocol does NOT claim exactly-once DLQ
 * delivery and does not invent Redis dedupe. Delivery identity remains the
 * queue entry identity; durable Neon claim authority is unchanged for the
 * claimed_and_acked path.
 */

export type DualLeaseMalformedDlqAction =
  | "dlq_acked"
  | "dlq_written_ack_pending";

/** Bounded observation — never keys, stream IDs, payloads, or provider errors. */
export type DualLeaseDlqAckObservation = {
  dlqWrite: "not_attempted" | "called_failed" | "succeeded";
  sourceAck: "not_attempted" | "called_failed" | "succeeded";
};

export function createDualLeaseDlqAckObservation(): DualLeaseDlqAckObservation {
  return {
    dlqWrite: "not_attempted",
    sourceAck: "not_attempted",
  };
}

export function freezeDlqAckObservation(
  obs: DualLeaseDlqAckObservation,
): Readonly<DualLeaseDlqAckObservation> {
  return Object.freeze({
    dlqWrite: obs.dlqWrite,
    sourceAck: obs.sourceAck,
  });
}
