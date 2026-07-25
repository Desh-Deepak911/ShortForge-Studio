/**
 * Case-local stream lifecycle finalization (Sprint 11E 2D.1E / 2D.1E.1 / 2D.1E.2).
 *
 * Fail-closed commit protocol: shared mutations require fresh lock ownership;
 * only compare-token release status `deleted` (or no-lock none-path) authorizes
 * an atomic in-memory active→finalized tracking commit (stream + QA group together).
 *
 * Operates only on the current case's run-owned delivery / QA group.
 * Never destroys production worker groups. Never touches foreign IDs.
 * Global cleanup remains the failure/exception safety net for active leftovers.
 */

import {
  confirmQaLockOwnership,
  destroyQaConsumerGroup,
  isProductionWorkerGroup,
  isQaLockDeadlineElapsed,
  isQaOwnedGroup,
  releaseQaExclusivityLock,
  type QaLockClock,
  type QaLockHandle,
} from "./queue-isolation";
import type {
  UpstashLiveMatrixContext,
  UpstashLiveTrackedStreamId,
} from "./types";

export type CaseFinalizeReasonId =
  | "queue_lock_lost"
  | "queue_lock_release_failed"
  | "pending_probe_failed"
  | "session_ack_failed"
  | "pending_not_cleared"
  | "stream_xdel_failed"
  | "stream_still_present"
  | "stream_presence_probe_failed"
  | "qa_group_destroy_failed"
  | "qa_group_still_present"
  | "group_probe_failed"
  | "finalize_ownership_invalid"
  | "finalize_tracking_failed"
  | "prior_run_entry_not_finalized";

export type CaseFinalizeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: CaseFinalizeReasonId };

export type AtomicTrackingCommitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasonId: "finalize_tracking_failed" };

export type FinalizeIsolatedCaseDeliveryInput = {
  readonly ctx: UpstashLiveMatrixContext;
  readonly streamKey: string;
  readonly streamId: string;
  readonly kind: NonNullable<UpstashLiveTrackedStreamId["kind"]>;
  /**
   * Session consumer group for ACK/pending (QA case group or production workers).
   * Null when the entry was never delivered to a group (unread enqueue-only).
   */
  readonly sessionGroup: string | null;
  readonly groupAuthority: "qa" | "production" | "none";
  readonly lockHandle: QaLockHandle | null;
  readonly lockClock: QaLockClock;
  /**
   * When true, ACK the session group before XDEL (entry was pending or may be).
   * When false, skip ACK (already cleared by consume, or never delivered).
   */
  readonly ackSessionGroup: boolean;
  /** When true, require exact pending=false before ACK (consume already cleared). */
  readonly expectPendingAlreadyCleared?: boolean;
};

function streamKeyOf(entry: UpstashLiveTrackedStreamId): string {
  return `${entry.stream}\0${entry.id}`;
}

function expectedProductionWorkerGroup(
  ctx: UpstashLiveMatrixContext,
  kind: NonNullable<UpstashLiveTrackedStreamId["kind"]>,
): string {
  if (kind === "verify" || kind === "verify-dlq") {
    return ctx.streamNames.verifyGroup;
  }
  return ctx.streamNames.renderGroup;
}

function countStreamTracking(
  ctx: UpstashLiveMatrixContext,
  streamKey: string,
  streamId: string,
): { readonly active: number; readonly finalized: number } {
  const k = `${streamKey}\0${streamId}`;
  let active = 0;
  let finalized = 0;
  for (const t of ctx.runOwnedActiveStreamIds) {
    if (streamKeyOf(t) === k) active += 1;
  }
  for (const t of ctx.caseFinalizedStreamIds) {
    if (streamKeyOf(t) === k) finalized += 1;
  }
  return { active, finalized };
}

function countQaGroupTracking(
  ctx: UpstashLiveMatrixContext,
  group: string,
): { readonly active: number; readonly finalized: number } {
  let active = 0;
  let finalized = 0;
  for (const g of ctx.activeQaGroups) {
    if (g === group) active += 1;
  }
  for (const g of ctx.finalizedQaGroups) {
    if (g === group) finalized += 1;
  }
  return { active, finalized };
}

/**
 * Authority-shape validation for mutation and replay (no live lock required for replay).
 */
