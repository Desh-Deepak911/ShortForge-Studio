/**
 * Sprint 11E Phase 2D.1D.1 — group-bound queue mutation authority (deterministic).
 * Run: npm run test:headless-upstash-group-bound-queue-authority
 *
 * Proves QA-bound handles never mutate production PEL and production-bound
 * handles never mutate QA PEL. No provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  consumeRenderDeliveryOnce,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { createGroupBoundStreamQueue } from "../upstash-live/group-bound-stream-queue";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  trackConsumerName,
  trackRunOwnedStreamId,
} from "../upstash-live/live-fixtures";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
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

type DualPending = {
  streamId: string;
  deliveryId: string;
  jobId: string;
  ownerId: string;
  attempt: number;
  qaGroup: string;
  prodGroup: string;
  renderStream: string;
};

/**
 * Put the same stream entry into pending state in both production and QA groups.
 */
async function seedDualPending(
  ctx: UpstashLiveMatrixContext,
  stream: MemoryHeadlessStreamQueueAdapter,
  caseId: string,
): Promise<DualPending> {
  await stream.ensureConsumerGroups();
  const created = await createQaCaseConsumerGroup({
    redis: stream,
    streamKey: ctx.streamNames.renderStream,
    runId: ctx.runId,
    caseId,
    kind: "render",
    ctx,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("qa_group_create_failed");

  const seeded = await seedQueuedCanonicalJob(ctx);
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed_failed");

  const enqueued = await stream.enqueueRender({
    deliveryId: seeded.deliveryId,
    jobId: seeded.jobId,
    ownerId: ctx.ownerId,
    attempt: seeded.attempt,
    enqueuedAtMs: ctx.nowMs,
    deliveryKind: "render",
  });
  assert.equal(enqueued.ok, true);
  if (!enqueued.ok) throw new Error("enqueue_failed");

  trackRunOwnedStreamId(ctx, {
    stream: ctx.streamNames.renderStream,
    id: enqueued.value.streamId,
    kind: "render",
  });

  const prodConsumer = `uq_prod_${caseId.slice(0, 8)}`;
  const qaConsumer = `uq_qa_${caseId.slice(0, 8)}`;
  trackConsumerName(ctx, prodConsumer);
  trackConsumerName(ctx, qaConsumer);

  const prodRead = await stream.readGroup({
    kind: "render",
    consumerName: prodConsumer,
    count: 1,
    blockMs: 0,
  });
  assert.equal(prodRead.ok && prodRead.value.length === 1, true);
  if (!prodRead.ok) throw new Error("prod_read_failed");
  assert.equal(prodRead.value[0]!.streamId, enqueued.value.streamId);

  const qaRead = await stream.qaXreadGroupInGroup({
    streamKey: ctx.streamNames.renderStream,
    group: created.group,
    consumerName: qaConsumer,
    count: 1,
    blockMs: 0,
  });
  assert.equal(qaRead.ok && qaRead.items.length === 1, true);
  if (!qaRead.ok) throw new Error("qa_read_failed");
  assert.equal(qaRead.items[0]!.streamId, enqueued.value.streamId);

  assert.deepEqual(
    await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      ctx.streamNames.renderGroup,
      enqueued.value.streamId,
    ),
    { ok: true, pending: true },
  );
  assert.deepEqual(
    await stream.qaProbePendingInGroup(
      ctx.streamNames.renderStream,
      created.group,
      enqueued.value.streamId,
    ),
    { ok: true, pending: true },
  );

  return {
    streamId: enqueued.value.streamId,
    deliveryId: seeded.deliveryId,
    jobId: seeded.jobId,
    ownerId: ctx.ownerId,
    attempt: seeded.attempt,
    qaGroup: created.group,
    prodGroup: ctx.streamNames.renderGroup,
    renderStream: ctx.streamNames.renderStream,
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1D.1 — group-bound queue mutation authority\n",
  );

  await test(
    "1. same entry pending in production + case-scoped QA group",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "dual.seed");
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.prodGroup,
          dual.streamId,
        ),
        { ok: true, pending: true },
      );
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.qaGroup,
          dual.streamId,
        ),
        { ok: true, pending: true },
      );
    },
  );

  await test(
    "2. QA-bound consume clears QA pending; production pending unchanged",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "qa.consume");
      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: dual.qaGroup,
        streamKey: dual.renderStream,
        kind: "render",
        expected: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          streamId: dual.streamId,
        },
        dlqAuthority: "production_env",
      });
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: ctx.jobStore,
        entry: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        },
        streamId: dual.streamId,
        nowMs: ctx.nowMs + 10,
        leaseSettings: ctx.leaseSettings,
        consumerName: `uq_qa_c_${ctx.runId.slice(0, 8)}`,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.qaGroup,
          dual.streamId,
        ),
        { ok: true, pending: false },
      );
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.prodGroup,
          dual.streamId,
        ),
        { ok: true, pending: true },
      );
    },
  );

  await test(
    "3. production-bound consume clears production pending; QA unchanged",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "prod.consume");
      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "production",
        sessionGroup: dual.prodGroup,
        streamKey: dual.renderStream,
        kind: "render",
        expected: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          streamId: dual.streamId,
        },
        dlqAuthority: "production_env",
      });
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: ctx.jobStore,
        entry: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        },
        streamId: dual.streamId,
        nowMs: ctx.nowMs + 10,
        leaseSettings: ctx.leaseSettings,
        consumerName: `uq_prod_c_${ctx.runId.slice(0, 8)}`,
      });
      assert.equal(result.ok, true);
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.prodGroup,
          dual.streamId,
        ),
        { ok: true, pending: false },
      );
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          dual.renderStream,
          dual.qaGroup,
          dual.streamId,
        ),
        { ok: true, pending: true },
      );
    },
  );

  await test("4. QA readGroup never invokes production readGroup", async () => {
    const { ctx, stream } = buildCtx();
    const dual = await seedDualPending(ctx, stream, "qa.read");
    let prodReads = 0;
    const original = stream.readGroup.bind(stream);
    stream.readGroup = async (i) => {
      prodReads += 1;
      return original(i);
    };
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: dual.qaGroup,
      streamKey: dual.renderStream,
      kind: "render",
      expected: {
        deliveryId: dual.deliveryId,
        jobId: dual.jobId,
        ownerId: dual.ownerId,
        attempt: dual.attempt,
        streamId: dual.streamId,
      },
        dlqAuthority: "production_env",
      });
    // Re-seed another entry for QA-only unread after dual-pending consume setup.
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    // New QA group for a fresh unread (dual group's cursor already past prior entry).
    const caseId = "qa.read.fresh";
    const created = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId,
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
    const freshBound = createGroupBoundStreamQueue({
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
    prodReads = 0;
    const read = await freshBound.readGroup({
      kind: "render",
      consumerName: `uq_r_${ctx.runId.slice(0, 8)}`,
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.value.length, 1);
    assert.equal(read.value[0]!.streamId, enq.value.streamId);
    assert.equal(prodReads, 0);
    void dual;
    void bound;
  });

  await test(
    "5. QA autoClaimIdle never invokes production autoClaimIdle",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "qa.autoclaim");
      let prodClaims = 0;
      const original = stream.autoClaimIdle.bind(stream);
      stream.autoClaimIdle = async (i) => {
        prodClaims += 1;
        return original(i);
      };
      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: dual.qaGroup,
        streamKey: dual.renderStream,
        kind: "render",
        expected: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          streamId: dual.streamId,
        },
        dlqAuthority: "production_env",
      });
      prodClaims = 0;
      const claimed = await bound.autoClaimIdle({
        kind: "render",
        consumerName: `uq_ac_${ctx.runId.slice(0, 8)}`,
        minIdleMs: 0,
        count: 1,
      });
      assert.equal(claimed.ok, true);
      if (!claimed.ok) return;
      assert.equal(prodClaims, 0);
      assert.equal(
        claimed.value.some((i) => i.streamId === dual.streamId),
        true,
      );
    },
  );

  await test("6. QA ACK returning zero cannot PASS", async () => {
    const { ctx, stream } = buildCtx();
    const dual = await seedDualPending(ctx, stream, "qa.zeroack");
    // Clear QA pending first so subsequent bound ACK sees zero.
    assert.equal(
      await stream.qaXackInGroup(dual.renderStream, dual.qaGroup, dual.streamId),
      true,
    );
    const bound = createGroupBoundStreamQueue({
      restProducer: stream,
      tcpConsumer: stream,
      groupAuthority: "qa",
      sessionGroup: dual.qaGroup,
      streamKey: dual.renderStream,
      kind: "render",
      expected: {
        deliveryId: dual.deliveryId,
        jobId: dual.jobId,
        ownerId: dual.ownerId,
        attempt: dual.attempt,
        streamId: dual.streamId,
      },
        dlqAuthority: "production_env",
      });
    const ack = await bound.ack({
      kind: "render",
      streamId: dual.streamId,
      deliveryId: dual.deliveryId,
    });
    assert.equal(ack.ok, false);
  });

  await test(
    "7. production ACK returning zero cannot PASS (pending-clear required)",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "prod.zeroack");
      assert.equal(
        await stream.qaXackInGroup(
          dual.renderStream,
          dual.prodGroup,
          dual.streamId,
        ),
        true,
      );
      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "production",
        sessionGroup: dual.prodGroup,
        streamKey: dual.renderStream,
        kind: "render",
        expected: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          streamId: dual.streamId,
        },
        dlqAuthority: "production_env",
      });
      const ack = await bound.ack({
        kind: "render",
        streamId: dual.streamId,
        deliveryId: dual.deliveryId,
      });
      assert.equal(ack.ok, false);
    },
  );

  await test(
    "8. DLQ flow ACKs only session group; other group unchanged",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const caseId = "dlq.session";
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId,
        kind: "render",
        ctx,
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;

      const forgedJobId = "job_missing_for_dlq_bound";
      const forgedDeliveryId = stableHeadlessDeliveryId(forgedJobId, 1);
      const forgedId = await stream.qaXaddRaw(ctx.streamNames.renderStream, {
        deliveryId: forgedDeliveryId,
        jobId: forgedJobId,
        ownerId: ctx.ownerId,
        attempt: "1",
        enqueuedAtMs: String(ctx.nowMs),
        deliveryKind: "render",
      });
      assert.ok(forgedId != null);
      if (forgedId == null) return;
      trackRunOwnedStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: forgedId,
        kind: "render",
      });

      const prodConsumer = `uq_dlq_prod_${ctx.runId.slice(0, 8)}`;
      const qaConsumer = `uq_dlq_qa_${ctx.runId.slice(0, 8)}`;
      trackConsumerName(ctx, prodConsumer);
      trackConsumerName(ctx, qaConsumer);

      const prodRead = await stream.readGroup({
        kind: "render",
        consumerName: prodConsumer,
        count: 1,
        blockMs: 0,
      });
      assert.equal(prodRead.ok && prodRead.value.length === 1, true);

      const qaRead = await stream.qaXreadGroupInGroup({
        streamKey: ctx.streamNames.renderStream,
        group: created.group,
        consumerName: qaConsumer,
        count: 1,
        blockMs: 0,
      });
      assert.equal(qaRead.ok && qaRead.items.length === 1, true);

      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: created.group,
        streamKey: ctx.streamNames.renderStream,
        kind: "render",
        expected: {
          deliveryId: forgedDeliveryId,
          jobId: forgedJobId,
          ownerId: ctx.ownerId,
          attempt: 1,
          streamId: forgedId,
        },
        dlqAuthority: "production_env",
      });
      const result = await consumeRenderDeliveryOnce({
        streamQueue: bound,
        jobStore: ctx.jobStore,
        entry: {
          deliveryId: forgedDeliveryId,
          jobId: forgedJobId,
          ownerId: ctx.ownerId,
          attempt: 1,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        },
        streamId: forgedId,
        nowMs: ctx.nowMs + 10,
        leaseSettings: ctx.leaseSettings,
        consumerName: qaConsumer,
      });
      assert.equal(result.ok && result.value.action === "dlq_acked", true);
      assert.ok(stream.testingFake().testingLength(ctx.streamNames.renderDlq) >= 1);
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          ctx.streamNames.renderStream,
          created.group,
          forgedId,
        ),
        { ok: true, pending: false },
      );
      assert.deepEqual(
        await stream.qaProbePendingInGroup(
          ctx.streamNames.renderStream,
          ctx.streamNames.renderGroup,
          forgedId,
        ),
        { ok: true, pending: true },
      );
    },
  );

  await test("9. lock loss prevents all group mutations", async () => {
    const { ctx, stream } = buildCtx();
    const { acquireIsolatedCaseDelivery } = await import(
      "../upstash-live/case-delivery-authority"
    );
    let mutations = 0;
    const origAck = stream.qaXackInGroup.bind(stream);
    const origRead = stream.qaXreadGroupInGroup.bind(stream);
    stream.qaXackInGroup = async (...args) => {
      mutations += 1;
      return origAck(...args);
    };
    stream.qaXreadGroupInGroup = async (i) => {
      mutations += 1;
      return origRead(i);
    };
    const acquired = await acquireIsolatedCaseDelivery({
      ctx,
      caseId: "lock.loss.mut",
      kind: "render",
      consumerLabel: "lockloss",
      groupAuthority: "qa",
      forceLockLostBeforeRead: true,
      mintDelivery: async () => {
        const seeded = await seedQueuedCanonicalJob(ctx);
        if (!seeded.ok) return { ok: false, reasonId: "delivery_enqueue_failed" };
        const enq = await stream.enqueueRender({
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        });
        if (!enq.ok) return { ok: false, reasonId: "delivery_enqueue_failed" };
        trackRunOwnedStreamId(ctx, {
          stream: ctx.streamNames.renderStream,
          id: enq.value.streamId,
          kind: "render",
        });
        return {
          ok: true,
          expected: {
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            streamId: enq.value.streamId,
          },
        };
      },
    });
    assert.equal(acquired.ok, false);
    if (acquired.ok) return;
    assert.equal(acquired.reasonId, "queue_lock_lost");
    assert.equal(mutations, 0);
  });

  await test(
    "10. cleanup only touches run-owned entries and tracked QA groups",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "cleanup.owned");
      const foreignJobId = "job_foreign_cleanup_bound";
      const foreign = await stream.enqueueRender({
        deliveryId: stableHeadlessDeliveryId(foreignJobId, 1),
        jobId: foreignJobId,
        ownerId: ctx.ownerId,
        attempt: 1,
        enqueuedAtMs: ctx.nowMs - 10,
        deliveryKind: "render",
      });
      assert.equal(foreign.ok, true);
      if (!foreign.ok) return;
      const foreignRead = await stream.readGroup({
        kind: "render",
        consumerName: "foreign_cleanup_owner",
        count: 1,
        blockMs: 0,
      });
      assert.equal(foreignRead.ok && foreignRead.value.length === 1, true);
      // Clear dual pending on both groups so cleanup can XDEL owned.
      await stream.qaXackInGroup(dual.renderStream, dual.qaGroup, dual.streamId);
      await stream.qaXackInGroup(dual.renderStream, dual.prodGroup, dual.streamId);

      const cleanup = await defaultUpstashLiveCleanup(ctx, false);
      assert.equal(cleanup, "ok");
      assert.equal(
        stream.testingFake().testingHasEntry(dual.renderStream, dual.streamId),
        false,
      );
      assert.equal(
        stream.testingFake().testingHasEntry(
          ctx.streamNames.renderStream,
          foreign.value.streamId,
        ),
        true,
      );
      assert.equal(
        stream.testingFake().testingPendingOwner(
          ctx.streamNames.renderStream,
          ctx.streamNames.renderGroup,
          foreign.value.streamId,
        ),
        "foreign_cleanup_owner",
      );
      // Tracked QA group destroyed; production group remains.
      const list = await stream.qaXinfoGroups(ctx.streamNames.renderStream);
      assert.equal(list.ok, true);
      if (!list.ok) return;
      assert.equal(
        list.groups.some((g) => g.name === dual.qaGroup),
        false,
      );
      assert.equal(
        list.groups.some((g) => g.name === ctx.streamNames.renderGroup),
        true,
      );
      assert.ok(ctx.trackedQaGroups.includes(dual.qaGroup));
      assert.ok(!ctx.trackedQaGroups.includes(ctx.streamNames.renderGroup));
    },
  );

  await test(
    "11. source-boundary rejects production ACK/read/autoclaim inside QA branch",
    async () => {
      const { ctx, stream } = buildCtx();
      const dual = await seedDualPending(ctx, stream, "src.boundary");
      let prodAck = 0;
      let prodRead = 0;
      let prodClaim = 0;
      let qaXackProdHelper = 0;
      const origAck = stream.ack.bind(stream);
      const origRead = stream.readGroup.bind(stream);
      const origClaim = stream.autoClaimIdle.bind(stream);
      const origQaXack = stream.qaXack.bind(stream);
      stream.ack = async (i) => {
        prodAck += 1;
        return origAck(i);
      };
      stream.readGroup = async (i) => {
        prodRead += 1;
        return origRead(i);
      };
      stream.autoClaimIdle = async (i) => {
        prodClaim += 1;
        return origClaim(i);
      };
      stream.qaXack = async (kind, streamId) => {
        qaXackProdHelper += 1;
        return origQaXack(kind, streamId);
      };

      const bound = createGroupBoundStreamQueue({
        restProducer: stream,
        tcpConsumer: stream,
        groupAuthority: "qa",
        sessionGroup: dual.qaGroup,
        streamKey: dual.renderStream,
        kind: "render",
        expected: {
          deliveryId: dual.deliveryId,
          jobId: dual.jobId,
          ownerId: dual.ownerId,
          attempt: dual.attempt,
          streamId: dual.streamId,
        },
        onProductionAck: () => {
          throw new Error("QA branch must not call production ack hook");
        },
        onProductionReadGroup: () => {
          throw new Error("QA branch must not call production read hook");
        },
        onProductionAutoClaimIdle: () => {
          throw new Error("QA branch must not call production autoclaim hook");
        },
        dlqAuthority: "production_env",
      });

      prodAck = 0;
      prodRead = 0;
      prodClaim = 0;
      qaXackProdHelper = 0;

      const ack = await bound.ack({
        kind: "render",
        streamId: dual.streamId,
        deliveryId: dual.deliveryId,
      });
      assert.equal(ack.ok, true);
      const claim = await bound.autoClaimIdle({
        kind: "render",
        consumerName: `uq_src_${ctx.runId.slice(0, 8)}`,
        minIdleMs: 0,
        count: 1,
      });
      assert.equal(claim.ok, true);

      assert.equal(prodAck, 0);
      assert.equal(prodRead, 0);
      assert.equal(prodClaim, 0);
      assert.equal(qaXackProdHelper, 0);
    },
  );

  console.log(`\n${passed}/11 group-bound queue authority fixtures passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
