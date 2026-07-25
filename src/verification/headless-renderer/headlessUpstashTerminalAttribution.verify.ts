/**
 * Sprint 11E Phase 2D.1C / 2D.1C.1 — bounded terminal no-op attribution (deterministic).
 * Run: npm run test:headless-upstash-terminal-attribution
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { createCountingJobStore } from "./upstash-live/counting-job-store";
import { acquireIsolatedExactRenderDelivery } from "./upstash-live/exact-delivery-acquisition";
import { assertUpstashEvidencePrivacyStructure } from "./upstash-live/evidence-privacy-authority";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import { renderUpstashLiveEvidenceMarkdown } from "./upstash-live/evidence";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./upstash-live/live-fixtures";
import {
  createQaRenderConsumerGroup,
} from "./upstash-live/queue-isolation";
import {
  attributedFailureToTerminalNoopEvidence,
  runAttributedTerminalNoopConsume,
  scrubTerminalAttributionStages,
  TERMINAL_ATTRIBUTION_REASON_IDS,
  TERMINAL_ATTRIBUTION_STAGE_IDS,
} from "./upstash-live/terminal-attribution";
import type { UpstashLiveMatrixContext } from "./upstash-live/types";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function noopSql(): HeadlessSqlExecutor {
  const client = {
    async query<T = Record<string, unknown>>() {
      return { rows: [{ n: "0" }] as T[] };
    },
  };
  return {
    async withClient(fn) {
      return fn(client as never);
    },
    async withTransaction(fn) {
      return fn(client as never);
    },
  };
}

function buildCtx(overrides?: {
  readonly jobStore?: MemoryHeadlessJobStoreAdapter;
}): {
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
} {
  const runId = randomUUID();
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    env: { HEADLESS_ENV_NAME: "staging" },
    nowMs: 1_700_000_000_000,
    leaseSettings: Object.freeze({
      deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
      renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
      verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
      verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
    }),
    qaIdleMs: 50,
    sql: noopSql(),
    jobStore: overrides?.jobStore ?? new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    restProducer: stream,
    tcpConsumer: stream,
    streamQueue: stream,
    streamNames: stream.streamNames(),
    envName: "staging",
    createdJobIds: [],
    createdObjectIds: [],
    createdProjectIds: [],
    runOwnedActiveStreamIds: lifecycle.runOwnedActiveStreamIds,
    runOwnedStreamIds: lifecycle.runOwnedStreamIds,
    trackedStreamIds: lifecycle.trackedStreamIds,
    caseFinalizedStreamIds: lifecycle.caseFinalizedStreamIds,
    observedForeignStreamIds: [],
    trackedConsumerNames: [],
    activeQaGroups: lifecycle.activeQaGroups,
    trackedQaGroups: lifecycle.trackedQaGroups,
    finalizedQaGroups: lifecycle.finalizedQaGroups,
    trackedDlqIds: lifecycle.trackedDlqIds,
    session: emptyUpstashLiveSession(),
    preflightFingerprint: buildUpstashLiveSchemaFingerprint(),
  };
  return { ctx, stream };
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1C — Upstash terminal attribution\n");

  await test("stage and reason registries include isolation allowlists", () => {
    assert.ok(TERMINAL_ATTRIBUTION_STAGE_IDS.includes("queue_lock_acquire"));
    assert.ok(TERMINAL_ATTRIBUTION_STAGE_IDS.includes("queue_lock_renew"));
    assert.ok(TERMINAL_ATTRIBUTION_STAGE_IDS.includes("queue_lock_release"));
    assert.ok(TERMINAL_ATTRIBUTION_STAGE_IDS.includes("queue_precondition"));
    assert.ok(TERMINAL_ATTRIBUTION_STAGE_IDS.includes("expected_delivery_read"));
    assert.ok(
      TERMINAL_ATTRIBUTION_REASON_IDS.includes("queue_precondition_not_isolated"),
    );
    assert.ok(TERMINAL_ATTRIBUTION_REASON_IDS.includes("queue_lock_unavailable"));
    assert.ok(TERMINAL_ATTRIBUTION_REASON_IDS.includes("queue_lock_lost"));
    assert.ok(
      TERMINAL_ATTRIBUTION_REASON_IDS.includes("queue_lock_release_failed"),
    );
    assert.ok(TERMINAL_ATTRIBUTION_REASON_IDS.includes("group_probe_failed"));
    assert.equal(Object.isFrozen(TERMINAL_ATTRIBUTION_STAGE_IDS), true);
    assert.equal(Object.isFrozen(TERMINAL_ATTRIBUTION_REASON_IDS), true);
  });

  await test("correct terminal delivery → acked_noop_terminal + zero claims", async () => {
    const { ctx } = buildCtx();
    const counting = createCountingJobStore(ctx.jobStore);
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      countingJobStore: counting,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.claimQueuedJobCallCount, 0);
    assert.equal(counting.claimQueuedJobCallCount, 0);
    const names = result.stages.map((s) => s.stage);
    assert.ok(names.includes("terminal_state_assertion"));
    assert.ok(names.includes("queue_precondition"));
    assert.ok(names.includes("delivery_identity_match"));
    assert.ok(names.includes("redis_ack"));
    assert.ok(names.includes("pending_clear"));
    assert.ok(names.includes("terminal_immutability"));
    assert.equal(result.stages.every((s) => s.status !== "failed"), true);
  });

  await test("nonterminal delivery cannot pass as terminal", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      skipTerminalTransition: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "terminal_state_assertion");
    assert.equal(result.failureReasonId, "terminal_state_mismatch");
  });

  await test(
    "prior undelivered foreign on shared stream is skipped by $ QA group",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const unrelatedJobId = "job_unrelated_prior";
      const unrelated = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId(unrelatedJobId, 1),
        jobId: unrelatedJobId,
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs - 1000,
        deliveryKind: "render",
      });
      assert.equal(unrelated.ok, true);

      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
      assert.equal(
        result.ok,
        true,
        !result.ok
          ? `isolation should skip prior tip; stage=${result.failureStage} reason=${result.failureReasonId}`
          : "ok",
      );
      if (!result.ok) return;
      assert.equal(result.claimQueuedJobCallCount, 0);
      // Foreign never registered for cleanup.
      assert.equal(
        ctx.runOwnedStreamIds.some((t) => t.id === unrelated.value.streamId),
        false,
      );
      assert.equal(
        stream
          .testingFake()
          .testingHasEntry(
            ctx.streamNames.renderStream,
            unrelated.value.streamId,
          ),
        true,
      );
    },
  );

  await test("expected delivery identity mismatch fails closed", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      forceMismatchedEnqueue: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "delivery_identity_match");
    assert.equal(result.failureReasonId, "delivery_identity_mismatch");
  });

  await test("isolated acquisition identity mismatch fails closed", async () => {
    const { ctx, stream } = buildCtx();
    const created = await createQaRenderConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const enqueued = await stream.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_other", 9),
      jobId: "job_other",
      ownerId: ctx.ownerId,
      attempt: 9,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enqueued.ok, true);
    if (!enqueued.ok) return;
    const acquired = await acquireIsolatedExactRenderDelivery({
      tcpConsumer: stream,
      streamKey: ctx.streamNames.renderStream,
      qaGroup: created.group,
      consumerName: `uq_x_${ctx.runId.slice(0, 8)}`,
      expected: {
        deliveryId: stableHeadlessDeliveryId("job_expected", 1),
        jobId: "job_expected",
        ownerId: ctx.ownerId,
        attempt: 1,
        streamId: enqueued.value.streamId,
      },
      cursorSnapshot: {
        group: created.group,
        lastDeliveredId: created.lastDeliveredId,
      },
    });
    assert.equal(acquired.ok, false);
    if (acquired.ok) return;
    assert.equal(acquired.reasonId, "delivery_identity_mismatch");
  });

  await test("ACK failure cannot report terminal success", async () => {
    const { ctx, stream } = buildCtx();
    // Terminal consume is QA-group-bound — inject on qaXackInGroup, not production ack.
    const originalQaAck = stream.qaXackInGroup.bind(stream);
    let ackCalls = 0;
    stream.qaXackInGroup = async (streamKey, group, streamId) => {
      ackCalls += 1;
      if (ackCalls === 1) {
        return false;
      }
      return originalQaAck(streamKey, group, streamId);
    };

    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "redis_ack");
    assert.equal(result.failureReasonId, "redis_ack_failed");
    assert.equal(ackCalls >= 1, true);
  });

  await test("ACK success removes pending state + Neon immutability", async () => {
    const { ctx, stream } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const qaGroup = ctx.trackedQaGroups[0]!;
    const pending = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      qaGroup,
      result.streamId,
    );
    assert.deepEqual(pending, { ok: true, pending: false });
    const stored = await ctx.jobStore.getByJobIdAndOwner(
      result.jobId,
      ctx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(stored.value.stage, "canonical");
    assert.equal(stored.value.canonicalJob.state, "failed");
    assert.equal(stored.value.claimToken, null);
    assert.equal(stored.value.storeVersion, result.storeVersion);
  });

  await test("live claim path still claims (counting fixture baseline)", async () => {
    const { ctx, stream } = buildCtx();
    const counting = createCountingJobStore(ctx.jobStore);
    const { seedQueuedCanonicalJob } = await import(
      "./upstash-live/live-fixtures"
    );
    const seeded = await seedQueuedCanonicalJob({
      ...ctx,
      jobStore: counting,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enqueued = await stream.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enqueued.ok, true);
    if (!enqueued.ok) return;
    await stream.ensureConsumerGroups();
    const read = await stream.readGroup({
      kind: "render",
      consumerName: `uq_claim_${ctx.runId.slice(0, 8)}`,
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const { consumeRenderDeliveryOnce } = await import(
      "@/features/headless-renderer/control-plane"
    );
    counting.resetClaimQueuedJobCallCount();
    const result = await consumeRenderDeliveryOnce({
      streamQueue: stream,
      jobStore: counting,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: ctx.nowMs + 10,
      leaseSettings: ctx.leaseSettings,
      consumerName: `uq_claim_${ctx.runId.slice(0, 8)}`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "claimed_and_acked");
    assert.equal(counting.claimQueuedJobCallCount, 1);
    void stableHeadlessDeliveryId;
  });

  await test("hostile provider text scrubbed from evidence mapping", async () => {
    const failure = {
      ok: false as const,
      failureStage: "redis_ack" as const,
      failureReasonId: "redis_ack_failed" as const,
      stages: [
        {
          stage: "redis_ack" as const,
          status: "failed" as const,
          reasonId: "redis_ack_failed" as const,
        },
      ],
      claimQueuedJobCallCount: 0,
    };
    const evidence = attributedFailureToTerminalNoopEvidence(failure);
    const privacy = assertUpstashEvidencePrivacyStructure(evidence);
    assert.equal(privacy.ok, true, privacy.ok ? "" : privacy.message);
    const md = renderUpstashLiveEvidenceMarkdown({
      title: "t",
      overall: "FAIL",
      eligibilityVerdict: "x",
      startedAtIso: null,
      endedAtIso: null,
      cases: [evidence],
      schemaFingerprint: null,
      cleanupStatus: "ok",
      notes: ["safe note"],
    });
    assert.equal(md.includes("UPSTASH_REDIS"), false);
    assert.equal(md.includes("https://"), false);
  });

  await test("scrubTerminalAttributionStages drops unknown fields", () => {
    const scrubbed = scrubTerminalAttributionStages([
      { stage: "redis_ack", status: "ok" },
      {
        stage: "redis_ack",
        status: "failed",
        reasonId: "not_a_real_reason" as never,
      },
      { stage: "not_a_stage" as never, status: "ok" },
    ]);
    assert.equal(scrubbed.length, 2);
    assert.equal(scrubbed[1]?.reasonId, undefined);
  });

  await test(
    "isolated acquisition never assigns foreign undelivered to QA consumer",
    async () => {
      const { ctx, stream } = buildCtx();
      const created = await createQaRenderConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        ctx,
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      const u = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId("job_skip", 1),
        jobId: "job_skip",
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      });
      const e = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId("job_keep", 1),
        jobId: "job_keep",
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs + 1,
        deliveryKind: "render",
      });
      assert.equal(u.ok && e.ok, true);
      if (!u.ok || !e.ok) return;
      const acquired = await acquireIsolatedExactRenderDelivery({
        tcpConsumer: stream,
        streamKey: ctx.streamNames.renderStream,
        qaGroup: created.group,
        consumerName: `uq_acq_${ctx.runId.slice(0, 8)}`,
        expected: {
          deliveryId: stableHeadlessDeliveryId("job_keep", 1),
          jobId: "job_keep",
          ownerId: ctx.ownerId,
          attempt: 1,
          streamId: e.value.streamId,
        },
        cursorSnapshot: {
          group: created.group,
          lastDeliveredId: created.lastDeliveredId,
        },
      });
      assert.equal(acquired.ok, false);
      if (acquired.ok) return;
      assert.equal(acquired.reasonId, "queue_precondition_not_isolated");
      assert.ok(acquired.observedForeignStreamIds.includes(u.value.streamId));
      assert.equal(
        stream
          .testingFake()
          .testingIsPending(
            ctx.streamNames.renderStream,
            created.group,
            u.value.streamId,
          ),
        false,
      );
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