export function validateFinalizeAuthorityShape(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly kind: NonNullable<UpstashLiveTrackedStreamId["kind"]>;
  readonly sessionGroup: string | null;
  readonly groupAuthority: "qa" | "production" | "none";
  /** When true (mutation path), qa/production also require a non-null lockHandle. */
  readonly requireLock: boolean;
  readonly lockHandle: QaLockHandle | null;
}): CaseFinalizeResult | null {
  const { sessionGroup, groupAuthority, kind, ctx } = input;

  if (groupAuthority === "none") {
    if (sessionGroup != null) {
      return { ok: false, reasonId: "finalize_ownership_invalid" };
    }
    return null;
  }

  if (sessionGroup == null) {
    return { ok: false, reasonId: "finalize_ownership_invalid" };
  }
  if (input.requireLock && input.lockHandle == null) {
    return { ok: false, reasonId: "finalize_ownership_invalid" };
  }

  if (groupAuthority === "qa") {
    if (!isQaOwnedGroup(sessionGroup) || isProductionWorkerGroup(sessionGroup)) {
      return { ok: false, reasonId: "finalize_ownership_invalid" };
    }
    return null;
  }

  // production
  if (!isProductionWorkerGroup(sessionGroup)) {
    return { ok: false, reasonId: "finalize_ownership_invalid" };
  }
  if (sessionGroup !== expectedProductionWorkerGroup(ctx, kind)) {
    return { ok: false, reasonId: "finalize_ownership_invalid" };
  }
  return null;
}

/**
 * Synchronous eligibility check for the atomic tracking commit.
 * Performs no mutations. Used as preflight before lock release and again after.
 */
