/**
 * Sprint 11E Phase 2D.1E — case-local lifecycle authority (deterministic).
 * Run: npm run test:headless-upstash-case-local-lifecycle-authority
 *
 * No provider contact. Proves case-local finalize, stream presence probes,
 * canonical prefix isolation, matrix residue rules, and claim/ACK boundaries.
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
  interpretExactXrangeResponse,
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

import { acquireIsolatedCaseDelivery } from "./upstash-live/case-delivery-authority";
import {
  finalizeIsolatedCaseDelivery,
  finalizeUnreadRunOwnedEntry,
} from "./upstash-live/case-delivery-finalize";
import {
  CLAIM_ACK_ATTRIBUTION_REASON_IDS,
  CLAIM_ACK_ATTRIBUTION_STAGE_IDS,
  runAttributedClaimAckConsume,
} from "./upstash-live/claim-ack-attribution";
import { defaultUpstashLiveCleanup } from "./upstash-live/cleanup";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  hasNoActiveRunOwnedRenderEntries,
  seedQueuedCanonicalJob,
  seedStagingOwnedObject,
  trackRunOwnedStreamId,
} from "./upstash-live/live-fixtures";
import {
  DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
  runUpstashLiveMatrix,
} from "./upstash-live/live-matrix";
import {
  acquireQaExclusivityLock,
  createFakeQaLockClock,
  createQaCaseConsumerGroup,
  QA_LOCK_SAFE_DEADLINE_MS,
} from "./upstash-live/queue-isolation";
import { REQUIRED_UPSTASH_LIVE_CASE_IDS } from "./upstash-live/required-cases";
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

function configuredEnv(): Record<string, string> {
  return {
    HEADLESS_ENV_NAME: "staging",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token_value_0123456789",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    DATABASE_URL:
      "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
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
    env: configuredEnv(),
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

function assertZeroActiveRunOwned(ctx: UpstashLiveMatrixContext): void {
  assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
}

const CANONICAL_PREFIX_CASES = [
  "enqueue.render",
  "enqueue.verify",
  "group.create",
  "read.group",
  "consume.claim.ack",
] as const;

const FINALIZE_SOURCE_MARKERS = [
  "finalizeIsolatedCaseDelivery",
  "finalizeUnreadRunOwnedEntry",
  "runAttributedClaimAckConsume",
  "runAttributedTerminalNoopConsume",
  "runAttributedDuplicateLiveConsume",
  "runAttributedDlqMalformed",
  "runAttributedConcurrencyNoSteal",
] as const;

function runnerSegmentFinalizes(segment: string): boolean {
  return FINALIZE_SOURCE_MARKERS.some((marker) => segment.includes(marker));
}

const MINTING_CASES_REQUIRING_FINALIZE = [
  "enqueue.render",
  "enqueue.verify",
  "read.group",
  "consume.claim.ack",
  "consume.terminal.noop",
  "consume.duplicate.live",
  "consume.leave.pending",
  "autoclaim.idle",
  "recover.render.expired",
  "recover.verify.expired",
  "dlq.malformed",
  "trim.maxlen",
  "concurrency.no.steal",
] as const;

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1E — case-local lifecycle authority\n",
  );

  await test(
    "canonical prefix runners PASS with zero active between cases and production intact",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const finalizedRenderIds: string[] = [];

      for (const caseId of CANONICAL_PREFIX_CASES) {
        if (caseId === "consume.claim.ack") {
          assert.equal(hasNoActiveRunOwnedRenderEntries(ctx), true);
          for (const id of finalizedRenderIds) {
            const probe = await stream.qaProbeStreamEntry(
              ctx.streamNames.renderStream,
              id,
            );
            assert.deepEqual(probe, { ok: true, present: false });
          }
          assert.equal(ctx.activeQaGroups.length, 0);
        }

        const runner = DEFAULT_UPSTASH_LIVE_CASE_RUNNERS[caseId];
        const result = await runner(ctx);
        assert.equal(result.status, "PASS", `${caseId} must PASS`);
        assertZeroActiveRunOwned(ctx);

        if (caseId === "read.group" && ctx.session.renderStreamId != null) {
          finalizedRenderIds.push(ctx.session.renderStreamId);
        }
      }

      const list = await stream.qaXinfoGroups(ctx.streamNames.renderStream);
      assert.equal(list.ok, true);
      if (!list.ok) return;
      assert.ok(
        list.groups.some((g) => g.name === ctx.streamNames.renderGroup),
        "production render group must remain",
      );
      assert.equal(
        list.groups.some((g) => g.name.startsWith("hfq:qa:render:")),
        false,
        "QA case groups must be destroyed",
      );
    },
  );

  await test("case finalization is idempotent on already-finalized entry", async () => {
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
    const first = await finalizeUnreadRunOwnedEntry({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
    });
    assert.equal(first.ok, true);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
    const second = await finalizeUnreadRunOwnedEntry({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: enq.value.streamId,
      kind: "render",
    });
    assert.equal(second.ok, true);
    assert.equal(ctx.caseFinalizedStreamIds.length, 1);
  });

  await test(
    "XDEL zero/wrong ID and probe failure cannot apply markCaseFinalized",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId: "xdel.block",
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
        consumerName: "xdel_c",
        count: 1,
        blockMs: 0,
      });
      const clock = createFakeQaLockClock(0);
      const lock = await acquireQaExclusivityLock({
        redis: stream,
        envName: "staging",
        clock,
      });
      assert.equal(lock.acquired, true);
      if (!lock.acquired) return;

      const origXdel = stream.qaXdel.bind(stream);
      stream.qaXdel = async () => 0;
      const zeroDel = await finalizeIsolatedCaseDelivery({
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
      assert.equal(zeroDel.ok, false);
      assert.equal(zeroDel.ok ? "" : zeroDel.reasonId, "stream_xdel_failed");
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
      assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
      stream.qaXdel = origXdel;

      const origProbe = stream.qaProbeStreamEntry.bind(stream);
      stream.qaProbeStreamEntry = async () => ({
        ok: false,
        reasonId: "stream_presence_probe_failed",
      });
      const probeFail = await finalizeIsolatedCaseDelivery({
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
      assert.equal(probeFail.ok, false);
      assert.equal(
        probeFail.ok ? "" : probeFail.reasonId,
        "stream_presence_probe_failed",
      );
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
      stream.qaProbeStreamEntry = origProbe;
    },
  );

  await test("lock loss blocks finalization mutation", async () => {
    const { ctx } = buildCtx();
    const clock = createFakeQaLockClock(0);
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const acquired = await acquireIsolatedCaseDelivery({
      ctx,
      caseId: "lock.loss",
      kind: "render",
      consumerLabel: "lock",
      groupAuthority: "qa",
      qaLockClock: clock,
      mintDelivery: async () => {
        const enqueued = await ctx.restProducer.enqueueRender({
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        });
        if (!enqueued.ok) {
          return { ok: false, reasonId: "delivery_enqueue_failed" };
        }
        return {
          ok: true,
          expected: {
            kind: "render",
            deliveryId: seeded.deliveryId,
            jobId: seeded.jobId,
            ownerId: ctx.ownerId,
            attempt: seeded.attempt,
            streamId: enqueued.value.streamId,
          },
        };
      },
    });
    assert.equal(acquired.ok, true);
    if (!acquired.ok) return;
    clock.setMs(QA_LOCK_SAFE_DEADLINE_MS + 1);
    const fin = await finalizeIsolatedCaseDelivery({
      ctx,
      streamKey: acquired.streamKey,
      streamId: acquired.item.streamId,
      kind: "render",
      sessionGroup: acquired.group,
      groupAuthority: "qa",
      lockHandle: acquired.lockHandle,
      lockClock: clock,
      ackSessionGroup: true,
    });
    assert.equal(fin.ok, false);
    assert.equal(fin.ok ? "" : fin.reasonId, "queue_lock_lost");
    assert.equal(
      ctx.caseFinalizedStreamIds.some((t) => t.id === acquired.item.streamId),
      false,
    );
    await acquired.releaseLock();
  });

  await test(
    "exception before finalize leaves entry active for global cleanup",
    async () => {
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
      const orig = stream.qaXdel.bind(stream);
      stream.qaXdel = async () => {
        throw new Error("forced_finalize_exception");
      };
      let result: Awaited<ReturnType<typeof finalizeUnreadRunOwnedEntry>>;
      try {
        result = await finalizeUnreadRunOwnedEntry({
          ctx,
          streamKey: ctx.streamNames.renderStream,
          streamId: enq.value.streamId,
          kind: "render",
        });
      } finally {
        stream.qaXdel = orig;
      }
      // Provider XDEL throw must fail closed — entry stays active for global cleanup.
      assert.equal(result.ok, false);
      assert.equal(result.ok ? "" : result.reasonId, "stream_xdel_failed");
      assert.equal(ctx.runOwnedActiveStreamIds.length, 1);
      assert.equal(ctx.caseFinalizedStreamIds.length, 0);
      const cleanup = await defaultUpstashLiveCleanup(ctx, false);
      assert.equal(cleanup, "ok");
      const probe = await stream.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        enq.value.streamId,
      );
      assert.deepEqual(probe, { ok: true, present: false });
    },
  );

  await test(
    "global cleanup clears active entries and finalized remain absent",
    async () => {
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
      const finalized = await finalizeUnreadRunOwnedEntry({
        ctx,
        streamKey: ctx.streamNames.renderStream,
        streamId: enq.value.streamId,
        kind: "render",
      });
      assert.equal(finalized.ok, true);
      assert.equal(ctx.runOwnedActiveStreamIds.length, 0);

      const activeSeeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(activeSeeded.ok, true);
      if (!activeSeeded.ok) return;
      const activeEnq = await stream.enqueueRender({
        deliveryId: activeSeeded.deliveryId,
        jobId: activeSeeded.jobId,
        ownerId: ctx.ownerId,
        attempt: activeSeeded.attempt,
        enqueuedAtMs: ctx.nowMs + 1,
        deliveryKind: "render",
      });
      assert.equal(activeEnq.ok, true);
      if (!activeEnq.ok) return;
      trackRunOwnedStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: activeEnq.value.streamId,
        kind: "render",
      });
      const cleanup = await defaultUpstashLiveCleanup(ctx, false);
      assert.equal(cleanup, "ok");
      const activeProbe = await stream.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        activeEnq.value.streamId,
      );
      assert.deepEqual(activeProbe, { ok: true, present: false });
      const finProbe = await stream.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        enq.value.streamId,
      );
      assert.deepEqual(finProbe, { ok: true, present: false });
    },
  );

  await test(
    ">100 unrelated PEL entries do not affect exact stream presence probes",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const created = await createQaCaseConsumerGroup({
        redis: stream,
        streamKey: ctx.streamNames.renderStream,
        runId: ctx.runId,
        caseId: "large.pel.presence",
        kind: "render",
        ctx,
      });
      assert.equal(created.ok, true);
      if (!created.ok) return;
      for (let i = 0; i < 105; i++) {
        const seeded = await seedQueuedCanonicalJob(ctx);
        assert.equal(seeded.ok, true);
        if (!seeded.ok) return;
        const enq = await stream.enqueueRender({
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          enqueuedAtMs: ctx.nowMs + i,
          deliveryKind: "render",
        });
        assert.equal(enq.ok, true);
        if (!enq.ok) return;
        await stream.qaXreadGroupInGroup({
          streamKey: ctx.streamNames.renderStream,
          group: created.group,
          consumerName: `filler_${i}`,
          count: 1,
          blockMs: 0,
        });
      }
      const expected = await seedQueuedCanonicalJob(ctx);
      assert.equal(expected.ok, true);
      if (!expected.ok) return;
      const target = await stream.enqueueRender({
        deliveryId: expected.deliveryId,
        jobId: expected.jobId,
        ownerId: ctx.ownerId,
        attempt: expected.attempt,
        enqueuedAtMs: ctx.nowMs + 200,
        deliveryKind: "render",
      });
      assert.equal(target.ok, true);
      if (!target.ok) return;
      const probe = await stream.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        target.value.streamId,
      );
      assert.deepEqual(probe, { ok: true, present: true });
      const scan = await stream.testingFake().xrange(
        ctx.streamNames.renderStream,
        target.value.streamId,
        target.value.streamId,
        "COUNT",
        1,
      );
      assert.ok(Array.isArray(scan));
      assert.equal(scan.length, 1);
    },
  );

  await test("render and verify stream finalization remain isolated", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const renderSeeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(renderSeeded.ok, true);
    if (!renderSeeded.ok) return;
    const renderEnq = await stream.enqueueRender({
      deliveryId: renderSeeded.deliveryId,
      jobId: renderSeeded.jobId,
      ownerId: ctx.ownerId,
      attempt: renderSeeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(renderEnq.ok, true);
    if (!renderEnq.ok) return;
    trackRunOwnedStreamId(ctx, {
      stream: ctx.streamNames.renderStream,
      id: renderEnq.value.streamId,
      kind: "render",
    });

    const verifyOwned = await seedStagingOwnedObject(ctx);
    assert.equal(verifyOwned.ok, true);
    if (!verifyOwned.ok) return;
    const verifyEnq = await stream.enqueueVerify({
      deliveryId: verifyOwned.deliveryId,
      ownedObjectId: verifyOwned.objectId,
      ownerId: ctx.ownerId,
      attempt: verifyOwned.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "verify",
    });
    assert.equal(verifyEnq.ok, true);
    if (!verifyEnq.ok) return;
    trackRunOwnedStreamId(ctx, {
      stream: ctx.streamNames.verifyStream,
      id: verifyEnq.value.streamId,
      kind: "verify",
    });

    const finRender = await finalizeUnreadRunOwnedEntry({
      ctx,
      streamKey: ctx.streamNames.renderStream,
      streamId: renderEnq.value.streamId,
      kind: "render",
    });
    assert.equal(finRender.ok, true);
    const verifyProbe = await stream.qaProbeStreamEntry(
      ctx.streamNames.verifyStream,
      verifyEnq.value.streamId,
    );
    assert.deepEqual(verifyProbe, { ok: true, present: true });
    const renderProbe = await stream.qaProbeStreamEntry(
      ctx.streamNames.renderStream,
      renderEnq.value.streamId,
    );
    assert.deepEqual(renderProbe, { ok: true, present: false });
  });

  await test(
    "full 22-case DEFAULT matrix leaves zero run-owned active between PASS cases",
    async () => {
      const { ctx } = buildCtx();
      const wrappedRunners = Object.fromEntries(
        REQUIRED_UPSTASH_LIVE_CASE_IDS.map((id) => [
          id,
          async (runCtx: UpstashLiveMatrixContext) => {
            const result = await DEFAULT_UPSTASH_LIVE_CASE_RUNNERS[id](runCtx);
            if (result.status === "PASS") {
              assertZeroActiveRunOwned(runCtx);
            }
            return result;
          },
        ]),
      ) as typeof DEFAULT_UPSTASH_LIVE_CASE_RUNNERS;
      const cases = await runUpstashLiveMatrix(ctx, wrappedRunners);
      assert.equal(cases.length, 22);
      const passCount = cases.filter((c) => c.status === "PASS").length;
      assert.ok(passCount >= CANONICAL_PREFIX_CASES.length);
      void cases;
    },
  );

  await test(
    "source-boundary requires finalize calls before PASS in minting DEFAULT runners",
    () => {
      const source = readFileSync(
        path.join(
          process.cwd(),
          "src/verification/headless-renderer/upstash-live/live-matrix.ts",
        ),
        "utf8",
      );
      const idx = source.indexOf("DEFAULT_UPSTASH_LIVE_CASE_RUNNERS");
      assert.ok(idx >= 0);
      const block = source.slice(idx);
      const end = block.indexOf("\n});");
      const body = end >= 0 ? block.slice(0, end) : block;
      assert.ok(body.includes("finalizeIsolatedCaseDelivery"));
      assert.ok(body.includes("finalizeUnreadRunOwnedEntry"));

      for (const caseId of MINTING_CASES_REQUIRING_FINALIZE) {
        const marker = `"${caseId}": async`;
        const start = body.indexOf(marker);
        assert.ok(start >= 0, `${caseId} runner block missing`);
        const passToken = `return pass("${caseId}")`;
        const passIdx = body.indexOf(passToken, start);
        assert.ok(passIdx >= 0, `${caseId} must return pass`);
        const segment = body.slice(start, passIdx);
        assert.ok(
          runnerSegmentFinalizes(segment),
          `${caseId} must call case-local finalize before PASS`,
        );
      }
    },
  );

  await test(
    "claim/ACK attribution allowlists present; prior_run_entry_not_finalized when active render exists",
    async () => {
      assert.equal(CLAIM_ACK_ATTRIBUTION_STAGE_IDS.length, 10);
      assert.equal(CLAIM_ACK_ATTRIBUTION_REASON_IDS.length, 14);
      assert.ok(
        CLAIM_ACK_ATTRIBUTION_REASON_IDS.includes(
          "prior_run_entry_not_finalized",
        ),
      );

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
      const blocked = await runAttributedClaimAckConsume(ctx);
      assert.equal(blocked.ok, false);
      if (blocked.ok) return;
      assert.equal(blocked.failureReasonId, "prior_run_entry_not_finalized");
    },
  );

  await test(
    "interpretExactXrangeResponse present/absent/malformed/probe failure",
    async () => {
      assert.deepEqual(interpretExactXrangeResponse(null, "1-0"), {
        ok: false,
        reasonId: "stream_presence_probe_failed",
      });
      assert.deepEqual(interpretExactXrangeResponse("bad", "1-0"), {
        ok: false,
        reasonId: "stream_presence_probe_failed",
      });
      assert.deepEqual(interpretExactXrangeResponse([], "1-0"), {
        ok: true,
        present: false,
      });
      assert.deepEqual(
        interpretExactXrangeResponse(
          [
            ["1-0", ["f", "v"]],
            ["2-0", ["f", "v"]],
          ],
          "1-0",
        ),
        { ok: false, reasonId: "stream_presence_probe_failed" },
      );
      assert.deepEqual(
        interpretExactXrangeResponse([["2-0", ["f", "v"]]], "1-0"),
        { ok: false, reasonId: "stream_presence_probe_failed" },
      );
      assert.deepEqual(
        interpretExactXrangeResponse([["1-0", ["f", "v"]]], "1-0"),
        { ok: true, present: true },
      );

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
      const mem = await stream.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        enq.value.streamId,
      );
      const tcp = new UpstashTcpStreamConsumerAdapter({
        envName: "staging",
        client: createFakeIoredisLike(stream.testingFake()),
      });
      const tcpProbe = await tcp.qaProbeStreamEntry(
        ctx.streamNames.renderStream,
        enq.value.streamId,
      );
      assert.deepEqual(mem, tcpProbe);
      assert.deepEqual(mem, { ok: true, present: true });
      const orig = stream.testingFake().xrange.bind(stream.testingFake());
      stream.testingFake().xrange = async () => {
        throw new Error("forced_xrange_throw");
      };
      try {
        const failProbe = await stream.qaProbeStreamEntry(
          ctx.streamNames.renderStream,
          enq.value.streamId,
        );
        assert.deepEqual(failProbe, {
          ok: false,
          reasonId: "stream_presence_probe_failed",
        });
      } finally {
        stream.testingFake().xrange = orig;
      }
      await tcp.close?.();
    },
  );

  await test(
    "foreign entry preceding claim yields queue_precondition_not_isolated without mutating foreign",
    async () => {
      const { ctx, stream } = buildCtx();
      await stream.ensureConsumerGroups();
      const foreignJob = `job_foreign_claim_${ctx.runId.slice(0, 8)}`;
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
      assert.equal(hasNoActiveRunOwnedRenderEntries(ctx), true);

      const result = await runAttributedClaimAckConsume(ctx);
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.failureReasonId, "queue_precondition_not_isolated");
      assert.equal(
        stream.testingFake().testingHasEntry(
          ctx.streamNames.renderStream,
          foreign.value.streamId,
        ),
        true,
      );
      assert.equal(
        ctx.runOwnedStreamIds.some((t) => t.id === foreign.value.streamId),
        false,
      );
    },
  );

  console.log(`\n${passed}/${passed} passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
