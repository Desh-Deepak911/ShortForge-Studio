/**
 * Isolated exact delivery acquisition (render + verify)
 * (Sprint 11E 2D.1C.1 / 2D.1C.2 / 2D.1C.3 / 2D.1D).
 *
 * Non-destructive: never scans through unrelated undelivered entries with
 * XREADGROUP `>`. Requires an isolation precondition before a single count=1
 * read. Lock ownership is renewed before precondition and before XREADGROUP
 * using a live/injected monotonic clock; lock loss never mutates shared queue
 * state.
 */

import { randomUUID } from "node:crypto";

import type {
  HeadlessRenderQueueMessage,
  HeadlessVerifyQueueMessage,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessStreamQueueReadItem } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import { validateHeadlessStreamQueueEntry } from "@/features/headless-renderer/control-plane/ports/queue.port";

import {
  assertExpectedIsNextUnread,
  renewQaExclusivityLock,
  type QaLockClock,
  type QaLockHandle,
  type QueueCursorSnapshot,
} from "./queue-isolation";
import type { UpstashLiveConsumerPort } from "./types";

export type ExactRenderDeliveryExpected = {
  readonly kind?: "render";
  readonly deliveryId: string;
  readonly jobId: string;
  readonly ownerId: string;
  readonly attempt: number;
  /** Required — streamId from this run's XADD. */
  readonly streamId: string;
};

export type ExactVerifyDeliveryExpected = {
  readonly kind: "verify";
  readonly deliveryId: string;
  readonly ownedObjectId: string;
  readonly ownerId: string;
  readonly attempt: number;
  readonly streamId: string;
};

export type ExactCaseDeliveryExpected =
  | ExactRenderDeliveryExpected
  | ExactVerifyDeliveryExpected;

export type IsolatedExactDeliveryReasonId =
  | "queue_lock_lost"
  | "queue_lock_deadline_elapsed"
  | "queue_lock_ownership_lost"
  | "queue_precondition_not_isolated"
  | "queue_cursor_changed"
  | "group_probe_failed"
  | "expected_delivery_unavailable"
  | "delivery_read_failed"
  | "delivery_identity_mismatch";

export type IsolatedExactDeliverySuccess = {
  readonly ok: true;
  readonly item: HeadlessStreamQueueReadItem & {
    readonly entry: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage;
  };
  readonly group: string;
  /** @deprecated Alias of group — prefer `group`. */
  readonly qaGroup: string;
  readonly observedForeignStreamIds: readonly string[];
  readonly lockRenewed: boolean;
};

/** @deprecated Prefer IsolatedExactDeliverySuccess */
export type IsolatedExactRenderDeliverySuccess = IsolatedExactDeliverySuccess;

export type IsolatedExactDeliveryFailure = {
  readonly ok: false;
  readonly reasonId: IsolatedExactDeliveryReasonId;
  readonly observedForeignStreamIds: readonly string[];
};

/** @deprecated Prefer IsolatedExactDeliveryFailure */
export type IsolatedExactRenderDeliveryFailure = IsolatedExactDeliveryFailure;

export type IsolatedExactDeliveryResult =
  | IsolatedExactDeliverySuccess
  | IsolatedExactDeliveryFailure;

/** @deprecated Prefer IsolatedExactDeliveryResult */
export type IsolatedExactRenderDeliveryResult = IsolatedExactDeliveryResult;

function matchesExpected(
  item: HeadlessStreamQueueReadItem,
  expected: ExactCaseDeliveryExpected,
): item is HeadlessStreamQueueReadItem & {
  entry: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage;
} {
  const { entry } = item;
  if (item.streamId !== expected.streamId) return false;
  if (entry.deliveryId !== expected.deliveryId) return false;
  if (entry.ownerId !== expected.ownerId) return false;
  if (entry.attempt !== expected.attempt) return false;
  const kind = expected.kind ?? "render";
  if (kind === "verify") {
    if (entry.deliveryKind !== "verify") return false;
    const v = expected as ExactVerifyDeliveryExpected;
    return entry.ownedObjectId === v.ownedObjectId;
  }
  if (entry.deliveryKind !== "render") return false;
  const r = expected as ExactRenderDeliveryExpected;
  return entry.jobId === r.jobId;
}