export function preflightCaseFinalizationTracking(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly entry: UpstashLiveTrackedStreamId;
  /** QA group to finalize with the stream; null for production/none. */
  readonly qaGroup: string | null;
}): AtomicTrackingCommitResult {
  const { ctx, entry, qaGroup } = input;
  const streamCounts = countStreamTracking(ctx, entry.stream, entry.id);
  if (streamCounts.active !== 1 || streamCounts.finalized !== 0) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  if (qaGroup != null) {
    if (!isQaOwnedGroup(qaGroup) || isProductionWorkerGroup(qaGroup)) {
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
    const groupCounts = countQaGroupTracking(ctx, qaGroup);
    if (groupCounts.active !== 1 || groupCounts.finalized !== 0) {
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
  }

  return { ok: true };
}

/**
 * Atomic active→finalized tracking commit for the stream and optional QA group.
 * No await between validation and mutation. Zero mutations on any precondition failure.
 * Does not touch DLQ tracking — caller removes DLQ only after this succeeds.
 */
export function commitCaseFinalizationTracking(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly entry: UpstashLiveTrackedStreamId;
  readonly qaGroup: string | null;
}): AtomicTrackingCommitResult {
  const preflight = preflightCaseFinalizationTracking(input);
  if (!preflight.ok) return preflight;

  const { ctx, entry, qaGroup } = input;
  const streamK = streamKeyOf(entry);

  // Re-locate indices immediately before mutation (still synchronous).
  const activeStreamIdx = ctx.runOwnedActiveStreamIds.findIndex(
    (t) => streamKeyOf(t) === streamK,
  );
  if (activeStreamIdx < 0) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }
  if (ctx.caseFinalizedStreamIds.some((t) => streamKeyOf(t) === streamK)) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  let activeGroupIdx = -1;
  if (qaGroup != null) {
    activeGroupIdx = ctx.activeQaGroups.indexOf(qaGroup);
    if (activeGroupIdx < 0) {
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
    if (ctx.finalizedQaGroups.includes(qaGroup)) {
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
  }

  // Mutate together — no intervening awaits; no partial commit on throw.
  ctx.runOwnedActiveStreamIds.splice(activeStreamIdx, 1);
  ctx.caseFinalizedStreamIds.push(entry);
  if (qaGroup != null) {
    ctx.activeQaGroups.splice(activeGroupIdx, 1);
    ctx.finalizedQaGroups.push(qaGroup);
  }

  return { ok: true };
}

async function requireLockOwnership(input: {
  readonly redis: UpstashLiveMatrixContext["tcpConsumer"];
  readonly lockHandle: QaLockHandle | null;
  readonly lockClock: QaLockClock;
}): Promise<CaseFinalizeResult | null> {
  if (input.lockHandle == null) return null;
  if (isQaLockDeadlineElapsed(input.lockHandle, input.lockClock)) {
    return { ok: false, reasonId: "queue_lock_lost" };
  }
  const confirm = await confirmQaLockOwnership({
    redis: input.redis,
    handle: input.lockHandle,
    clock: input.lockClock,
  });
  if (!confirm.ok) {
    return { ok: false, reasonId: "queue_lock_lost" };
  }
  return null;
}

async function verifyIdempotentFinalizedReplay(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly streamKey: string;
  readonly streamId: string;
  readonly kind: NonNullable<UpstashLiveTrackedStreamId["kind"]>;
  readonly sessionGroup: string | null;
  readonly groupAuthority: "qa" | "production" | "none";
}): Promise<CaseFinalizeResult> {
  const { ctx, streamKey, streamId, kind, sessionGroup, groupAuthority } =
    input;
  const consumer = ctx.tcpConsumer;

  const shape = validateFinalizeAuthorityShape({
    ctx,
    kind,
    sessionGroup,
    groupAuthority,
    requireLock: false,
    lockHandle: null,
  });
  if (shape != null) return shape;

  const streamCounts = countStreamTracking(ctx, streamKey, streamId);
  if (streamCounts.active !== 0) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }
  if (streamCounts.finalized !== 1) {
    // Neither (0) or duplicate (>1) — fail closed.
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  const presence = await consumer.qaProbeStreamEntry(streamKey, streamId);
  if (!presence.ok) {
    return { ok: false, reasonId: "stream_presence_probe_failed" };
  }
  if (presence.present) {
    return { ok: false, reasonId: "stream_still_present" };
  }

  if (sessionGroup != null && groupAuthority !== "none") {
    const pending = await consumer.qaProbePendingInGroup(
      streamKey,
      sessionGroup,
      streamId,
    );
    if (!pending.ok) {
      return { ok: false, reasonId: "pending_probe_failed" };
    }
    if (pending.pending) {
      return { ok: false, reasonId: "pending_not_cleared" };
    }
  }

  if (groupAuthority === "qa" && sessionGroup != null) {
    const list = await consumer.qaXinfoGroups(streamKey);
    if (!list.ok) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    if (list.groups.some((g) => g.name === sessionGroup)) {
      return { ok: false, reasonId: "qa_group_still_present" };
    }
    const groupCounts = countQaGroupTracking(ctx, sessionGroup);
    if (groupCounts.active !== 0) {
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
    if (groupCounts.finalized !== 1) {
      // Neither-active-nor-finalized or duplicates.
      return { ok: false, reasonId: "finalize_tracking_failed" };
    }
  }

  return { ok: true };
}

/**
 * Finalize a single run-owned delivery so the next canonical case cannot see it.
 */
export async function finalizeIsolatedCaseDelivery(
  input: FinalizeIsolatedCaseDeliveryInput,
): Promise<CaseFinalizeResult> {
  const {
    ctx,
    streamKey,
    streamId,
    kind,
    sessionGroup,
    groupAuthority,
    lockHandle,
    lockClock,
    ackSessionGroup,
  } = input;
  const consumer = ctx.tcpConsumer;
  const entry: UpstashLiveTrackedStreamId = {
    stream: streamKey,
    id: streamId,
    kind,
  };

  const streamCounts = countStreamTracking(ctx, streamKey, streamId);

  // Exact once in finalized + absent from active → read-only idempotent replay.
  if (streamCounts.finalized === 1 && streamCounts.active === 0) {
    return verifyIdempotentFinalizedReplay({
      ctx,
      streamKey,
      streamId,
      kind,
      sessionGroup,
      groupAuthority,
    });
  }

  // Neither / duplicate / both → fail closed before mutation.
  if (!(streamCounts.active === 1 && streamCounts.finalized === 0)) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  const coherence = validateFinalizeAuthorityShape({
    ctx,
    kind,
    sessionGroup,
    groupAuthority,
    requireLock: true,
    lockHandle,
  });
  if (coherence != null) return coherence;

  // Initial ownership checkpoint (when a lock is held).
  {
    const lost = await requireLockOwnership({
      redis: consumer,
      lockHandle,
      lockClock,
    });
    if (lost != null) return lost;
  }

  // Pending disposition + exact probes + optional session ACK.
  if (sessionGroup != null && groupAuthority !== "none") {
    const pre = await consumer.qaProbePendingInGroup(
      streamKey,
      sessionGroup,
      streamId,
    );
    if (!pre.ok) {
      return { ok: false, reasonId: "pending_probe_failed" };
    }

    if (input.expectPendingAlreadyCleared === true) {
      if (pre.pending) {
        return { ok: false, reasonId: "pending_not_cleared" };
      }
    } else if (ackSessionGroup) {
      if (pre.pending) {
        const beforeAck = await requireLockOwnership({
          redis: consumer,
          lockHandle,
          lockClock,
        });
        if (beforeAck != null) return beforeAck;
        const acked = await consumer.qaXackInGroup(
          streamKey,
          sessionGroup,
          streamId,
        );
        if (!acked) {
          return { ok: false, reasonId: "session_ack_failed" };
        }
      }
      const post = await consumer.qaProbePendingInGroup(
        streamKey,
        sessionGroup,
        streamId,
      );
      if (!post.ok) {
        return { ok: false, reasonId: "pending_probe_failed" };
      }
      if (post.pending) {
        return { ok: false, reasonId: "pending_not_cleared" };
      }
    } else if (pre.pending) {
      return { ok: false, reasonId: "pending_not_cleared" };
    }
  }

  // XDEL + exact stream absence. Provider failure never marks finalized.
  {
    const beforeXdel = await requireLockOwnership({
      redis: consumer,
      lockHandle,
      lockClock,
    });
    if (beforeXdel != null) return beforeXdel;
  }
  let deleted: number;
  try {
    deleted = await consumer.qaXdel(streamKey, streamId);
  } catch {
    return { ok: false, reasonId: "stream_xdel_failed" };
  }
  if (!(deleted > 0)) {
    const presenceAfterZero = await consumer.qaProbeStreamEntry(
      streamKey,
      streamId,
    );
    if (!presenceAfterZero.ok) {
      return { ok: false, reasonId: "stream_presence_probe_failed" };
    }
    if (presenceAfterZero.present) {
      return { ok: false, reasonId: "stream_xdel_failed" };
    }
  } else {
    const presence = await consumer.qaProbeStreamEntry(streamKey, streamId);
    if (!presence.ok) {
      return { ok: false, reasonId: "stream_presence_probe_failed" };
    }
    if (presence.present) {
      return { ok: false, reasonId: "stream_still_present" };
    }
  }

  // Destroy case-scoped QA group only (never production).
  let qaGroupToFinalize: string | null = null;
  if (groupAuthority === "qa" && sessionGroup != null) {
    const beforeDestroy = await requireLockOwnership({
      redis: consumer,
      lockHandle,
      lockClock,
    });
    if (beforeDestroy != null) return beforeDestroy;

    const destroyed = await destroyQaConsumerGroup({
      redis: consumer,
      streamKey,
      group: sessionGroup,
    });
    const list = await consumer.qaXinfoGroups(streamKey);
    if (!list.ok) {
      return { ok: false, reasonId: "group_probe_failed" };
    }
    const stillPresent = list.groups.some((g) => g.name === sessionGroup);
    if (!destroyed) {
      if (stillPresent) {
        return { ok: false, reasonId: "qa_group_destroy_failed" };
      }
      // Destroy returned zero but probe confirms absence — proceed.
    } else if (stillPresent) {
      return { ok: false, reasonId: "qa_group_still_present" };
    }
    qaGroupToFinalize = sessionGroup;
  }

  // Preflight tracking eligibility before compare-token release.
  const trackingPreflight = preflightCaseFinalizationTracking({
    ctx,
    entry,
    qaGroup: qaGroupToFinalize,
  });
  if (!trackingPreflight.ok) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  // Final commit boundary: compare-token release (when locked).
  if (lockHandle != null) {
    const release = await releaseQaExclusivityLock({
      redis: consumer,
      handle: lockHandle,
    });
    if (release.status === "lost") {
      return { ok: false, reasonId: "queue_lock_lost" };
    }
    if (release.status === "error") {
      return { ok: false, reasonId: "queue_lock_release_failed" };
    }
    if (release.status !== "deleted") {
      return { ok: false, reasonId: "queue_lock_release_failed" };
    }
  }

  // Synchronous revalidate + atomic commit immediately after release.
  const trackingCommit = commitCaseFinalizationTracking({
    ctx,
    entry,
    qaGroup: qaGroupToFinalize,
  });
  if (!trackingCommit.ok) {
    return { ok: false, reasonId: "finalize_tracking_failed" };
  }

  // DLQ tracking only after the combined commit succeeds.
  if (kind === "render-dlq" || kind === "verify-dlq") {
    const di = ctx.trackedDlqIds.findIndex(
      (t) => t.stream === streamKey && t.id === streamId,
    );
    if (di >= 0) ctx.trackedDlqIds.splice(di, 1);
  }

  return { ok: true };
}

/**
 * Finalize an unread enqueue-only entry (no consumer-group delivery).
 * XDEL + presence probe + mark finalized. No production group mutation.
 * No lock — only valid when groupAuthority is none and sessionGroup is null.
 */
export async function finalizeUnreadRunOwnedEntry(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly streamKey: string;
  readonly streamId: string;
  readonly kind: "render" | "verify";
}): Promise<CaseFinalizeResult> {
  return finalizeIsolatedCaseDelivery({
    ctx: input.ctx,
    streamKey: input.streamKey,
    streamId: input.streamId,
    kind: input.kind,
    sessionGroup: null,
    groupAuthority: "none",
    lockHandle: null,
    lockClock: { nowMs: () => input.ctx.nowMs },
    ackSessionGroup: false,
  });
}
