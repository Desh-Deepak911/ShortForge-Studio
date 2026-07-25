/**
 * Universal case-scoped live delivery authority (Sprint 11E 2D.1D).
 *
 * Reusable for render AND verify matrix cases:
 * lock → QA `$` group (or production-group isolation) → mint XADD →
 * trackRunOwnedStreamId → cursor/range precondition → count=1 read →
 * exact identity → group-bound ACK/pending/autoclaim → compare-token release.
 *
 * Never scans unrelated deliveries. Never registers foreign IDs for cleanup.
 * QA-group ACK does not prove production-group pending removal.
 */

import {
  pendingProbeToDeprecatedBoolean,
  type HeadlessPendingProbeResult,
  type HeadlessRenderQueueMessage,
  type HeadlessVerifyQueueMessage,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import type { HeadlessStreamQueueReadItem } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";

import {
  acquireIsolatedExactDelivery,
  type ExactCaseDeliveryExpected,
  type IsolatedExactDeliveryReasonId,
} from "./exact-delivery-acquisition";
import { createGroupBoundStreamQueue } from "./group-bound-stream-queue";
import { createQaRunScopedTcpDlqWriter } from "./qa-run-scoped-dlq";
import {
  observeForeignStreamId,
  runScopedConsumerName,
  trackConsumerName,
  trackQaGroup,
  trackRunOwnedStreamId,
} from "./live-fixtures";
import { ensureQaRunScopedProductionGroups } from "./qa-run-scoped-queue";
import {
  acquireQaExclusivityLock,
  confirmQaLockOwnership,
  createLiveQaLockClock,
  createQaCaseConsumerGroup,
  isProductionWorkerGroup,
  isQaLockDeadlineElapsed,
  isQaOwnedGroup,
  releaseQaExclusivityLock,
  snapshotQaGroupCursor,
  type QaLockClock,
  type QaLockHandle,
  type QaLockReleaseResult,
  type QaLockRenewResult,
} from "./queue-isolation";
import type { UpstashLiveMatrixContext } from "./types";

export type CaseGroupAuthority = "qa" | "production";

export type CaseDeliveryAuthorityReasonId =
  | IsolatedExactDeliveryReasonId
  | "queue_lock_unavailable"
  | "queue_lock_release_failed"
  | "delivery_enqueue_failed"
  | "group_authority_invalid"
  | "group_probe_failed";

export type MintCaseDeliveryResult =
  | {
      readonly ok: true;
      readonly expected: ExactCaseDeliveryExpected;
    }
  | {
      readonly ok: false;
      readonly reasonId: CaseDeliveryAuthorityReasonId;
    };

export type IsolatedCaseDeliveryHandle = {
  readonly ok: true;
  readonly item: HeadlessStreamQueueReadItem & {
    readonly entry: HeadlessRenderQueueMessage | HeadlessVerifyQueueMessage;
  };
  readonly group: string;
  readonly groupAuthority: CaseGroupAuthority;
  readonly consumerName: string;
  readonly streamKey: string;
  readonly kind: "render" | "verify";
  readonly caseId: string;
  readonly expected: ExactCaseDeliveryExpected;
  readonly observedForeignStreamIds: readonly string[];
  readonly lockHandle: QaLockHandle | null;
  readonly lockClock: QaLockClock;

  confirmLock(): Promise<QaLockRenewResult>;
  releaseLock(): Promise<QaLockReleaseResult>;
  /** Exact pending probe on the session group (result-bearing). */
  probePendingInGroup(): Promise<HeadlessPendingProbeResult>;
  /**
   * @deprecated Fail-closed boolean — use `probePendingInGroup` for evidence.
   */
  isPendingInGroup(): Promise<boolean>;
  ackInGroup(): Promise<boolean>;
  autoClaimIdleInGroup(input: {
    readonly consumerName: string;
    readonly minIdleMs: number;
    readonly count: number;
  }): Promise<
    | { readonly ok: true; readonly streamIds: readonly string[] }
    | { readonly ok: false }
  >;
  /**
   * Stream queue fully bound to session group authority.
   * QA: never production read/ack/autoclaim. Production: never QA-only helpers.
   */
  bindStreamQueue(): HeadlessStreamQueuePort;
  isLockDeadlineElapsed(): boolean;
};

export type IsolatedCaseDeliveryFailure = {
  readonly ok: false;
  readonly reasonId: CaseDeliveryAuthorityReasonId;
  readonly observedForeignStreamIds: readonly string[];
  readonly group: string | null;
  readonly groupAuthority: CaseGroupAuthority;
};

export type IsolatedCaseDeliveryResult =
  | IsolatedCaseDeliveryHandle
  | IsolatedCaseDeliveryFailure;

function streamKeyForKind(
  ctx: UpstashLiveMatrixContext,
  kind: "render" | "verify",
): string {
  return kind === "verify"
    ? ctx.streamNames.verifyStream
    : ctx.streamNames.renderStream;
}

function productionGroupForKind(
  ctx: UpstashLiveMatrixContext,
  kind: "render" | "verify",
): string {
  return kind === "verify"
    ? ctx.streamNames.verifyGroup
    : ctx.streamNames.renderGroup;
}

function fail(
  reasonId: CaseDeliveryAuthorityReasonId,
  observedForeign: readonly string[],
  group: string | null,
  groupAuthority: CaseGroupAuthority,
): IsolatedCaseDeliveryFailure {
  return {
    ok: false,
    reasonId,
    observedForeignStreamIds: Object.freeze(observedForeign.slice()),
    group,
    groupAuthority,
  };
}

/**
 * Acquire an isolated exact delivery for one matrix case.
 * On success the exclusivity lock remains held until `releaseLock()`.
 * On failure the lock is released in `finally` (compare-token delete).
 */
export async function acquireIsolatedCaseDelivery(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly caseId: string;
  readonly kind: "render" | "verify";
  readonly consumerLabel: string;
  readonly groupAuthority?: CaseGroupAuthority;
  readonly qaLockClock?: QaLockClock;
  readonly skipQaLock?: boolean;
  readonly blockMs?: number;
  /**
   * After lock + group tip are ready: XADD expected delivery and return identity.
   * Authority tracks run-owned streamId only when mint returns ok with streamId.
   */
  readonly mintDelivery: () => Promise<MintCaseDeliveryResult>;
  readonly forceLockLostBeforePrecondition?: boolean;
  readonly forceLockLostBeforeRead?: boolean;
  readonly onAfterPreconditionBeforeReadRenew?: () => void | Promise<void>;
}): Promise<IsolatedCaseDeliveryResult> {
  const ctx = input.ctx;
  const kind = input.kind;
  const groupAuthority = input.groupAuthority ?? "qa";
  const lockClock = input.qaLockClock ?? createLiveQaLockClock();
  const streamKey = streamKeyForKind(ctx, kind);
  const consumerName = runScopedConsumerName(ctx, input.consumerLabel);
  trackConsumerName(ctx, consumerName);

  const observedForeign: string[] = [];
  let lockHandle: QaLockHandle | null = null;
  let group: string | null = null;
  let cursorLastDeliveredId: string | null = null;
  let finishedWithHandle = false;

  try {
    if (ctx.streamAuthority === "qa_run_scoped") {
      const binding = ctx.qaRunStreamBinding;
      if (binding == null) {
        return fail(
          "group_authority_invalid",
          observedForeign,
          null,
          groupAuthority,
        );
      }
      const ensured = await ensureQaRunScopedProductionGroups({
        redis: ctx.tcpConsumer,
        binding,
      });
      if (!ensured) {
        return fail(
          "group_authority_invalid",
          observedForeign,
          null,
          groupAuthority,
        );
      }
    } else {
      try {
        await ctx.tcpConsumer.ensureConsumerGroups();
      } catch {
        // Production ensure is best-effort; QA path creates its own group.
      }
    }

    if (input.skipQaLock !== true) {
      const lock = await acquireQaExclusivityLock({
        redis: ctx.tcpConsumer,
        envName: ctx.envName,
        clock: lockClock,
        kind,
      });
      if (!lock.acquired) {
        return fail("queue_lock_unavailable", observedForeign, null, groupAuthority);
      }
      lockHandle = lock;
    }

    if (groupAuthority === "qa") {
      const created = await createQaCaseConsumerGroup({
        redis: ctx.tcpConsumer,
        streamKey,
        runId: ctx.runId,
        caseId: input.caseId,
        kind,
        ctx,
      });
      if (!created.ok) {
        return fail(created.reasonId, observedForeign, null, groupAuthority);
      }
      group = created.group;
      cursorLastDeliveredId = created.lastDeliveredId;
      trackQaGroup(ctx, group);
    } else if (groupAuthority === "production") {
      group = productionGroupForKind(ctx, kind);
      if (!isProductionWorkerGroup(group)) {
        return fail("group_authority_invalid", observedForeign, null, groupAuthority);
      }
      const cursor = await snapshotQaGroupCursor({
        redis: ctx.tcpConsumer,
        streamKey,
        group,
      });
      if (!cursor.ok) {
        // Probe failure and confirmed absence both fail closed (no false PASS).
        return fail("queue_cursor_changed", observedForeign, group, groupAuthority);
      }
      cursorLastDeliveredId = cursor.snapshot.lastDeliveredId;
    } else {
      return fail("group_authority_invalid", observedForeign, null, groupAuthority);
    }

    let mint: MintCaseDeliveryResult;
    try {
      mint = await input.mintDelivery();
    } catch {
      return fail("delivery_enqueue_failed", observedForeign, group, groupAuthority);
    }
    if (!mint.ok) {
      return fail(mint.reasonId, observedForeign, group, groupAuthority);
    }

    const expected = mint.expected;
    if (expected.streamId.length === 0) {
      return fail("delivery_enqueue_failed", observedForeign, group, groupAuthority);
    }
    trackRunOwnedStreamId(ctx, {
      stream: streamKey,
      id: expected.streamId,
      kind,
    });

    const acquired = await acquireIsolatedExactDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey,
      group: group!,
      consumerName,
      expected,
      cursorSnapshot: {
        group: group!,
        lastDeliveredId: cursorLastDeliveredId ?? "0-0",
      },
      blockMs: input.blockMs,
      signal: ctx.abortSignal,
      lockHandle,
      clock: lockClock,
      forceLockLostBeforePrecondition: input.forceLockLostBeforePrecondition,
      forceLockLostBeforeRead: input.forceLockLostBeforeRead,
      onAfterPreconditionBeforeReadRenew:
        input.onAfterPreconditionBeforeReadRenew,
    });

    for (const foreignId of acquired.observedForeignStreamIds) {
      observedForeign.push(foreignId);
      observeForeignStreamId(ctx, {
        stream: streamKey,
        id: foreignId,
        kind,
      });
    }

    if (!acquired.ok) {
      return fail(acquired.reasonId, observedForeign, group, groupAuthority);
    }

    const sessionGroup = group!;
    const sessionLock = lockHandle;
    const sessionExpected = expected;

    const handle: IsolatedCaseDeliveryHandle = {
      ok: true,
      item: acquired.item,
      group: sessionGroup,
      groupAuthority,
      consumerName,
      streamKey,
      kind,
      caseId: input.caseId,
      expected: sessionExpected,
      observedForeignStreamIds: Object.freeze(observedForeign.slice()),
      lockHandle: sessionLock,
      lockClock,

      async confirmLock() {
        if (sessionLock == null) return { ok: true };
        return confirmQaLockOwnership({
          redis: ctx.tcpConsumer,
          handle: sessionLock,
          clock: lockClock,
        });
      },

      async releaseLock() {
        const outcome = await releaseQaExclusivityLock({
          redis: ctx.tcpConsumer,
          handle: sessionLock,
        });
        lockHandle = null;
        return outcome;
      },

      async probePendingInGroup() {
        return ctx.tcpConsumer.qaProbePendingInGroup(
          streamKey,
          sessionGroup,
          acquired.item.streamId,
        );
      },

      async isPendingInGroup() {
        return pendingProbeToDeprecatedBoolean(
          await this.probePendingInGroup(),
        );
      },

      async ackInGroup() {
        return ctx.tcpConsumer.qaXackInGroup(
          streamKey,
          sessionGroup,
          acquired.item.streamId,
        );
      },

      async autoClaimIdleInGroup(claimInput) {
        const claimed = await ctx.tcpConsumer.qaAutoClaimIdleInGroup({
          streamKey,
          group: sessionGroup,
          consumerName: claimInput.consumerName,
          minIdleMs: claimInput.minIdleMs,
          count: claimInput.count,
        });
        if (!claimed.ok) return { ok: false };
        return {
          ok: true,
          streamIds: Object.freeze(claimed.items.map((i) => i.streamId)),
        };
      },

      bindStreamQueue() {
        const runScoped =
          ctx.streamAuthority === "qa_run_scoped" &&
          ctx.qaRunStreamBinding != null;
        const qaRunScopedDlqWriter = runScoped
          ? createQaRunScopedTcpDlqWriter({
              redis: ctx.tcpConsumer,
              binding: ctx.qaRunStreamBinding,
            })
          : null;
        return createGroupBoundStreamQueue({
          restProducer: ctx.restProducer,
          tcpConsumer: ctx.tcpConsumer,
          groupAuthority,
          sessionGroup,
          streamKey,
          kind,
          expected: sessionExpected,
          dlqAuthority: runScoped ? "qa_run_scoped" : "production_env",
          qaRunScopedDlqWriter,
        });
      },

      isLockDeadlineElapsed() {
        return sessionLock != null
          ? isQaLockDeadlineElapsed(sessionLock, lockClock)
          : false;
      },
    };

    finishedWithHandle = true;
    // Transfer lock ownership to handle — do not release in finally.
    lockHandle = null;
    return handle;
  } finally {
    if (!finishedWithHandle && lockHandle != null) {
      await releaseQaExclusivityLock({
        redis: ctx.tcpConsumer,
        handle: lockHandle,
      });
      lockHandle = null;
    }
  }
}

/** True when a group string is a safe QA-owned (non-production) group. */
export function assertQaGroupCleanupEligible(group: string): boolean {
  return isQaOwnedGroup(group) && !isProductionWorkerGroup(group);
}
