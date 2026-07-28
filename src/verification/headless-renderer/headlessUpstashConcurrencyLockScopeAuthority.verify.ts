/**
 * Sprint 11E Phase 2D.1H.1 — concurrency lock-scope + delayed-operation authority.
 * Run: npm run test:headless-upstash-concurrency-lock-scope-authority
 *
 * No Neon/Upstash provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  createFakeUpstashRestClient,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { composeQaRunScopedHarnessPorts } from "./upstash-live/compose-qa-run-scoped-ports";
import {
  CONCURRENCY_ATTRIBUTION_STAGE_IDS,
  runAttributedConcurrencyNoSteal,
} from "./upstash-live/concurrency-attribution";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
} from "./upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  createFakeQaLockClock,
  QA_LOCK_SAFE_DEADLINE_MS,
  QA_LOCK_TTL_MS,
  releaseQaExclusivityLock,
} from "./upstash-live/queue-isolation";
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

async function buildScopedCtx(runId = randomUUID()) {
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  await stream.ensureConsumerGroups();
  const restClient = createFakeUpstashRestClient(stream.testingFake());
  const scoped = await composeQaRunScopedHarnessPorts({
    envName: "staging",
    runId,
    redis: stream,
    restClient,
  });
  assert.ok(scoped != null);
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_ls_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_ls_o_${runId.slice(0, 8)}`,
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
    restProducer: scoped.restProducer,
    tcpConsumer: stream,
    streamQueue: {
      enqueueRender: (m) => scoped.restProducer.enqueueRender(m),
      enqueueVerify: (m) => scoped.restProducer.enqueueVerify(m),
      ensureConsumerGroups: () => stream.ensureConsumerGroups(),
      readGroup: (i) => stream.readGroup(i),
      ack: (i) => stream.ack(i),
      autoClaimIdle: (i) => stream.autoClaimIdle(i),
      moveToDlq: (i) => scoped.dlqWriter.moveToDlq(i),
    },
    streamNames: scoped.streamNames,
    streamAuthority: scoped.streamAuthority,
    groupAuthorityEvidence: scoped.groupAuthorityEvidence,
    qaRunStreamBinding: scoped.binding,
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
  return { ctx, stream, scoped };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1H.1 — concurrency lock-scope authority\n",
  );

  await test("1. TTL/deadline constants unchanged (not blindly widened)", () => {
    assert.equal(QA_LOCK_TTL_MS, 30_000);
    assert.equal(QA_LOCK_SAFE_DEADLINE_MS, 20_000);
    assert.ok(CONCURRENCY_ATTRIBUTION_STAGE_IDS.includes("lock_scope_a_release"));
  });

  await test(
    "2. delay >20s after truthful scope-A release does not false lock-lose consume",
    async () => {
      const { ctx } = await buildScopedCtx();
      const clock = createFakeQaLockClock(0);
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        lockClock: clock,
        onAfterScopeARelease: () => {
          clock.advanceMs(QA_LOCK_SAFE_DEADLINE_MS + 5_000);
        },
      });
      assert.equal(attributed.ok, true, "expected PASS after post-release delay");
      if (!attributed.ok) return;
      assert.equal(attributed.winnerAction, "claimed_and_acked");
      assert.equal(attributed.peerAction, "acked_duplicate_live");
    },
  );

  await test(
    "3. deadline expiry inside scope A fails before concurrent consume",
    async () => {
      const { ctx } = await buildScopedCtx();
      const clock = createFakeQaLockClock(0);
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        lockClock: clock,
        onBeforeDuplicateBExactRead: () => {
          clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
        },
      });
      assert.equal(attributed.ok, false);
      if (attributed.ok) return;
      assert.equal(attributed.failureStage, "duplicate_b_exact_read");
      assert.equal(
        attributed.failureReasonId,
        "lock_scope_a_deadline_elapsed",
      );
      assert.equal(
        attributed.stages.some((s) => s.stageId === "concurrent_consume"),
        false,
      );
    },
  );

  await test(
    "4. scope-A release lost prevents concurrent consume; successor preserved",
    async () => {
      const { ctx, stream } = await buildScopedCtx();
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        forceScopeAReleaseStatus: "lost",
      });
      assert.equal(attributed.ok, false);
      if (attributed.ok) return;
      assert.equal(attributed.failureStage, "lock_scope_a_release");
      assert.equal(attributed.failureReasonId, "lock_scope_a_release_lost");
      assert.equal(
        attributed.stages.some((s) => s.stageId === "concurrent_consume"),
        false,
      );
      // Successor token must remain (stale release never deletes successor).
      const lockKey = `hfq:qa-lock:render:staging`;
      const remaining = stream.testingFake().testingGetString(lockKey);
      assert.ok(
        typeof remaining === "string" && remaining.startsWith("successor_"),
      );
      await stream.qaDelKey(lockKey);
    },
  );

  await test(
    "5. scope-A release error prevents concurrent consume",
    async () => {
      const { ctx } = await buildScopedCtx();
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        forceScopeAReleaseStatus: "error",
      });
      assert.equal(attributed.ok, false);
      if (attributed.ok) return;
      assert.equal(attributed.failureStage, "lock_scope_a_release");
      assert.equal(
        attributed.failureReasonId,
        "lock_scope_a_release_failed",
      );
      assert.equal(
        attributed.stages.some((s) => s.stageId === "concurrent_consume"),
        false,
      );
    },
  );

  await test(
    "6. FinA/FinB each use a fresh deadline/token (happy path tokens differ)",
    async () => {
      const { ctx, stream } = await buildScopedCtx();
      const clock = createFakeQaLockClock(0);
      const tokens: string[] = [];
      const origAcquire = stream.qaSetNxPx.bind(stream);
      stream.qaSetNxPx = async (key, value, pxMs) => {
        if (key.includes("qa-lock")) {
          tokens.push(value);
        }
        return origAcquire(key, value, pxMs);
      };
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        lockClock: clock,
      });
      assert.equal(attributed.ok, true);
      // Scope A + FinA + FinB = 3 distinct lock tokens.
      assert.ok(tokens.length >= 3);
      assert.equal(new Set(tokens).size, tokens.length);
    },
  );

  await test(
    "7. finalize-A ownership loss fails without marking A finalized",
    async () => {
      const { ctx, stream } = await buildScopedCtx();
      const clock = createFakeQaLockClock(0);
      let acquireCount = 0;
      const origSet = stream.qaSetNxPx.bind(stream);
      stream.qaSetNxPx = async (key, value, pxMs) => {
        const ok = await origSet(key, value, pxMs);
        if (key.includes("qa-lock")) {
          acquireCount += 1;
          // After FinA acquire (2nd lock: A then FinA), steal before finalize.
          if (acquireCount === 2) {
            await stream.qaDelKey(key);
            await origSet(key, `stolen_${value}`, pxMs);
          }
        }
        return ok;
      };
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        lockClock: clock,
      });
      assert.equal(attributed.ok, false);
      if (attributed.ok) return;
      assert.equal(attributed.failureStage, "duplicate_a_finalize");
      assert.ok(
        attributed.failureReasonId === "lock_scope_fina_ownership_lost" ||
          attributed.failureReasonId === "lock_scope_fina_deadline_elapsed" ||
          attributed.failureReasonId === "stream_finalize_failed",
      );
      assert.equal(
        ctx.caseFinalizedStreamIds.filter((t) => t.kind === "render").length,
        0,
      );
      // Active deliveries remain recoverable for cleanup.
      assert.ok(ctx.runOwnedActiveStreamIds.length >= 1);
    },
  );

  await test(
    "8. stale release never deletes successor token",
    async () => {
      const { stream } = await buildScopedCtx();
      const clock = createFakeQaLockClock(0);
      const lock = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        clock,
        kind: "render",
      });
      assert.equal(lock.acquired, true);
      if (!lock.acquired) return;
      await stream.qaDelKey(lock.key);
      const successor = `successor_${randomUUID()}`;
      assert.equal(
        await stream.qaSetNxPx(lock.key, successor, lock.ttlMs),
        true,
      );
      const released = await releaseQaExclusivityLock({
        redis: stream,
        handle: lock,
      });
      assert.equal(released.status, "lost");
      assert.equal(
        stream.testingFake().testingGetString(lock.key),
        successor,
      );
      await stream.qaDelKey(lock.key);
    },
  );

  await test(
    "9. happy path still proves one-winner concurrency + independent finalize",
    async () => {
      const { ctx } = await buildScopedCtx();
      const attributed = await runAttributedConcurrencyNoSteal(ctx);
      assert.equal(attributed.ok, true);
      if (!attributed.ok) return;
      assert.equal(attributed.stages.length, 16);
      assert.equal(
        ctx.caseFinalizedStreamIds.filter((t) => t.kind === "render").length,
        2,
      );
      assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    },
  );

  await test(
    "10. bounded failure leaves deliveries independently cleanable",
    async () => {
      const { ctx } = await buildScopedCtx();
      const attributed = await runAttributedConcurrencyNoSteal(ctx, {
        forceScopeAReleaseStatus: "lost",
      });
      assert.equal(attributed.ok, false);
      if (attributed.ok) return;
      // Two run-owned active stream entries remain tracked for cleanup.
      assert.equal(
        ctx.runOwnedActiveStreamIds.filter((t) => t.kind === "render").length,
        2,
      );
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
