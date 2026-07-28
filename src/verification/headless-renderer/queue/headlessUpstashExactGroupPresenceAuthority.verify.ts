/**
 * Sprint 11E Phase 2D.1E.3 — exact group-presence authority (deterministic).
 * Run: npm run test:headless-upstash-exact-group-presence-authority
 *
 * No provider contact. Proves XINFO GROUPS result-bearing semantics —
 * empty success ≠ probe failure; consumers never treat errors as absence.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  interpretGroupPresence,
  interpretXinfoGroupsResponse,
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

import { finalizeIsolatedCaseDelivery } from "../upstash-live/case-delivery-finalize";
import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  trackQaGroup,
  trackRunOwnedStreamId,
} from "../upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  createFakeQaLockClock,
  createQaCaseConsumerGroup,
  snapshotQaGroupCursor,
} from "../upstash-live/queue-isolation";
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

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1E.3 — exact group-presence authority\n",
  );

  await test("successful empty group list confirms absence", async () => {
    const empty = interpretXinfoGroupsResponse([]);
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    assert.equal(empty.groups.length, 0);
    assert.deepEqual(
      interpretGroupPresence(empty, "hfq:qa:render:abc"),
      { ok: true, present: false },
    );
    const { stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const list = await stream.qaXinfoGroups(stream.streamNames().renderStream);
    assert.equal(list.ok, true);
    if (!list.ok) return;
    const missing = interpretGroupPresence(
      list,
      "hfq:qa:render:missingmissingmissingmiss01",
    );
    assert.deepEqual(missing, { ok: true, present: false });
  });

  await test("provider throw returns group_probe_failed", async () => {
    const { stream } = buildCtx();
    const orig = stream.testingFake().xinfoGroups.bind(stream.testingFake());
    stream.testingFake().xinfoGroups = async () => {
      throw new Error("forced_xinfo_throw");
    };
    const list = await stream.qaXinfoGroups(stream.streamNames().renderStream);
    stream.testingFake().xinfoGroups = orig;
    assert.deepEqual(list, { ok: false, reasonId: "group_probe_failed" });
  });

  await test("unconfigured TCP adapter returns group_probe_failed", async () => {
    const fake = createFakeIoredisLike({
      nowMs: () => 1_700_000_000_000,
    } as never);
    const tcp = new UpstashTcpStreamConsumerAdapter({
      envName: "staging",
      // Force unconfigured — no config / client.
    });
    void fake;
    const list = await tcp.qaXinfoGroups("hfq:render:staging");
    assert.deepEqual(list, { ok: false, reasonId: "group_probe_failed" });
  });

  await test("malformed outer response fails", () => {
    assert.deepEqual(interpretXinfoGroupsResponse(null), {
      ok: false,
      reasonId: "group_probe_failed",
    });
    assert.deepEqual(interpretXinfoGroupsResponse("bad"), {
      ok: false,
      reasonId: "group_probe_failed",
    });
    assert.deepEqual(interpretXinfoGroupsResponse({}), {
      ok: false,
      reasonId: "group_probe_failed",
    });
  });

  await test("malformed row fails", () => {
    assert.deepEqual(interpretXinfoGroupsResponse([["name"]]), {
      ok: false,
      reasonId: "group_probe_failed",
    });
    assert.deepEqual(
      interpretXinfoGroupsResponse([
        ["name", "", "last-delivered-id", "0-0", "pending", 0, "consumers", 0],
      ]),
      { ok: false, reasonId: "group_probe_failed" },
    );
    assert.deepEqual(
      interpretXinfoGroupsResponse([
        [
          "name",
          "hfq:qa:render:ok",
          "last-delivered-id",
          "not-an-id",
          "pending",
          0,
          "consumers",
          0,
        ],
      ]),
      { ok: false, reasonId: "group_probe_failed" },
    );
    assert.deepEqual(
      interpretXinfoGroupsResponse([
        [
          "name",
          "hfq:qa:render:ok",
          "last-delivered-id",
          "0-0",
          "pending",
          -1,
          "consumers",
          0,
        ],
      ]),
      { ok: false, reasonId: "group_probe_failed" },
    );
  });

  await test("replay cannot pass on group-probe failure", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const clock = createFakeQaLockClock(0);
    const lock = await acquireQaExclusivityLock({
      redis: stream,
      envName: "staging",
      clock,
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "replay.group.probe",
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
    trackRunOwnedStreamId(ctx, {
      stream: ctx.streamNames.renderStream,
      id: enq.value.streamId,
      kind: "render",
    });
    await stream.qaXreadGroupInGroup({
      streamKey: ctx.streamNames.renderStream,
      group: created.group,
      consumerName: "gprobe",
      count: 1,
      blockMs: 0,
    });
    const first = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
      sessionGroup: created.group,
      groupAuthority: "qa",
      lockHandle: lock,
      lockClock: clock,
      ackSessionGroup: true,
    });
    assert.equal(first.ok, true);

    const orig = stream.qaXinfoGroups.bind(stream);
    stream.qaXinfoGroups = async () => ({
      ok: false,
      reasonId: "group_probe_failed",
    });
    const replay = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
      sessionGroup: created.group,
      groupAuthority: "qa",
      lockHandle: null,
      lockClock: clock,
      ackSessionGroup: true,
    });
    stream.qaXinfoGroups = orig;
    assert.equal(replay.ok, false);
    assert.equal(replay.ok ? "" : replay.reasonId, "group_probe_failed");
  });

  await test(
    "destroy returning zero plus probe failure cannot pass",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const clock = createFakeQaLockClock(0);
      const lock = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        clock,
      });
      assert.equal(lock.acquired, true);
      if (!lock.acquired) return;
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId: "destroy.zero.probe",
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
      trackRunOwnedStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: enq.value.streamId,
        kind: "render",
      });
      await stream.qaXreadGroupInGroup({
        streamKey: ctx.streamNames.renderStream,
        group: created.group,
        consumerName: "dzp",
        count: 1,
        blockMs: 0,
      });
      stream.qaXgroupDestroy = async () => false;
      stream.qaXinfoGroups = async () => ({
        ok: false,
        reasonId: "group_probe_failed",
      });
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: enq.value.streamId,
        kind: "render",
        sessionGroup: created.group,
        groupAuthority: "qa",
        lockHandle: lock,
        lockClock: clock,
        ackSessionGroup: true,
      });
      assert.equal(fin.ok, false);
      assert.equal(fin.ok ? "" : fin.reasonId, "group_probe_failed");
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    },
  );

  await test(
    "destroy returning success plus probe failure cannot pass",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const clock = createFakeQaLockClock(0);
      const lock = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        clock,
      });
      assert.equal(lock.acquired, true);
      if (!lock.acquired) return;
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId: "destroy.ok.probe",
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
      trackRunOwnedStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: enq.value.streamId,
        kind: "render",
      });
      await stream.qaXreadGroupInGroup({
        streamKey: ctx.streamNames.renderStream,
        group: created.group,
        consumerName: "dop",
        count: 1,
        blockMs: 0,
      });
      const origDestroy = stream.qaXgroupDestroy.bind(stream);
      stream.qaXgroupDestroy = async (...args) => {
        await origDestroy(...args);
        return true;
      };
      stream.qaXinfoGroups = async () => ({
        ok: false,
        reasonId: "group_probe_failed",
      });
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: enq.value.streamId,
        kind: "render",
        sessionGroup: created.group,
        groupAuthority: "qa",
        lockHandle: lock,
        lockClock: clock,
        ackSessionGroup: true,
      });
      assert.equal(fin.ok, false);
      assert.equal(fin.ok ? "" : fin.reasonId, "group_probe_failed");
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    },
  );

  await test("group creation cannot pass on probe failure", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    stream.qaXinfoGroups = async () => ({
      ok: false,
      reasonId: "group_probe_failed",
    });
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "create.probe.fail",
      kind: "render",
      ctx,
    });
    assert.equal(created.ok, false);
    assert.equal(
      created.ok ? "" : created.reasonId,
      "group_probe_failed",
    );
  });

  await test(
    "cursor snapshot cannot report absence/success on probe failure",
    async () => {
      const { stream } = buildCtx();
      await stream.ensureConsumerGroups();
      stream.qaXinfoGroups = async () => ({
        ok: false,
        reasonId: "group_probe_failed",
      });
      const snap = await snapshotQaGroupCursor({
        redis: stream,
        streamKey: stream.streamNames().renderStream,
        group: stream.streamNames().renderGroup,
      });
      assert.equal(snap.ok, false);
      assert.equal(snap.ok ? "" : snap.reasonId, "group_probe_failed");
    },
  );

  await test("cleanup cannot report clean on probe failure", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const group = "hfq:qa:render:cleanupprobefail00000000000001";
    trackQaGroup(ctx, group);
    // Finalize tracking as if case-finalized, then force probe failure.
    ctx.activeQaGroups.length = 0;
    ctx.finalizedQaGroups.push(group);
    stream.qaXinfoGroups = async () => ({
      ok: false,
      reasonId: "group_probe_failed",
    });
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "failed");
  });

  await test(
    "valid XINFO row interprets present; Memory/TCP empty-fail parity",
    async () => {
      const ok = interpretXinfoGroupsResponse([
        [
          "name",
          "hfq:render-workers",
          "consumers",
          1,
          "pending",
          0,
          "last-delivered-id",
          "0-0",
        ],
      ]);
      assert.equal(ok.ok, true);
      if (!ok.ok) return;
      assert.equal(ok.groups.length, 1);
      assert.deepEqual(interpretGroupPresence(ok, "hfq:render-workers"), {
        ok: true,
        present: true,
      });

      const tcp = new UpstashTcpStreamConsumerAdapter({ envName: "staging" });
      assert.deepEqual(await tcp.qaXinfoGroups("hfq:render:staging"), {
        ok: false,
        reasonId: "group_probe_failed",
      });
    },
  );

  console.log(`\n${passed}/${passed} exact group-presence fixtures passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