function fieldsToReadItem(
  streamId: string,
  fields: Readonly<Record<string, string>>,
): HeadlessStreamQueueReadItem | null {
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

async function stealLockForTest(input: {
  readonly redis: UpstashLiveConsumerPort;
  readonly handle: QaLockHandle;
}): Promise<void> {
  await input.redis.qaDelKey(input.handle.key);
  await input.redis.qaSetNxPx(
    input.handle.key,
    randomUUID(),
    input.handle.ttlMs,
  );
}

/**
 * Fail-closed isolated exact delivery read (render or verify).
 * Caller must have prepared the consumer group and enqueued expected.
 * Never registers foreign IDs for cleanup.
 */
export async function acquireIsolatedExactDelivery(input: {
  readonly tcpConsumer: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly group: string;
  /** @deprecated Alias of group. */
  readonly qaGroup?: string;
  readonly consumerName: string;
  readonly expected: ExactCaseDeliveryExpected;
  readonly cursorSnapshot?: QueueCursorSnapshot;
  readonly blockMs?: number;
  readonly signal?: AbortSignal;
  readonly lockHandle?: QaLockHandle | null;
  /** Required when lockHandle is set — live or injected monotonic clock. */
  readonly clock?: QaLockClock;
  /** Deterministic: steal lock before precondition renew. */
  readonly forceLockLostBeforePrecondition?: boolean;
  /** Deterministic: steal lock after precondition, before XREADGROUP. */
  readonly forceLockLostBeforeRead?: boolean;
  /** Deterministic: advance/expire clock after precondition, before read renew. */
  readonly onAfterPreconditionBeforeReadRenew?: () => void | Promise<void>;
}): Promise<IsolatedExactDeliveryResult> {
  const observedForeign: string[] = [];
  const blockMs = input.blockMs ?? 0;
  const lock = input.lockHandle ?? null;
  const clock = input.clock;
  const group = input.group.length > 0 ? input.group : (input.qaGroup ?? "");
  let lockRenewed = false;

  if (
    input.expected.streamId.length === 0 ||
    group.length === 0 ||
    input.consumerName.length === 0
  ) {
    return {
      ok: false,
      reasonId: "delivery_read_failed",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  if (lock != null) {
    if (clock == null) {
      return {
        ok: false,
        reasonId: "queue_lock_lost",
        observedForeignStreamIds: Object.freeze(observedForeign.slice()),
      };
    }
    if (input.forceLockLostBeforePrecondition === true) {
      await stealLockForTest({ redis: input.tcpConsumer, handle: lock });
    }
    const renewPre = await renewQaExclusivityLock({
      redis: input.tcpConsumer,
      handle: lock,
      clock,
    });
    if (!renewPre.ok) {
      return {
        ok: false,
        reasonId: renewPre.reasonId,
        observedForeignStreamIds: Object.freeze(observedForeign.slice()),
      };
    }
    lockRenewed = true;
  }

  const precondition = await assertExpectedIsNextUnread({
    redis: input.tcpConsumer,
    streamKey: input.streamKey,
    group,
    expectedStreamId: input.expected.streamId,
    expectedLastDeliveredId: input.cursorSnapshot?.lastDeliveredId,
  });

  if (!precondition.ok) {
    if (precondition.observedForeignStreamId != null) {
      observedForeign.push(precondition.observedForeignStreamId);
    }
    return {
      ok: false,
      reasonId: precondition.reasonId,
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  if (lock != null) {
    if (clock == null) {
      return {
        ok: false,
        reasonId: "queue_lock_lost",
        observedForeignStreamIds: Object.freeze(observedForeign.slice()),
      };
    }
    if (input.forceLockLostBeforeRead === true) {
      await stealLockForTest({ redis: input.tcpConsumer, handle: lock });
    }
    if (input.onAfterPreconditionBeforeReadRenew != null) {
      await input.onAfterPreconditionBeforeReadRenew();
    }
    const renewRead = await renewQaExclusivityLock({
      redis: input.tcpConsumer,
      handle: lock,
      clock,
    });
    if (!renewRead.ok) {
      return {
        ok: false,
        reasonId: renewRead.reasonId,
        observedForeignStreamIds: Object.freeze(observedForeign.slice()),
      };
    }
    lockRenewed = true;
  }

  if (input.signal?.aborted) {
    return {
      ok: false,
      reasonId: "delivery_read_failed",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  let read: Awaited<
    ReturnType<UpstashLiveConsumerPort["qaXreadGroupInGroup"]>
  >;
  try {
    read = await input.tcpConsumer.qaXreadGroupInGroup({
      streamKey: input.streamKey,
      group,
      consumerName: input.consumerName,
      count: 1,
      blockMs,
      signal: input.signal,
    });
  } catch {
    return {
      ok: false,
      reasonId: "delivery_read_failed",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  if (!read.ok) {
    return {
      ok: false,
      reasonId: "delivery_read_failed",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  if (read.items.length === 0) {
    return {
      ok: false,
      reasonId: "expected_delivery_unavailable",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  const raw = read.items[0]!;
  if (raw.streamId !== input.expected.streamId) {
    observedForeign.push(raw.streamId);
    return {
      ok: false,
      reasonId: "delivery_identity_mismatch",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  const item = fieldsToReadItem(raw.streamId, raw.fields);
  if (item == null || !matchesExpected(item, input.expected)) {
    return {
      ok: false,
      reasonId: "delivery_identity_mismatch",
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    };
  }

  return {
    ok: true,
    item: item as IsolatedExactDeliverySuccess["item"],
    group,
    qaGroup: group,
    observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    lockRenewed,
  };
}

/**
 * Fail-closed isolated exact render-delivery read.
 * Alias of {@link acquireIsolatedExactDelivery} for render kind.
 */
export async function acquireIsolatedExactRenderDelivery(input: {
  readonly tcpConsumer: UpstashLiveConsumerPort;
  readonly streamKey: string;
  readonly qaGroup: string;
  readonly consumerName: string;
  readonly expected: ExactRenderDeliveryExpected;
  readonly cursorSnapshot?: QueueCursorSnapshot;
  readonly blockMs?: number;
  readonly signal?: AbortSignal;
  readonly lockHandle?: QaLockHandle | null;
  readonly clock?: QaLockClock;
  readonly forceLockLostBeforePrecondition?: boolean;
  readonly forceLockLostBeforeRead?: boolean;
  readonly onAfterPreconditionBeforeReadRenew?: () => void | Promise<void>;
}): Promise<IsolatedExactDeliveryResult> {
  return acquireIsolatedExactDelivery({
    tcpConsumer: input.tcpConsumer,
    streamKey: input.streamKey,
    group: input.qaGroup,
    qaGroup: input.qaGroup,
    consumerName: input.consumerName,
    expected: { ...input.expected, kind: "render" },
    cursorSnapshot: input.cursorSnapshot,
    blockMs: input.blockMs,
    signal: input.signal,
    lockHandle: input.lockHandle,
    clock: input.clock,
    forceLockLostBeforePrecondition: input.forceLockLostBeforePrecondition,
    forceLockLostBeforeRead: input.forceLockLostBeforeRead,
    onAfterPreconditionBeforeReadRenew:
      input.onAfterPreconditionBeforeReadRenew,
  });
}

/**
 * @deprecated Removed scan-through acquisition. Use acquireIsolatedExactDelivery.
 * Kept as a hard fail-closed stub so accidental callers cannot revive unsafe behavior.
 */
export async function acquireExactRenderDelivery(_input: {
  readonly tcpConsumer: UpstashLiveConsumerPort;
  readonly consumerName: string;
  readonly expected: ExactRenderDeliveryExpected & { readonly streamId?: string };
  readonly maxRounds?: number;
  readonly batchCount?: number;
  readonly blockMs?: number;
  readonly signal?: AbortSignal;
  readonly onSkippedStreamId?: (streamId: string) => void;
}): Promise<IsolatedExactDeliveryFailure> {
  void _input;
  return {
    ok: false,
    reasonId: "delivery_read_failed",
    observedForeignStreamIds: Object.freeze([]),
  };
}
