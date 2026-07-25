/**
 * Bounded terminal no-op consume attribution for Upstash live / probe QA.
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, SQL, or IDs.
 */

import { randomUUID } from "node:crypto";

import {
  consumeRenderDeliveryOnce,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain";
import { isHeadlessTerminalState } from "@/features/headless-renderer/domain/headless-render-constants";

import { finalizeIsolatedCaseDelivery } from "./case-delivery-finalize";
import { createCountingJobStore } from "./counting-job-store";
import { acquireIsolatedExactRenderDelivery } from "./exact-delivery-acquisition";
import type { UpstashLiveCaseEvidence } from "./evidence";
import { createGroupBoundStreamQueue } from "./group-bound-stream-queue";
import {
  createQaRunScopedTcpDlqWriter,
  type QaRunScopedTcpDlqWriter,
} from "./qa-run-scoped-dlq";
import {
  observeForeignStreamId,
  runScopedConsumerName,
  seedQueuedCanonicalJob,
  trackConsumerName,
  trackJobId,
  trackQaGroup,
  trackRunOwnedStreamId,
} from "./live-fixtures";
import {
  acquireQaExclusivityLock,
  confirmQaLockOwnership,
  createLiveQaLockClock,
  createQaRenderConsumerGroup,
  releaseQaExclusivityLock,
  type QaLockClock,
  type QaLockHandle,
  type QaLockReleaseResult,
} from "./queue-isolation";
import type { UpstashLiveMatrixContext } from "./types";

function resolveTerminalDlqWriter(
  ctx: UpstashLiveMatrixContext,
): QaRunScopedTcpDlqWriter | null {
  if (
    ctx.streamAuthority !== "qa_run_scoped" ||
    ctx.qaRunStreamBinding == null
  ) {
    return null;
  }
  return createQaRunScopedTcpDlqWriter({
    redis: ctx.tcpConsumer,
    binding: ctx.qaRunStreamBinding,
  });
}

export const TERMINAL_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "terminal_job_seed",
  "terminal_transition",
  "terminal_cas",
  "terminal_reread",
  "terminal_state_assertion",
  "queue_lock_acquire",
  "queue_lock_renew",
  "queue_lock_release",
  "queue_cursor_snapshot",
  "delivery_enqueue",
  "queue_precondition",
  "expected_delivery_read",
  "delivery_identity_match",
  "consume_job_load",
  "terminal_detection",
  "redis_ack",
  "pending_clear",
  "terminal_immutability",
  "cleanup",
] as const);

export type TerminalAttributionStageId =
  (typeof TERMINAL_ATTRIBUTION_STAGE_IDS)[number];

export const TERMINAL_ATTRIBUTION_REASON_IDS = Object.freeze([
  "terminal_seed_failed",
  "terminal_transition_failed",
  "terminal_cas_failed",
  "terminal_reread_failed",
  "terminal_state_mismatch",
  "terminal_reason_mismatch",
  "queue_lock_unavailable",
  "queue_lock_lost",
  "queue_lock_release_failed",
  "queue_cursor_changed",
  "group_probe_failed",
  "delivery_enqueue_failed",
  "queue_precondition_not_isolated",
  "expected_delivery_unavailable",
  "delivery_read_failed",
  "delivery_identity_mismatch",
  "terminal_consume_failed",
  "terminal_action_mismatch",
  "redis_ack_failed",
  "delivery_still_pending",
  "terminal_record_mutated",
  "stream_finalize_failed",
] as const);

export type TerminalAttributionReasonId =
  (typeof TERMINAL_ATTRIBUTION_REASON_IDS)[number];

const STAGE_SET = new Set<string>(TERMINAL_ATTRIBUTION_STAGE_IDS);
const REASON_SET = new Set<string>(TERMINAL_ATTRIBUTION_REASON_IDS);

export type TerminalAttributionStageStatus =
  | "ok"
  | "failed"
  | "skipped"
  | "best_effort_failed";

/** Allowlisted stage result — no secrets/IDs/URLs/SQL. */
export type TerminalAttributionStageResult = {
  readonly stage: TerminalAttributionStageId;
  readonly status: TerminalAttributionStageStatus;
  readonly reasonId?: TerminalAttributionReasonId;
};

