/**
 * Real duplicate-delivery concurrency attribution (Sprint 11E 2D.1H / 2D.1H.1).
 * Two distinct Redis streamIds, same Neon job/attempt/deliveryId.
 *
 * Lock scopes (2D.1H.1):
 * - Scope A (held): production cursor snapshot → two REST XADDs → two exact
 *   production-group reads → identity verification → compare-token release.
 * - Unlocked: concurrent Neon consume/claim, peer disposition, pending probes,
 *   Neon no-steal reread (bound to already-acquired exact deliveries).
 * - Scope FinA / FinB: each uses a fresh acquire + finalize + compare-token
 *   release. Never reuse a released/expired handle.
 *
 * Accepted local mechanism for official `queue_lock_lost` under the prior
 * single long-held lock: the fixed 20s local safe deadline can elapse across
 * remote Neon/Redis work while Redis ownership may still be valid. This phase
 * does not claim remote causation; it removes the local deadline span.
 *
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, keys, or IDs.
 */

import {
  consumeRenderDeliveryOnce,
  type DualLeaseRenderConsumeAction,
} from "@/features/headless-renderer/control-plane";

import { finalizeIsolatedCaseDelivery } from "./case-delivery-finalize";
import { createGroupBoundStreamQueue } from "./group-bound-stream-queue";
import type { UpstashLiveCaseEvidence } from "./evidence";
import { acquireIsolatedExactDelivery } from "./exact-delivery-acquisition";
import {
  hasNoActiveRunOwnedRenderEntries,
  runScopedConsumerName,
  seedQueuedCanonicalJob,
  trackConsumerName,
  trackRunOwnedStreamId,
} from "./live-fixtures";
import { createQaRunScopedTcpDlqWriter } from "./qa-run-scoped-dlq";
import { ensureQaRunScopedProductionGroups } from "./qa-run-scoped-queue";
import {
  acquireQaExclusivityLock,
  createLiveQaLockClock,
  isProductionWorkerGroup,
  isQaLockDeadlineElapsed,
  releaseQaExclusivityLock,
  snapshotQaGroupCursor,
  type QaLockClock,
  type QaLockHandle,
} from "./queue-isolation";
import type { UpstashLiveMatrixContext } from "./types";

export const CONCURRENCY_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "queued_job_seed",
  "production_group_snapshot",
  "duplicate_a_rest_enqueue",
  "duplicate_b_rest_enqueue",
  "duplicate_a_exact_read",
  "duplicate_b_exact_read",
  "lock_scope_a_release",
  "concurrent_consume",
  "winner_claim",
  "peer_duplicate_ack",
  "pending_a_clear",
  "pending_b_clear",
  "neon_no_steal",
  "duplicate_a_finalize",
  "duplicate_b_finalize",
  "cleanup",
] as const);

export type ConcurrencyAttributionStageId =
  (typeof CONCURRENCY_ATTRIBUTION_STAGE_IDS)[number];

export const CONCURRENCY_ATTRIBUTION_REASON_IDS = Object.freeze([
  "prior_run_entry_not_finalized",
  "claim_seed_failed",
  "group_authority_invalid",
  "queue_lock_unavailable",
  "lock_scope_a_unavailable",
  "lock_scope_a_deadline_elapsed",
  "lock_scope_a_ownership_lost",
  "lock_scope_a_renew_failed",
  "lock_scope_a_release_lost",
  "lock_scope_a_release_failed",
  "lock_scope_fina_unavailable",
  "lock_scope_fina_deadline_elapsed",
  "lock_scope_fina_ownership_lost",
  "lock_scope_fina_release_lost",
  "lock_scope_fina_release_failed",
  "lock_scope_finb_unavailable",
  "lock_scope_finb_deadline_elapsed",
  "lock_scope_finb_ownership_lost",
  "lock_scope_finb_release_lost",
  "lock_scope_finb_release_failed",
  /** @deprecated Prefer scoped lock reason IDs (retained for allowlist stability). */
  "queue_lock_lost",
  "queue_lock_release_failed",
  "queue_cursor_changed",
  "group_probe_failed",
  "delivery_enqueue_failed",
  "delivery_identity_mismatch",
  "expected_delivery_unavailable",
  "delivery_read_failed",
  "queue_precondition_not_isolated",
  "concurrent_consume_failed",
  "two_winners",
  "zero_winners",
  "peer_dlq_rejected",
  "peer_disposition_invalid",
  "peer_left_pending_unrecovered",
  "pending_a_not_cleared",
  "pending_b_not_cleared",
  "pending_probe_failed",
  "neon_claim_missing",
  "neon_claim_stolen",
  "neon_store_version_mismatch",
  "stream_finalize_failed",
  "cleanup_tracking_failed",
] as const);

