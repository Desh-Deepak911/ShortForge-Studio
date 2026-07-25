/**
 * Bounded duplicate-live consume attribution for Upstash live matrix.
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, SQL, or IDs.
 *
 * Proves: capture claim token/claimedAt/storeVersion before consume;
 * action `acked_duplicate_live`; zero second claimQueuedJob; exact group
 * pending cleared; Neon claim fields unchanged.
 */

import {
  consumeRenderDeliveryOnce,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";

import {
  acquireIsolatedCaseDelivery,
  type CaseDeliveryAuthorityReasonId,
} from "./case-delivery-authority";
import { finalizeIsolatedCaseDelivery } from "./case-delivery-finalize";
import { createCountingJobStore } from "./counting-job-store";
import type { UpstashLiveCaseEvidence } from "./evidence";
import {
  seedQueuedCanonicalJob,
  trackJobId,
} from "./live-fixtures";
import {
  createLiveQaLockClock,
  type QaLockClock,
} from "./queue-isolation";
import type { UpstashLiveMatrixContext } from "./types";

export const DUPLICATE_LIVE_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "queued_job_seed",
  "initial_claim",
  "live_claim_reread",
  "delivery_enqueue",
  "queue_isolation",
  "delivery_identity",
  "duplicate_detection",
  "duplicate_ack",
  "pending_clear",
  "claim_immutability",
  "cleanup",
] as const);

export type DuplicateLiveAttributionStageId =
  (typeof DUPLICATE_LIVE_ATTRIBUTION_STAGE_IDS)[number];

export const DUPLICATE_LIVE_ATTRIBUTION_REASON_IDS = Object.freeze([
  "duplicate_seed_failed",
  "initial_claim_failed",
  "live_claim_missing",
  "live_claim_expired",
  "delivery_enqueue_failed",
  "delivery_identity_mismatch",
  "duplicate_action_mismatch",
  "duplicate_ack_failed",
  "duplicate_still_pending",
  "live_claim_mutated",
  "queue_lock_lost",
  "queue_lock_release_failed",
  "queue_precondition_not_isolated",
  "stream_finalize_failed",
] as const);

export type DuplicateLiveAttributionReasonId =
  (typeof DUPLICATE_LIVE_ATTRIBUTION_REASON_IDS)[number];

const STAGE_SET = new Set<string>(DUPLICATE_LIVE_ATTRIBUTION_STAGE_IDS);
const REASON_SET = new Set<string>(DUPLICATE_LIVE_ATTRIBUTION_REASON_IDS);

export type DuplicateLiveAttributionStageStatus =
  | "ok"
  | "failed"
  | "skipped"
  | "best_effort_failed";

export type DuplicateLiveAttributionStageResult = {
  readonly stage: DuplicateLiveAttributionStageId;
  readonly status: DuplicateLiveAttributionStageStatus;
  readonly reasonId?: DuplicateLiveAttributionReasonId;
};

export type AttributedDuplicateLiveSuccess = {
  readonly ok: true;
  readonly jobId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly streamId: string;
  readonly claimToken: string;
  readonly claimQueuedJobCallCount: number;
  readonly stages: readonly DuplicateLiveAttributionStageResult[];
};

export type AttributedDuplicateLiveFailure = {
  readonly ok: false;
  readonly failureStage: DuplicateLiveAttributionStageId;
  readonly failureReasonId: DuplicateLiveAttributionReasonId;
  readonly stages: readonly DuplicateLiveAttributionStageResult[];
  readonly claimQueuedJobCallCount: number;
};

export type AttributedDuplicateLiveResult =
  | AttributedDuplicateLiveSuccess
  | AttributedDuplicateLiveFailure;

export function isDuplicateLiveAttributionStageId(
  value: unknown,
): value is DuplicateLiveAttributionStageId {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function isDuplicateLiveAttributionReasonId(
  value: unknown,
): value is DuplicateLiveAttributionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function scrubDuplicateLiveAttributionStages(
  stages: readonly DuplicateLiveAttributionStageResult[],
): readonly DuplicateLiveAttributionStageResult[] {
  const out: DuplicateLiveAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isDuplicateLiveAttributionStageId(s.stage)) continue;
    if (
      s.status !== "ok" &&
      s.status !== "failed" &&
      s.status !== "skipped" &&
      s.status !== "best_effort_failed"
    ) {
      continue;
    }
    if (s.reasonId != null && !isDuplicateLiveAttributionReasonId(s.reasonId)) {
      out.push({ stage: s.stage, status: s.status });
      continue;
    }
    out.push(
      s.reasonId != null
        ? { stage: s.stage, status: s.status, reasonId: s.reasonId }
        : { stage: s.stage, status: s.status },
    );
  }
  return Object.freeze(out.slice());
}

