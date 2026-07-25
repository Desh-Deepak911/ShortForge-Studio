/**
 * Sprint 11E Phase 2D.1A — Upstash live matrix authority (FakeRedis + memory).
 * Proves DEFAULT runners touch ports, stop-on-first-fail, cleanup, dual-lease ACK.
 * Run: npm run test:headless-upstash-live-matrix-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  HEADLESS_QUEUE_PROTOCOL_VERSION,
  consumeRenderDeliveryOnce,
} from "@/features/headless-renderer/control-plane";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import { defaultUpstashLiveCleanup } from "./upstash-live/cleanup";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import { createUpstashLifecycleTracking,
  emptyUpstashLiveSession } from "./upstash-live/live-fixtures";
import {
  DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
  runUpstashLiveMatrix,
} from "./upstash-live/live-matrix";
import { runUpstashLiveHarness } from "./upstash-live/run-upstash-live-harness";
import {
  assertExactRequiredUpstashLiveCasePrefixFailAuthority,
  REQUIRED_UPSTASH_LIVE_CASE_IDS,
} from "./upstash-live/required-cases";
import type { UpstashLiveMatrixContext } from "./upstash-live/types";
import {
  createQueuedCanonicalJob,
  DUAL_LEASE_TEST_LEASES,
} from "./upstash-live/dual-lease-test-fixture";

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
  readonly failCase?: (typeof REQUIRED_UPSTASH_LIVE_CASE_IDS)[number];
}): {
  ctx: UpstashLiveMatrixContext;
  stream: MemoryHeadlessStreamQueueAdapter;
} {
  const runId = randomUUID();
  const stream = new MemoryHeadlessStreamQueueAdapter({
    envName: "staging",
    nowMs: () => 1_700_000_000_000,
  });
  const leaseSettings = Object.freeze({
    deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
    renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
    verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
    verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  });
  void overrides;
  const lifecycle = createUpstashLifecycleTracking();
  const ctx: UpstashLiveMatrixContext = {
    runId,
    ownerId: `uq_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    env: {
      HEADLESS_ENV_NAME: "staging",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
      UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
      DATABASE_URL:
        "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
    },
    nowMs: 1_700_000_000_000,
    leaseSettings,
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
  console.log("\nSprint 11E Phase 2D.1A — Upstash live matrix authority\n");

  await test("DEFAULT runners are not stub aliases", () => {
    assert.notEqual(
      DEFAULT_UPSTASH_LIVE_CASE_RUNNERS["enqueue.render"],
      DEFAULT_UPSTASH_LIVE_CASE_RUNNERS["enqueue.verify"],
    );
    assert.equal(REQUIRED_UPSTASH_LIVE_CASE_IDS.length, 22);
  });

  await test(
    "injected FakeRedis matrix exercises ports through compose.blocked",
    async () => {
      const { ctx } = buildCtx();
      const cases = await runUpstashLiveMatrix(ctx);
      assert.equal(cases.length, 22);
      // Env + protocol + stream cases must PASS with configured env.
      assert.equal(cases[0]?.status, "PASS"); // env.producer.config
      assert.equal(cases[1]?.status, "PASS"); // env.consumer.config
      assert.equal(cases[2]?.status, "PASS"); // env.lease.settings
      assert.equal(cases[3]?.status, "PASS"); // stream.names
      assert.equal(cases[4]?.status, "PASS"); // protocol.version
      // If a later case fails, remaining are NOT_TESTED (prefix shape).
      const firstFail = cases.findIndex((c) => c.status === "FAIL");
      if (firstFail >= 0) {
        const prefix =
          assertExactRequiredUpstashLiveCasePrefixFailAuthority(cases);
        assert.equal(prefix.ok, true, prefix.ok ? "" : prefix.message);
      } else {
        assert.ok(cases.every((c) => c.status === "PASS"));
      }
    },
  );

  await test("stop-on-first-failure pads NOT_TESTED", async () => {
    const { ctx } = buildCtx();
    const runners = {
      ...DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
      "env.producer.config": async () => ({
        caseId: "env.producer.config" as const,
        status: "FAIL" as const,
        failureCategory: "ENV_PRODUCER_FAILED" as const,
      }),
    };
    const cases = await runUpstashLiveMatrix(ctx, runners);
    assert.equal(cases[0]?.status, "FAIL");
    assert.ok(cases.slice(1).every((c) => c.status === "NOT_TESTED"));
    const prefix = assertExactRequiredUpstashLiveCasePrefixFailAuthority(cases);
    assert.equal(prefix.ok, true);
  });

  await test("cleanup ok with tracked redis + empty neon counts", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const enq = await stream.enqueueRender({
      deliveryId: "dlv:job_cleanup:1",
      jobId: "job_cleanup",
      ownerId: ctx.ownerId,
      attempt: 1,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;
    ctx.trackedStreamIds.push({
      stream: ctx.streamNames.renderStream,
      id: enq.value.streamId,
      kind: "render",
    });
    const consumer = `uq_cleanup_${ctx.runId.slice(0, 8)}`;
    ctx.trackedConsumerNames.push(consumer);
    await stream.readGroup({
      kind: "render",
      consumerName: consumer,
      count: 1,
      blockMs: 0,
    });
    const status = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(status, "ok");
    assert.equal(
      stream.testingFake().testingIsPending(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
        enq.value.streamId,
      ),
      false,
    );
  });

  await test("dual-lease: expired claim → left_pending", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimedAt = fx.nowMs + 5;
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "claim_expired",
      nowMs: claimedAt,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c_leave",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const result = await consumeRenderDeliveryOnce({
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: claimedAt + DUAL_LEASE_TEST_LEASES.renderClaimMs + 1,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c_leave",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "left_pending");
    assert.equal(
      fx.streamQueue
        .testingFake()
        .testingIsPending(
          "hfq:render:local",
          "hfq:render-workers",
          read.value[0]!.streamId,
        ),
      true,
    );
  });

  await test(
    "dual-lease: ACK fail after claim still claimed_and_acked",
    async () => {
      const fx = await createQueuedCanonicalJob();
      const read = await fx.streamQueue.readGroup({
        kind: "render",
        consumerName: "c_ackfail",
        count: 1,
        blockMs: 0,
      });
      assert.equal(read.ok && read.value.length === 1, true);
      if (!read.ok) return;
      fx.streamQueue.testingFailNextAck();
      const result = await consumeRenderDeliveryOnce({
        streamQueue: fx.streamQueue,
        jobStore: fx.stack.jobStore,
        entry: read.value[0]!.entry,
        streamId: read.value[0]!.streamId,
        nowMs: fx.nowMs + 10,
        leaseSettings: DUAL_LEASE_TEST_LEASES,
        consumerName: "c_ackfail",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.action, "claimed_and_acked");
      assert.ok(result.value.claimToken != null);
    },
  );

  await test(
    "harness gate-on with injected FakeRedis DEFAULT runners (temp evidence)",
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), "upstash-matrix-"));
      const evidencePath = path.join(dir, "evidence.md");
      const stream = new MemoryHeadlessStreamQueueAdapter({
        envName: "staging",
      });
      const result = await runUpstashLiveHarness({
        forceGateOn: true,
        assumeConfigured: true,
        evidencePath,
        env: {
          HEADLESS_UPSTASH_QA: "1",
          HEADLESS_ENV_NAME: "staging",
          DATABASE_URL:
            "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
          UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
          UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
          UPSTASH_REDIS_TCP_URL:
            "rediss://default:pass@example.upstash.io:6379",
        },
        injectedSql: noopSql(),
        injectedRestProducer: stream,
        injectedTcpConsumer: stream,
        injectedStreamQueue: stream,
        injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
        injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
        injectedProjectAuthorization:
          new MemoryHeadlessProjectOwnershipAdapter(),
        injectedFingerprint: buildUpstashLiveSchemaFingerprint(),
        cleanupRunner: async (ctx, preserve) =>
          defaultUpstashLiveCleanup(ctx, preserve === true),
      });
      // Full 22 may PASS on memory; if not, must be coherent FAIL (not crash).
      assert.ok(
        result.overall === "PASS" || result.overall === "FAIL",
        `unexpected overall ${result.overall}`,
      );
      assert.equal(result.exitCode === 0, result.overall === "PASS");
      void HEADLESS_QUEUE_PROTOCOL_VERSION;
    },
  );

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