export type ConcurrencyAttributionReasonId =
  (typeof CONCURRENCY_ATTRIBUTION_REASON_IDS)[number];

const STAGE_SET = new Set<string>(CONCURRENCY_ATTRIBUTION_STAGE_IDS);
const REASON_SET = new Set<string>(CONCURRENCY_ATTRIBUTION_REASON_IDS);

export function isConcurrencyAttributionStageId(
  value: unknown,
): value is ConcurrencyAttributionStageId {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function isConcurrencyAttributionReasonId(
  value: unknown,
): value is ConcurrencyAttributionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function scrubConcurrencyAttributionStages(
  stages: readonly ConcurrencyAttributionStageResult[],
): readonly ConcurrencyAttributionStageResult[] {
  const out: ConcurrencyAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isConcurrencyAttributionStageId(s.stageId)) continue;
    if (s.ok !== true && s.ok !== false) continue;
    out.push({ stageId: s.stageId, ok: s.ok });
  }
  return Object.freeze(out.slice());
}

export type ConcurrencyAttributionStageResult = {
  readonly stageId: ConcurrencyAttributionStageId;
  readonly ok: boolean;
};

export type ConcurrencyAttributionSuccess = {
  readonly ok: true;
  readonly stages: readonly ConcurrencyAttributionStageResult[];
  readonly winnerAction: "claimed_and_acked";
  readonly peerAction: "acked_duplicate_live";
};

export type ConcurrencyAttributionFailure = {
  readonly ok: false;
  readonly stages: readonly ConcurrencyAttributionStageResult[];
  readonly failureStage: ConcurrencyAttributionStageId;
  readonly failureReasonId: ConcurrencyAttributionReasonId;
};

/** Deterministic injection hooks — never used by live harness defaults. */
export type ConcurrencyAttributionOptions = {
  readonly lockClock?: QaLockClock;
  /** Invoked only after scope-A compare-token release status=deleted. */
  readonly onAfterScopeARelease?: () => void | Promise<void>;
  /**
   * Force scope-A release disposition without concurrent consume.
   * `lost`: steal ownership then release (successor-safe).
   * `error`: release with a corrupted token path is not used; instead
   * call release after deleting key via non-compare path is unavailable —
   * simulated by returning release status without mutating when redis
   * compare-delete reports error (inject via steal+wrong token → lost).
   * Prefer `lost` for ownership-loss fixtures.
   */
  readonly forceScopeAReleaseStatus?: "lost" | "error";
  /** Advance clock / mutate before exact-read B renew (scope A still held). */
  readonly onBeforeDuplicateBExactRead?: () => void | Promise<void>;
};

function stageOk(
  stageId: ConcurrencyAttributionStageId,
): ConcurrencyAttributionStageResult {
  return { stageId, ok: true };
}

function failAt(
  stages: ConcurrencyAttributionStageResult[],
  failureStage: ConcurrencyAttributionStageId,
  failureReasonId: ConcurrencyAttributionReasonId,
): ConcurrencyAttributionFailure {
  return {
    ok: false,
    stages: Object.freeze([
      ...stages,
      { stageId: failureStage, ok: false },
    ]),
    failureStage,
    failureReasonId,
  };
}

function mapExactReason(
  reasonId: string,
): ConcurrencyAttributionReasonId {
  switch (reasonId) {
    case "queue_lock_deadline_elapsed":
      return "lock_scope_a_deadline_elapsed";
    case "queue_lock_ownership_lost":
      return "lock_scope_a_ownership_lost";
    case "queue_lock_lost":
      return "lock_scope_a_renew_failed";
    case "queue_precondition_not_isolated":
      return "queue_precondition_not_isolated";
    case "queue_cursor_changed":
      return "queue_cursor_changed";
    case "group_probe_failed":
      return "group_probe_failed";
    case "expected_delivery_unavailable":
      return "expected_delivery_unavailable";
    case "delivery_read_failed":
      return "delivery_read_failed";
    case "delivery_identity_mismatch":
      return "delivery_identity_mismatch";
    default:
      return "queue_precondition_not_isolated";
  }
}