export type AttributedTerminalNoopSuccess = {
  readonly ok: true;
  readonly jobId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly storeVersion: number;
  readonly streamId: string;
  readonly claimQueuedJobCallCount: number;
  readonly stages: readonly TerminalAttributionStageResult[];
};

export type AttributedTerminalNoopFailure = {
  readonly ok: false;
  readonly failureStage: TerminalAttributionStageId;
  readonly failureReasonId: TerminalAttributionReasonId;
  readonly stages: readonly TerminalAttributionStageResult[];
  readonly claimQueuedJobCallCount: number;
};

export type AttributedTerminalNoopResult =
  | AttributedTerminalNoopSuccess
  | AttributedTerminalNoopFailure;

export function isTerminalAttributionStageId(
  value: unknown,
): value is TerminalAttributionStageId {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function isTerminalAttributionReasonId(
  value: unknown,
): value is TerminalAttributionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function scrubTerminalAttributionStages(
  stages: readonly TerminalAttributionStageResult[],
): readonly TerminalAttributionStageResult[] {
  const out: TerminalAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isTerminalAttributionStageId(s.stage)) continue;
    if (
      s.status !== "ok" &&
      s.status !== "failed" &&
      s.status !== "skipped" &&
      s.status !== "best_effort_failed"
    ) {
      continue;
    }
    if (s.reasonId != null && !isTerminalAttributionReasonId(s.reasonId)) {
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
  stage: TerminalAttributionStageId,
): TerminalAttributionStageResult {
  return { stage, status: "ok" };
}

function stageFail(
  stage: TerminalAttributionStageId,
  reasonId: TerminalAttributionReasonId,
): TerminalAttributionStageResult {
  return { stage, status: "failed", reasonId };
}

function failAt(
  stages: TerminalAttributionStageResult[],
  stage: TerminalAttributionStageId,
  reasonId: TerminalAttributionReasonId,
  claimQueuedJobCallCount: number,
): AttributedTerminalNoopFailure {
  stages.push(stageFail(stage, reasonId));
  return {
    ok: false,
    failureStage: stage,
    failureReasonId: reasonId,
    stages: scrubTerminalAttributionStages(stages),
    claimQueuedJobCallCount,
  };
}

export type AttributedTerminalNoopDeps = {
  /** Skip cleanup stage marker (harness cleanup runs separately). */
  readonly markCleanupSkipped?: boolean;
  readonly blockMs?: number;
  /**
   * Deterministic suites only — leave job queued (nonterminal) after seed.
   * Stops at terminal_state_assertion / terminal_detection.
   */
  readonly skipTerminalTransition?: boolean;
  /**
   * Deterministic: enqueue a mismatched deliveryId while Neon stays terminal.
   * Used to prove identity / nonterminal consume paths fail closed.
   */
  readonly forceMismatchedEnqueue?: boolean;
  /**
   * Deterministic: after QA group create, enqueue a foreign entry before the
   * expected delivery so precondition fails closed without XREADGROUP.
   */
  readonly injectForeignBeforeExpected?: boolean;
  /** When set, wraps this store; otherwise wraps ctx.jobStore. */
  readonly countingJobStore?: ReturnType<typeof createCountingJobStore>;
  /** Skip exclusivity lock (deterministic single-tenant FakeRedis only). */
  readonly skipQaLock?: boolean;
  /** Deterministic: steal lock before precondition renew. */
  readonly forceLockLostBeforePrecondition?: boolean;
  /** Deterministic: steal lock after precondition, before XREADGROUP. */
  readonly forceLockLostBeforeRead?: boolean;
  /** Deterministic: steal lock before terminal ACK confirm. */
  readonly forceLockLostBeforeAck?: boolean;
  /** Deterministic: force compare-and-delete release to report provider error. */
  readonly forceReleaseError?: boolean;
  /**
   * Injected lock deadline clock. Live default is monotonic `performance.now`.
   * Deterministic suites inject a fake clock — never use frozen ctx.nowMs.
   */
  readonly qaLockClock?: QaLockClock;
  /** Deterministic: hook after precondition, before pre-read renew. */
  readonly onAfterPreconditionBeforeReadRenew?: () => void | Promise<void>;
  /** Deterministic: hook immediately before pre-ACK confirm renew. */
  readonly onBeforeAckConfirm?: () => void | Promise<void>;
};

/**
 * Sequential attributed terminal no-op consume chain.
 * Stops on first hard failure. Isolated exact-delivery never assigns foreign
 * undelivered entries to the QA consumer and never registers them for cleanup.
 */
export async function runAttributedTerminalNoopConsume(
  ctx: UpstashLiveMatrixContext,
  deps: AttributedTerminalNoopDeps = {},
): Promise<AttributedTerminalNoopResult> {
  const stages: TerminalAttributionStageResult[] = [];
  const counting =
    deps.countingJobStore ?? createCountingJobStore(ctx.jobStore);
  counting.resetClaimQueuedJobCallCount();
  let lockHandle: QaLockHandle | null = null;
  let qaGroup: string | null = null;
  let cursorLastDeliveredId: string | null = null;
  const lockClock = deps.qaLockClock ?? createLiveQaLockClock();

  // Use counting store for all Neon job ops in this chain.
  const jobStore = counting;

  // --- terminal_job_seed ---
  let jobId: string;
  let attempt: number;
  let deliveryId: string;

  try {
    const seeded = await seedQueuedCanonicalJob({
      ...ctx,
      jobStore,
    });
    if (!seeded.ok) {
      return failAt(
        stages,
        "terminal_job_seed",
        "terminal_seed_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    jobId = seeded.jobId;
    attempt = seeded.attempt;
    deliveryId = seeded.deliveryId;
    trackJobId(ctx, jobId);
    stages.push(stageOk("terminal_job_seed"));
  } catch {
    return failAt(
      stages,
      "terminal_job_seed",
      "terminal_seed_failed",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- terminal_transition + terminal_cas ---
  let storeVersionBeforeTerminal: number;
  let expectedStoreVersionAfterCas: number;

  if (deps.skipTerminalTransition) {
    // Deterministic nonterminal path — fail closed at state assertion.
    const loaded = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
    storeVersionBeforeTerminal =
      loaded.ok && loaded.value.stage === "canonical"
        ? loaded.value.storeVersion
        : 0;
    expectedStoreVersionAfterCas = storeVersionBeforeTerminal;
    stages.push(stageOk("terminal_transition"));
    stages.push(stageOk("terminal_cas"));
  } else {
    try {
      const loaded = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
      if (!loaded.ok || loaded.value.stage !== "canonical") {
        return failAt(
          stages,
          "terminal_transition",
          "terminal_transition_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      storeVersionBeforeTerminal = loaded.value.storeVersion;
      const failedJob = applyHeadlessJobTransition({
        jobValue: loaded.value.canonicalJob,
        requestValue: loaded.value.canonicalRequest,
        toState: "failed",
        attempt: loaded.value.canonicalJob.attempt,
        updatedAtMs: Math.max(
          ctx.nowMs,
          loaded.value.canonicalJob.updatedAtMs + 1,
        ),
        terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
      });
      if (!failedJob.ok) {
        return failAt(
          stages,
          "terminal_transition",
          "terminal_transition_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("terminal_transition"));

      const cas = await jobStore.compareAndSetTransition({
        jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: loaded.value.storeVersion,
        next: {
          job: failedJob.job,
          request: loaded.value.canonicalRequest,
          idempotencyAuthorityKey: loaded.value.idempotencyAuthorityKey,
          operationId: loaded.value.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok || cas.value.kind !== "updated") {
        return failAt(
          stages,
          "terminal_cas",
          "terminal_cas_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      expectedStoreVersionAfterCas = cas.value.record.storeVersion;
      stages.push(stageOk("terminal_cas"));
    } catch {
      if (stages.every((s) => s.stage !== "terminal_transition")) {
        return failAt(
          stages,
          "terminal_transition",
          "terminal_transition_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      return failAt(
        stages,
        "terminal_cas",
        "terminal_cas_failed",
        counting.claimQueuedJobCallCount,
      );
    }
  }

  // --- terminal_reread + terminal_state_assertion (stop BEFORE enqueue) ---
  let immutableSnapshot: {
    readonly state: string;
    readonly reasonId: string | null;
    readonly retryable: boolean | null;
    readonly claimToken: string | null;
    readonly claimedAtMs: number | null;
    readonly attempt: number;
    readonly storeVersion: number;
    readonly hasArtifact: boolean;
  };

  try {
    const reread = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
    if (!reread.ok || reread.value.stage !== "canonical") {
      return failAt(
        stages,
        "terminal_reread",
        "terminal_reread_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    stages.push(stageOk("terminal_reread"));

    const rec = reread.value;
    const job = rec.canonicalJob;
    const reason = job.terminalReason ?? null;

    if (deps.skipTerminalTransition) {
      // Nonterminal cannot satisfy terminal assertion.
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }

    if (
      !isHeadlessTerminalState(job.state) ||
      job.state !== "failed"
    ) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (
      reason == null ||
      reason.reasonId !== "WORKER_FAILED" ||
      reason.retryable !== false
    ) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_reason_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (rec.claimToken != null || rec.claimedAtMs != null) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (job.attempt !== attempt) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (rec.storeVersion !== expectedStoreVersionAfterCas) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    // Store version must have advanced exactly once from pre-terminal.
    if (rec.storeVersion !== storeVersionBeforeTerminal + 1) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (rec.artifactObjectBinding != null) {
      return failAt(
        stages,
        "terminal_state_assertion",
        "terminal_state_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }

    deliveryId = stableHeadlessDeliveryId(jobId, attempt);
    immutableSnapshot = {
      state: job.state,
      reasonId: reason.reasonId,
      retryable: reason.retryable,
      claimToken: rec.claimToken,
      claimedAtMs: rec.claimedAtMs,
      attempt: job.attempt,
      storeVersion: rec.storeVersion,
      hasArtifact: rec.artifactObjectBinding != null,
    };
    stages.push(stageOk("terminal_state_assertion"));
  } catch {
    if (stages.every((s) => s.stage !== "terminal_reread")) {
      return failAt(
        stages,
        "terminal_reread",
        "terminal_reread_failed",
        counting.claimQueuedJobCallCount,
      );
    }
    return failAt(
      stages,
      "terminal_state_assertion",
      "terminal_state_mismatch",
      counting.claimQueuedJobCallCount,
    );
  }

  // --- queue_lock_acquire + queue_cursor_snapshot + delivery_enqueue + isolated read ---
  let streamId: string;
  const consumer = runScopedConsumerName(ctx, "term");
  trackConsumerName(ctx, consumer);
  const renderStream = ctx.streamNames.renderStream;
  let finishedCleanly = false;

  try {
    // Production groups may exist for other matrix cases; never SETID/DESTROY them.
    try {
      await ctx.tcpConsumer.ensureConsumerGroups();
    } catch {
      // Isolation uses QA-only group; production ensure is best-effort.
    }

    // --- queue_lock_acquire ---
    if (deps.skipQaLock === true) {
      stages.push(stageOk("queue_lock_acquire"));
    } else {
      const lock = await acquireQaExclusivityLock({
        redis: ctx.tcpConsumer,
        envName: ctx.envName,
        clock: lockClock,
      });
      if (!lock.acquired) {
        return failAt(
          stages,
          "queue_lock_acquire",
          "queue_lock_unavailable",
          counting.claimQueuedJobCallCount,
        );
      }
      lockHandle = lock;
      stages.push(stageOk("queue_lock_acquire"));
    }

    // --- queue_cursor_snapshot (case-scoped QA group create with $) ---
    const created = await createQaRenderConsumerGroup({
      redis: ctx.tcpConsumer,
      streamKey: renderStream,
      runId: ctx.runId,
      caseId: "consume.terminal.noop",
      ctx,
    });
    if (!created.ok) {
      return failAt(
        stages,
        "queue_cursor_snapshot",
        created.reasonId,
        counting.claimQueuedJobCallCount,
      );
    }
    qaGroup = created.group;
    cursorLastDeliveredId = created.lastDeliveredId;
    trackQaGroup(ctx, qaGroup);
    stages.push(stageOk("queue_cursor_snapshot"));

    // Deterministic foreign-before-expected injection (after $ tip capture).
    if (deps.injectForeignBeforeExpected === true) {
      const foreignJobId = `job_foreign_${ctx.runId.slice(0, 8)}`;
      const foreign = await ctx.restProducer.enqueueRender({
        deliveryId: stableHeadlessDeliveryId(foreignJobId, 1),
        jobId: foreignJobId,
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs - 1,
        deliveryKind: "render",
      });
      if (foreign.ok) {
        observeForeignStreamId(ctx, {
          stream: renderStream,
          id: foreign.value.streamId,
          kind: "render",
        });
      }
    }

    // --- delivery_enqueue ---
    try {
      const mismatchJobId = `job_mismatch_${ctx.runId.slice(0, 8)}`;
      const enqueueJobId = deps.forceMismatchedEnqueue ? mismatchJobId : jobId;
      const enqueueDeliveryId = deps.forceMismatchedEnqueue
        ? stableHeadlessDeliveryId(mismatchJobId, attempt)
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
        return failAt(
          stages,
          "delivery_enqueue",
          "delivery_enqueue_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      streamId = enqueued.value.streamId;
      trackRunOwnedStreamId(ctx, {
        stream: renderStream,
        id: streamId,
        kind: "render",
      });
      ctx.session.renderStreamId = streamId;
      ctx.session.renderDeliveryId = deliveryId;
      ctx.session.jobId = jobId;
      stages.push(stageOk("delivery_enqueue"));
    } catch {
      return failAt(
        stages,
        "delivery_enqueue",
        "delivery_enqueue_failed",
        counting.claimQueuedJobCallCount,
      );
    }

    // --- queue_precondition + expected_delivery_read + delivery_identity_match ---
    const acquired = await acquireIsolatedExactRenderDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey: renderStream,
      qaGroup,
      consumerName: consumer,
      expected: {
        deliveryId,
        jobId,
        ownerId: ctx.ownerId,
        attempt,
        streamId,
      },
      cursorSnapshot: {
        group: qaGroup,
        lastDeliveredId: cursorLastDeliveredId,
      },
      blockMs: deps.blockMs,
      signal: ctx.abortSignal,
      lockHandle,
      clock: lockClock,
      forceLockLostBeforePrecondition: deps.forceLockLostBeforePrecondition,
      forceLockLostBeforeRead: deps.forceLockLostBeforeRead,
      onAfterPreconditionBeforeReadRenew:
        deps.onAfterPreconditionBeforeReadRenew,
    });

    for (const foreignId of acquired.observedForeignStreamIds) {
      observeForeignStreamId(ctx, {
        stream: renderStream,
        id: foreignId,
        kind: "render",
      });
    }

    if (!acquired.ok) {
      if (
        acquired.reasonId === "queue_lock_lost" ||
        acquired.reasonId === "queue_lock_deadline_elapsed" ||
        acquired.reasonId === "queue_lock_ownership_lost"
      ) {
        return failAt(
          stages,
          "queue_lock_renew",
          "queue_lock_lost",
          counting.claimQueuedJobCallCount,
        );
      }
      if (acquired.reasonId === "queue_precondition_not_isolated") {
        return failAt(
          stages,
          "queue_precondition",
          "queue_precondition_not_isolated",
          counting.claimQueuedJobCallCount,
        );
      }
      if (acquired.reasonId === "queue_cursor_changed") {
        return failAt(
          stages,
          "queue_precondition",
          "queue_cursor_changed",
          counting.claimQueuedJobCallCount,
        );
      }
      if (acquired.reasonId === "expected_delivery_unavailable") {
        stages.push(stageOk("queue_precondition"));
        return failAt(
          stages,
          "expected_delivery_read",
          "expected_delivery_unavailable",
          counting.claimQueuedJobCallCount,
        );
      }
      if (acquired.reasonId === "delivery_read_failed") {
        stages.push(stageOk("queue_precondition"));
        return failAt(
          stages,
          "expected_delivery_read",
          "delivery_read_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("queue_precondition"));
      stages.push(stageOk("expected_delivery_read"));
      return failAt(
        stages,
        "delivery_identity_match",
        "delivery_identity_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }
    if (lockHandle != null && acquired.lockRenewed) {
      stages.push(stageOk("queue_lock_renew"));
    }
    stages.push(stageOk("queue_precondition"));
    stages.push(stageOk("expected_delivery_read"));
    stages.push(stageOk("delivery_identity_match"));

    const item = acquired.item;
    const isolatedQaGroup = qaGroup;
    if (item.entry.deliveryKind !== "render") {
      return failAt(
        stages,
        "delivery_identity_match",
        "delivery_identity_mismatch",
        counting.claimQueuedJobCallCount,
      );
    }

    // --- consume_job_load ---
    try {
      const loaded = await jobStore.getByJobIdAndOwner(
        item.entry.jobId,
        item.entry.ownerId,
      );
      if (!loaded.ok || loaded.value.stage !== "canonical") {
        return failAt(
          stages,
          "consume_job_load",
          "terminal_consume_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("consume_job_load"));

      // --- terminal_detection ---
      if (!isHeadlessTerminalState(loaded.value.canonicalJob.state)) {
        return failAt(
          stages,
          "terminal_detection",
          "terminal_state_mismatch",
          counting.claimQueuedJobCallCount,
        );
      }
      const tr = loaded.value.canonicalJob.terminalReason;
      if (
        tr == null ||
        tr.reasonId !== "WORKER_FAILED" ||
        tr.retryable !== false
      ) {
        return failAt(
          stages,
          "terminal_detection",
          "terminal_reason_mismatch",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("terminal_detection"));
    } catch {
      return failAt(
        stages,
        "consume_job_load",
        "terminal_consume_failed",
        counting.claimQueuedJobCallCount,
      );
    }

    // --- confirm lock ownership before terminal ACK ---
    // Deadline → renew → deadline again → only then ACK.
    if (lockHandle != null) {
      if (deps.forceLockLostBeforeAck === true) {
        await ctx.tcpConsumer.qaDelKey(lockHandle.key);
        await ctx.tcpConsumer.qaSetNxPx(
          lockHandle.key,
          randomUUID(),
          lockHandle.ttlMs,
        );
      }
      if (deps.onBeforeAckConfirm != null) {
        await deps.onBeforeAckConfirm();
      }
      const ackConfirm = await confirmQaLockOwnership({
        redis: ctx.tcpConsumer,
        handle: lockHandle,
        clock: lockClock,
      });
      if (!ackConfirm.ok) {
        return failAt(
          stages,
          "queue_lock_renew",
          "queue_lock_lost",
          counting.claimQueuedJobCallCount,
        );
      }
    }

    // --- redis_ack via group-bound consume (must remain acked_noop_terminal) ---
    // Terminal probe ACKs only the QA-isolated session group — never production PEL.
    // consume.claim.ack proves production consumer-group ACK separately.
    counting.resetClaimQueuedJobCallCount();
    try {
      if (isolatedQaGroup == null) {
        return failAt(
          stages,
          "redis_ack",
          "terminal_consume_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      const streamQueueForConsume = createGroupBoundStreamQueue({
        restProducer: ctx.restProducer,
        tcpConsumer: ctx.tcpConsumer,
        groupAuthority: "qa",
        sessionGroup: isolatedQaGroup,
        streamKey: renderStream,
        kind: "render",
        expected: {
          deliveryId: item.entry.deliveryId,
          jobId: item.entry.jobId,
          ownerId: item.entry.ownerId,
          attempt: item.entry.attempt,
          streamId: item.streamId,
        },
        dlqAuthority:
          ctx.streamAuthority === "qa_run_scoped"
            ? "qa_run_scoped"
            : "production_env",
        qaRunScopedDlqWriter: resolveTerminalDlqWriter(ctx),
      });

      const result = await consumeRenderDeliveryOnce({
        streamQueue: streamQueueForConsume,
        jobStore: counting,
        entry: item.entry,
        streamId: item.streamId,
        nowMs: ctx.nowMs + 20,
        leaseSettings: ctx.leaseSettings,
        consumerName: consumer,
      });

      if (counting.claimQueuedJobCallCount !== 0) {
        return failAt(
          stages,
          "redis_ack",
          "terminal_consume_failed",
          counting.claimQueuedJobCallCount,
        );
      }

      if (!result.ok) {
        return failAt(
          stages,
          "redis_ack",
          "redis_ack_failed",
          counting.claimQueuedJobCallCount,
        );
      }
      if (result.value.action !== "acked_noop_terminal") {
        return failAt(
          stages,
          "redis_ack",
          "terminal_action_mismatch",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("redis_ack"));
    } catch {
      return failAt(
        stages,
        "redis_ack",
        "redis_ack_failed",
        counting.claimQueuedJobCallCount,
      );
    }

    // --- pending_clear (QA group where delivery was read) ---
    try {
      const probe = await ctx.tcpConsumer.qaProbePendingInGroup(
        renderStream,
        isolatedQaGroup,
        item.streamId,
      );
      if (!probe.ok || probe.pending) {
        return failAt(
          stages,
          "pending_clear",
          "delivery_still_pending",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("pending_clear"));
    } catch {
      return failAt(
        stages,
        "pending_clear",
        "delivery_still_pending",
        counting.claimQueuedJobCallCount,
      );
    }

    // --- terminal_immutability ---
    try {
      const again = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
      if (!again.ok || again.value.stage !== "canonical") {
        return failAt(
          stages,
          "terminal_immutability",
          "terminal_record_mutated",
          counting.claimQueuedJobCallCount,
        );
      }
      const rec = again.value;
      const job = rec.canonicalJob;
      const reason = job.terminalReason ?? null;
      if (
        job.state !== immutableSnapshot.state ||
        reason?.reasonId !== immutableSnapshot.reasonId ||
        reason?.retryable !== immutableSnapshot.retryable ||
        rec.claimToken !== immutableSnapshot.claimToken ||
        rec.claimedAtMs !== immutableSnapshot.claimedAtMs ||
        job.attempt !== immutableSnapshot.attempt ||
        rec.storeVersion !== immutableSnapshot.storeVersion ||
        (rec.artifactObjectBinding != null) !== immutableSnapshot.hasArtifact
      ) {
        return failAt(
          stages,
          "terminal_immutability",
          "terminal_record_mutated",
          counting.claimQueuedJobCallCount,
        );
      }
      stages.push(stageOk("terminal_immutability"));
    } catch {
      return failAt(
        stages,
        "terminal_immutability",
        "terminal_record_mutated",
        counting.claimQueuedJobCallCount,
      );
    }

    // Case-local finalize: ACK already cleared; XDEL + destroy QA group + lock release.
    if (deps.forceReleaseError === true) {
      await releaseLockWithHooks({
        redis: ctx.tcpConsumer,
        handle: lockHandle,
        forceReleaseError: true,
      });
      lockHandle = null;
      return failAt(
        stages,
        "queue_lock_release",
        "queue_lock_release_failed",
        counting.claimQueuedJobCallCount,
      );
    }

    const finalized = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: renderStream,
      streamId: item.streamId,
      kind: "render",
      sessionGroup: isolatedQaGroup,
      groupAuthority: "qa",
      lockHandle,
      lockClock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    if (!finalized.ok) {
      if (
        finalized.reasonId === "queue_lock_lost" ||
        finalized.reasonId === "queue_lock_release_failed"
      ) {
        return failAt(
          stages,
          "queue_lock_release",
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
    lockHandle = null;
    if (deps.markCleanupSkipped) {
      stages.push({ stage: "cleanup", status: "skipped" });
    } else {
      stages.push(stageOk("cleanup"));
    }
    stages.push(stageOk("queue_lock_release"));

    finishedCleanly = true;
    return {
      ok: true,
      jobId,
      deliveryId,
      attempt,
      storeVersion: immutableSnapshot.storeVersion,
      streamId: item.streamId,
      claimQueuedJobCallCount: counting.claimQueuedJobCallCount,
      stages: scrubTerminalAttributionStages(stages),
    };
  } finally {
    if (!finishedCleanly && lockHandle != null) {
      await releaseLockWithHooks({
        redis: ctx.tcpConsumer,
        handle: lockHandle,
        forceReleaseError: deps.forceReleaseError === true,
      });
      lockHandle = null;
    }
  }
}

async function releaseLockWithHooks(input: {
  readonly redis: UpstashLiveMatrixContext["tcpConsumer"];
  readonly handle: QaLockHandle | null;
  readonly forceReleaseError: boolean;
}): Promise<QaLockReleaseResult> {
  if (input.forceReleaseError) {
    return { status: "error" };
  }
  return releaseQaExclusivityLock({
    redis: input.redis,
    handle: input.handle,
  });
}

/**
 * Map attributed failure to live-matrix case evidence (category + allowlisted reason).
 */
export function attributedFailureToTerminalNoopEvidence(
  failure: AttributedTerminalNoopFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "consume.terminal.noop",
    status: "FAIL",
    failureCategory: "CONSUME_TERMINAL_FAILED",
    failureReasonId: failure.failureReasonId,
  };
}
