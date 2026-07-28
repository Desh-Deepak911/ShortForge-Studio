/**
 * Sprint 11E Phase 2D.1E.1 / 2D.1E.2 / 2D.1E.3 — finalization commit + atomic
 * tracking + exact replay authority (deterministic).
 * Run: npm run test:headless-upstash-finalize-commit-authority
 *
 * No provider contact. Proves fail-closed lock release → atomic tracking commit,
 * ownership checkpoints before ACK/XDEL/group-destroy, exact replay rules,
 * truthful cleanup, and fail-closed remote stream/pending/group probe failures.
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
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import {
  commitCaseFinalizationTracking,
  finalizeIsolatedCaseDelivery,
  finalizeUnreadRunOwnedEntry,
  preflightCaseFinalizationTracking,
  validateFinalizeAuthorityShape,
} from "../upstash-live/case-delivery-finalize";
import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  trackDlqId,
  trackQaGroup,
  trackRunOwnedStreamId,
} from "../upstash-live/live-fixtures";
import {
  acquireQaExclusivityLock,
  createFakeQaLockClock,
  createQaCaseConsumerGroup,
  QA_LOCK_SAFE_DEADLINE_MS,
  qaRenderLockKey,
  type QaLockHandle,
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

async function seedPendingQaDelivery(input: {
  readonly ctx: UpstashLiveMatrixContext;
  readonly stream: MemoryHeadlessStreamQueueAdapter;
  readonly caseId: string;
}): Promise<{
  readonly streamId: string;
  readonly group: string;
  readonly lockHandle: QaLockHandle;
  readonly clock: ReturnType<typeof createFakeQaLockClock>;
}> {
  const { ctx, stream, caseId } = input;
  await stream.ensureConsumerGroups();
  const clock = createFakeQaLockClock(0);
  const lock = await acquireQaExclusivityLock({
    redis: stream,
    envName: "staging",
    clock,
  });
  assert.equal(lock.acquired, true);
  if (!lock.acquired) throw new Error("lock");
  const created = await createQaCaseConsumerGroup({
    redis: stream,
    streamKey: ctx.streamNames.renderStream,
    runId: ctx.runId,
    caseId,
    kind: "render",
    ctx,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("group");
  const seeded = await seedQueuedCanonicalJob(ctx);
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed");
  const enq = await stream.enqueueRender({
    deliveryId: seeded.deliveryId,
    jobId: seeded.jobId,
    ownerId: ctx.ownerId,
    attempt: seeded.attempt,
    enqueuedAtMs: ctx.nowMs,
    deliveryKind: "render",
  });
  assert.equal(enq.ok, true);
  if (!enq.ok) throw new Error("enq");
  trackRunOwnedStreamId(ctx, {
    stream: ctx.streamNames.renderStream,
    id: enq.value.streamId,
    kind: "render",
  });
  const read = await stream.qaXreadGroupInGroup({
    streamKey: ctx.streamNames.renderStream,
    group: created.group,
    consumerName: `c_${caseId.slice(0, 8)}`,
    count: 1,
    blockMs: 0,
  });
  assert.equal(read.ok, true);
  return {
    streamId: enq.value.streamId,
    group: created.group,
    lockHandle: lock,
    clock,
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1E.2 — finalization commit + atomic tracking authority\n",
  );

  await test("1. release deleted → finalized exactly once", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.deleted",
    });
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    assert.equal(fin.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    assert.equal(ctx.caseFinalizedStreamIds[0]!.id, prep.streamId);
    assert.equal(
      stream.testingFake().testingGetString(qaRenderLockKey("staging")),
      null,
    );
    const replay = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    assert.equal(replay.ok, true);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
  });

  await test("2. release lost → queue_lock_lost; active remains", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.lost",
    });
    const orig = stream.qaCompareAndDeleteLock.bind(stream);
    stream.qaCompareAndDeleteLock = async () => "not_owner";
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaCompareAndDeleteLock = orig;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test("3. release error → queue_lock_release_failed; active remains", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.error",
    });
    const orig = stream.qaCompareAndDeleteLock.bind(stream);
    stream.qaCompareAndDeleteLock = async () => "error";
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaCompareAndDeleteLock = orig;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_release_failed");
    assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test("4. successor lock survives stale owner release", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.successor",
    });
    const key = qaRenderLockKey("staging");
    // Replace lock with a successor token before finalize release.
    await stream.qaDelKey(key);
    const successorToken = randomUUID();
    const held = await stream.qaSetNxPx(key, successorToken, 30_000);
    assert.equal(held, true);
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    assert.equal(
      stream.testingFake().testingGetString(key),
      successorToken,
    );
  });

  await test("5. tracking transition false → finalize_tracking_failed", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.track",
    });
    const orig = stream.qaCompareAndDeleteLock.bind(stream);
    stream.qaCompareAndDeleteLock = async (key, token) => {
      const outcome = await orig(key, token);
      // Steal active ownership after release deleted — mark must fail closed.
      ctx.runOwnedActiveStreamIds.length = 0;
      return outcome;
    };
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaCompareAndDeleteLock = orig;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "finalize_tracking_failed");
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test("6. deadline expires before ACK → zero ACK/XDEL/destroy", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.ack.deadline",
    });
    let acks = 0;
    let xdels = 0;
    let destroys = 0;
    const origAck = stream.qaXackInGroup.bind(stream);
    const origXdel = stream.qaXdel.bind(stream);
    const origDestroy = stream.qaXgroupDestroy.bind(stream);
    stream.qaXackInGroup = async (...args) => {
      acks += 1;
      return origAck(...args);
    };
    stream.qaXdel = async (...args) => {
      xdels += 1;
      return origXdel(...args);
    };
    stream.qaXgroupDestroy = async (...args) => {
      destroys += 1;
      return origDestroy(...args);
    };
    prep.clock.setMs(QA_LOCK_SAFE_DEADLINE_MS + 1);
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaXackInGroup = origAck;
    stream.qaXdel = origXdel;
    stream.qaXgroupDestroy = origDestroy;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(acks, 0);
    assert.equal(xdels, 0);
    assert.equal(destroys, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test("7. deadline expires before XDEL → zero XDEL/destroy", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.xdel.deadline",
    });
    // Clear pending first so ACK path is skipped; expire before XDEL checkpoint.
    assert.equal(
      await stream.qaXackInGroup(
        ctx.streamNames.renderStream,
        prep.group,
        prep.streamId,
      ),
      true,
    );
    let xdels = 0;
    let destroys = 0;
    const origProbe = stream.qaProbePendingInGroup.bind(stream);
    const origXdel = stream.qaXdel.bind(stream);
    const origDestroy = stream.qaXgroupDestroy.bind(stream);
    stream.qaProbePendingInGroup = async (...args) => {
      const r = await origProbe(...args);
      prep.clock.setMs(QA_LOCK_SAFE_DEADLINE_MS + 1);
      return r;
    };
    stream.qaXdel = async (...args) => {
      xdels += 1;
      return origXdel(...args);
    };
    stream.qaXgroupDestroy = async (...args) => {
      destroys += 1;
      return origDestroy(...args);
    };
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    stream.qaProbePendingInGroup = origProbe;
    stream.qaXdel = origXdel;
    stream.qaXgroupDestroy = origDestroy;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(xdels, 0);
    assert.equal(destroys, 0);
  });

  await test("8. deadline expires before group destroy → zero destroy", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.destroy.deadline",
    });
    assert.equal(
      await stream.qaXackInGroup(
        ctx.streamNames.renderStream,
        prep.group,
        prep.streamId,
      ),
      true,
    );
    let destroys = 0;
    const origXdel = stream.qaXdel.bind(stream);
    const origDestroy = stream.qaXgroupDestroy.bind(stream);
    stream.qaXdel = async (...args) => {
      const n = await origXdel(...args);
      prep.clock.setMs(QA_LOCK_SAFE_DEADLINE_MS + 1);
      return n;
    };
    stream.qaXgroupDestroy = async (...args) => {
      destroys += 1;
      return origDestroy(...args);
    };
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    stream.qaXdel = origXdel;
    stream.qaXgroupDestroy = origDestroy;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(destroys, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    // Entry may already be deleted — remain active/unconfirmed.
    assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
  });

  await test("9. exact pending/stream probe error cannot finalize", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.probe",
    });
    const origPending = stream.qaProbePendingInGroup.bind(stream);
    stream.qaProbePendingInGroup = async () => ({
      ok: false,
      reasonId: "pending_probe_failed",
    });
    const pendingFail = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaProbePendingInGroup = origPending;
    assert.equal(pendingFail.ok, false);
    assert.equal(
      pendingFail.ok ? "" : pendingFail.reasonId,
      "pending_probe_failed",
    );
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);

    assert.equal(
      await stream.qaXackInGroup(
        ctx.streamNames.renderStream,
        prep.group,
        prep.streamId,
      ),
      true,
    );
    const origPresence = stream.qaProbeStreamEntry.bind(stream);
    let xdelDone = false;
    const origXdel = stream.qaXdel.bind(stream);
    stream.qaXdel = async (...args) => {
      xdelDone = true;
      return origXdel(...args);
    };
    stream.qaProbeStreamEntry = async () => ({
      ok: false,
      reasonId: "stream_presence_probe_failed",
    });
    const presenceFail = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    stream.qaProbeStreamEntry = origPresence;
    stream.qaXdel = origXdel;
    assert.equal(xdelDone, true);
    assert.equal(presenceFail.ok, false);
    assert.equal(
      presenceFail.ok ? "" : presenceFail.reasonId,
      "stream_presence_probe_failed",
    );
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test(
    "10. idempotent finalized replay validates stream/pending/group/tracking",
    async () => {
      const { ctx, stream } = buildCtx();
      const prep = await seedPendingQaDelivery({
        ctx,
        stream,
        caseId: "commit.replay",
      });
      const first = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: prep.lockHandle,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      assert.equal(first.ok, true);

      // Read-only idempotent replay: no lock required; stream/pending/group/tracking.
      const okReplay = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      assert.equal(okReplay.ok, true);
      assert.equal(ctx.caseFinalizedStreamIds.length, 1);

      // Corrupt: put stream back → replay must fail closed (not treat as absent).
      await stream.qaXaddRaw(ctx.streamNames.renderStream, {
        deliveryId: "dlv:replay:1",
        jobId: "job_replay",
        ownerId: ctx.ownerId,
        attempt: "1",
        enqueuedAtMs: String(ctx.nowMs),
        deliveryKind: "render",
      });
      // Force presence probe to report the finalized id present.
      const origPresence = stream.qaProbeStreamEntry.bind(stream);
      stream.qaProbeStreamEntry = async (sk, id) => {
        if (id === prep.streamId) return { ok: true, present: true };
        return origPresence(sk, id);
      };
      const bad = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: null,
        groupAuthority: "none",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: false,
      });
      stream.qaProbeStreamEntry = origPresence;
      assert.equal(bad.ok, false);
      assert.equal(bad.ok ? "" : bad.reasonId, "stream_still_present");
    },
  );

  await test("11. unread groupAuthority:none path remains valid", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
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
    const fin = await finalizeUnreadRunOwnedEntry({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
    });
    assert.equal(fin.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
  });

  await test("12. incoherent group/session/lock combinations fail closed", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
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
    const qaNoLock = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
      sessionGroup: "hfq:qa:render:deadbeef",
      groupAuthority: "qa",
      lockHandle: null,
      lockClock: { nowMs: () => ctx.nowMs },
      ackSessionGroup: true,
    });
    assert.equal(qaNoLock.ok, false);
    assert.equal(
      qaNoLock.ok ? "" : qaNoLock.reasonId,
      "finalize_ownership_invalid",
    );

    const noneWithGroup = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
      sessionGroup: ctx.streamNames.renderGroup,
      groupAuthority: "none",
      lockHandle: null,
      lockClock: { nowMs: () => ctx.nowMs },
      ackSessionGroup: false,
    });
    assert.equal(noneWithGroup.ok, false);
    assert.equal(
      noneWithGroup.ok ? "" : noneWithGroup.reasonId,
      "finalize_ownership_invalid",
    );

    const prodNoLock = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
      sessionGroup: ctx.streamNames.renderGroup,
      groupAuthority: "production",
      lockHandle: null,
      lockClock: { nowMs: () => ctx.nowMs },
      ackSessionGroup: false,
      expectPendingAlreadyCleared: true,
    });
    assert.equal(prodNoLock.ok, false);
    assert.equal(
      prodNoLock.ok ? "" : prodNoLock.reasonId,
      "finalize_ownership_invalid",
    );
    assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
  });

  await test("13. global cleanup treats uncommitted finalization truthfully", async () => {
    const { ctx, stream } = buildCtx();
    const prep = await seedPendingQaDelivery({
      ctx,
      stream,
      caseId: "commit.cleanup",
    });
    const orig = stream.qaCompareAndDeleteLock.bind(stream);
    stream.qaCompareAndDeleteLock = async () => "error";
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: prep.streamId,
      kind: "render",
      sessionGroup: prep.group,
      groupAuthority: "qa",
      lockHandle: prep.lockHandle,
      lockClock: prep.clock,
      ackSessionGroup: true,
    });
    stream.qaCompareAndDeleteLock = orig;
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_release_failed");
    // Uncommitted: still active; must not claim finalized from XDEL alone.
    assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
    assert.equal(ctx.caseFinalizedStreamIds.length, 0);
    // Stream entry may already be gone — cleanup must still reconcile via probes.
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "ok");
    const presence = await stream.qaProbeStreamEntry(
      ctx.streamNames.renderStream,
      prep.streamId,
    );
    assert.deepEqual(presence, { ok: true, present: false });
  });

  // --- 2D.1E.2 atomic tracking + exact replay ---

  await test(
    "14. stream-valid/group-invalid → zero tracking mutations",
    async () => {
      const { ctx } = buildCtx();
      const entry = {
        stream: ctx.streamNames.renderStream,
        id: "1-0",
        kind: "render" as const,
      };
      trackRunOwnedStreamId(ctx, entry);
      const qaGroup = "hfq:qa:render:atomictest00000000000000000001";
      // Group missing from active → invalid.
      const beforeActive = ctx.runOwnedActiveStreamIds.length;
      const beforeFinal = ctx.caseFinalizedStreamIds.length;
      const beforeGActive = ctx.activeQaGroups.length;
      const beforeGFinal = ctx.finalizedQaGroups.length;
      const pre = preflightCaseFinalizationTracking({
        ctx,
        entry,
        qaGroup,
      });
      assert.equal(pre.ok, false);
      const commit = commitCaseFinalizationTracking({
        ctx,
        entry,
        qaGroup,
      });
      assert.equal(commit.ok, false);
      assert.equal(ctx.runOwnedActiveStreamIds.length, beforeActive);
      assert.equal(ctx.caseFinalizedStreamIds.length, beforeFinal);
      assert.equal(ctx.activeQaGroups.length, beforeGActive);
      assert.equal(ctx.finalizedQaGroups.length, beforeGFinal);
    },
  );

  await test(
    "15. group-valid/stream-invalid → zero tracking mutations",
    async () => {
      const { ctx } = buildCtx();
      const entry = {
        stream: ctx.streamNames.renderStream,
        id: "1-1",
        kind: "render" as const,
      };
      const qaGroup = "hfq:qa:render:atomictest00000000000000000002";
      trackQaGroup(ctx, qaGroup);
      // Stream not active.
      const beforeGActive = [...ctx.activeQaGroups];
      const commit = commitCaseFinalizationTracking({
        ctx,
        entry,
        qaGroup,
      });
      assert.equal(commit.ok, false);
      assert.deepEqual(ctx.activeQaGroups, beforeGActive);
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
      assert.equal(ctx.finalizedQaGroups.length, 0);
    },
  );

  await test("16. successful QA commit moves stream+group exactly once", async () => {
    const { ctx } = buildCtx();
    const entry = {
      stream: ctx.streamNames.renderStream,
      id: "1-2",
      kind: "render" as const,
    };
    const qaGroup = "hfq:qa:render:atomictest00000000000000000003";
    trackRunOwnedStreamId(ctx, entry);
    trackQaGroup(ctx, qaGroup);
    const commit = commitCaseFinalizationTracking({
      ctx,
      entry,
      qaGroup,
    });
    assert.equal(commit.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    assert.equal(ctx.activeQaGroups.length, 0);
    assert.equal(ctx.finalizedQaGroups.length, 1);
    assert.equal(ctx.finalizedQaGroups[0], qaGroup);
    // Second commit fails closed (no longer active).
    const again = commitCaseFinalizationTracking({ ctx, entry, qaGroup });
    assert.equal(again.ok, false);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    assert.equal(ctx.finalizedQaGroups.length, 1);
  });

  await test("17. successful production commit moves only the stream", async () => {
    const { ctx } = buildCtx();
    const entry = {
      stream: ctx.streamNames.renderStream,
      id: "1-3",
      kind: "render" as const,
    };
    const qaGroup = "hfq:qa:render:atomictest00000000000000000004";
    trackRunOwnedStreamId(ctx, entry);
    trackQaGroup(ctx, qaGroup);
    const commit = commitCaseFinalizationTracking({
      ctx,
      entry,
      qaGroup: null,
    });
    assert.equal(commit.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    assert.equal(ctx.activeQaGroups.length, 1);
    assert.equal(ctx.finalizedQaGroups.length, 0);
  });

  await test("18. successful none/unread commit moves only the stream", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
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
    trackQaGroup(ctx, "hfq:qa:render:atomictest00000000000000000005");
    const fin = await finalizeUnreadRunOwnedEntry({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
    });
    assert.equal(fin.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    assert.equal(ctx.activeQaGroups.length, 1);
    assert.equal(ctx.finalizedQaGroups.length, 0);
  });

  await test("19. duplicate active/finalized entries fail closed", async () => {
    const { ctx } = buildCtx();
    const entry = {
      stream: ctx.streamNames.renderStream,
      id: "1-4",
      kind: "render" as const,
    };
    ctx.runOwnedActiveStreamIds.push(entry, { ...entry });
    const dupActive = commitCaseFinalizationTracking({
      ctx,
      entry,
      qaGroup: null,
    });
    assert.equal(dupActive.ok, false);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 2);

    ctx.runOwnedActiveStreamIds.length = 0;
    ctx.caseFinalizedStreamIds.push(entry, { ...entry });
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: entry.stream,
      streamId: entry.id,
      kind: "render",
      sessionGroup: null,
      groupAuthority: "none",
      lockHandle: null,
      lockClock: { nowMs: () => ctx.nowMs },
      ackSessionGroup: false,
    });
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "finalize_tracking_failed");
  });

  await test(
    "20. replay with QA group in neither tracking collection fails",
    async () => {
      const { ctx, stream } = buildCtx();
      const entry = {
        stream: ctx.streamNames.renderStream,
        id: "1-5",
        kind: "render" as const,
      };
      const qaGroup = "hfq:qa:render:atomictest00000000000000000006";
      ctx.caseFinalizedStreamIds.push(entry);
      // Group neither active nor finalized.
      const replay = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: entry.stream,
        streamId: entry.id,
        kind: "render",
        sessionGroup: qaGroup,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: { nowMs: () => ctx.nowMs },
        ackSessionGroup: true,
      });
      assert.equal(replay.ok, false);
      assert.equal(replay.ok ? "" : replay.reasonId, "finalize_tracking_failed");
      void stream;
    },
  );

  await test("21. replay with QA group still active fails", async () => {
    const { ctx } = buildCtx();
    const entry = {
      stream: ctx.streamNames.renderStream,
      id: "1-6",
      kind: "render" as const,
    };
    const qaGroup = "hfq:qa:render:atomictest00000000000000000007";
    ctx.caseFinalizedStreamIds.push(entry);
    trackQaGroup(ctx, qaGroup);
    const replay = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: entry.stream,
      streamId: entry.id,
      kind: "render",
      sessionGroup: qaGroup,
      groupAuthority: "qa",
      lockHandle: null,
      lockClock: { nowMs: () => ctx.nowMs },
      ackSessionGroup: true,
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.ok ? "" : replay.reasonId, "finalize_tracking_failed");
  });

  await test(
    "22. replay with QA group finalized exactly once passes",
    async () => {
      const { ctx, stream } = buildCtx();
      const prep = await seedPendingQaDelivery({
        ctx,
        stream,
        caseId: "replay.ok",
      });
      const first = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: prep.lockHandle,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      assert.equal(first.ok, true);
      assert.equal(ctx.finalizedQaGroups.length, 1);
      const replay = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      assert.equal(replay.ok, true);
    },
  );

  await test(
    "23. QA authority paired with production/non-QA group fails",
    async () => {
      const { ctx } = buildCtx();
      const shape = validateFinalizeAuthorityShape({
        ctx,
        kind: "render",
        sessionGroup: ctx.streamNames.renderGroup,
        groupAuthority: "qa",
        requireLock: false,
        lockHandle: null,
      });
      assert.equal(shape?.ok, false);
      assert.equal(shape?.ok === false ? shape.reasonId : "", "finalize_ownership_invalid");
      const shape2 = validateFinalizeAuthorityShape({
        ctx,
        kind: "render",
        sessionGroup: "not-a-qa-group",
        groupAuthority: "qa",
        requireLock: false,
        lockHandle: null,
      });
      assert.equal(shape2?.ok, false);
    },
  );

  await test(
    "24. production authority paired with QA/arbitrary group fails",
    async () => {
      const { ctx } = buildCtx();
      const qa = validateFinalizeAuthorityShape({
        ctx,
        kind: "render",
        sessionGroup: "hfq:qa:render:deadbeefdeadbeefdeadbeefdeadbeef",
        groupAuthority: "production",
        requireLock: false,
        lockHandle: null,
      });
      assert.equal(qa?.ok, false);
      assert.equal(qa?.ok === false ? qa.reasonId : "", "finalize_ownership_invalid");
      const wrongProd = validateFinalizeAuthorityShape({
        ctx,
        kind: "render",
        sessionGroup: ctx.streamNames.verifyGroup,
        groupAuthority: "production",
        requireLock: false,
        lockHandle: null,
      });
      assert.equal(wrongProd?.ok, false);
    },
  );

  await test("25. none authority paired with a session group fails", async () => {
    const { ctx } = buildCtx();
    const shape = validateFinalizeAuthorityShape({
      ctx,
      kind: "render",
      sessionGroup: "hfq:qa:render:deadbeefdeadbeefdeadbeefdeadbeef",
      groupAuthority: "none",
      requireLock: false,
      lockHandle: null,
    });
    assert.equal(shape?.ok, false);
    assert.equal(
      shape?.ok === false ? shape.reasonId : "",
      "finalize_ownership_invalid",
    );
  });

  await test(
    "26. remote stream/pending/group probe failures all fail replay",
    async () => {
      const { ctx, stream } = buildCtx();
      const prep = await seedPendingQaDelivery({
        ctx,
        stream,
        caseId: "replay.probe",
      });
      const first = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: prep.lockHandle,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      assert.equal(first.ok, true);

      const origPresence = stream.qaProbeStreamEntry.bind(stream);
      stream.qaProbeStreamEntry = async () => ({
        ok: false,
        reasonId: "stream_presence_probe_failed",
      });
      const streamFail = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      stream.qaProbeStreamEntry = origPresence;
      assert.equal(streamFail.ok, false);
      assert.equal(
        streamFail.ok ? "" : streamFail.reasonId,
        "stream_presence_probe_failed",
      );

      const origPending = stream.qaProbePendingInGroup.bind(stream);
      stream.qaProbePendingInGroup = async () => ({
        ok: false,
        reasonId: "pending_probe_failed",
      });
      const pendingFail = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      stream.qaProbePendingInGroup = origPending;
      assert.equal(pendingFail.ok, false);
      assert.equal(
        pendingFail.ok ? "" : pendingFail.reasonId,
        "pending_probe_failed",
      );

      const origGroups = stream.qaXinfoGroups.bind(stream);
      stream.qaXinfoGroups = async () => ({
        ok: false,
        reasonId: "group_probe_failed",
      });
      const groupFail = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: null,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      stream.qaXinfoGroups = origGroups;
      assert.equal(groupFail.ok, false);
      assert.equal(
        groupFail.ok ? "" : groupFail.reasonId,
        "group_probe_failed",
      );
    },
  );

  await test(
    "27. DLQ tracking removed only after atomic commit succeeds",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const dlqId = await stream.qaXaddRaw(ctx.streamNames.renderDlq, {
        deliveryId: "dlv:job_dlq:1",
        jobId: "job_dlq",
        ownerId: ctx.ownerId,
        attempt: "1",
        class: "malformed_unauthorized",
        enqueuedAtMs: String(ctx.nowMs),
        reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
      });
      assert.ok(dlqId != null && dlqId.length > 0);
      const entry = {
        stream: ctx.streamNames.renderDlq,
        id: dlqId!,
        kind: "render-dlq" as const,
      };
      trackRunOwnedStreamId(ctx, entry);
      trackDlqId(ctx, entry);
      // Force tracking preflight failure (duplicate active) — DLQ must remain.
      ctx.runOwnedActiveStreamIds.push({ ...entry });
      const fail = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: entry.stream,
        streamId: entry.id,
        kind: "render-dlq",
        sessionGroup: null,
        groupAuthority: "none",
        lockHandle: null,
        lockClock: { nowMs: () => ctx.nowMs },
        ackSessionGroup: false,
      });
      assert.equal(fail.ok, false);
      assert.equal(ctx.trackedDlqIds.length, 1);

      ctx.runOwnedActiveStreamIds.length = 0;
      trackRunOwnedStreamId(ctx, entry);
      const ok = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: entry.stream,
        streamId: entry.id,
        kind: "render-dlq",
        sessionGroup: null,
        groupAuthority: "none",
        lockHandle: null,
        lockClock: { nowMs: () => ctx.nowMs },
        ackSessionGroup: false,
      });
      assert.equal(ok.ok, true);
      assert.equal(ctx.trackedDlqIds.length, 0);
      assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    },
  );

  await test(
    "28. post-release tracking failure leaves no partial stream/group finalize",
    async () => {
      const { ctx, stream } = buildCtx();
      const prep = await seedPendingQaDelivery({
        ctx,
        stream,
        caseId: "post.release.track",
      });
      const orig = stream.qaCompareAndDeleteLock.bind(stream);
      stream.qaCompareAndDeleteLock = async (key, token) => {
        const outcome = await orig(key, token);
        // Corrupt group tracking after release deleted — atomic commit must fail
        // without moving the stream alone.
        ctx.activeQaGroups.length = 0;
        return outcome;
      };
      const fin = await finalizeIsolatedCaseDelivery({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: prep.streamId,
        kind: "render",
        sessionGroup: prep.group,
        groupAuthority: "qa",
        lockHandle: prep.lockHandle,
        lockClock: prep.clock,
        ackSessionGroup: true,
      });
      stream.qaCompareAndDeleteLock = orig;
      assert.equal(fin.ok, false);
      assert.equal(fin.ok ? "" : fin.reasonId, "finalize_tracking_failed");
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
      assert.equal(ctx.finalizedQaGroups.length, 0);
    },
  );

  console.log(`\n${passed}/${passed} passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