function mapFinalizeLockReason(
  reasonId: string,
  handle: QaLockHandle,
  clock: QaLockClock,
  scope: "fina" | "finb",
): ConcurrencyAttributionReasonId {
  if (reasonId === "queue_lock_release_failed") {
    return scope === "fina"
      ? "lock_scope_fina_release_failed"
      : "lock_scope_finb_release_failed";
  }
  if (reasonId === "queue_lock_lost") {
    if (isQaLockDeadlineElapsed(handle, clock)) {
      return scope === "fina"
        ? "lock_scope_fina_deadline_elapsed"
        : "lock_scope_finb_deadline_elapsed";
    }
    return scope === "fina"
      ? "lock_scope_fina_ownership_lost"
      : "lock_scope_finb_ownership_lost";
  }
  return "stream_finalize_failed";
}

export function attributedFailureToConcurrencyEvidence(
  failure: ConcurrencyAttributionFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "concurrency.no.steal",
    status: "FAIL",
    failureCategory: "CONCURRENCY_FAILED",
    failureStage: failure.failureStage,
    failureReasonId: failure.failureReasonId,
  };
}

/**
 * Pure disposition classifier for duplicate-delivery concurrency fixtures.
 * Never treats DLQ or unrecovered left_pending as success.
 */
export function classifyDuplicateDeliveryPair(input: {
  readonly actionA: DualLeaseRenderConsumeAction;
  readonly actionB: DualLeaseRenderConsumeAction;
  /** When true, peer left_pending was recovered to acked_duplicate_live. */
  readonly peerRecoveredFromLeftPending?: boolean;
}):
  | {
      readonly ok: true;
      readonly winnerSide: "a" | "b";
      readonly peerAction: "acked_duplicate_live";
    }
  | {
      readonly ok: false;
      readonly failureStage:
        | "winner_claim"
        | "peer_duplicate_ack";
      readonly failureReasonId: ConcurrencyAttributionReasonId;
    } {
  const winners: Array<"a" | "b"> = [];
  if (input.actionA === "claimed_and_acked") winners.push("a");
  if (input.actionB === "claimed_and_acked") winners.push("b");
  if (winners.length > 1) {
    return {
      ok: false,
      failureStage: "winner_claim",
      failureReasonId: "two_winners",
    };
  }
  if (winners.length === 0) {
    return {
      ok: false,
      failureStage: "winner_claim",
      failureReasonId: "zero_winners",
    };
  }
  const winnerSide = winners[0]!;
  const peerAction =
    winnerSide === "a" ? input.actionB : input.actionA;
  if (
    peerAction === "dlq_acked" ||
    peerAction === "dlq_written_ack_pending"
  ) {
    return {
      ok: false,
      failureStage: "peer_duplicate_ack",
      failureReasonId: "peer_dlq_rejected",
    };
  }
  if (peerAction === "left_pending") {
    return {
      ok: false,
      failureStage: "peer_duplicate_ack",
      failureReasonId: "peer_left_pending_unrecovered",
    };
  }
  if (peerAction !== "acked_duplicate_live") {
    return {
      ok: false,
      failureStage: "peer_duplicate_ack",
      failureReasonId: "peer_disposition_invalid",
    };
  }
  void input.peerRecoveredFromLeftPending;
  return {
    ok: true,
    winnerSide,
    peerAction: "acked_duplicate_live",
  };
}

function productionRenderGroup(ctx: UpstashLiveMatrixContext): string {
  return ctx.streamNames.renderGroup;
}

/**
 * Two REST XADDs → two streamIds → concurrent Neon claim race → one winner.
 * Lock scopes: A (acquire deliveries) → unlocked Neon race → FinA → FinB.
 */