function stageOk(
  stage: DuplicateLiveAttributionStageId,
): DuplicateLiveAttributionStageResult {
  return { stage, status: "ok" };
}

function stageFail(
  stage: DuplicateLiveAttributionStageId,
  reasonId: DuplicateLiveAttributionReasonId,
): DuplicateLiveAttributionStageResult {
  return { stage, status: "failed", reasonId };
}

function failAt(
  stages: DuplicateLiveAttributionStageResult[],
  stage: DuplicateLiveAttributionStageId,
  reasonId: DuplicateLiveAttributionReasonId,
  claimQueuedJobCallCount: number,
): AttributedDuplicateLiveFailure {
  stages.push(stageFail(stage, reasonId));
  return {
    ok: false,
    failureStage: stage,
    failureReasonId: reasonId,
    stages: scrubDuplicateLiveAttributionStages(stages),
    claimQueuedJobCallCount,
  };
}

function mapAuthorityReason(
  reasonId: CaseDeliveryAuthorityReasonId,
): DuplicateLiveAttributionReasonId {
  if (
    reasonId === "queue_lock_lost" ||
    reasonId === "queue_lock_deadline_elapsed" ||
    reasonId === "queue_lock_ownership_lost" ||
    reasonId === "queue_lock_unavailable"
  ) {
    return "queue_lock_lost";
  }
  if (
    reasonId === "queue_precondition_not_isolated" ||
    reasonId === "queue_cursor_changed" ||
    reasonId === "expected_delivery_unavailable"
  ) {
    return "queue_precondition_not_isolated";
  }
  if (
    reasonId === "delivery_identity_mismatch" ||
    reasonId === "delivery_read_failed"
  ) {
    return "delivery_identity_mismatch";
  }
  if (reasonId === "delivery_enqueue_failed") {
    return "delivery_enqueue_failed";
  }
  return "delivery_enqueue_failed";
}

export type AttributedDuplicateLiveDeps = {
  readonly markCleanupSkipped?: boolean;
  readonly blockMs?: number;
  readonly countingJobStore?: ReturnType<typeof createCountingJobStore>;
  readonly skipQaLock?: boolean;
  readonly qaLockClock?: QaLockClock;
  /**
   * Deterministic: treat the live claim as expired at reread by advancing the
   * consume clock past renderClaimMs (cannot PASS as acked_duplicate_live).
   */
  readonly forceExpiredClaim?: boolean;
  /**
   * Deterministic: enqueue a mismatched deliveryId while Neon claim stays live
   * — identity match must fail closed.
   */
  readonly forceMismatchedEnqueue?: boolean;
};

/**
 * Sequential attributed duplicate-live consume chain.
 * Uses case-scoped QA isolation — PASS proves group pending clear on the QA
 * group where the delivery was read (not independent production-group proof).
 */
