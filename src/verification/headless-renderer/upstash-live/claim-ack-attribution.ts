/**
 * Production claim/ACK attribution (Sprint 11E 2D.1E).
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, SQL, or IDs.
 */

import { consumeRenderDeliveryOnce } from "@/features/headless-renderer/control-plane";

import {
  finalizeIsolatedCaseDelivery,
} from "./case-delivery-finalize";
import { acquireIsolatedCaseDelivery } from "./case-delivery-authority";
import type { UpstashLiveCaseEvidence } from "./evidence";
import {
  hasNoActiveRunOwnedRenderEntries,
  seedQueuedCanonicalJob,
} from "./live-fixtures";
import type { UpstashLiveMatrixContext } from "./types";

export const CLAIM_ACK_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "queued_job_seed",
  "production_group_snapshot",
  "delivery_enqueue",
  "next_unread_precondition",
  "exact_delivery_read",
  "neon_claim",
  "production_ack",
  "pending_clear",
  "stream_finalize",
  "lock_release",
] as const);

export type ClaimAckAttributionStageId =
  (typeof CLAIM_ACK_ATTRIBUTION_STAGE_IDS)[number];

export const CLAIM_ACK_ATTRIBUTION_REASON_IDS = Object.freeze([
  "claim_seed_failed",
  "prior_run_entry_not_finalized",
  "queue_precondition_not_isolated",
  "queue_lock_lost",
  "group_probe_failed",
  "delivery_enqueue_failed",
  "delivery_identity_mismatch",
  "expected_delivery_unavailable",
  "delivery_read_failed",
  "neon_claim_failed",
  "production_ack_failed",
  "production_pending_not_cleared",
  "stream_finalize_failed",
  "queue_lock_release_failed",
] as const);

export type ClaimAckAttributionReasonId =
  (typeof CLAIM_ACK_ATTRIBUTION_REASON_IDS)[number];

const CLAIM_ACK_STAGE_SET = new Set<string>(CLAIM_ACK_ATTRIBUTION_STAGE_IDS);
const CLAIM_ACK_REASON_SET = new Set<string>(CLAIM_ACK_ATTRIBUTION_REASON_IDS);

export function isClaimAckAttributionStageId(
  value: unknown,
): value is ClaimAckAttributionStageId {
  return typeof value === "string" && CLAIM_ACK_STAGE_SET.has(value);
}

export function isClaimAckAttributionReasonId(
  value: unknown,
): value is ClaimAckAttributionReasonId {
  return typeof value === "string" && CLAIM_ACK_REASON_SET.has(value);
}

export function scrubClaimAckAttributionStages(
  stages: readonly ClaimAckAttributionStageResult[],
): readonly ClaimAckAttributionStageResult[] {
  const out: ClaimAckAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isClaimAckAttributionStageId(s.stageId)) continue;
    if (s.ok !== true && s.ok !== false) continue;
    out.push({ stageId: s.stageId, ok: s.ok });
  }
  return Object.freeze(out.slice());
}

export type ClaimAckAttributionStageResult = {
  readonly stageId: ClaimAckAttributionStageId;
  readonly ok: boolean;
};

export type ClaimAckAttributionSuccess = {
  readonly ok: true;
  readonly stages: readonly ClaimAckAttributionStageResult[];
  readonly streamId: string;
  readonly jobId: string;
  readonly claimToken: string;
};

export type ClaimAckAttributionFailure = {
  readonly ok: false;
  readonly stages: readonly ClaimAckAttributionStageResult[];
  readonly failureStage: ClaimAckAttributionStageId;
  readonly failureReasonId: ClaimAckAttributionReasonId;
};

function stageOk(stageId: ClaimAckAttributionStageId): ClaimAckAttributionStageResult {
  return { stageId, ok: true };
}

function failAt(
  stages: ClaimAckAttributionStageResult[],
  failureStage: ClaimAckAttributionStageId,
  failureReasonId: ClaimAckAttributionReasonId,
): ClaimAckAttributionFailure {
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

function mapAcquireReason(
  reasonId: string,
): {
  stage: ClaimAckAttributionStageId;
  reason: ClaimAckAttributionReasonId;
} {
  switch (reasonId) {
    case "queue_lock_lost":
    case "queue_lock_deadline_elapsed":
    case "queue_lock_ownership_lost":
    case "queue_lock_unavailable":
      return { stage: "production_group_snapshot", reason: "queue_lock_lost" };
    case "queue_precondition_not_isolated":
      return {
        stage: "next_unread_precondition",
        reason: "queue_precondition_not_isolated",
      };
    case "queue_cursor_changed":
      return {
        stage: "production_group_snapshot",
        reason: "queue_precondition_not_isolated",
      };
    case "group_probe_failed":
      return {
        stage: "production_group_snapshot",
        reason: "group_probe_failed",
      };
    case "delivery_enqueue_failed":
      return { stage: "delivery_enqueue", reason: "delivery_enqueue_failed" };
    case "expected_delivery_unavailable":
      return {
        stage: "exact_delivery_read",
        reason: "expected_delivery_unavailable",
      };
    case "delivery_read_failed":
      return { stage: "exact_delivery_read", reason: "delivery_read_failed" };
    case "delivery_identity_mismatch":
      return {
        stage: "exact_delivery_read",
        reason: "delivery_identity_mismatch",
      };
    default:
      return {
        stage: "next_unread_precondition",
        reason: "queue_precondition_not_isolated",
      };
  }
}

/**
 * Map attribution failure → progressive/official case evidence (category retained).
 */
export function attributedFailureToClaimAckEvidence(
  failure: ClaimAckAttributionFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "consume.claim.ack",
    status: "FAIL",
    failureCategory: "CONSUME_CLAIM_ACK_FAILED",
    failureStage: failure.failureStage,
    failureReasonId: failure.failureReasonId,
  };
}

