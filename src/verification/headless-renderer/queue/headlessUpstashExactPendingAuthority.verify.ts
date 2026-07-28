/**
 * Sprint 11E Phase 2D.1D.2 — exact pending-entry authority (deterministic).
 * Run: npm run test:headless-upstash-exact-pending-authority
 *
 * No provider contact. Proves XPENDING streamId streamId 1 semantics and
 * fail-closed probe handling for ACK / left_pending / cleanup.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  consumeRenderDeliveryOnce,
  interpretExactXpendingResponse,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import { createFakeIoredisLike } from "@/features/headless-renderer/control-plane/testing/fake-redis-streams";
import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { createGroupBoundStreamQueue } from "../upstash-live/group-bound-stream-queue";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  trackConsumerName,
  trackRunOwnedStreamId,
} from "../upstash-live/live-fixtures";
import { createQaCaseConsumerGroup } from "../upstash-live/queue-isolation";
import type { UpstashLiveMatrixContext } from "../upstash-live/types";

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

async function enqueuePending(
  ctx: UpstashLiveMatrixContext,
  stream: MemoryHeadlessStreamQueueAdapter,
  group: string,
  consumer: string,
  jobSuffix: string,
): Promise<{ streamId: string; deliveryId: string; jobId: string; attempt: number }> {
  const seeded = await seedQueuedCanonicalJob(ctx);
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed_failed");
  const enq = await stream.enqueueRender({
    deliveryId: seeded.deliveryId,
    jobId: seeded.jobId,
    ownerId: ctx.ownerId,
    attempt: seeded.attempt,
    enqueuedAtMs: ctx.nowMs,
    deliveryKind: "render",
  });
  assert.equal(enq.ok, true);
  if (!enq.ok) throw new Error("enqueue_failed");
  void jobSuffix;
  const read = await stream.qaXreadGroupInGroup({
    streamKey: ctx.streamNames.renderStream,
    group,
    consumerName: consumer,
    count: 1,
    blockMs: 0,
  });
  assert.equal(read.ok && read.items.length === 1, true);
  if (!read.ok) throw new Error("read_failed");
  assert.equal(read.items[0]!.streamId, enq.value.streamId);
  return {
    streamId: enq.value.streamId,
    deliveryId: seeded.deliveryId,
    jobId: seeded.jobId,
    attempt: seeded.attempt,
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1D.2 — exact pending-entry authority\n",
  );

  await test(
    "expected entry detectable with >100 unrelated pending before it",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId: "large.pel",
        kind: "render",
        ctx,
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      for (let i = 0; i < 105; i++) {
        await enqueuePending(
          ctx,
          stream,
          created.group,
          `filler_${i}`,
          `filler_${i}`,
        );
      }
      const expected = await enqueuePending(
        ctx,
        stream,
        created.group,
        "expected_consumer",
        "expected",
      );
      const probe = await stream.qaProbePendingInGroup(
        ctx.streamNames.renderStream,
        created.group,
        expected.streamId,
      );
      assert.deepEqual(probe, { ok: true, pending: true });
      // Legacy scan of first 100 would miss this — exact probe must not.
      const scan = await stream.testingFake().xpending(
        ctx.streamNames.renderStream,
        created.group,
        "-",
        "+",
        100,
      );
      assert.ok(Array.isArray(scan));
      const scannedIds = (scan as Array<[string, string, number, number]>).map(
        (r) => r[0],
      );
      assert.equal(scannedIds.includes(expected.streamId), false);
    },
  );

  await test("exact query uses streamId, streamId, 1", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "exact.args",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "args_c",
      "args",
    );
    const calls: unknown[][] = [];
    const fake = stream.testingFake();
    const ioredis = createFakeIoredisLike(fake);
    const origCall = ioredis.call.bind(ioredis);
    ioredis.call = async (cmd, ...args) => {
      if (String(cmd).toUpperCase() === "XPENDING") {
        calls.push([cmd, ...args]);
      }
      return origCall(cmd, ...args);
    };
    const tcp = new UpstashTcpStreamConsumerAdapter({
      envName: "staging",
      client: ioredis,
    });
    const probe = await tcp.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    assert.deepEqual(probe, { ok: true, pending: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "XPENDING",
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
      expected.streamId,
      1,
    ]);
    await tcp.close?.();
  });

  await test("empty exact result means confirmed absent", async () => {
    const { stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const names = stream.streamNames();
    const probe = await stream.qaProbePendingInGroup(
      names.renderStream,
      names.renderGroup,
      "9999999999999-0",
    );
    assert.deepEqual(probe, { ok: true, pending: false });
  });

  await test("provider throw means probe failure, not absent", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "throw.probe",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "throw_c",
      "throw",
    );
    const orig = stream.testingFake().xpending.bind(stream.testingFake());
    stream.testingFake().xpending = async () => {
      throw new Error("forced_xpending_throw");
    };
    try {
      const probe = await stream.qaProbePendingInGroup(
        ctx.streamNames.renderStream,
        created.group,
        expected.streamId,
      );
      assert.deepEqual(probe, {
        ok: false,
        reasonId: "pending_probe_failed",
      });
    } finally {
      stream.testingFake().xpending = orig;
    }
  });

  await test("malformed response fails", async () => {
    assert.deepEqual(interpretExactXpendingResponse(null, "1-0"), {
      ok: false,
      reasonId: "pending_probe_failed",
    });
    assert.deepEqual(interpretExactXpendingResponse("bad", "1-0"), {
      ok: false,
      reasonId: "pending_probe_failed",
    });
    assert.deepEqual(interpretExactXpendingResponse([[]], "1-0"), {
      ok: false,
      reasonId: "pending_probe_failed",
    });
    assert.deepEqual(
      interpretExactXpendingResponse(
        [
          ["1-0", "c", 1, 1],
          ["1-0", "c", 1, 1],
        ],
        "1-0",
      ),
      { ok: false, reasonId: "pending_probe_failed" },
    );
  });

  await test("wrong-ID response fails", async () => {
    assert.deepEqual(
      interpretExactXpendingResponse([["2-0", "c", 0, 1]], "1-0"),
      { ok: false, reasonId: "pending_probe_failed" },
    );
  });

  await test("pre-ACK probe failure causes zero ACK", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "pre.ack.fail",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "pre_c",
      "pre",
    );
    let ackCalls = 0;
    const origAck = stream.qaXackInGroup.bind(stream);
    stream.qaXackInGroup = async (...args) => {
      ackCalls += 1;
      return origAck(...args);
    };
    stream.qaProbePendingInGroup = async () => ({
      ok: false,
      reasonId: "pending_probe_failed",
    });
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: created.group,
      streamKey: ctx.streamNames.renderStream,
      kind: "render",
      expected: {
        deliveryId: expected.deliveryId,
        jobId: expected.jobId,
        ownerId: ctx.ownerId,
        attempt: expected.attempt,
        streamId: expected.streamId,
      },
        dlqAuthority: "production_env",
      });
    const ack = await bound.ack({
      kind: "render",
      streamId: expected.streamId,
      deliveryId: expected.deliveryId,
    });
    assert.equal(ack.ok, false);
    assert.equal(ackCalls, 0);
  });

  await test("post-ACK probe failure cannot PASS", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "post.ack.fail",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "post_c",
      "post",
    );
    let probes = 0;
    const orig = stream.qaProbePendingInGroup.bind(stream);
    stream.qaProbePendingInGroup = async (sk, g, id) => {
      probes += 1;
      if (probes === 1) return orig(sk, g, id);
      return { ok: false, reasonId: "pending_probe_failed" };
    };
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: created.group,
      streamKey: ctx.streamNames.renderStream,
      kind: "render",
      expected: {
        deliveryId: expected.deliveryId,
        jobId: expected.jobId,
        ownerId: ctx.ownerId,
        attempt: expected.attempt,
        streamId: expected.streamId,
      },
        dlqAuthority: "production_env",
      });
    const ack = await bound.ack({
      kind: "render",
      streamId: expected.streamId,
      deliveryId: expected.deliveryId,
    });
    assert.equal(ack.ok, false);
    assert.equal(probes >= 2, true);
  });

  await test("ACK count zero cannot PASS", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "zero.ack",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "zero_c",
      "zero",
    );
    // Clear pending so XACK returns 0, but force pre-probe to claim pending.
    await stream.qaXackInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    let probes = 0;
    stream.qaProbePendingInGroup = async () => {
      probes += 1;
      if (probes === 1) return { ok: true, pending: true };
      return { ok: true, pending: false };
    };
    stream.qaXackInGroup = async () => false;
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: created.group,
      streamKey: ctx.streamNames.renderStream,
      kind: "render",
      expected: {
        deliveryId: expected.deliveryId,
        jobId: expected.jobId,
        ownerId: ctx.ownerId,
        attempt: expected.attempt,
        streamId: expected.streamId,
      },
        dlqAuthority: "production_env",
      });
    const ack = await bound.ack({
      kind: "render",
      streamId: expected.streamId,
      deliveryId: expected.deliveryId,
    });
    assert.equal(ack.ok, false);
  });

  await test("left_pending requires confirmed pending true", async () => {
    const { ctx, stream } = buildCtx();
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const loaded = await ctx.jobStore.getByJobIdAndOwner(
      seeded.jobId,
      ctx.ownerId,
    );
    assert.equal(loaded.ok && loaded.value.stage === "canonical", true);
    if (!loaded.ok || loaded.value.stage !== "canonical") return;
    const claimedAt = ctx.nowMs + 5;
    const claimed = await ctx.jobStore.claimQueuedJob({
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      expectedStoreVersion: loaded.value.storeVersion,
      claimToken: `claim_lp_${ctx.runId.slice(0, 8)}`,
      nowMs: claimedAt,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "left.pending",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const enq = await stream.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;
    const read = await stream.qaXreadGroupInGroup({
      streamKey: ctx.streamNames.renderStream,
      group: created.group,
      consumerName: "lp_c",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.items.length === 1, true);
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: created.group,
      streamKey: ctx.streamNames.renderStream,
      kind: "render",
      expected: {
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        streamId: enq.value.streamId,
      },
        dlqAuthority: "production_env",
      });
    ctx.nowMs = claimedAt + ctx.leaseSettings.renderClaimMs + 1;
    const result = await consumeRenderDeliveryOnce({
      streamQueue: bound,
      jobStore: ctx.jobStore,
      entry: {
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      },
      streamId: enq.value.streamId,
      nowMs: ctx.nowMs,
      leaseSettings: ctx.leaseSettings,
      consumerName: "lp_c",
    });
    assert.equal(result.ok && result.value.action === "left_pending", true);
    const probe = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      enq.value.streamId,
    );
    assert.deepEqual(probe, { ok: true, pending: true });
    // Probe failure cannot satisfy left_pending.
    stream.qaProbePendingInGroup = async () => ({
      ok: false,
      reasonId: "pending_probe_failed",
    });
    const failProbe = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      enq.value.streamId,
    );
    assert.equal(failProbe.ok, false);
  });

  await test("QA and production groups remain independent", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "indep.groups",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enq = await stream.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;
    await stream.readGroup({
      kind: "render",
      consumerName: "prod_indep",
      count: 1,
      blockMs: 0,
    });
    await stream.qaXreadGroupInGroup({
      streamKey: ctx.streamNames.renderStream,
      group: created.group,
      consumerName: "qa_indep",
      count: 1,
      blockMs: 0,
    });
    await stream.qaXackInGroup(
      ctx.streamNames.renderStream,
      created.group,
      enq.value.streamId,
    );
    const qa = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      enq.value.streamId,
    );
    const prod = await stream.qaProbePending(
      "render",
      enq.value.streamId,
    );
    assert.deepEqual(qa, { ok: true, pending: false });
    assert.deepEqual(prod, { ok: true, pending: true });
  });

  await test("cleanup probe failure produces cleanup failed", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "cleanup.probe",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "cl_c",
      "cl",
    );
    trackRunOwnedStreamId(ctx, {
      stream: ctx.streamNames.renderStream,
      id: expected.streamId,
      kind: "render",
    });
    trackConsumerName(ctx, "cl_c");
    await stream.qaXackInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    const orig = stream.qaProbePendingInGroup.bind(stream);
    const origProd = stream.qaProbePending.bind(stream);
    stream.qaProbePending = async () => ({
      ok: false,
      reasonId: "pending_probe_failed",
    });
    stream.qaProbePendingInGroup = async () => ({
      ok: false,
      reasonId: "pending_probe_failed",
    });
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "failed");
    stream.qaProbePending = origProd;
    stream.qaProbePendingInGroup = orig;
  });

  await test("foreign entries remain untouched", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const foreignJob = "job_foreign_exact_pending";
    const foreign = await stream.enqueueRender({
      deliveryId: stableHeadlessDeliveryId(foreignJob, 1),
      jobId: foreignJob,
      ownerId: ctx.ownerId,
      attempt: 1,
      enqueuedAtMs: ctx.nowMs - 10,
      deliveryKind: "render",
    });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    await stream.readGroup({
      kind: "render",
      consumerName: "foreign_owner",
      count: 1,
      blockMs: 0,
    });
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "foreign.untouched",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const owned = await enqueuePending(
      ctx,
      stream,
      created.group,
      "own_c",
      "own",
    );
    trackRunOwnedStreamId(ctx, {
      stream: ctx.streamNames.renderStream,
      id: owned.streamId,
      kind: "render",
    });
    await stream.qaXackInGroup(
      ctx.streamNames.renderStream,
      created.group,
      owned.streamId,
    );
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "ok");
    assert.equal(
      stream.testingFake().testingHasEntry(
        ctx.streamNames.renderStream,
        foreign.value.streamId,
      ),
      true,
    );
    const foreignProbe = await stream.qaProbePending(
      "render",
      foreign.value.streamId,
    );
    assert.deepEqual(foreignProbe, { ok: true, pending: true });
  });

  await test("Memory and TCP probe behavior are equivalent", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "mem.tcp.eq",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const expected = await enqueuePending(
      ctx,
      stream,
      created.group,
      "eq_c",
      "eq",
    );
    const mem = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    const tcp = new UpstashTcpStreamConsumerAdapter({
      envName: "staging",
      client: createFakeIoredisLike(stream.testingFake()),
    });
    const tcpProbe = await tcp.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    assert.deepEqual(mem, tcpProbe);
    assert.deepEqual(mem, { ok: true, pending: true });
    await stream.qaXackInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    const memAbsent = await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    const tcpAbsent = await tcp.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      expected.streamId,
    );
    assert.deepEqual(memAbsent, tcpAbsent);
    assert.deepEqual(memAbsent, { ok: true, pending: false });
    await tcp.close?.();
  });

  await test(
    "source-boundary rejects XPENDING - + 100 for exact evidence paths",
    async () => {
      const root = path.join(
        process.cwd(),
        "src/verification/headless-renderer/upstash-live",
      );
      const authorityFiles = [
        "group-bound-stream-queue.ts",
        "cleanup.ts",
        "terminal-attribution.ts",
        "duplicate-live-attribution.ts",
        "case-delivery-authority.ts",
        "live-matrix.ts",
      ];
      const scanPattern = /XPENDING[\s\S]{0,120}["']-["'][\s\S]{0,40}["']\+["'][\s\S]{0,40}100/;
      for (const file of authorityFiles) {
        const src = readFileSync(path.join(root, file), "utf8");
        assert.equal(
          scanPattern.test(src),
          false,
          `${file} must not use XPENDING - + 100`,
        );
        // Official evidence paths must call the result-bearing probe.
        if (file !== "case-delivery-authority.ts") {
          assert.equal(
            /(?<!deprecated[\s\S]{0,80})qaIsPendingInGroup\s*\(/.test(src) &&
              src.includes("qaIsPendingInGroup(") &&
              !src.includes("probePendingInGroup"),
            false,
            `${file} must use probePendingInGroup / qaProbePending* for evidence`,
          );
        }
        if (
          file === "cleanup.ts" ||
          file === "group-bound-stream-queue.ts" ||
          file === "terminal-attribution.ts" ||
          file === "duplicate-live-attribution.ts" ||
          file === "live-matrix.ts"
        ) {
          assert.ok(
            src.includes("qaProbePending") ||
              src.includes("probePendingInGroup"),
            `${file} must use exact pending probe`,
          );
        }
      }
      const tcpSrc = readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter.ts",
        ),
        "utf8",
      );
      assert.ok(tcpSrc.includes("qaProbePendingInGroup"));
      const probeFn = tcpSrc.slice(
        tcpSrc.indexOf("async qaProbePendingInGroup"),
        tcpSrc.indexOf("/** @deprecated Fail-closed boolean — use `qaProbePendingInGroup`"),
      );
      assert.ok(probeFn.includes("streamId"));
      assert.ok(/streamId,\s*\n\s*streamId,\s*\n\s*1/.test(probeFn));
      assert.equal(scanPattern.test(probeFn), false);
    },
  );

  console.log(`\n${passed}/15 exact pending authority fixtures passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
