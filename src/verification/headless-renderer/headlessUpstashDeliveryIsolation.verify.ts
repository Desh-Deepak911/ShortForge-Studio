/**
 * Sprint 11E Phase 2D.1C.1 — non-destructive delivery isolation (deterministic).
 * Run: npm run test:headless-upstash-delivery-isolation
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

import { defaultUpstashLiveCleanup } from "./upstash-live/cleanup";
import { createCountingJobStore } from "./upstash-live/counting-job-store";
import { acquireIsolatedExactRenderDelivery } from "./upstash-live/exact-delivery-acquisition";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  assertExpectedIsNextUnread,
  createFakeQaLockClock,
  createQaRenderConsumerGroup,
  qaCaseGroupName,
  qaRenderLockKey,
  releaseQaExclusivityLock,
} from "./upstash-live/queue-isolation";

function terminalQaGroup(runId: string): string {
  return qaCaseGroupName(runId, "consume.terminal.noop", "render");
}
import { runAttributedTerminalNoopConsume } from "./upstash-live/terminal-attribution";
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

function buildCtx(): {
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
    jobStore: new MemoryHeadlessJobStoreAdapter(),
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
  console.log(
    "\nSprint 11E Phase 2D.1C.1 — Upstash non-destructive delivery isolation\n",
  );

  await test("expected entry is next → exact read and terminal PASS", async () => {
    const { ctx } = buildCtx();
    const counting = createCountingJobStore(ctx.jobStore);
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      countingJobStore: counting,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.claimQueuedJobCallCount, 0);
    const stages = result.stages.map((s) => s.stage);
    assert.ok(stages.includes("queue_lock_acquire"));
    assert.ok(stages.includes("queue_lock_renew"));
    assert.ok(stages.includes("queue_lock_release"));
    assert.ok(stages.includes("queue_cursor_snapshot"));
    assert.ok(stages.includes("queue_precondition"));
    assert.ok(stages.includes("expected_delivery_read"));
    assert.ok(stages.includes("redis_ack"));
    assert.ok(stages.includes("pending_clear"));
    assert.ok(stages.includes("terminal_immutability"));
  });

  await test(
    "foreign unread precedes expected → fail before XREADGROUP",
    async () => {
      const { ctx, stream } = buildCtx();
      const fake = stream.testingFake();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        injectForeignBeforeExpected: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_precondition");
      assert.equal(result.failureReasonId, "queue_precondition_not_isolated");
      assert.equal(ctx.observedForeignStreamIds.length >= 1, true);
      assert.equal(
        ctx.runOwnedStreamIds.some((t) =>
          ctx.observedForeignStreamIds.some(
            (f) => f.id === t.id && f.stream === t.stream,
          ),
        ),
        false,
      );
      // Foreign was never assigned to a QA consumer via XREADGROUP.
      const foreignId = ctx.observedForeignStreamIds[0]!.id;
      const qaGroup = terminalQaGroup(ctx.runId);
      assert.equal(
        fake.testingIsPending(ctx.streamNames.renderStream, qaGroup, foreignId),
        false,
      );
    },
  );

  await test(
    "foreign entry remains present and unmodified after failure and cleanup",
    async () => {
      const { ctx, stream } = buildCtx();
      const fake = stream.testingFake();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        injectForeignBeforeExpected: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      const foreignId = ctx.observedForeignStreamIds[0]!.id;
      assert.equal(
        fake.testingHasEntry(ctx.streamNames.renderStream, foreignId),
        true,
      );
      const cleanup = await defaultUpstashLiveCleanup(ctx, false);
      assert.equal(cleanup, "ok");
      assert.equal(
        fake.testingHasEntry(ctx.streamNames.renderStream, foreignId),
        true,
      );
      // Run-owned expected entry removed.
      for (const owned of ctx.runOwnedStreamIds) {
        assert.equal(
          fake.testingHasEntry(owned.stream, owned.id),
          false,
        );
      }
    },
  );

  await test(
    "foreign pending entry remains owned by its original consumer",
    async () => {
      const { ctx, stream } = buildCtx();
      const fake = stream.testingFake();
      await stream.ensureConsumerGroups();
      const foreignJobId = "job_pending_foreign";
      const foreign = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId(foreignJobId, 1),
        jobId: foreignJobId,
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs - 5000,
        deliveryKind: "render",
      });
      assert.equal(foreign.ok, true);
      if (!foreign.ok) return;
      const read = await stream.readGroup({
        kind: "render",
        consumerName: "prod_consumer_a",
        count: 1,
        blockMs: 0,
      });
      assert.equal(read.ok && read.value.length === 1, true);
      assert.equal(
        fake.testingPendingOwner(
          ctx.streamNames.renderStream,
          ctx.streamNames.renderGroup,
          foreign.value.streamId,
        ),
        "prod_consumer_a",
      );

      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;

      assert.equal(
        fake.testingPendingOwner(
          ctx.streamNames.renderStream,
          ctx.streamNames.renderGroup,
          foreign.value.streamId,
        ),
        "prod_consumer_a",
      );
      assert.equal(
        fake.testingHasEntry(
          ctx.streamNames.renderStream,
          foreign.value.streamId,
        ),
        true,
      );
    },
  );

  await test(
    "concurrent insertion before isolation/read fails safely",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const lock = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        clock: createFakeQaLockClock(ctx.nowMs),
      });
      assert.equal(lock.acquired, true);
      const created = await createQaRenderConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        ctx,
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;

      const foreign = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId("job_race", 1),
        jobId: "job_race",
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      });
      assert.equal(foreign.ok, true);
      if (!foreign.ok) return;

      const expected = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId("job_expected", 1),
        jobId: "job_expected",
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs + 1,
        deliveryKind: "render",
      });
      assert.equal(expected.ok, true);
      if (!expected.ok) return;

      const pre = await assertExpectedIsNextUnread({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        group: created.group,
        expectedStreamId: expected.value.streamId,
        expectedLastDeliveredId: created.lastDeliveredId,
      });
      assert.equal(pre.ok, false);
      if (pre.ok) return;
      assert.equal(pre.reasonId, "queue_precondition_not_isolated");

      const acquired = await acquireIsolatedExactRenderDelivery({
        tcpConsumer: stream,
        streamKey: ctx.streamNames.renderStream,
        qaGroup: created.group,
        consumerName: `uq_race_${ctx.runId.slice(0, 8)}`,
        expected: {
          deliveryId: stableHeadlessDeliveryId("job_expected", 1),
          jobId: "job_expected",
          ownerId: ctx.ownerId,
          attempt: 1,
          streamId: expected.value.streamId,
        },
        cursorSnapshot: {
          group: created.group,
          lastDeliveredId: created.lastDeliveredId,
        },
      });
      assert.equal(acquired.ok, false);
      if (acquired.ok) return;
      assert.equal(acquired.reasonId, "queue_precondition_not_isolated");
      // Foreign never pending under QA group.
      assert.equal(
        stream
          .testingFake()
          .testingIsPending(
            ctx.streamNames.renderStream,
            created.group,
            foreign.value.streamId,
          ),
        false,
      );
      if (lock.acquired) {
        await releaseQaExclusivityLock({ redis: stream, handle: lock });
      }
    },
  );

  await test("only current-run XADD results enter cleanup tracking", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      injectForeignBeforeExpected: true,
    });
    assert.equal(result.ok, false);
    assert.equal(ctx.runOwnedStreamIds.length, 1);
    assert.equal(ctx.observedForeignStreamIds.length >= 1, true);
    for (const foreign of ctx.observedForeignStreamIds) {
      assert.equal(
        ctx.runOwnedStreamIds.some((o) => o.id === foreign.id),
        false,
      );
    }
  });

  await test("run-owned entries are still cleaned", async () => {
    const { ctx, stream } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Case-local finalize moves the entry active → finalized (already XDEL'd).
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    const ownedId = ctx.caseFinalizedStreamIds[0]!.id;
    assert.equal(
      stream.testingFake().testingHasEntry(ctx.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      stream
        .testingFake()
        .testingHasGroup(
          ctx.streamNames.renderStream,
          terminalQaGroup(ctx.runId),
        ),
      false,
    );
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "ok");
    assert.equal(
      stream.testingFake().testingHasEntry(ctx.streamNames.renderStream, ownedId),
      false,
    );
  });

  await test(
    "QA lock contention fails safely and does not mutate queue state",
    async () => {
      const { ctx, stream } = buildCtx();
      const key = qaRenderLockKey("staging");
      const held = await stream.qaSetNxPx(key, "other-run", 30_000);
      assert.equal(held, true);
      const lenBefore = stream.testingFake().testingLength(
        ctx.streamNames.renderStream,
      );
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_lock_acquire");
      assert.equal(result.failureReasonId, "queue_lock_unavailable");
      assert.equal(
        stream.testingFake().testingLength(ctx.streamNames.renderStream),
        lenBefore,
      );
      assert.equal(ctx.runOwnedStreamIds.length, 0);
      assert.equal(ctx.trackedQaGroups.length, 0);
      await stream.qaDelKey(key);
    },
  );

  await test("lock release occurs on PASS", async () => {
    const { ctx, stream } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test("lock release occurs on failure", async () => {
    const { ctx, stream } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      injectForeignBeforeExpected: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test("lock release occurs on cancellation", async () => {
    const { ctx, stream } = buildCtx();
    const ac = new AbortController();
    ac.abort();
    (ctx as { abortSignal?: AbortSignal }).abortSignal = ac.signal;
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureReasonId, "delivery_read_failed");
    }
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test("lock release occurs on exception", async () => {
    const { ctx, stream } = buildCtx();
    const original = stream.qaXgroupCreate.bind(stream);
    stream.qaXgroupCreate = async () => {
      throw new Error("forced_qa_group_create_exception");
    };
    let threw = false;
    try {
      await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
    } catch {
      threw = true;
    } finally {
      stream.qaXgroupCreate = original;
    }
    assert.equal(threw, true);
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test(
    "production terminal delivery still makes zero claimQueuedJob calls",
    async () => {
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
    },
  );

  await test(
    "acked_noop_terminal, pending-clear, and Neon immutability remain enforced",
    async () => {
      const { ctx, stream } = buildCtx();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const qaGroup = terminalQaGroup(ctx.runId);
      assert.equal(
        await stream.qaIsPendingInGroup(
          ctx.streamNames.renderStream,
          qaGroup,
          result.streamId,
        ),
        false,
      );
      const stored = await ctx.jobStore.getByJobIdAndOwner(
        result.jobId,
        ctx.ownerId,
      );
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.stage, "canonical");
      assert.equal(stored.value.canonicalJob.state, "failed");
      assert.equal(stored.value.storeVersion, result.storeVersion);
    },
  );

  await test("existing claim-and-ACK live behavior remains unchanged", async () => {
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
  });

  await test("scan-through acquireExactRenderDelivery stub is fail-closed", async () => {
    const { acquireExactRenderDelivery } = await import(
      "./upstash-live/exact-delivery-acquisition"
    );
    const { ctx, stream } = buildCtx();
    const r = await acquireExactRenderDelivery({
      tcpConsumer: stream,
      consumerName: "x",
      expected: {
        deliveryId: "d",
        jobId: "j",
        ownerId: ctx.ownerId,
        attempt: 1,
        streamId: "1-1",
      },
      onSkippedStreamId: () => {
        throw new Error("must not track skipped");
      },
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reasonId, "delivery_read_failed");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