export async function runAttributedConcurrencyNoSteal(
  ctx: UpstashLiveMatrixContext,
  options: ConcurrencyAttributionOptions = {},
): Promise<ConcurrencyAttributionSuccess | ConcurrencyAttributionFailure> {
  const stages: ConcurrencyAttributionStageResult[] = [];
  const lockClock = options.lockClock ?? createLiveQaLockClock();
  let lockHandle: QaLockHandle | null = null;

  const releaseLockBestEffort = async () => {
    if (lockHandle == null) return;
    await releaseQaExclusivityLock({
      redis: ctx.tcpConsumer,
      handle: lockHandle,
    });
    lockHandle = null;
  };

  try {
    if (!hasNoActiveRunOwnedRenderEntries(ctx)) {
      return failAt(
        stages,
        "queued_job_seed",
        "prior_run_entry_not_finalized",
      );
    }

    const seeded = await seedQueuedCanonicalJob(ctx);
    if (!seeded.ok) {
      return failAt(stages, "queued_job_seed", "claim_seed_failed");
    }
    stages.push(stageOk("queued_job_seed"));

    if (ctx.streamAuthority === "qa_run_scoped") {
      if (ctx.qaRunStreamBinding == null) {
        return failAt(
          stages,
          "production_group_snapshot",
          "group_authority_invalid",
        );
      }
      const ensured = await ensureQaRunScopedProductionGroups({
        redis: ctx.tcpConsumer,
        binding: ctx.qaRunStreamBinding,
      });
      if (!ensured) {
        return failAt(
          stages,
          "production_group_snapshot",
          "group_authority_invalid",
        );
      }
    } else {
      try {
        await ctx.tcpConsumer.ensureConsumerGroups();
      } catch {
        return failAt(
          stages,
          "production_group_snapshot",
          "group_authority_invalid",
        );
      }
    }

    const streamKey = ctx.streamNames.renderStream;
    const group = productionRenderGroup(ctx);
    if (!isProductionWorkerGroup(group)) {
      return failAt(
        stages,
        "production_group_snapshot",
        "group_authority_invalid",
      );
    }

    // ---------- Scope A: delivery isolation only ----------
    const lockA = await acquireQaExclusivityLock({
      redis: ctx.tcpConsumer,
      envName: ctx.envName,
      clock: lockClock,
      kind: "render",
    });
    if (!lockA.acquired) {
      return failAt(
        stages,
        "production_group_snapshot",
        "lock_scope_a_unavailable",
      );
    }
    lockHandle = lockA;

    const cursor = await snapshotQaGroupCursor({
      redis: ctx.tcpConsumer,
      streamKey,
      group,
    });
    if (!cursor.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "production_group_snapshot",
        cursor.reasonId === "group_probe_failed"
          ? "group_probe_failed"
          : "queue_cursor_changed",
      );
    }
    stages.push(stageOk("production_group_snapshot"));

    const entryFields = {
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render" as const,
    };

    const enqA = await ctx.restProducer.enqueueRender(entryFields);
    if (!enqA.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_a_rest_enqueue",
        "delivery_enqueue_failed",
      );
    }
    const streamIdA = enqA.value.streamId;
    trackRunOwnedStreamId(ctx, {
      stream: streamKey,
      id: streamIdA,
      kind: "render",
    });
    stages.push(stageOk("duplicate_a_rest_enqueue"));

    const enqB = await ctx.restProducer.enqueueRender(entryFields);
    if (!enqB.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_rest_enqueue",
        "delivery_enqueue_failed",
      );
    }
    const streamIdB = enqB.value.streamId;
    if (streamIdA === streamIdB) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_rest_enqueue",
        "delivery_identity_mismatch",
      );
    }
    trackRunOwnedStreamId(ctx, {
      stream: streamKey,
      id: streamIdB,
      kind: "render",
    });
    stages.push(stageOk("duplicate_b_rest_enqueue"));

    const consumerA = runScopedConsumerName(ctx, "race_a");
    const consumerB = runScopedConsumerName(ctx, "race_b");
    trackConsumerName(ctx, consumerA);
    trackConsumerName(ctx, consumerB);

    const expectedA = {
      kind: "render" as const,
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      streamId: streamIdA,
    };
    const expectedB = {
      kind: "render" as const,
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      streamId: streamIdB,
    };

    const readA = await acquireIsolatedExactDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey,
      group,
      consumerName: consumerA,
      expected: expectedA,
      cursorSnapshot: {
        group,
        lastDeliveredId: cursor.snapshot.lastDeliveredId,
      },
      blockMs: 0,
      signal: ctx.abortSignal,
      lockHandle,
      clock: lockClock,
    });
    if (!readA.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_a_exact_read",
        mapExactReason(readA.reasonId),
      );
    }
    if (
      readA.item.entry.deliveryKind !== "render" ||
      readA.item.streamId !== streamIdA
    ) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_a_exact_read",
        "delivery_identity_mismatch",
      );
    }
    stages.push(stageOk("duplicate_a_exact_read"));

    const cursorAfterA = await snapshotQaGroupCursor({
      redis: ctx.tcpConsumer,
      streamKey,
      group,
    });
    if (!cursorAfterA.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_exact_read",
        cursorAfterA.reasonId === "group_probe_failed"
          ? "group_probe_failed"
          : "queue_cursor_changed",
      );
    }
    if (cursorAfterA.snapshot.lastDeliveredId !== streamIdA) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_exact_read",
        "queue_cursor_changed",
      );
    }

    if (options.onBeforeDuplicateBExactRead != null) {
      await options.onBeforeDuplicateBExactRead();
    }

    const readB = await acquireIsolatedExactDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey,
      group,
      consumerName: consumerB,
      expected: expectedB,
      cursorSnapshot: {
        group,
        lastDeliveredId: cursorAfterA.snapshot.lastDeliveredId,
      },
      blockMs: 0,
      signal: ctx.abortSignal,
      lockHandle,
      clock: lockClock,
    });
    if (!readB.ok) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_exact_read",
        mapExactReason(readB.reasonId),
      );
    }
    if (
      readB.item.entry.deliveryKind !== "render" ||
      readB.item.streamId !== streamIdB
    ) {
      await releaseLockBestEffort();
      return failAt(
        stages,
        "duplicate_b_exact_read",
        "delivery_identity_mismatch",
      );
    }
    stages.push(stageOk("duplicate_b_exact_read"));

    // Truthful scope-A release before lengthy Neon concurrency work.
    if (options.forceScopeAReleaseStatus === "lost") {
      // Install successor token — stale release must not delete it.
      await ctx.tcpConsumer.qaDelKey(lockHandle.key);
      await ctx.tcpConsumer.qaSetNxPx(
        lockHandle.key,
        `successor_${Date.now()}`,
        lockHandle.ttlMs,
      );
    } else if (options.forceScopeAReleaseStatus === "error") {
      // Deterministic: truthfully release ownership, then fail closed as
      // release-failed before concurrent consume (no manufactured success).
      await releaseQaExclusivityLock({
        redis: ctx.tcpConsumer,
        handle: lockHandle,
      });
      lockHandle = null;
      return failAt(
        stages,
        "lock_scope_a_release",
        "lock_scope_a_release_failed",
      );
    }

    const scopeARelease = await releaseQaExclusivityLock({
      redis: ctx.tcpConsumer,
      handle: lockHandle,
    });
    lockHandle = null;
    if (scopeARelease.status === "lost") {
      return failAt(
        stages,
        "lock_scope_a_release",
        "lock_scope_a_release_lost",
      );
    }
    if (scopeARelease.status === "error") {
      return failAt(
        stages,
        "lock_scope_a_release",
        "lock_scope_a_release_failed",
      );
    }
    stages.push(stageOk("lock_scope_a_release"));

    if (options.onAfterScopeARelease != null) {
      await options.onAfterScopeARelease();
    }

    // ---------- Unlocked: Neon concurrency on already-bound deliveries ----------
    const runScoped =
      ctx.streamAuthority === "qa_run_scoped" &&
      ctx.qaRunStreamBinding != null;
    const qaRunScopedDlqWriter = runScoped
      ? createQaRunScopedTcpDlqWriter({
          redis: ctx.tcpConsumer,
          binding: ctx.qaRunStreamBinding,
        })
      : null;

    const boundA = createGroupBoundStreamQueue({
      restProducer: ctx.restProducer,
      tcpConsumer: ctx.tcpConsumer,
      groupAuthority: "production",
      sessionGroup: group,
      streamKey,
      kind: "render",
      expected: expectedA,
      dlqAuthority: runScoped ? "qa_run_scoped" : "production_env",
      qaRunScopedDlqWriter,
    });
    const boundB = createGroupBoundStreamQueue({
      restProducer: ctx.restProducer,
      tcpConsumer: ctx.tcpConsumer,
      groupAuthority: "production",
      sessionGroup: group,
      streamKey,
      kind: "render",
      expected: expectedB,
      dlqAuthority: runScoped ? "qa_run_scoped" : "production_env",
      qaRunScopedDlqWriter,
    });

    const nowMs = ctx.nowMs + 10;
    const [rA, rB] = await Promise.all([
      consumeRenderDeliveryOnce({
        streamQueue: boundA,
        jobStore: ctx.jobStore,
        entry: readA.item.entry,
        streamId: streamIdA,
        nowMs,
        leaseSettings: ctx.leaseSettings,
        consumerName: consumerA,
      }),
      consumeRenderDeliveryOnce({
        streamQueue: boundB,
        jobStore: ctx.jobStore,
        entry: readB.item.entry,
        streamId: streamIdB,
        nowMs,
        leaseSettings: ctx.leaseSettings,
        consumerName: consumerB,
      }),
    ]);

    if (!rA.ok || !rB.ok) {
      return failAt(
        stages,
        "concurrent_consume",
        "concurrent_consume_failed",
      );
    }
    stages.push(stageOk("concurrent_consume"));

    type Pair = {
      readonly action: DualLeaseRenderConsumeAction;
      readonly streamId: string;
      readonly claimToken?: string;
      readonly bound: typeof boundA;
      readonly entry: typeof readA.item.entry;
      readonly consumerName: string;
    };

    const pairs: readonly Pair[] = [
      {
        action: rA.value.action,
        streamId: streamIdA,
        claimToken: rA.value.claimToken,
        bound: boundA,
        entry: readA.item.entry,
        consumerName: consumerA,
      },
      {
        action: rB.value.action,
        streamId: streamIdB,
        claimToken: rB.value.claimToken,
        bound: boundB,
        entry: readB.item.entry,
        consumerName: consumerB,
      },
    ];

    const winners = pairs.filter((p) => p.action === "claimed_and_acked");
    if (winners.length > 1) {
      return failAt(stages, "winner_claim", "two_winners");
    }
    if (winners.length === 0) {
      return failAt(stages, "winner_claim", "zero_winners");
    }
    const winner = winners[0]!;
    if (winner.claimToken == null || winner.claimToken.length === 0) {
      return failAt(stages, "winner_claim", "neon_claim_missing");
    }
    stages.push(stageOk("winner_claim"));

    let peer = pairs.find((p) => p.streamId !== winner.streamId)!;
    if (
      peer.action === "dlq_acked" ||
      peer.action === "dlq_written_ack_pending"
    ) {
      return failAt(stages, "peer_duplicate_ack", "peer_dlq_rejected");
    }

    if (peer.action === "left_pending") {
      const recovered = await consumeRenderDeliveryOnce({
        streamQueue: peer.bound,
        jobStore: ctx.jobStore,
        entry: peer.entry,
        streamId: peer.streamId,
        nowMs: nowMs + 20,
        leaseSettings: ctx.leaseSettings,
        consumerName: peer.consumerName,
      });
      if (!recovered.ok || recovered.value.action !== "acked_duplicate_live") {
        return failAt(
          stages,
          "peer_duplicate_ack",
          "peer_left_pending_unrecovered",
        );
      }
      peer = {
        ...peer,
        action: "acked_duplicate_live",
      };
    }

    if (peer.action !== "acked_duplicate_live") {
      return failAt(
        stages,
        "peer_duplicate_ack",
        "peer_disposition_invalid",
      );
    }
    stages.push(stageOk("peer_duplicate_ack"));

    const pendingA = await ctx.tcpConsumer.qaProbePendingInGroup(
      streamKey,
      group,
      streamIdA,
    );
    if (!pendingA.ok) {
      return failAt(stages, "pending_a_clear", "pending_probe_failed");
    }
    if (pendingA.pending) {
      return failAt(stages, "pending_a_clear", "pending_a_not_cleared");
    }
    stages.push(stageOk("pending_a_clear"));

    const pendingB = await ctx.tcpConsumer.qaProbePendingInGroup(
      streamKey,
      group,
      streamIdB,
    );
    if (!pendingB.ok) {
      return failAt(stages, "pending_b_clear", "pending_probe_failed");
    }
    if (pendingB.pending) {
      return failAt(stages, "pending_b_clear", "pending_b_not_cleared");
    }
    stages.push(stageOk("pending_b_clear"));

    const reread = await ctx.jobStore.getByJobIdAndOwner(
      seeded.jobId,
      ctx.ownerId,
    );
    if (!reread.ok || reread.value == null || reread.value.stage !== "canonical") {
      return failAt(stages, "neon_no_steal", "neon_claim_missing");
    }
    if (reread.value.claimToken !== winner.claimToken) {
      return failAt(stages, "neon_no_steal", "neon_claim_stolen");
    }
    if (reread.value.storeVersion !== seeded.storeVersion + 1) {
      return failAt(stages, "neon_no_steal", "neon_store_version_mismatch");
    }
    if (
      typeof reread.value.claimedAtMs !== "number" ||
      !Number.isSafeInteger(reread.value.claimedAtMs)
    ) {
      return failAt(stages, "neon_no_steal", "neon_claim_missing");
    }
    stages.push(stageOk("neon_no_steal"));

    // ---------- Scope FinA: fresh lock ----------
    const lockFinA = await acquireQaExclusivityLock({
      redis: ctx.tcpConsumer,
      envName: ctx.envName,
      clock: lockClock,
      kind: "render",
    });
    if (!lockFinA.acquired) {
      return failAt(
        stages,
        "duplicate_a_finalize",
        "lock_scope_fina_unavailable",
      );
    }
    lockHandle = lockFinA;

    const finA = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey,
      streamId: streamIdA,
      kind: "render",
      sessionGroup: group,
      groupAuthority: "production",
      lockHandle: lockFinA,
      lockClock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    lockHandle = null;
    if (!finA.ok) {
      await releaseLockBestEffort();
      if (
        finA.reasonId === "queue_lock_lost" ||
        finA.reasonId === "queue_lock_release_failed"
      ) {
        return failAt(
          stages,
          "duplicate_a_finalize",
          mapFinalizeLockReason(finA.reasonId, lockFinA, lockClock, "fina"),
        );
      }
      return failAt(stages, "duplicate_a_finalize", "stream_finalize_failed");
    }
    stages.push(stageOk("duplicate_a_finalize"));

    // ---------- Scope FinB: fresh lock ----------
    const lockFinB = await acquireQaExclusivityLock({
      redis: ctx.tcpConsumer,
      envName: ctx.envName,
      clock: lockClock,
      kind: "render",
    });
    if (!lockFinB.acquired) {
      return failAt(
        stages,
        "duplicate_b_finalize",
        "lock_scope_finb_unavailable",
      );
    }
    lockHandle = lockFinB;

    const finB = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey,
      streamId: streamIdB,
      kind: "render",
      sessionGroup: group,
      groupAuthority: "production",
      lockHandle: lockFinB,
      lockClock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    lockHandle = null;
    if (!finB.ok) {
      await releaseLockBestEffort();
      if (
        finB.reasonId === "queue_lock_lost" ||
        finB.reasonId === "queue_lock_release_failed"
      ) {
        return failAt(
          stages,
          "duplicate_b_finalize",
          mapFinalizeLockReason(finB.reasonId, lockFinB, lockClock, "finb"),
        );
      }
      return failAt(stages, "duplicate_b_finalize", "stream_finalize_failed");
    }
    stages.push(stageOk("duplicate_b_finalize"));

    const aFinalized = ctx.caseFinalizedStreamIds.some(
      (t) => t.stream === streamKey && t.id === streamIdA,
    );
    const bFinalized = ctx.caseFinalizedStreamIds.some(
      (t) => t.stream === streamKey && t.id === streamIdB,
    );
    if (!aFinalized || !bFinalized) {
      return failAt(stages, "cleanup", "cleanup_tracking_failed");
    }
    stages.push(stageOk("cleanup"));

    ctx.session.claimToken = winner.claimToken;
    ctx.session.jobId = seeded.jobId;

    return {
      ok: true,
      stages: Object.freeze(stages.slice()),
      winnerAction: "claimed_and_acked",
      peerAction: "acked_duplicate_live",
    };
  } catch {
    await releaseLockBestEffort();
    return failAt(stages, "concurrent_consume", "concurrent_consume_failed");
  }
}