export async function runAttributedDuplicateLiveConsume(
  ctx: UpstashLiveMatrixContext,
  deps: AttributedDuplicateLiveDeps = {},
): Promise<AttributedDuplicateLiveResult> {
  const stages: DuplicateLiveAttributionStageResult[] = [];
  const counting =
    deps.countingJobStore ?? createCountingJobStore(ctx.jobStore);
  counting.resetClaimQueuedJobCallCount();
  const jobStore = counting;
  const lockClock = deps.qaLockClock ?? createLiveQaLockClock();

  // --- queued_job_seed ---
  let jobId: string;
  let attempt: number;
  let deliveryId: string;
  try {
    const seeded = await seedQueuedCanonicalJob({ ...ctx, jobStore });
    if (!seeded.ok) {
      return failAt(
        stages,
        "queued_job_seed",
        "duplicate_seed_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    jobId = seeded.jobId;
    attempt = seeded.attempt;
    deliveryId = seeded.deliveryId;
    trackJobId(ctx, jobId);
    stages.push(stageOk("queued_job_seed"));
  } catch {
    return failAt(
      stages,
      "queued_job_seed",
      "duplicate_seed_failed",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- initial_claim ---
  let claimToken: string;
  let claimedAtMs: number;
  let storeVersionAfterClaim: number;
  try {
    const loaded = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
    if (!loaded.ok || loaded.value.stage !== "canonical") {
      return failAt(
        stages,
        "initial_claim",
        "initial_claim_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    counting.resetClaimQueuedJobCallCount();
    const claimed = await jobStore.claimQueuedJob({
      jobId,
      ownerId: ctx.ownerId,
      expectedStoreVersion: loaded.value.storeVersion,
      claimToken: `claim_live_${ctx.runId.slice(0, 8)}`,
      nowMs: ctx.nowMs + 5,
    });
    if (!claimed.ok || claimed.value.kind !== "claimed") {
      return failAt(
        stages,
        "initial_claim",
        "initial_claim_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    if (counting.claimQueuedJobCallCount !== 1) {
      return failAt(
        stages,
        "initial_claim",
        "initial_claim_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    claimToken = claimed.value.record.claimToken ?? "";
    claimedAtMs = claimed.value.record.claimedAtMs ?? 0;
    storeVersionAfterClaim = claimed.value.record.storeVersion;
    if (claimToken.length === 0 || claimedAtMs <= 0) {
      return failAt(
        stages,
        "initial_claim",
        "initial_claim_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("initial_claim"));
  } catch {
    return failAt(
      stages,
      "initial_claim",
      "initial_claim_failed",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- live_claim_reread (capture before consume) ---
  try {
    const reread = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
    if (!reread.ok || reread.value.stage !== "canonical") {
      return failAt(
        stages,
        "live_claim_reread",
        "live_claim_missing",
        counting.claimQueuedJobCallCount,
      );
    }
    if (
      reread.value.claimToken !== claimToken ||
      reread.value.claimedAtMs !== claimedAtMs
    ) {
      return failAt(
        stages,
        "live_claim_reread",
        "live_claim_missing",
        counting.claimQueuedJobCallCount,
      );
    }
    // Live claim must still be within lease at consume time.
    const consumeNowMs =
      deps.forceExpiredClaim === true
        ? claimedAtMs + ctx.leaseSettings.renderClaimMs + 1
        : ctx.nowMs + 20;
    const expiresAt = claimedAtMs + ctx.leaseSettings.renderClaimMs;
    if (consumeNowMs >= expiresAt) {
      return failAt(
        stages,
        "live_claim_reread",
        "live_claim_expired",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("live_claim_reread"));
  } catch {
    return failAt(
      stages,
      "live_claim_reread",
      "live_claim_missing",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- delivery_enqueue + queue_isolation + delivery_identity ---
  const acquired = await acquireIsolatedCaseDelivery({
    ctx,
    caseId: "consume.duplicate.live",
    kind: "render",
    consumerLabel: "dup",
    groupAuthority: "qa",
    qaLockClock: lockClock,
    skipQaLock: deps.skipQaLock,
    blockMs: deps.blockMs,
    mintDelivery: async () => {
      try {
        const enqueueJobId =
          deps.forceMismatchedEnqueue === true
            ? `job_mismatch_${ctx.runId.slice(0, 8)}`
            : jobId;
        const enqueueDeliveryId =
          deps.forceMismatchedEnqueue === true
            ? stableHeadlessDeliveryId(enqueueJobId, attempt)
            : deliveryId;
        const enqueued = await ctx.restProducer.enqueueRender({
          deliveryId: enqueueDeliveryId,
          jobId: enqueueJobId,
          ownerId: ctx.ownerId,
          attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        });
        if (!enqueued.ok) {
          return { ok: false, reasonId: "delivery_enqueue_failed" };
        }
        ctx.session.renderStreamId = enqueued.value.streamId;
        ctx.session.renderDeliveryId = deliveryId;
        ctx.session.jobId = jobId;
        return {
          ok: true,
          expected: {
            kind: "render",
            deliveryId,
            jobId,
            ownerId: ctx.ownerId,
            attempt,
            streamId: enqueued.value.streamId,
          },
        };
      } catch {
        return { ok: false, reasonId: "delivery_enqueue_failed" };
      }
    },
  });

  if (!acquired.ok) {
    const mapped = mapAuthorityReason(acquired.reasonId);
    if (
      mapped === "queue_lock_lost" ||
      mapped === "queue_precondition_not_isolated"
    ) {
      return failAt(
        stages,
        "queue_isolation",
        mapped,
        counting.claimQueuedJobCallCount,
      );
    }
    if (mapped === "delivery_enqueue_failed") {
      return failAt(
        stages,
        "delivery_enqueue",
        "delivery_enqueue_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("delivery_enqueue"));
    stages.push(stageOk("queue_isolation"));
    return failAt(
      stages,
      "delivery_identity",
      "delivery_identity_mismatch",
      counting.claimQueuedJobCallCount,
    );
  }

  stages.push(stageOk("delivery_enqueue"));
  stages.push(stageOk("queue_isolation"));
  stages.push(stageOk("delivery_identity"));

  const item = acquired.item;
  if (item.entry.deliveryKind !== "render") {
    await acquired.releaseLock();
    return failAt(
      stages,
      "delivery_identity",
      "delivery_identity_mismatch",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- duplicate_detection + duplicate_ack ---
  counting.resetClaimQueuedJobCallCount();
  try {
    const confirm = await acquired.confirmLock();
    if (!confirm.ok) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "queue_isolation",
        "queue_lock_lost",
        counting.claimQueuedJobCallCount,
      );
    }

    const result = await consumeRenderDeliveryOnce({
      streamQueue: acquired.bindStreamQueue(),
      jobStore,
      entry: item.entry,
      streamId: item.streamId,
      nowMs: ctx.nowMs + 20,
      leaseSettings: ctx.leaseSettings,
      consumerName: acquired.consumerName,
    });

    // Read via Number() — TS may narrow the getter after the earlier !== 1 check.
    const claimCallsAfterConsume = Number(counting.claimQueuedJobCallCount);
    if (claimCallsAfterConsume !== 0) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "duplicate_detection",
        "duplicate_action_mismatch",
        claimCallsAfterConsume,
      );
    }

    if (!result.ok) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "duplicate_ack",
        "duplicate_ack_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    if (result.value.action !== "acked_duplicate_live") {
      await acquired.releaseLock();
      return failAt(
        stages,
        "duplicate_detection",
        "duplicate_action_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("duplicate_detection"));
    stages.push(stageOk("duplicate_ack"));
  } catch {
    await acquired.releaseLock();
    return failAt(
      stages,
      "duplicate_ack",
      "duplicate_ack_failed",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- pending_clear (QA session group) — exact probe only ---
  try {
    const probe = await acquired.probePendingInGroup();
    if (!probe.ok || probe.pending) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "pending_clear",
        "duplicate_still_pending",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("pending_clear"));
  } catch {
    await acquired.releaseLock();
    return failAt(
      stages,
      "pending_clear",
      "duplicate_still_pending",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- claim_immutability ---
  try {
    const again = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
    if (!again.ok || again.value.stage !== "canonical") {
      await acquired.releaseLock();
      return failAt(
        stages,
        "claim_immutability",
        "live_claim_mutated",
        counting.claimQueuedJobCallCount,
      );
    }
    if (
      again.value.claimToken !== claimToken ||
      again.value.claimedAtMs !== claimedAtMs ||
      again.value.storeVersion !== storeVersionAfterClaim
    ) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "claim_immutability",
        "live_claim_mutated",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("claim_immutability"));
  } catch {
    await acquired.releaseLock();
    return failAt(
      stages,
      "claim_immutability",
      "live_claim_mutated",
      counting.claimQueuedJobCallCount,
    );
  }

  const finalized = await finalizeIsolatedCaseDelivery({
    ctx,
    streamKey: acquired.streamKey,
    streamId: item.streamId,
    kind: "render",
    sessionGroup: acquired.group,
    groupAuthority: "qa",
    lockHandle: acquired.lockHandle,
    lockClock,
    ackSessionGroup: false,
    expectPendingAlreadyCleared: true,
  });
  if (!finalized.ok) {
    await acquired.releaseLock();
    if (
      finalized.reasonId === "queue_lock_lost" ||
      finalized.reasonId === "queue_lock_release_failed"
    ) {
      return failAt(
        stages,
        "cleanup",
        finalized.reasonId,
        counting.claimQueuedJobCallCount,
      );
    }
    return failAt(
      stages,
      "cleanup",
      "stream_finalize_failed",
      counting.claimQueuedJobCallCount,
    );
  }

  if (deps.markCleanupSkipped) {
    stages.push({ stage: "cleanup", status: "skipped" });
  } else {
    stages.push(stageOk("cleanup"));
  }

  return {
    ok: true,
    jobId,
    deliveryId,
    attempt,
    streamId: item.streamId,
    claimToken,
    claimQueuedJobCallCount: counting.claimQueuedJobCallCount,
    stages: scrubDuplicateLiveAttributionStages(stages),
  };
}

export function attributedFailureToDuplicateLiveEvidence(
  failure: AttributedDuplicateLiveFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "consume.duplicate.live",
    status: "FAIL",
    failureCategory: "CONSUME_DUPLICATE_FAILED",
    failureReasonId: failure.failureReasonId,
  };
}
