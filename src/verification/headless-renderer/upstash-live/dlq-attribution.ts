/**
 * Run-scoped DLQ malformed attribution (Sprint 11E 2D.1G / 2D.1G.1).
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, keys, or IDs.
 *
 * Stages require direct evidence:
 * - dlq_tcp_xadd: writer observation succeeded (not inferred from aggregate action)
 * - source_ack: ACK observation succeeded AND exact pending probe reports false
 */

import {
  consumeRenderDeliveryOnce,
  createDualLeaseDlqAckObservation,
  stableHeadlessDeliveryId,
  validateHeadlessQueueDlqEntry,
} from "@/features/headless-renderer/control-plane";
import type { FakeRedisStreams } from "@/features/headless-renderer/control-plane/testing/fake-redis-streams";

import { acquireIsolatedCaseDelivery } from "./case-delivery-authority";
import { finalizeIsolatedCaseDelivery } from "./case-delivery-finalize";
import type { UpstashLiveCaseEvidence } from "./evidence";
import { trackDlqId, trackStreamId } from "./live-fixtures";
import type { UpstashLiveMatrixContext } from "./types";

function tryTestingFake(
  consumer: UpstashLiveMatrixContext["tcpConsumer"],
): FakeRedisStreams | null {
  const withFake = consumer as { testingFake?: () => FakeRedisStreams };
  try {
    return typeof withFake.testingFake === "function"
      ? withFake.testingFake()
      : null;
  } catch {
    return null;
  }
}

export const DLQ_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "source_delivery_build",
  "source_rest_enqueue",
  "source_exact_acquire",
  "missing_job_consume",
  "dlq_tcp_xadd",
  "source_ack",
  "dlq_exact_lookup",
  "dlq_entry_validation",
  "source_finalize",
  "dlq_finalize",
  "cleanup",
] as const);

export type DlqAttributionStageId =
  (typeof DLQ_ATTRIBUTION_STAGE_IDS)[number];

export const DLQ_ATTRIBUTION_REASON_IDS = Object.freeze([
  "source_delivery_build_failed",
  "source_rest_enqueue_failed",
  "source_exact_acquire_failed",
  "queue_lock_lost",
  "queue_precondition_not_isolated",
  "group_probe_failed",
  "delivery_identity_mismatch",
  "expected_delivery_unavailable",
  "delivery_read_failed",
  "missing_job_consume_failed",
  "dlq_action_not_produced",
  "dlq_tcp_xadd_failed",
  "source_ack_failed",
  "source_pending_not_cleared",
  "source_pending_probe_failed",
  "dlq_exact_lookup_failed",
  "dlq_entry_validation_failed",
  "source_finalize_failed",
  "dlq_finalize_failed",
  "cleanup_tracking_failed",
  "shared_staging_dlq_mutated",
] as const);

export type DlqAttributionReasonId =
  (typeof DLQ_ATTRIBUTION_REASON_IDS)[number];

const DLQ_STAGE_SET = new Set<string>(DLQ_ATTRIBUTION_STAGE_IDS);
const DLQ_REASON_SET = new Set<string>(DLQ_ATTRIBUTION_REASON_IDS);

export function isDlqAttributionStageId(
  value: unknown,
): value is DlqAttributionStageId {
  return typeof value === "string" && DLQ_STAGE_SET.has(value);
}

export function isDlqAttributionReasonId(
  value: unknown,
): value is DlqAttributionReasonId {
  return typeof value === "string" && DLQ_REASON_SET.has(value);
}

export function scrubDlqAttributionStages(
  stages: readonly DlqAttributionStageResult[],
): readonly DlqAttributionStageResult[] {
  const out: DlqAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isDlqAttributionStageId(s.stageId)) continue;
    if (s.ok !== true && s.ok !== false) continue;
    out.push({ stageId: s.stageId, ok: s.ok });
  }
  return Object.freeze(out.slice());
}

export type DlqAttributionStageResult = {
  readonly stageId: DlqAttributionStageId;
  readonly ok: boolean;
};

