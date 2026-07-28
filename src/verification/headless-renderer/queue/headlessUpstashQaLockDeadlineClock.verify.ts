/**
 * Sprint 11E Phase 2D.1C.3 — live deadline clock authority (deterministic).
 * Run: npm run test:headless-upstash-qa-lock-deadline-clock
 *
 * Proves monotonic injected clock for QA lock safe deadline: fresh reads at
 * every checkpoint, before/after awaited renew, expiry before read/ACK, and
 * source boundary rejecting frozen ctx.nowMs for lock deadlines.
 * No provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  FakeRedisStreams,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "../upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  createFakeQaLockClock,
  QA_LOCK_SAFE_DEADLINE_MS,
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

function buildCtx(): {
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
  fake: FakeRedisStreams;
} {
  const runId = randomUUID();
  const nowMs = 1_700_000_000_000;
  const fake = new FakeRedisStreams({ nowMs: () => nowMs });
  fake.testingSetNowMs(nowMs);
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

function wrapXreadCounter(stream: MemoryHeadlessStreamQueueAdapter): {
  count: () => number;
} {
  let n = 0;
  const original = stream.qaXreadGroupInGroup.bind(stream);
  stream.qaXreadGroupInGroup = async (input) => {
    n += 1;
    return original(input);
  };
  return { count: () => n };
}

function wrapAckCounter(stream: MemoryHeadlessStreamQueueAdapter): {
  count: () => number;
} {
  let n = 0;
  const origGroup = stream.qaXackInGroup.bind(stream);
  const origAck = stream.ack.bind(stream);
  stream.qaXackInGroup = async (streamKey, group, streamId) => {
    n += 1;
    return origGroup(streamKey, group, streamId);
  };
  stream.ack = async (input) => {
    n += 1;
    return origAck(input);
  };
  return { count: () => n };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1C.3 — Upstash QA lock live deadline clock\n",
  );

  await test("normal flow within 20 seconds passes", async () => {
    const { ctx } = buildCtx();
    const clock = createFakeQaLockClock(0);
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      qaLockClock: clock,
    });
    assert.equal(result.ok, true);
    assert.ok(clock.peekMs() < QA_LOCK_SAFE_DEADLINE_MS);
  });

  await test("deadline expires before precondition → zero XREADGROUP", async () => {
    const { ctx, stream } = buildCtx();
    const xread = wrapXreadCounter(stream);
    const clock = createFakeQaLockClock(0);
    // Acquire stamps deadline at t=0+20s; expire before first renew/precondition.
    const origSet = stream.qaSetNxPx.bind(stream);
    stream.qaSetNxPx = async (key, value, pxMs) => {
      const ok = await origSet(key, value, pxMs);
      clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
      return ok;
    };
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      qaLockClock: clock,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureReasonId, "queue_lock_lost");
      assert.equal(result.failureStage, "queue_lock_renew");
    }
    assert.equal(xread.count(), 0);
  });

  await test(
    "renewal begins before deadline but completes after → zero XREADGROUP",
    async () => {
      const { ctx, stream } = buildCtx();
      const xread = wrapXreadCounter(stream);
      const clock = createFakeQaLockClock(0);
      const origRenew = stream.qaCompareAndRenewLock.bind(stream);
      stream.qaCompareAndRenewLock = async (key, token, ttlMs) => {
        const ok = await origRenew(key, token, ttlMs);
        // Completes after deadline — post-await check must fail closed.
        clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
        return ok;
      };
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.failureReasonId, "queue_lock_lost");
        assert.equal(result.failureStage, "queue_lock_renew");
      }
      assert.equal(xread.count(), 0);
    },
  );

  await test(
    "deadline expires between precondition and read → zero XREADGROUP",
    async () => {
      const { ctx, stream } = buildCtx();
      const xread = wrapXreadCounter(stream);
      const clock = createFakeQaLockClock(0);
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
        onAfterPreconditionBeforeReadRenew: () => {
          clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
        },
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.failureReasonId, "queue_lock_lost");
      }
      assert.equal(xread.count(), 0);
    },
  );

  await test("deadline expires before ACK → zero ACK", async () => {
    const { ctx, stream } = buildCtx();
    const acks = wrapAckCounter(stream);
    const clock = createFakeQaLockClock(0);
    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      qaLockClock: clock,
      onBeforeAckConfirm: () => {
        clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureReasonId, "queue_lock_lost");
      assert.equal(result.failureStage, "queue_lock_renew");
    }
    assert.equal(acks.count(), 0);
  });

  await test(
    "renewal completes after deadline before ACK → zero ACK",
    async () => {
      const { ctx, stream } = buildCtx();
      const acks = wrapAckCounter(stream);
      const clock = createFakeQaLockClock(0);
      let renewCount = 0;
      const origRenew = stream.qaCompareAndRenewLock.bind(stream);
      stream.qaCompareAndRenewLock = async (key, token, ttlMs) => {
        renewCount += 1;
        const ok = await origRenew(key, token, ttlMs);
        // Expire only on the pre-ACK renew (3rd: pre + pre-read + pre-ack).
        if (renewCount >= 3) {
          clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
        }
        return ok;
      };
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.failureReasonId, "queue_lock_lost");
      }
      assert.equal(acks.count(), 0);
    },
  );

  await test("wall-clock rollback does not extend the monotonic deadline", async () => {
    const { stream } = buildCtx();
    const clock = createFakeQaLockClock(100);
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock,
      safeDeadlineMs: 20_000,
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    assert.equal(lock.deadlineMs, 20_100);
    clock.setMs(20_100);
    const lost = await renewQaExclusivityLock({
      redis: stream,
      handle: lock,
      clock,
    });
    assert.equal(lost.ok, false);
    // Attempted rollback — fake clock is monotonic (like performance.now).
    clock.setMs(5_000);
    assert.equal(clock.peekMs(), 20_100);
    const stillLost = await renewQaExclusivityLock({
      redis: stream,
      handle: lock,
      clock,
    });
    assert.equal(stillLost.ok, false);
    if (!stillLost.ok) {
      assert.equal(stillLost.reasonId, "queue_lock_deadline_elapsed");
    }
    await releaseQaExclusivityLock({ redis: stream, handle: lock });
  });

  await test("successor-lock protection remains intact with clock", async () => {
    const fake = new FakeRedisStreams({ nowMs: () => 1_700_000_000_000 });
    fake.testingSetNowMs(1_700_000_000_000);
    const stream = new MemoryHeadlessStreamQueueAdapter({
      envName: "staging",
      fake,
      nowMs: () => 1_700_000_000_000,
    });
    const clock = createFakeQaLockClock(0);
    const original = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock,
      ttlMs: 50,
    });
    assert.equal(original.acquired, true);
    if (!original.acquired) return;
    fake.testingAdvanceMs(51);
    const successorClock = createFakeQaLockClock(100);
    const successor = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock: successorClock,
      ttlMs: 30_000,
    });
    assert.equal(successor.acquired, true);
    if (!successor.acquired) return;
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
  });

  await test(
    "final compare-and-delete still protects a successor after deadline loss",
    async () => {
      const { ctx, stream, fake } = buildCtx();
      const clock = createFakeQaLockClock(0);
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
        onBeforeAckConfirm: async () => {
          // Steal lock (successor) then expire local deadline.
          const key = qaRenderLockKey("staging");
          await stream.qaDelKey(key);
          await stream.qaSetNxPx(key, "successor-token", 30_000);
          clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
        },
      });
      assert.equal(result.ok, false);
      assert.equal(
        fake.testingGetString(qaRenderLockKey("staging")),
        "successor-token",
      );
    },
  );

  await test(
    "provider delay cannot be hidden by a frozen timestamp",
    async () => {
      const { ctx, stream } = buildCtx();
      const xread = wrapXreadCounter(stream);
      const clock = createFakeQaLockClock(0);
      const origRenew = stream.qaCompareAndRenewLock.bind(stream);
      stream.qaCompareAndRenewLock = async (key, token, ttlMs) => {
        // Simulate slow provider: deadline elapses during await.
        clock.advanceMs(QA_LOCK_SAFE_DEADLINE_MS);
        return origRenew(key, token, ttlMs);
      };
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.failureReasonId, "queue_lock_lost");
      }
      assert.equal(xread.count(), 0);
      // Frozen ctx.nowMs would have allowed this — monotonic clock does not.
      assert.equal(ctx.nowMs, 1_700_000_000_000);
    },
  );

  await test(
    "cancellation/exception still executes safe compare-and-delete",
    async () => {
      const { ctx, stream } = buildCtx();
      const clock = createFakeQaLockClock(0);
      const ac = new AbortController();
      ac.abort();
      (ctx as { abortSignal?: AbortSignal }).abortSignal = ac.signal;
      const result = await runAttributedTerminalNoopConsume(ctx, {
        markCleanupSkipped: true,
        qaLockClock: clock,
      });
      assert.equal(result.ok, false);
      assert.equal(
        stream.testingFake().testingGetString(qaRenderLockKey("staging")),
        null,
      );

      const { ctx: ctx2, stream: stream2 } = buildCtx();
      const clock2 = createFakeQaLockClock(0);
      const original = stream2.qaXgroupCreate.bind(stream2);
      stream2.qaXgroupCreate = async () => {
        throw new Error("forced_exception_deadline_clock");
      };
      let threw = false;
      try {
        await runAttributedTerminalNoopConsume(ctx2, {
          markCleanupSkipped: true,
          qaLockClock: clock2,
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
    },
  );

  await test("foreign-entry and cleanup proofs remain green", async () => {
    const { ctx, stream, fake } = buildCtx();
    const clock = createFakeQaLockClock(0);
    await stream.ensureConsumerGroups();
    const foreign = await stream.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_foreign_deadline", 1),
      jobId: "job_foreign_deadline",
      ownerId: ctx.ownerId,
      attempt: 1,
      enqueuedAtMs: ctx.nowMs - 100,
      deliveryKind: "render",
    });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    const read = await stream.readGroup({
      kind: "render",
      consumerName: "prod_foreign_deadline",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);

    const result = await runAttributedTerminalNoopConsume(ctx, {
      markCleanupSkipped: true,
      qaLockClock: clock,
      injectForeignBeforeExpected: true,
    });
    assert.equal(result.ok, false);
    assert.equal(
      fake.testingPendingOwner(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
        foreign.value.streamId,
      ),
      "prod_foreign_deadline",
    );

    const { ctx: ctx2, fake: fake2 } = buildCtx();
    const clock2 = createFakeQaLockClock(0);
    const pass = await runAttributedTerminalNoopConsume(ctx2, {
      markCleanupSkipped: true,
      qaLockClock: clock2,
    });
    assert.equal(pass.ok, true);
    if (!pass.ok) return;
    assert.equal(ctx2.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx2.caseFinalizedStreamIds.length, 1);
    const ownedId = ctx2.caseFinalizedStreamIds[0]!.id;
    assert.equal(
      fake2.testingHasEntry(ctx2.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      fake2.testingHasGroup(
        ctx2.streamNames.renderStream,
        terminalQaGroup(ctx2.runId),
      ),
      false,
    );
    const cleanup = await defaultUpstashLiveCleanup(ctx2, false);
    assert.equal(cleanup, "ok");
    assert.equal(
      fake2.testingHasEntry(ctx2.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      fake2.testingHasGroup(
        ctx2.streamNames.renderStream,
        ctx2.streamNames.renderGroup,
      ),
      true,
    );
  });

  await test(
    "source boundary rejects runtime ctx.nowMs for QA lock deadline checkpoints",
    async () => {
      const root = path.join(
        process.cwd(),
        "src/verification/headless-renderer/upstash-live",
      );
      const files = [
        "terminal-attribution.ts",
        "exact-delivery-acquisition.ts",
        "queue-isolation.ts",
      ];
      for (const file of files) {
        const src = readFileSync(path.join(root, file), "utf8");
        assert.equal(
          /acquireQaExclusivityLock\(\{[\s\S]{0,400}?nowMs:\s*ctx\.nowMs/.test(
            src,
          ),
          false,
          `${file}: acquire must not use ctx.nowMs`,
        );
        assert.equal(
          /renewQaExclusivityLock\(\{[\s\S]{0,400}?nowMs:\s*ctx\.nowMs/.test(
            src,
          ),
          false,
          `${file}: renew must not use ctx.nowMs`,
        );
        assert.equal(
          /confirmQaLockOwnership\(\{[\s\S]{0,400}?nowMs:\s*ctx\.nowMs/.test(
            src,
          ),
          false,
          `${file}: confirm must not use ctx.nowMs`,
        );
      }
      const isolation = readFileSync(
        path.join(root, "queue-isolation.ts"),
        "utf8",
      );
      assert.ok(isolation.includes("QaLockClock"));
      assert.ok(isolation.includes("createLiveQaLockClock"));
      assert.ok(isolation.includes("performance.now"));
      // Runtime lock APIs must require clock, not a fixed nowMs number.
      assert.equal(
        /export async function acquireQaExclusivityLock\([\s\S]*?readonly nowMs\?: number/.test(
          isolation,
        ),
        false,
      );
      assert.equal(
        /export async function renewQaExclusivityLock\([\s\S]*?readonly nowMs\?: number/.test(
          isolation,
        ),
        false,
      );
      const terminal = readFileSync(
        path.join(root, "terminal-attribution.ts"),
        "utf8",
      );
      assert.ok(terminal.includes("qaLockClock"));
      assert.ok(terminal.includes("createLiveQaLockClock"));
      assert.equal(
        /nowMs:\s*ctx\.nowMs/.test(
          terminal.slice(
            terminal.indexOf("acquireQaExclusivityLock"),
            terminal.indexOf("acquireQaExclusivityLock") + 200,
          ),
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
