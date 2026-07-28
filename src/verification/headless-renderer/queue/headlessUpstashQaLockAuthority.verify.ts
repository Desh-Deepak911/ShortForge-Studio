/**
 * Sprint 11E Phase 2D.1C.2 — QA lock ownership authority (deterministic).
 * Run: npm run test:headless-upstash-qa-lock-authority
 *
 * Proves compare-and-renew / compare-and-delete ownership, lease-expiry
 * successor safety, checkpoint fail-closed behavior, and release-error ≠ PASS.
 * No provider contact.
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
import {
  QA_LOCK_COMPARE_AND_DELETE_LUA,
  QA_LOCK_COMPARE_AND_RENEW_LUA,
} from "@/features/headless-renderer/control-plane/adapters/qa-lock-lua";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  FakeRedisStreams,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { createCountingJobStore } from "../upstash-live/counting-job-store";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "../upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  confirmQaLockOwnership,
  createFakeQaLockClock,
  QA_LOCK_TTL_MS,
  qaCaseGroupName,
  qaRenderLockKey,
  releaseQaExclusivityLock,
  renewQaExclusivityLock,
} from "../upstash-live/queue-isolation";
import { runAttributedTerminalNoopConsume } from "../upstash-live/terminal-attribution";
import type { UpstashLiveMatrixContext } from "../upstash-live/types";

function terminalQaGroup(runId: string): string {
  return qaCaseGroupName(runId, "consume.terminal.noop", "render");
}

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

function buildCtx(options?: {
  readonly fake?: FakeRedisStreams;
  readonly nowMs?: number;
}): {
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
  fake: FakeRedisStreams;
} {
  const runId = randomUUID();
  const nowMs = options?.nowMs ?? 1_700_000_000_000;
  const fake =
    options?.fake ??
    new FakeRedisStreams({
      nowMs: () => nowMs,
    });
  if (options?.fake == null) {
    fake.testingSetNowMs(nowMs);
  }
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    fake,
    nowMs: () => nowMs,
  });
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    env: { HEADLESS_ENV_NAME: "staging" },
    nowMs,
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
  return { ctx, stream, fake };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1C.2 — Upstash QA lock ownership authority\n",
  );

  await test("owner can renew live lock via compare-and-renew", async () => {
    const { stream, fake } = buildCtx();
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    assert.notEqual(lock.token.length, 8);
    assert.match(
      lock.token,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    const renewed = await renewQaExclusivityLock({
      redis: stream,
      handle: lock,
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(renewed.ok, true);
    assert.equal(fake.testingGetString(lock.key), lock.token);
    const viaEval = await fake.eval(
      QA_LOCK_COMPARE_AND_RENEW_LUA,
      1,
      lock.key,
      lock.token,
      QA_LOCK_TTL_MS,
    );
    assert.equal(viaEval, 1);
    await releaseQaExclusivityLock({ redis: stream, handle: lock });
  });

  await test("wrong token cannot renew", async () => {
    const { stream } = buildCtx();
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const wrong = {
      ...lock,
      token: randomUUID(),
    };
    const renewed = await renewQaExclusivityLock({
      redis: stream,
      handle: wrong,
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(renewed.ok, false);
    if (renewed.ok) return;
    assert.equal(renewed.reasonId, "queue_lock_ownership_lost");
    assert.equal(
      stream.testingFake().testingGetString(lock.key),
      lock.token,
    );
    await releaseQaExclusivityLock({ redis: stream, handle: lock });
  });

  await test("owner can delete live lock via compare-and-delete", async () => {
    const { stream, fake } = buildCtx();
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const released = await releaseQaExclusivityLock({
      redis: stream,
      handle: lock,
    });
    assert.equal(released.status, "deleted");
    assert.equal(fake.testingGetString(lock.key), null);
    const again = await fake.eval(
      QA_LOCK_COMPARE_AND_DELETE_LUA,
      1,
      lock.key,
      lock.token,
    );
    assert.equal(again, 0);
  });

  await test("wrong token cannot delete", async () => {
    const { stream, fake } = buildCtx();
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const wrong = { ...lock, token: randomUUID() };
    const released = await releaseQaExclusivityLock({
      redis: stream,
      handle: wrong,
    });
    assert.equal(released.status, "lost");
    assert.equal(fake.testingGetString(lock.key), lock.token);
    await releaseQaExclusivityLock({ redis: stream, handle: lock });
  });

  await test(
    "lease expires → successor acquires → original finally cannot delete successor",
    async () => {
      const fake = new FakeRedisStreams({ nowMs: () => 1_700_000_000_000 });
      fake.testingSetNowMs(1_700_000_000_000);
      const stream = new MemoryHeadlessStreamQueueAdapter({
        envName: "staging",
        fake,
        nowMs: () => 1_700_000_000_000,
      });
      const original = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        ttlMs: 50,
        clock: createFakeQaLockClock(1_700_000_000_000),
      });
      assert.equal(original.acquired, true);
      if (!original.acquired) return;

      fake.testingAdvanceMs(51);
      assert.equal(fake.testingGetString(original.key), null);

      const successor = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        ttlMs: 30_000,
        clock: createFakeQaLockClock(1_700_000_000_051),
      });
      assert.equal(successor.acquired, true);
      if (!successor.acquired) return;
      assert.notEqual(successor.token, original.token);
      assert.equal(fake.testingGetString(original.key), successor.token);

      const originalRelease = await releaseQaExclusivityLock({
        redis: stream,
        handle: original,
      });
      assert.equal(originalRelease.status, "lost");
      assert.equal(fake.testingGetString(original.key), successor.token);

      const successorRelease = await releaseQaExclusivityLock({
        redis: stream,
        handle: successor,
      });
      assert.equal(successorRelease.status, "deleted");
      assert.equal(fake.testingGetString(original.key), null);
    },
  );

  await test(
    "renewal failure before precondition stops before XREADGROUP",
    async () => {
      const { ctx, stream, fake } = buildCtx();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        forceLockLostBeforePrecondition: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_lock_renew");
      assert.equal(result.failureReasonId, "queue_lock_lost");
      // No QA pending assignment (never XREADGROUP for expected).
      const qaGroup = terminalQaGroup(ctx.runId);
      for (const owned of ctx.runOwnedStreamIds) {
        assert.equal(
          fake.testingIsPending(owned.stream, qaGroup, owned.id),
          false,
        );
      }
      assert.notEqual(
        stream.testingFake().testingGetString(qaRenderLockKey("staging")),
        null,
      );
    },
  );

  await test(
    "lock loss after precondition before read stops before XREADGROUP",
    async () => {
      const { ctx, fake } = buildCtx();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        forceLockLostBeforeRead: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_lock_renew");
      assert.equal(result.failureReasonId, "queue_lock_lost");
      const qaGroup = terminalQaGroup(ctx.runId);
      for (const owned of ctx.runOwnedStreamIds) {
        assert.equal(
          fake.testingIsPending(owned.stream, qaGroup, owned.id),
          false,
        );
      }
    },
  );

  await test(
    "lock loss before ACK does not ACK or delete the entry",
    async () => {
      const { ctx, stream, fake } = buildCtx();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        forceLockLostBeforeAck: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_lock_renew");
      assert.equal(result.failureReasonId, "queue_lock_lost");
      assert.equal(ctx.runOwnedStreamIds.length, 1);
      const owned = ctx.runOwnedStreamIds[0]!;
      const qaGroup = terminalQaGroup(ctx.runId);
      assert.equal(
        fake.testingIsPending(owned.stream, qaGroup, owned.id),
        true,
      );
      assert.equal(fake.testingHasEntry(owned.stream, owned.id), true);
      // Production worker group was never assigned this QA-isolated delivery.
      assert.equal(
        fake.testingIsPending(
          owned.stream,
          ctx.streamNames.renderGroup,
          owned.id,
        ),
        false,
      );
      assert.equal(
        await stream.qaIsPendingInGroup(owned.stream, qaGroup, owned.id),
        true,
      );
    },
  );

  await test("cancel/exception executes compare-and-delete", async () => {
    const { ctx, stream } = buildCtx();
    const ac = new AbortController();
    ac.abort();
    (ctx as { abortSignal?: AbortSignal }).abortSignal = ac.signal;
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );

    const { ctx: ctx2, stream: stream2 } = buildCtx();
    const original = stream2.qaXgroupCreate.bind(stream2);
    stream2.qaXgroupCreate = async () => {
      throw new Error("forced_exception_for_lock_release");
    };
    let threw = false;
    try {
      await runAttributedTerminalNoopConsume(ctx2, {
        markCleanupSkipped: true,
      });
    } catch {
      threw = true;
    } finally {
      stream2.qaXgroupCreate = original;
    }
    assert.equal(threw, true);
    assert.equal(
      stream2.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test(
    "provider failure during release cannot produce PASS",
    async () => {
      const { ctx } = buildCtx();
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        forceReleaseError: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureStage, "queue_lock_release");
      assert.equal(result.failureReasonId, "queue_lock_release_failed");
    },
  );

  await test(
    "successful terminal flow keeps lock live through precondition/read/ACK",
    async () => {
      const { ctx } = buildCtx();
      const counting = createCountingJobStore(ctx.jobStore);
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        countingJobStore: counting,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const stages = result.stages.map((s) => s.stage);
      assert.ok(stages.includes("queue_lock_acquire"));
      assert.ok(stages.includes("queue_lock_renew"));
      assert.ok(stages.includes("queue_lock_release"));
      assert.ok(stages.includes("queue_precondition"));
      assert.ok(stages.includes("redis_ack"));
      assert.ok(stages.includes("pending_clear"));
      assert.equal(result.claimQueuedJobCallCount, 0);
      const renew = result.stages.find((s) => s.stage === "queue_lock_renew");
      assert.equal(renew?.status, "ok");
      const release = result.stages.find((s) => s.stage === "queue_lock_release");
      assert.equal(release?.status, "ok");
    },
  );

  await test("foreign entries remain untouched under lock loss", async () => {
    const { ctx, stream, fake } = buildCtx();
    await stream.ensureConsumerGroups();
    const foreign = await stream.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_foreign_lock", 1),
      jobId: "job_foreign_lock",
      ownerId: ctx.ownerId,
      attempt: 1,
      enqueuedAtMs: ctx.nowMs - 100,
      deliveryKind: "render",
    });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    const read = await stream.readGroup({
      kind: "render",
      consumerName: "prod_foreign_owner",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);

    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      forceLockLostBeforeAck: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      fake.testingPendingOwner(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
        foreign.value.streamId,
      ),
      "prod_foreign_owner",
    );
    assert.equal(
      fake.testingHasEntry(
        ctx.streamNames.renderStream,
        foreign.value.streamId,
      ),
      true,
    );
  });

  await test("run-owned cleanup remains correct after lock-authority flow", async () => {
    const { ctx, stream, fake } = buildCtx();
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Case-local finalize: active cleared; entry already absent; group destroyed.
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    const ownedId = ctx.caseFinalizedStreamIds[0]!.id;
    assert.equal(
      fake.testingHasEntry(ctx.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      fake.testingHasGroup(
        ctx.streamNames.renderStream,
        terminalQaGroup(ctx.runId),
      ),
      false,
    );
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "ok");
    assert.equal(
      fake.testingHasEntry(ctx.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
  });

  await test("production groups are never reset or destroyed", async () => {
    const { ctx, stream, fake } = buildCtx();
    await stream.ensureConsumerGroups();
    assert.equal(
      fake.testingHasGroup(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
      ),
      true,
    );
    assert.equal(
      fake.testingHasGroup(
        ctx.streamNames.verifyStream,
        ctx.streamNames.verifyGroup,
      ),
      true,
    );
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(
      fake.testingHasGroup(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
      ),
      true,
    );
    assert.equal(
      fake.testingHasGroup(
        ctx.streamNames.verifyStream,
        ctx.streamNames.verifyGroup,
      ),
      true,
    );
    const destroyedProd = await stream.qaXgroupDestroy(
      ctx.streamNames.renderStream,
      ctx.streamNames.renderGroup,
    );
    assert.equal(destroyedProd, false);
  });

  await test("confirmQaLockOwnership matches renew semantics", async () => {
    const { stream } = buildCtx();
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const ok = await confirmQaLockOwnership({
      redis: stream,
      handle: lock,
      clock: createFakeQaLockClock(1_700_000_000_000),
    });
    assert.equal(ok.ok, true);
    const pastDeadline = await confirmQaLockOwnership({
      redis: stream,
      handle: lock,
      clock: createFakeQaLockClock(lock.deadlineMs + 1),
    });
    assert.equal(pastDeadline.ok, false);
    if (!pastDeadline.ok) {
      assert.equal(pastDeadline.reasonId, "queue_lock_deadline_elapsed");
    }
    await releaseQaExclusivityLock({ redis: stream, handle: lock });
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
