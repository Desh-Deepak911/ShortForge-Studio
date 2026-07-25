/**
 * Group-bound HeadlessStreamQueuePort wrapper (Sprint 11E 2D.1D.1 / 2D.1D.2 / 2D.1G).
 *
 * QA authority: never calls production readGroup/ack/autoClaimIdle/qaXack.
 * Production authority: only the production worker group.
 *
 * DLQ authority is explicit:
 * - qa_run_scoped → run-scoped TCP DLQ writer (never tcpConsumer.moveToDlq)
 * - production_env → tcpConsumer.moveToDlq (constructor-derived env DLQ keys)
 *
 * ACK PASS requires exact pending probe pre/post + XACK count > 0.
 * Never manufactures cpOk after a failed/zero ACK or probe failure.
 */

import { cpFail, cpOk } from "@/features/headless-renderer/control-plane";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import { validateHeadlessStreamQueueEntry } from "@/features/headless-renderer/control-plane/ports/queue.port";

import type { ExactCaseDeliveryExpected } from "./exact-delivery-acquisition";
import type { CaseGroupAuthority } from "./case-delivery-authority";
import type { QaRunScopedTcpDlqWriter } from "./qa-run-scoped-dlq";
import type { UpstashLiveConsumerPort, UpstashLiveProducerPort } from "./types";

function fieldsToEntry(
  streamId: string,
  fields: Readonly<Record<string, string>>,
) {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "attempt" || k === "enqueuedAtMs") {
      obj[k] = Number(v);
    } else {
      obj[k] = v;
    }
  }
  const validated = validateHeadlessStreamQueueEntry(obj);
  if (!validated.ok) return null;
  return { streamId, entry: validated.entry };
}

function matchesExpected(
  streamId: string,
  entry: {
    deliveryId: string;
    ownerId: string;
    attempt: number;
    deliveryKind: string;
    jobId?: string;
    ownedObjectId?: string;
  },
  expected: ExactCaseDeliveryExpected,
): boolean {
  if (streamId !== expected.streamId) return false;
  if (entry.deliveryId !== expected.deliveryId) return false;
  if (entry.ownerId !== expected.ownerId) return false;
  if (entry.attempt !== expected.attempt) return false;
  const kind = expected.kind ?? "render";
  if (kind === "verify") {
    return (
      entry.deliveryKind === "verify" &&
      entry.ownedObjectId ===
        (expected as { ownedObjectId: string }).ownedObjectId
    );
  }
  return (
    entry.deliveryKind === "render" &&
    entry.jobId === (expected as { jobId: string }).jobId
  );
}

/** Explicit DLQ write authority — never inferred from stream key strings. */
export type GroupBoundDlqAuthority = "qa_run_scoped" | "production_env";

export type GroupBoundStreamQueueInput = {
  readonly restProducer: UpstashLiveProducerPort;
  readonly tcpConsumer: UpstashLiveConsumerPort;
  readonly groupAuthority: CaseGroupAuthority;
  readonly sessionGroup: string;
  readonly streamKey: string;
  readonly kind: "render" | "verify";
  readonly expected: ExactCaseDeliveryExpected;
  /** Explicit DLQ routing authority (required). */
  readonly dlqAuthority: GroupBoundDlqAuthority;
  /**
   * Required when dlqAuthority === "qa_run_scoped".
   * Must never be used when dlqAuthority === "production_env".
   */
  readonly qaRunScopedDlqWriter?: QaRunScopedTcpDlqWriter | null;
  /**
   * Optional hooks for deterministic source-boundary / call-counting fixtures.
   * Production path only — QA path must never invoke these.
   */
  readonly onProductionReadGroup?: () => void;
  readonly onProductionAck?: () => void;
  readonly onProductionAutoClaimIdle?: () => void;
};

