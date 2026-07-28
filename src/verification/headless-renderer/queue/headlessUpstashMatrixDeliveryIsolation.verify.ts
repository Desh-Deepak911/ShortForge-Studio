/**
 * Sprint 11E Phase 2D.1D — universal matrix delivery isolation (deterministic).
 * Run: npm run test:headless-upstash-matrix-delivery-isolation
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { createCountingJobStore } from "../upstash-live/counting-job-store";
import { acquireIsolatedCaseDelivery } from "../upstash-live/case-delivery-authority";
import { runAttributedDuplicateLiveConsume } from "../upstash-live/duplicate-live-attribution";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
  seedStagingOwnedObject,
} from "../upstash-live/live-fixtures";
import {
  DEFAULT_UPSTASH_LIVE_CASE_RUNNERS,
  runUpstashLiveMatrix,
} from "../upstash-live/live-matrix";
import { progressiveCannotFalsePass } from "../upstash-live/progressive-evidence";
import {
  createFakeQaLockClock,
  createQaCaseConsumerGroup,
  qaCaseGroupName,
  qaRenderGroupName,
  QA_LOCK_SAFE_DEADLINE_MS,
} from "../upstash-live/queue-isolation";
import { assertDefaultUpstashLiveRunnersAreNotStubs } from "../upstash-live/stub-boundary";
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
    "\nSprint 11E Phase 2D.1D — Upstash matrix delivery isolation\n",
  );

  await test("qaCaseGroupName uses full runId+caseId digest (not 8-char)", () => {
    const runId = randomUUID();
    const caseId = "consume.duplicate.live";
    const name = qaCaseGroupName(runId, caseId, "render");
    assert.ok(name.startsWith("hfq:qa:render:"));
    assert.equal(name.includes(runId.slice(0, 8)), false);
    const expected = createHash("sha256")
      .update(runId, "utf8")
      .update("\0", "utf8")
      .update(caseId, "utf8")
      .update("\0", "utf8")
      .update("render", "utf8")
      .digest("hex")
      .slice(0, 32);
    assert.equal(name, `hfq:qa:render:${expected}`);
    const other = qaCaseGroupName(runId, "read.group", "render");
    assert.notEqual(name, other);
    assert.notEqual(qaRenderGroupName(runId), name);
  });

  await test("BUSYGROUP fail-closed on case group recreate", async () => {
    const { ctx, stream } = buildCtx();
    const first = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "read.group",
      kind: "render",
      ctx,
    });
    assert.equal(first.ok, true);
    const second = await createQaCaseConsumerGroup({
      redis: stream,
      streamKey: ctx.streamNames.renderStream,
      runId: ctx.runId,
      caseId: "read.group",
      kind: "render",
      ctx,
    });
    assert.equal(second.ok, false);
  });

  await test("isolated case delivery exact identity PASS", async () => {
    const { ctx } = buildCtx();
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const acquired = await acquireIsolatedCaseDelivery({
      ctx,
      caseId: "read.group",
      kind: "render",
      consumerLabel: "iso",
      groupAuthority: "qa",
      mintDelivery: async () => {
        const enqueued = await ctx.restProducer.enqueueRender({
          deliveryId: seeded.deliveryId,
          jobId: seeded.jobId,
          ownerId: ctx.ownerId,
          attempt: seeded.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "render",
        });
        assert.equal(enqueued.ok, true);
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
    assert.equal(acquired.item.streamId, acquired.expected.streamId);
    assert.equal(acquired.groupAuthority, "qa");
    assert.ok(ctx.runOwnedStreamIds.some((t) => t.id === acquired.item.streamId));
    assert.equal(ctx.observedForeignStreamIds.length, 0);
    await acquired.releaseLock();
  });

  await test("foreign unread → fail closed before XREADGROUP", async () => {
    const { ctx } = buildCtx();
    const seeded = await seedQueuedCanonicalJob(ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    const acquired = await acquireIsolatedCaseDelivery({
      ctx,
      caseId: "read.group",
      kind: "render",
      consumerLabel: "foreign",
      groupAuthority: "qa",
      mintDelivery: async () => {
        const foreignJob = `job_foreign_${ctx.runId.slice(0, 8)}`;
        await ctx.restProducer.enqueueRender({
          deliveryId: stableHeadlessDeliveryId(foreignJob, 1),
          jobId: foreignJob,
          ownerId: ctx.ownerId,
          attempt: 1,
          enqueuedAtMs: ctx.nowMs - 1,
          deliveryKind: "render",
        });
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
    assert.equal(acquired.ok, false);
    if (acquired.ok) return;
    assert.equal(acquired.reasonId, "queue_precondition_not_isolated");
    assert.ok(acquired.observedForeignStreamIds.length >= 1);
    // Foreign must never be registered for cleanup.
    for (const foreign of acquired.observedForeignStreamIds) {
      assert.ok(
        !ctx.runOwnedStreamIds.some((t) => t.id === foreign),
      );
    }
  });

  await test("duplicate-live attribution PASS on FakeRedis", async () => {
    const { ctx } = buildCtx();
    const counting = createCountingJobStore(ctx.jobStore);
    const result = await runAttributedDuplicateLiveConsume(ctx, {
      markCleanupSkipped: true,
      countingJobStore: counting,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.claimQueuedJobCallCount, 0);
    // Exactly one initial claim; zero second claims during duplicate consume.
    assert.equal(counting.claimQueuedJobCallCount, 0);
    const stages = result.stages.map((s) => s.stage);
    assert.ok(stages.includes("queued_job_seed"));
    assert.ok(stages.includes("initial_claim"));
    assert.ok(stages.includes("live_claim_reread"));
    assert.ok(stages.includes("queue_isolation"));
    assert.ok(stages.includes("duplicate_ack"));
    assert.ok(stages.includes("pending_clear"));
    assert.ok(stages.includes("claim_immutability"));
    const again = await ctx.jobStore.getByJobIdAndOwner(
      result.jobId,
      ctx.ownerId,
    );
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.value.claimToken, result.claimToken);
  });

  await test("expired claim cannot pass as live duplicate", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedDuplicateLiveConsume(ctx, {
      markCleanupSkipped: true,
      forceExpiredClaim: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "live_claim_reread");
    assert.equal(result.failureReasonId, "live_claim_expired");
  });

  await test("wrong delivery identity fails closed", async () => {
    const { ctx } = buildCtx();
    const result = await runAttributedDuplicateLiveConsume(ctx, {
      markCleanupSkipped: true,
      forceMismatchedEnqueue: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureReasonId, "delivery_identity_mismatch");
  });

  await test("verify exact-delivery helper isolates verify stream", async () => {
    const { ctx } = buildCtx();
    const owned = await seedStagingOwnedObject(ctx);
    assert.equal(owned.ok, true);
    if (!owned.ok) return;
    const acquired = await acquireIsolatedCaseDelivery({
      ctx,
      caseId: "recover.verify.expired",
      kind: "verify",
      consumerLabel: "vfy",
      groupAuthority: "qa",
      mintDelivery: async () => {
        const enqueued = await ctx.restProducer.enqueueVerify({
          deliveryId: owned.deliveryId,
          ownedObjectId: owned.objectId,
          ownerId: ctx.ownerId,
          attempt: owned.attempt,
          enqueuedAtMs: ctx.nowMs,
          deliveryKind: "verify",
        });
        if (!enqueued.ok) {
          return { ok: false, reasonId: "delivery_enqueue_failed" };
        }
        return {
          ok: true,
          expected: {
            kind: "verify",
            deliveryId: owned.deliveryId,
            ownedObjectId: owned.objectId,
            ownerId: ctx.ownerId,
            attempt: owned.attempt,
            streamId: enqueued.value.streamId,
          },
        };
      },
    });
    assert.equal(acquired.ok, true, `verify acquire failed: ${acquired.ok ? "" : acquired.reasonId}`);
    if (!acquired.ok) return;
    assert.equal(acquired.kind, "verify");
    assert.equal(acquired.item.entry.deliveryKind, "verify");
    assert.ok(acquired.group.startsWith("hfq:qa:verify:"));
    await acquired.releaseLock();
  });

  await test("foreign pending remains owned; cleanup is run-owned only", async () => {
    const { ctx, stream } = buildCtx();
    await stream.ensureConsumerGroups();
    const foreign = await stream.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_foreign_matrix", 1),
      jobId: "job_foreign_matrix",
      ownerId: ctx.ownerId,
      attempt: 1,
      enqueuedAtMs: ctx.nowMs - 50,
      deliveryKind: "render",
    });
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    const read = await stream.readGroup({
      kind: "render",
      consumerName: "prod_foreign_matrix",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);

    const pass = await runAttributedDuplicateLiveConsume(ctx, {
      markCleanupSkipped: true,
    });
    assert.equal(pass.ok, true);
    if (!pass.ok) return;
    assert.equal(
      stream.testingFake().testingPendingOwner(
        ctx.streamNames.renderStream,
        ctx.streamNames.renderGroup,
        foreign.value.streamId,
      ),
      "prod_foreign_matrix",
    );
    assert.equal(
      stream.testingFake().testingHasEntry(
        ctx.streamNames.renderStream,
        foreign.value.streamId,
      ),
      true,
    );
    const ownedId = pass.streamId;
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    assert.equal(cleanup, "ok");
    assert.equal(
      stream.testingFake().testingHasEntry(ctx.streamNames.renderStream, ownedId),
      false,
    );
    assert.equal(
      stream.testingFake().testingHasEntry(
        ctx.streamNames.renderStream,
        foreign.value.streamId,
      ),
      true,
    );
  });

  await test("QA lock loss stops mutation before XREADGROUP", async () => {
    const { ctx, stream } = buildCtx();
    let xreads = 0;
    const orig = stream.qaXreadGroupInGroup.bind(stream);
    stream.qaXreadGroupInGroup = async (input) => {
      xreads += 1;
      return orig(input);
    };
    const clock = createFakeQaLockClock(0);
    const origSet = stream.qaSetNxPx.bind(stream);
    stream.qaSetNxPx = async (key, value, pxMs) => {
      const ok = await origSet(key, value, pxMs);
      clock.setMs(QA_LOCK_SAFE_DEADLINE_MS);
      return ok;
    };
    const result = await runAttributedDuplicateLiveConsume(ctx, {
      markCleanupSkipped: true,
      qaLockClock: clock,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failureReasonId, "queue_lock_lost");
    }
    assert.equal(xreads, 0);
  });

  await test("source-boundary rejects read.value[0] in DEFAULT runners", () => {
    const stubs = assertDefaultUpstashLiveRunnersAreNotStubs();
    assert.equal(stubs.ok, true);
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
    assert.equal(/read\.value\[0\]/.test(body), false);
    assert.ok(body.includes("acquireIsolatedCaseDelivery"));
    assert.ok(body.includes("runAttributedDuplicateLiveConsume"));
  });

  await test("progressive false-pass rejection fixture", () => {
    const rejected = progressiveCannotFalsePass({
      cases: [
        { caseId: "env.producer.config", status: "PASS" },
        {
          caseId: "read.group",
          status: "FAIL",
          failureCategory: "READ_GROUP_FAILED",
        },
      ],
      cleanupStatus: "ok",
      claimedOverall: "PASS",
    });
    assert.equal(rejected.ok, false);
    const ok = progressiveCannotFalsePass({
      cases: [{ caseId: "env.producer.config", status: "PASS" }],
      cleanupStatus: "ok",
      claimedOverall: "PASS",
    });
    assert.equal(ok.ok, true);
  });

  await test("DEFAULT runners object is the shared registry surface", () => {
    assert.equal(
      Object.keys(DEFAULT_UPSTASH_LIVE_CASE_RUNNERS).length,
      22,
    );
    assert.equal(typeof runUpstashLiveMatrix, "function");
  });

  await test("production vs QA group authority map in live-matrix source", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "src/verification/headless-renderer/upstash-live/live-matrix.ts",
      ),
      "utf8",
    );
    assert.ok(
      /consume\.claim\.ack[\s\S]*runAttributedClaimAckConsume/.test(source),
    );
    const claimAckSource = readFileSync(
      path.join(
        process.cwd(),
        "src/verification/headless-renderer/upstash-live/claim-ack-attribution.ts",
      ),
      "utf8",
    );
    assert.ok(/groupAuthority:\s*"production"/.test(claimAckSource));
    assert.ok(
      /consume\.duplicate\.live[\s\S]*runAttributedDuplicateLiveConsume/.test(
        source,
      ),
    );
    assert.ok(
      /autoclaim\.idle[\s\S]*groupAuthority:\s*"qa"/.test(source),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