export type DlqAttributionSuccess = {
  readonly ok: true;
  readonly stages: readonly DlqAttributionStageResult[];
  readonly sourceStreamId: string;
  readonly dlqStreamId: string;
};

export type DlqAttributionFailure = {
  readonly ok: false;
  readonly stages: readonly DlqAttributionStageResult[];
  readonly failureStage: DlqAttributionStageId;
  readonly failureReasonId: DlqAttributionReasonId;
};

function stageOk(stageId: DlqAttributionStageId): DlqAttributionStageResult {
  return { stageId, ok: true };
}

function failAt(
  stages: DlqAttributionStageResult[],
  failureStage: DlqAttributionStageId,
  failureReasonId: DlqAttributionReasonId,
): DlqAttributionFailure {
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
  stage: DlqAttributionStageId;
  reason: DlqAttributionReasonId;
} {
  switch (reasonId) {
    case "delivery_enqueue_failed":
      return {
        stage: "source_rest_enqueue",
        reason: "source_rest_enqueue_failed",
      };
    case "queue_lock_lost":
    case "queue_lock_deadline_elapsed":
    case "queue_lock_ownership_lost":
    case "queue_lock_unavailable":
      return { stage: "source_exact_acquire", reason: "queue_lock_lost" };
    case "queue_precondition_not_isolated":
    case "queue_cursor_changed":
      return {
        stage: "source_exact_acquire",
        reason: "queue_precondition_not_isolated",
      };
    case "group_probe_failed":
      return { stage: "source_exact_acquire", reason: "group_probe_failed" };
    case "expected_delivery_unavailable":
      return {
        stage: "source_exact_acquire",
        reason: "expected_delivery_unavailable",
      };
    case "delivery_read_failed":
      return { stage: "source_exact_acquire", reason: "delivery_read_failed" };
    case "delivery_identity_mismatch":
      return {
        stage: "source_exact_acquire",
        reason: "delivery_identity_mismatch",
      };
    default:
      return {
        stage: "source_exact_acquire",
        reason: "source_exact_acquire_failed",
      };
  }
}

export function attributedFailureToDlqEvidence(
  failure: DlqAttributionFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "dlq.malformed",
    status: "FAIL",
    failureCategory: "DLQ_FAILED",
    failureStage: failure.failureStage,
    failureReasonId: failure.failureReasonId,
  };
}

const FORGED_JOB_ID = "job_missing_for_dlq";

/**
 * Missing-Neon-job → DLQ with run-scoped REST source enqueue + TCP DLQ XADD.
 */
