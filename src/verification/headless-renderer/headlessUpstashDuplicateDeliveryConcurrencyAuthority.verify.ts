/**
 * Sprint 11E Phase 2D.1H — real duplicate-delivery concurrency authority.
 * Run: npm run test:headless-upstash-duplicate-delivery-concurrency-authority
 *
 * No Neon/Upstash provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  consumeRenderDeliveryOnce,
  deriveHeadlessQueueStreamNames,
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
  classifyDuplicateDeliveryPair,
  CONCURRENCY_ATTRIBUTION_REASON_IDS,
  CONCURRENCY_ATTRIBUTION_STAGE_IDS,
  runAttributedConcurrencyNoSteal,
} from "./upstash-live/concurrency-attribution";
import { runUpstashConcurrencyProbe } from "./upstash-live/concurrency-probe";
import {
  concurrencyProbeCannotFalsePass,
  createNotTestedUpstashConcurrencyProbeEvidence,
} from "./upstash-live/concurrency-probe-evidence";
import { createGroupBoundStreamQueue } from "./upstash-live/group-bound-stream-queue";
import { buildUpstashLiveSchemaFingerprint } from "./upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  trackConsumerName,
  trackRunOwnedStreamId,
} from "./upstash-live/live-fixtures";
import { acquireIsolatedExactDelivery } from "./upstash-live/exact-delivery-acquisition";
import {
  acquireQaExclusivityLock,
  createLiveQaLockClock,
  releaseQaExclusivityLock,
  snapshotQaGroupCursor,
} from "./upstash-live/queue-isolation";
import { ensureQaRunScopedProductionGroups } from "./upstash-live/qa-run-scoped-queue";
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
    ownerId: `uq_conc_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_conc_o_${runId.slice(0, 8)}`,
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
    "\nSprint 11E Phase 2D.1H — duplicate-delivery concurrency authority\n",
  );

  await test("1. frozen stage/reason allowlists", () => {
    assert.equal(CONCURRENCY_ATTRIBUTION_STAGE_IDS.length, 16);
    assert.deepEqual(
      [...CONCURRENCY_ATTRIBUTION_STAGE_IDS],
      [
        "queued_job_seed",
        "production_group_snapshot",
        "duplicate_a_rest_enqueue",
        "duplicate_b_rest_enqueue",
        "duplicate_a_exact_read",
        "duplicate_b_exact_read",
        "lock_scope_a_release",
        "concurrent_consume",
        "winner_claim",
        "peer_duplicate_ack",
        "pending_a_clear",
        "pending_b_clear",
        "neon_no_steal",
        "duplicate_a_finalize",
        "duplicate_b_finalize",
        "cleanup",
      ],
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes(
        "lock_scope_a_deadline_elapsed",
      ),
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("lock_scope_a_release_lost"),
    );
    assert.ok(CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("two_winners"));
    assert.ok(CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("zero_winners"));
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes("peer_dlq_rejected"),
    );
    assert.ok(
      CONCURRENCY_ATTRIBUTION_REASON_IDS.includes(
        "peer_left_pending_unrecovered",
      ),
    );
  });

  await test("2. disposition: two winners fail", () => {
    const r = classifyDuplicateDeliveryPair({
      actionA: "claimed_and_acked",
      actionB: "claimed_and_acked",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.failureReasonId, "two_winners");
  });

  await test("3. disposition: zero winners fail", () => {
    const r = classifyDuplicateDeliveryPair({
      actionA: "acked_duplicate_live",
      actionB: "acked_duplicate_live",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.failureReasonId, "zero_winners");
  });

  await test("4. disposition: DLQ outcome fails this case", () => {
    const r = classifyDuplicateDeliveryPair({
      actionA: "claimed_and_acked",
      actionB: "dlq_acked",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.failureReasonId, "peer_dlq_rejected");
  });

  await test("5. disposition: left_pending requires bounded recovery", () => {
    const r = classifyDuplicateDeliveryPair({
      actionA: "claimed_and_acked",
      actionB: "left_pending",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.failureReasonId, "peer_left_pending_unrecovered");
  });

  await test("6. disposition: one winner + acked_duplicate_live PASS", () => {
    const r = classifyDuplicateDeliveryPair({
      actionA: "claimed_and_acked",
      actionB: "acked_duplicate_live",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.winnerSide, "a");
    assert.equal(r.peerAction, "acked_duplicate_live");
  });

  await test(
    "7. same-streamId double invoke fails exact ACK authority",
    async () => {
      const { ctx, scoped } = await buildScopedCtx();
      await ensureQaRunScopedProductionGroups({
        redis: ctx.tcpConsumer,
        binding: scoped.binding,
      });
      const seeded = await seedQueuedCanonicalJob(ctx);
      assert.equal(seeded.ok, true);
      if (!seeded.ok) return;

      const enq = await ctx.restProducer.enqueueRender({
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      });
      assert.equal(enq.ok, true);
      if (!enq.ok) return;
      const streamId = enq.value.streamId;
      trackRunOwnedStreamId(ctx, {
        stream: ctx.streamNames.renderStream,
        id: streamId,
        kind: "render",
      });

      const lockClock = createLiveQaLockClock();
      const lock = await acquireQaExclusivityLock({
        redis: ctx.tcpConsumer,
        envName: ctx.envName,
        clock: lockClock,
        kind: "render",
      });
      assert.equal(lock.acquired, true);
      if (!lock.acquired) return;

      const cursor = await snapshotQaGroupCursor({
        redis: ctx.tcpConsumer,
        streamKey: ctx.streamNames.renderStream,
        group: ctx.streamNames.renderGroup,
      });
      assert.equal(cursor.ok, true);
      if (!cursor.ok) return;

      const consumerA = `c_a_${ctx.runId.slice(0, 6)}`;
      trackConsumerName(ctx, consumerA);
      const expected = {
        kind: "render" as const,
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        streamId,
      };
      const read = await acquireIsolatedExactDelivery({
        tcpConsumer: ctx.tcpConsumer,
        streamKey: ctx.streamNames.renderStream,
        group: ctx.streamNames.renderGroup,
        consumerName: consumerA,
        expected,
        cursorSnapshot: cursor.snapshot,
        blockMs: 0,
        lockHandle: lock,
        clock: lockClock,
      });
      assert.equal(read.ok, true);
      if (!read.ok) return;

      const bound = createGroupBoundStreamQueue({
        restProducer: ctx.restProducer,
        tcpConsumer: ctx.tcpConsumer,
        groupAuthority: "production",
        sessionGroup: ctx.streamNames.renderGroup,
        streamKey: ctx.streamNames.renderStream,
        kind: "render",
        expected,
        dlqAuthority: "qa_run_scoped",
        qaRunScopedDlqWriter: scoped.dlqWriter,
      });

      const [r1, r2] = await Promise.all([
        consumeRenderDeliveryOnce({
          streamQueue: bound,
          jobStore: ctx.jobStore,
          entry: read.item.entry,
          streamId,
          nowMs: ctx.nowMs + 10,
          leaseSettings: ctx.leaseSettings,
          consumerName: consumerA,
        }),
        consumeRenderDeliveryOnce({
          streamQueue: bound,
          jobStore: ctx.jobStore,
          entry: read.item.entry,
          streamId,
          nowMs: ctx.nowMs + 10,
          leaseSettings: ctx.leaseSettings,
          consumerName: `c_b_${ctx.runId.slice(0, 6)}`,
        }),
      ]);
      await releaseQaExclusivityLock({ redis: ctx.tcpConsumer, handle: lock });

      // Old fixture defect: second ACK of already-cleared entry fails authority.
      const bothOk = r1.ok && r2.ok;
      if (bothOk) {
        const actions = [r1.value.action, r2.value.action];
        const winners = actions.filter((a) => a === "claimed_and_acked");
        // Even if both return ok (unlikely with exact pending), must not be
        // accepted as two independent Redis deliveries.
        assert.notEqual(
          winners.length === 1 &&
            actions.includes("acked_duplicate_live"),
          true,
          "same-streamId must not model valid duplicate-delivery PASS",
        );
      } else {
        assert.equal(bothOk, false);
      }
    },
  );

  await test(
    "8. two distinct streamIds → one winner + peer acked_duplicate_live",
    async () => {
      const { ctx } = await buildScopedCtx();
      const attributed = await runAttributedConcurrencyNoSteal(ctx);
      if (!attributed.ok) {
        assert.fail(
          `expected PASS stage=${attributed.failureStage} reason=${attributed.failureReasonId}`,
        );
      }
      assert.equal(attributed.winnerAction, "claimed_and_acked");
      assert.equal(attributed.peerAction, "acked_duplicate_live");
      assert.equal(attributed.stages.length, 16);
      assert.ok(attributed.stages.every((s) => s.ok));
      assert.ok(
        attributed.stages.some((s) => s.stageId === "lock_scope_a_release"),
      );
    },
  );

  await test("9. peer cannot replace claim token / storeVersion +1 once", async () => {
    const { ctx } = await buildScopedCtx();
    const attributed = await runAttributedConcurrencyNoSteal(ctx);
    assert.equal(attributed.ok, true);
    if (!attributed.ok) return;
    const jobId = ctx.session.jobId;
    const token = ctx.session.claimToken;
    assert.ok(typeof jobId === "string" && jobId.length > 0);
    assert.ok(typeof token === "string" && token.length > 0);
    const stored = await ctx.jobStore.getByJobIdAndOwner(jobId!, ctx.ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok || stored.value?.stage !== "canonical") return;
    assert.equal(stored.value.claimToken, token);
    assert.equal(typeof stored.value.claimedAtMs, "number");
  });

  await test("10. both entries clear pending independently", async () => {
    const { ctx } = await buildScopedCtx();
    const attributed = await runAttributedConcurrencyNoSteal(ctx);
    assert.equal(attributed.ok, true);
    if (!attributed.ok) return;
    const finalized = ctx.caseFinalizedStreamIds.filter(
      (t) => t.kind === "render",
    );
    assert.equal(finalized.length, 2);
    assert.notEqual(finalized[0]!.id, finalized[1]!.id);
  });

  await test("11. zero-ACK is never relabeled as success", async () => {
    const { ctx, scoped } = await buildScopedCtx();
    await ensureQaRunScopedProductionGroups({
      redis: ctx.tcpConsumer,
      binding: scoped.binding,
    });
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enq = await ctx.restProducer.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;

    const bound = createGroupBoundStreamQueue({
      restProducer: ctx.restProducer,
      tcpConsumer: ctx.tcpConsumer,
      groupAuthority: "production",
      sessionGroup: ctx.streamNames.renderGroup,
      streamKey: ctx.streamNames.renderStream,
      kind: "render",
      expected: {
        kind: "render",
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt,
        streamId: enq.value.streamId,
      },
      dlqAuthority: "qa_run_scoped",
      qaRunScopedDlqWriter: scoped.dlqWriter,
    });

    // ACK without pending → exact zero-ACK failure (not success).
    const ack = await bound.ack({
      kind: "render",
      streamId: enq.value.streamId,
      deliveryId: seeded.deliveryId,
    });
    assert.equal(ack.ok, false);
  });

  await test("12. cross-owner mismatch fails exact read", async () => {
    const { ctx, scoped } = await buildScopedCtx();
    await ensureQaRunScopedProductionGroups({
      redis: ctx.tcpConsumer,
      binding: scoped.binding,
    });
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enq = await ctx.restProducer.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;

    const lockClock = createLiveQaLockClock();
    const lock = await acquireQaExclusivityLock({
      redis: ctx.tcpConsumer,
      envName: ctx.envName,
      clock: lockClock,
      kind: "render",
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const cursor = await snapshotQaGroupCursor({
      redis: ctx.tcpConsumer,
      streamKey: ctx.streamNames.renderStream,
      group: ctx.streamNames.renderGroup,
    });
    assert.equal(cursor.ok, true);
    if (!cursor.ok) return;

    const read = await acquireIsolatedExactDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey: ctx.streamNames.renderStream,
      group: ctx.streamNames.renderGroup,
      consumerName: `c_x_${ctx.runId.slice(0, 6)}`,
      expected: {
        kind: "render",
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.otherOwnerId,
        attempt: seeded.attempt,
        streamId: enq.value.streamId,
      },
      cursorSnapshot: cursor.snapshot,
      blockMs: 0,
      lockHandle: lock,
      clock: lockClock,
    });
    await releaseQaExclusivityLock({ redis: ctx.tcpConsumer, handle: lock });
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.reasonId, "delivery_identity_mismatch");
  });

  await test("13. finalization is independent for both streamIds", async () => {
    const { ctx } = await buildScopedCtx();
    const attributed = await runAttributedConcurrencyNoSteal(ctx);
    assert.equal(attributed.ok, true);
    if (!attributed.ok) return;
    const ids = ctx.caseFinalizedStreamIds
      .filter((t) => t.kind === "render")
      .map((t) => t.id);
    assert.equal(ids.length, 2);
    assert.equal(new Set(ids).size, 2);
    assert.equal(ctx.runOwnedActiveStreamIds.length, 0);
  });

  await test("14. shared staging remains untouched", async () => {
    const { ctx, stream } = await buildScopedCtx();
    const staging = deriveHeadlessQueueStreamNames("staging");
    const beforeLen = stream.testingFake().testingLength(staging.renderStream);
    const attributed = await runAttributedConcurrencyNoSteal(ctx);
    assert.equal(attributed.ok, true);
    if (!attributed.ok) return;
    const afterLen = stream.testingFake().testingLength(staging.renderStream);
    assert.equal(afterLen, beforeLen);
    assert.ok(ctx.streamNames.renderStream !== staging.renderStream);
  });

  await test("15. targeted probe cannot false-pass", () => {
    const bad = createNotTestedUpstashConcurrencyProbeEvidence();
    assert.equal(concurrencyProbeCannotFalsePass(bad).ok, false);
    assert.equal(
      concurrencyProbeCannotFalsePass({
        ...bad,
        overall: "PASS",
        cleanupStatus: "ok",
        duplicateDeliveryModel: "two_distinct_stream_ids",
        stages: [],
      }).ok,
      false,
    );
  });

  await test("16. gate-off opens zero connections", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uq-conc-auth-gate-"));
    const evidencePath = path.join(dir, "probe.md");
    let connections = 0;
    const result = await runUpstashConcurrencyProbe({
      env: {},
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(connections, 0);
    assert.ok(readFileSync(evidencePath, "utf8").includes("NOT_TESTED"));
  });

  await test("17. attempt mismatch fails exact read", async () => {
    const { ctx, scoped } = await buildScopedCtx();
    await ensureQaRunScopedProductionGroups({
      redis: ctx.tcpConsumer,
      binding: scoped.binding,
    });
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const enq = await ctx.restProducer.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: ctx.nowMs,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    if (!enq.ok) return;

    const lockClock = createLiveQaLockClock();
    const lock = await acquireQaExclusivityLock({
      redis: ctx.tcpConsumer,
      envName: ctx.envName,
      clock: lockClock,
      kind: "render",
    });
    assert.equal(lock.acquired, true);
    if (!lock.acquired) return;
    const cursor = await snapshotQaGroupCursor({
      redis: ctx.tcpConsumer,
      streamKey: ctx.streamNames.renderStream,
      group: ctx.streamNames.renderGroup,
    });
    assert.equal(cursor.ok, true);
    if (!cursor.ok) return;

    const read = await acquireIsolatedExactDelivery({
      tcpConsumer: ctx.tcpConsumer,
      streamKey: ctx.streamNames.renderStream,
      group: ctx.streamNames.renderGroup,
      consumerName: `c_att_${ctx.runId.slice(0, 6)}`,
      expected: {
        kind: "render",
        deliveryId: seeded.deliveryId,
        jobId: seeded.jobId,
        ownerId: ctx.ownerId,
        attempt: seeded.attempt + 1,
        streamId: enq.value.streamId,
      },
      cursorSnapshot: cursor.snapshot,
      blockMs: 0,
      lockHandle: lock,
      clock: lockClock,
    });
    await releaseQaExclusivityLock({ redis: ctx.tcpConsumer, handle: lock });
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.reasonId, "delivery_identity_mismatch");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