/**
 * Production-group claim + ACK with case-local finalization.
 */
export async function runAttributedClaimAckConsume(
  ctx: UpstashLiveMatrixContext,
): Promise<ClaimAckAttributionSuccess | ClaimAckAttributionFailure> {
  const stages: ClaimAckAttributionStageResult[] = [];

  // Prior run-owned render entries must already be case-finalized.
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

  const acquired = await acquireIsolatedCaseDelivery({
    ctx,
    caseId: "consume.claim.ack",
    kind: "render",
    consumerLabel: "claim",
    groupAuthority: "production",
    mintDelivery: async () => {
      const enqueued = await ctx.restProducer.enqueueRender({
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      });
      if (!enqueued.ok) {
        return { ok: false, reasonId: "delivery_enqueue_failed" };
      }
      return {
        ok: true,
        expected: {
          kind: "render",
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          streamId: enqueued.value.streamId,
        },
      };
    },
  });

  if (!acquired.ok) {
    const mapped = mapAcquireReason(acquired.reasonId);
    return failAt(stages, mapped.stage, mapped.reason);
  }

  if (
    acquired.groupAuthority !== "production" ||
    acquired.group !== ctx.streamNames.renderGroup ||
    acquired.item.entry.deliveryKind !== "render"
  ) {
    await acquired.releaseLock();
    return failAt(
      stages,
      "exact_delivery_read",
      "delivery_identity_mismatch",
    );
  }

  stages.push(stageOk("production_group_snapshot"));
  stages.push(stageOk("delivery_enqueue"));
  stages.push(stageOk("next_unread_precondition"));
  stages.push(stageOk("exact_delivery_read"));

  const confirm = await acquired.confirmLock();
  if (!confirm.ok) {
    await acquired.releaseLock();
    return failAt(stages, "production_ack", "queue_lock_lost");
  }

  const result = await consumeRenderDeliveryOnce({
    streamQueue: acquired.bindStreamQueue(),
    jobStore: ctx.jobStore,
    entry: acquired.item.entry,
    streamId: acquired.item.streamId,
    nowMs: ctx.nowMs + 10,
    leaseSettings: ctx.leaseSettings,
    consumerName: acquired.consumerName,
  });

  if (!result.ok || result.value.action !== "claimed_and_acked") {
    await acquired.releaseLock();
    if (!result.ok) {
      return failAt(stages, "neon_claim", "neon_claim_failed");
    }
    if (result.value.action === "acked_duplicate_live") {
      return failAt(stages, "neon_claim", "neon_claim_failed");
    }
    return failAt(stages, "production_ack", "production_ack_failed");
  }
  if (result.value.claimToken == null) {
    await acquired.releaseLock();
    return failAt(stages, "neon_claim", "neon_claim_failed");
  }
  stages.push(stageOk("neon_claim"));
  stages.push(stageOk("production_ack"));

  const probe = await acquired.probePendingInGroup();
  if (!probe.ok || probe.pending) {
    await acquired.releaseLock();
    return failAt(stages, "pending_clear", "production_pending_not_cleared");
  }
  stages.push(stageOk("pending_clear"));

  const finalized = await finalizeIsolatedCaseDelivery({
    ctx,
    streamKey: acquired.streamKey,
    streamId: acquired.item.streamId,
    kind: "render",
    sessionGroup: acquired.group,
    groupAuthority: "production",
    lockHandle: acquired.lockHandle,
    lockClock: acquired.lockClock,
    ackSessionGroup: false,
    expectPendingAlreadyCleared: true,
  });
  if (!finalized.ok) {
    await acquired.releaseLock();
    if (
      finalized.reasonId === "queue_lock_lost" ||
      finalized.reasonId === "queue_lock_release_failed"
    ) {
      return failAt(stages, "lock_release", finalized.reasonId);
    }
    if (finalized.reasonId === "group_probe_failed") {
      return failAt(stages, "stream_finalize", "group_probe_failed");
    }
    return failAt(stages, "stream_finalize", "stream_finalize_failed");
  }
  stages.push(stageOk("stream_finalize"));
  stages.push(stageOk("lock_release"));

  ctx.session.claimToken = result.value.claimToken;
  ctx.session.jobId = seeded.jobId;
  ctx.session.renderStreamId = acquired.item.streamId;
  ctx.session.renderDeliveryId = acquired.item.entry.deliveryId;

  return {
    ok: true,
    stages: Object.freeze(stages.slice()),
    streamId: acquired.item.streamId,
    jobId: seeded.jobId,
    claimToken: result.value.claimToken,
  };
}