export async function runAttributedDlqMalformed(
  ctx: UpstashLiveMatrixContext,
): Promise<DlqAttributionSuccess | DlqAttributionFailure> {
  const stages: DlqAttributionStageResult[] = [];

  const forgedJobId = FORGED_JOB_ID;
  const forgedAttempt = 1;
  let forgedDeliveryId: string;
  try {
    forgedDeliveryId = stableHeadlessDeliveryId(forgedJobId, forgedAttempt);
  } catch {
    return failAt(
      stages,
      "source_delivery_build",
      "source_delivery_build_failed",
    );
  }
  if (
    typeof forgedDeliveryId !== "string" ||
    forgedDeliveryId.length === 0
  ) {
    return failAt(
      stages,
      "source_delivery_build",
      "source_delivery_build_failed",
    );
  }
  stages.push(stageOk("source_delivery_build"));

  // Capture shared staging DLQ length before (Memory) to prove untouched.
  const sharedNames = ctx.tcpConsumer.streamNames?.() ?? null;
  const fake = tryTestingFake(ctx.tcpConsumer);
  const sharedRenderDlqLenBefore =
    fake != null && sharedNames != null
      ? fake.testingLength(sharedNames.renderDlq)
      : null;

  const acquired = await acquireIsolatedCaseDelivery({
    ctx,
    caseId: "dlq.malformed",
    kind: "render",
    consumerLabel: "dlq",
    groupAuthority: "qa",
    mintDelivery: async () => {
      // REST XADD only — never TCP qaXaddRaw for source enqueue.
      const enqueued = await ctx.restProducer.enqueueRender({
        deliveryId: forgedDeliveryId,
        jobId: forgedJobId,
        ownerId: ctx.ownerId,
        attempt: forgedAttempt,
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
          deliveryId: forgedDeliveryId,
          jobId: forgedJobId,
          ownerId: ctx.ownerId,
          attempt: forgedAttempt,
          streamId: enqueued.value.streamId,
        },
      };
    },
  });

  if (!acquired.ok) {
    const mapped = mapAcquireReason(acquired.reasonId);
    return failAt(stages, mapped.stage, mapped.reason);
  }
  stages.push(stageOk("source_rest_enqueue"));
  stages.push(stageOk("source_exact_acquire"));

  if (acquired.item.entry.deliveryKind !== "render") {
    await acquired.releaseLock();
    return failAt(
      stages,
      "source_exact_acquire",
      "delivery_identity_mismatch",
    );
  }

  const qaObs = createDualLeaseDlqAckObservation();
  const result = await consumeRenderDeliveryOnce({
    streamQueue: acquired.bindStreamQueue(),
    jobStore: ctx.jobStore,
    entry: acquired.item.entry,
    streamId: acquired.item.streamId,
    nowMs: ctx.nowMs + 10,
    leaseSettings: ctx.leaseSettings,
    consumerName: acquired.consumerName,
    qaDlqAckObservation: qaObs,
  });

  if (!result.ok) {
    await acquired.releaseLock();
    if (qaObs.dlqWrite === "called_failed") {
      return failAt(stages, "dlq_tcp_xadd", "dlq_tcp_xadd_failed");
    }
    return failAt(
      stages,
      "missing_job_consume",
      "missing_job_consume_failed",
    );
  }

  const action = result.value.action;
  const obs = result.value.dlqAckObservation ?? qaObs;

  // Consume reached a disposition — mark missing_job_consume before split outcomes.
  if (
    action !== "dlq_acked" &&
    action !== "dlq_written_ack_pending"
  ) {
    await acquired.releaseLock();
    return failAt(stages, "missing_job_consume", "dlq_action_not_produced");
  }
  stages.push(stageOk("missing_job_consume"));

  // dlq_tcp_xadd — writer confirmation only (never inferred from aggregate).
  if (obs.dlqWrite !== "succeeded") {
    await acquired.releaseLock();
    return failAt(stages, "dlq_tcp_xadd", "dlq_tcp_xadd_failed");
  }
  stages.push(stageOk("dlq_tcp_xadd"));

  // source_ack — ACK observation + exact pending-clear proof.
  if (obs.sourceAck !== "succeeded" || action !== "dlq_acked") {
    await acquired.releaseLock();
    return failAt(stages, "source_ack", "source_ack_failed");
  }
  const pendingProbe = await acquired.probePendingInGroup();
  if (!pendingProbe.ok) {
    await acquired.releaseLock();
    return failAt(stages, "source_ack", "source_pending_probe_failed");
  }
  if (pendingProbe.pending) {
    await acquired.releaseLock();
    return failAt(stages, "source_ack", "source_pending_not_cleared");
  }
  stages.push(stageOk("source_ack"));

  const allowlisted = validateHeadlessQueueDlqEntry({
    deliveryId: forgedDeliveryId,
    jobId: forgedJobId,
    ownerId: ctx.ownerId,
    attempt: forgedAttempt,
    class: "malformed_unauthorized",
    enqueuedAtMs: ctx.nowMs,
    reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
  });
  if (!allowlisted.ok) {
    await acquired.releaseLock();
    return failAt(
      stages,
      "dlq_entry_validation",
      "dlq_entry_validation_failed",
    );
  }

  let dlqEntries;
  try {
    dlqEntries = await ctx.tcpConsumer.qaXrange({
      streamKey: ctx.streamNames.renderDlq,
      start: "-",
      end: "+",
      count: 20,
    });
  } catch {
    await acquired.releaseLock();
    return failAt(stages, "dlq_exact_lookup", "dlq_exact_lookup_failed");
  }
  const dlqHit = dlqEntries.find(
    (e) => e.fields.deliveryId === forgedDeliveryId,
  );
  if (dlqHit == null) {
    await acquired.releaseLock();
    return failAt(stages, "dlq_exact_lookup", "dlq_exact_lookup_failed");
  }
  stages.push(stageOk("dlq_exact_lookup"));

  // Re-validate exact looked-up fields (identifiers only).
  const lookedUp = validateHeadlessQueueDlqEntry({
    deliveryId: dlqHit.fields.deliveryId,
    jobId: dlqHit.fields.jobId,
    ownerId: dlqHit.fields.ownerId,
    attempt: Number(dlqHit.fields.attempt),
    class: dlqHit.fields.class,
    enqueuedAtMs: Number(dlqHit.fields.enqueuedAtMs),
    reasonId: dlqHit.fields.reasonId,
  });
  if (!lookedUp.ok || lookedUp.entry.class !== "malformed_unauthorized") {
    await acquired.releaseLock();
    return failAt(
      stages,
      "dlq_entry_validation",
      "dlq_entry_validation_failed",
    );
  }
  stages.push(stageOk("dlq_entry_validation"));

  if (
    fake != null &&
    sharedNames != null &&
    sharedRenderDlqLenBefore != null
  ) {
    const after = fake.testingLength(sharedNames.renderDlq);
    if (after !== sharedRenderDlqLenBefore) {
      await acquired.releaseLock();
      return failAt(
        stages,
        "dlq_tcp_xadd",
        "shared_staging_dlq_mutated",
      );
    }
  }

  trackDlqId(ctx, {
    stream: ctx.streamNames.renderDlq,
    id: dlqHit.streamId,
    kind: "render-dlq",
  });
  trackStreamId(ctx, {
    stream: ctx.streamNames.renderDlq,
    id: dlqHit.streamId,
    kind: "render-dlq",
  });

  const finSource = await finalizeIsolatedCaseDelivery({
    ctx,
    streamKey: acquired.streamKey,
    streamId: acquired.item.streamId,
    kind: "render",
    sessionGroup: acquired.group,
    groupAuthority: "qa",
    lockHandle: acquired.lockHandle,
    lockClock: acquired.lockClock,
    ackSessionGroup: false,
    expectPendingAlreadyCleared: true,
  });
  if (!finSource.ok) {
    await acquired.releaseLock();
    if (
      finSource.reasonId === "queue_lock_lost" ||
      finSource.reasonId === "queue_lock_release_failed"
    ) {
      return failAt(stages, "source_finalize", "queue_lock_lost");
    }
    return failAt(stages, "source_finalize", "source_finalize_failed");
  }
  stages.push(stageOk("source_finalize"));

  const finDlq = await finalizeIsolatedCaseDelivery({
    ctx,
    streamKey: ctx.streamNames.renderDlq,
    streamId: dlqHit.streamId,
    kind: "render-dlq",
    sessionGroup: null,
    groupAuthority: "none",
    lockHandle: null,
    lockClock: { nowMs: () => ctx.nowMs },
    ackSessionGroup: false,
  });
  if (!finDlq.ok) {
    return failAt(stages, "dlq_finalize", "dlq_finalize_failed");
  }
  stages.push(stageOk("dlq_finalize"));

  // Both source and DLQ must be case-finalized (DLQ untracks from trackedDlqIds
  // after successful finalize — caseFinalizedStreamIds is the authority).
  const sourceFinalized = ctx.caseFinalizedStreamIds.some(
    (t) => t.stream === acquired.streamKey && t.id === acquired.item.streamId,
  );
  const dlqFinalized = ctx.caseFinalizedStreamIds.some(
    (t) =>
      t.stream === ctx.streamNames.renderDlq && t.id === dlqHit.streamId,
  );
  if (!sourceFinalized || !dlqFinalized) {
    return failAt(stages, "cleanup", "cleanup_tracking_failed");
  }
  stages.push(stageOk("cleanup"));

  return {
    ok: true,
    stages: Object.freeze(stages.slice()),
    sourceStreamId: acquired.item.streamId,
    dlqStreamId: dlqHit.streamId,
  };
}
