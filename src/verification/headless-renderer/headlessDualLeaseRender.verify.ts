/**
 * Sprint 11E Phase 2D.1 — dual-lease render consume protocol.
 * Run: npm run test:headless-dual-lease-render
 */

import assert from "node:assert/strict";

import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain";
import { consumeRenderDeliveryOnce } from "@/features/headless-renderer/control-plane";

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

async function main() {
  console.log("\nSprint 11E Phase 2D.1 — dual-lease render consume\n");

  await test("claim + ack success", async () => {
    const fx = await createQueuedCanonicalJob();
    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c1",
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
      nowMs: fx.nowMs + 10,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "claimed_and_acked");
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.ok(stored.value.stage === "canonical");
    assert.ok(stored.value.claimToken != null);
  });

  await test("terminal → acked_noop_terminal", async () => {
    const fx = await createQueuedCanonicalJob();
    const failed = applyHeadlessJobTransition({
      jobValue: fx.record.canonicalJob,
      requestValue: fx.record.canonicalRequest,
      toState: "failed",
      attempt: fx.record.canonicalJob!.attempt,
      updatedAtMs: Math.max(fx.nowMs, fx.record.canonicalJob!.updatedAtMs) + 1,
      terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
    });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    const cas = await fx.stack.jobStore.compareAndSetTransition({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      next: {
        job: failed.job,
        request: fx.record.canonicalRequest,
        idempotencyAuthorityKey: fx.record.idempotencyAuthorityKey,
        operationId: fx.record.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(cas.ok && cas.value.kind === "updated", true);

    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c1",
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
      nowMs: fx.nowMs + 20,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "acked_noop_terminal");
  });

  await test("live claim → acked_duplicate_live (no steal)", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "claim_other",
      nowMs: fx.nowMs + 5,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);

    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c2",
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
      nowMs: fx.nowMs + 20,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c2",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "acked_duplicate_live");
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(
      stored.value.stage === "canonical" ? stored.value.claimToken : null,
      "claim_other",
    );
  });

  await test("expired Neon claim → left_pending (no steal / no ACK)", async () => {
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
      consumerName: "c3",
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
      consumerName: "c3",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "left_pending");
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(
      stored.value.stage === "canonical" ? stored.value.claimToken : null,
      "claim_expired",
    );
  });

  await test("ACK failure after durable claim still executes", async () => {
    const fx = await createQueuedCanonicalJob();
    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c4",
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
      consumerName: "c4",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "claimed_and_acked");
    assert.ok(result.value.claimToken != null);
    assert.ok(result.value.claimedRecord != null);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