function bindMoveToDlq(
  input: GroupBoundStreamQueueInput,
): HeadlessStreamQueuePort["moveToDlq"] {
  if (input.dlqAuthority === "qa_run_scoped") {
    const writer = input.qaRunScopedDlqWriter;
    if (writer == null || writer.dlqAuthority !== "qa_run_scoped") {
      return async () =>
        cpFail(
          "INTERNAL_ERROR",
          "Run-scoped DLQ writer required for qa_run_scoped authority.",
        );
    }
    // Never call tcpConsumer.moveToDlq (constructor-derived shared DLQ).
    return (i) => writer.moveToDlq(i);
  }
  // production_env — existing production behavior.
  return (i) => input.tcpConsumer.moveToDlq(i);
}

/**
 * Build a stream queue whose mutate/read ops are bound to sessionGroup only.
 */
export function createGroupBoundStreamQueue(
  input: GroupBoundStreamQueueInput,
): HeadlessStreamQueuePort {
  const {
    restProducer,
    tcpConsumer,
    groupAuthority,
    sessionGroup,
    streamKey,
    kind,
    expected,
  } = input;

  const moveToDlq = bindMoveToDlq(input);

  if (groupAuthority === "production") {
    // Production-protocol worker group on the explicit streamKey (shared env or
    // QA run-scoped). Uses explicit stream/group APIs — never scans foreign IDs.
    // QA-group ACK is a different authority path (below).
    return {
      enqueueRender: (m) => restProducer.enqueueRender(m),
      enqueueVerify: (m) => restProducer.enqueueVerify(m),
      ensureConsumerGroups: () => tcpConsumer.ensureConsumerGroups(),
      readGroup: async (i) => {
        input.onProductionReadGroup?.();
        if (i.kind !== kind) {
          return cpFail("INTERNAL_ERROR", "Production group read kind mismatch.");
        }
        const read = await tcpConsumer.qaXreadGroupInGroup({
          streamKey,
          group: sessionGroup,
          consumerName: i.consumerName,
          count: Math.max(1, i.count),
          blockMs: i.blockMs,
          signal: i.signal,
        });
        if (!read.ok) {
          return cpFail("INTERNAL_ERROR", "Production group read failed.");
        }
        const items = [];
        for (const raw of read.items) {
          const item = fieldsToEntry(raw.streamId, raw.fields);
          if (item == null) continue;
          if (!matchesExpected(item.streamId, item.entry, expected)) {
            return cpFail(
              "INTERNAL_ERROR",
              "Production group read delivery identity mismatch.",
            );
          }
          items.push(item);
        }
        return cpOk(Object.freeze(items.slice()));
      },
      ack: async (i) => {
        input.onProductionAck?.();
        if (i.kind !== kind || i.streamId !== expected.streamId) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production group ack identity mismatch.",
          );
        }
        const pre = await tcpConsumer.qaProbePendingInGroup(
          streamKey,
          sessionGroup,
          i.streamId,
        );
        if (!pre.ok) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production group pre-ACK pending probe failed.",
          );
        }
        if (!pre.pending) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production group ack acknowledged zero pending entries.",
          );
        }
        const acked = await tcpConsumer.qaXackInGroup(
          streamKey,
          sessionGroup,
          i.streamId,
        );
        if (!acked) {
          return cpFail("INTERNAL_ERROR", "Production group ack failed.");
        }
        const post = await tcpConsumer.qaProbePendingInGroup(
          streamKey,
          sessionGroup,
          i.streamId,
        );
        if (!post.ok) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production group post-ACK pending probe failed.",
          );
        }
        if (post.pending) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production group ack did not clear pending.",
          );
        }
        return cpOk(true as const);
      },
      autoClaimIdle: async (i) => {
        input.onProductionAutoClaimIdle?.();
        if (i.kind !== kind) {
          return cpFail(
            "INTERNAL_ERROR",
            "Production autoClaim kind mismatch.",
          );
        }
        const claimed = await tcpConsumer.qaAutoClaimIdleInGroup({
          streamKey,
          group: sessionGroup,
          consumerName: i.consumerName,
          minIdleMs: i.minIdleMs,
          count: i.count,
        });
        if (!claimed.ok) {
          return cpFail("INTERNAL_ERROR", "Production autoClaimIdle failed.");
        }
        const items = [];
        for (const raw of claimed.items) {
          if (raw.streamId !== expected.streamId) continue;
          const item = fieldsToEntry(raw.streamId, raw.fields);
          if (item == null) continue;
          if (!matchesExpected(item.streamId, item.entry, expected)) {
            return cpFail(
              "INTERNAL_ERROR",
              "Production autoClaimIdle delivery identity mismatch.",
            );
          }
          items.push(item);
        }
        return cpOk(Object.freeze(items.slice()));
      },
      moveToDlq,
    };
  }

  // --- QA authority: never touch production read/ack/autoclaim/qaXack ---
  return {
    enqueueRender: (m) => restProducer.enqueueRender(m),
    enqueueVerify: (m) => restProducer.enqueueVerify(m),
    ensureConsumerGroups: () => tcpConsumer.ensureConsumerGroups(),
    readGroup: async (i) => {
      if (i.kind !== kind) {
        return cpFail("INTERNAL_ERROR", "QA group read kind mismatch.");
      }
      const read = await tcpConsumer.qaXreadGroupInGroup({
        streamKey,
        group: sessionGroup,
        consumerName: i.consumerName,
        count: Math.max(1, i.count),
        blockMs: i.blockMs,
        signal: i.signal,
      });
      if (!read.ok) {
        return cpFail("INTERNAL_ERROR", "QA group read failed.");
      }
      const items = [];
      for (const raw of read.items) {
        const item = fieldsToEntry(raw.streamId, raw.fields);
        if (item == null) continue;
        if (!matchesExpected(item.streamId, item.entry, expected)) {
          return cpFail(
            "INTERNAL_ERROR",
            "QA group read delivery identity mismatch.",
          );
        }
        items.push(item);
      }
      return cpOk(Object.freeze(items.slice()));
    },
    ack: async (i) => {
      if (i.kind !== kind || i.streamId !== expected.streamId) {
        return cpFail("INTERNAL_ERROR", "QA group ack identity mismatch.");
      }
      const pre = await tcpConsumer.qaProbePendingInGroup(
        streamKey,
        sessionGroup,
        i.streamId,
      );
      if (!pre.ok) {
        return cpFail(
          "INTERNAL_ERROR",
          "QA group pre-ACK pending probe failed.",
        );
      }
      if (!pre.pending) {
        return cpFail(
          "INTERNAL_ERROR",
          "QA group ack acknowledged zero pending entries.",
        );
      }
      const acked = await tcpConsumer.qaXackInGroup(
        streamKey,
        sessionGroup,
        i.streamId,
      );
      if (!acked) {
        return cpFail("INTERNAL_ERROR", "QA group ack failed.");
      }
      const post = await tcpConsumer.qaProbePendingInGroup(
        streamKey,
        sessionGroup,
        i.streamId,
      );
      if (!post.ok) {
        return cpFail(
          "INTERNAL_ERROR",
          "QA group post-ACK pending probe failed.",
        );
      }
      if (post.pending) {
        return cpFail(
          "INTERNAL_ERROR",
          "QA group ack did not clear pending.",
        );
      }
      return cpOk(true as const);
    },
    autoClaimIdle: async (i) => {
      if (i.kind !== kind) {
        return cpFail("INTERNAL_ERROR", "QA autoClaim kind mismatch.");
      }
      const claimed = await tcpConsumer.qaAutoClaimIdleInGroup({
        streamKey,
        group: sessionGroup,
        consumerName: i.consumerName,
        minIdleMs: i.minIdleMs,
        count: i.count,
      });
      if (!claimed.ok) {
        return cpFail("INTERNAL_ERROR", "QA autoClaimIdle failed.");
      }
      const items = [];
      for (const raw of claimed.items) {
        if (raw.streamId !== expected.streamId) continue;
        const item = fieldsToEntry(raw.streamId, raw.fields);
        if (item == null) continue;
        if (!matchesExpected(item.streamId, item.entry, expected)) {
          return cpFail(
            "INTERNAL_ERROR",
            "QA autoClaimIdle delivery identity mismatch.",
          );
        }
        items.push(item);
      }
      return cpOk(Object.freeze(items.slice()));
    },
    moveToDlq,
  };
}
