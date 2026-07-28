/**
 * Sprint 11E Phase 2D.1 — dual-lease concurrency / no-steal.
 * Run: npm run test:headless-queue-concurrency
 */

import assert from "node:assert/strict";

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
  console.log("\nSprint 11E Phase 2D.1 — queue concurrency\n");

  await test("two consumers: only one claims", async () => {
    const fx = await createQueuedCanonicalJob();
    // Duplicate pending delivery for second consumer via autoClaim after idle.
    const read1 = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c1",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read1.ok && read1.value.length === 1, true);
    if (!read1.ok) return;

    const r1 = await consumeRenderDeliveryOnce({
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      entry: read1.value[0]!.entry,
      streamId: read1.value[0]!.streamId,
      nowMs: fx.nowMs + 10,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c1",
    });
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    assert.equal(r1.value.action, "claimed_and_acked");

    // Re-enqueue same logical delivery fields would be invalid after ack;
    // second consumer sees a fresh duplicate delivery for same job.
    const enq2 = await fx.streamQueue.enqueueRender({
      deliveryId: fx.deliveryId,
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      attempt: fx.record.canonicalJob!.attempt,
      enqueuedAtMs: fx.nowMs + 20,
      deliveryKind: "render",
    });
    assert.equal(enq2.ok, true);
    const read2 = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c2",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read2.ok && read2.value.length === 1, true);
    if (!read2.ok) return;
    const r2 = await consumeRenderDeliveryOnce({
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      entry: read2.value[0]!.entry,
      streamId: read2.value[0]!.streamId,
      nowMs: fx.nowMs + 30,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c2",
    });
    assert.equal(r2.ok, true);
    if (!r2.ok) return;
    assert.equal(r2.value.action, "acked_duplicate_live");
  });

  await test("autoClaim idle does not steal Neon claim", async () => {
    const fx = await createQueuedCanonicalJob();
    const read = await fx.streamQueue.readGroup({
      kind: "render",
      consumerName: "c1",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    // Claim Neon first without ack — leave pending.
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "claim_holder",
      nowMs: fx.nowMs + 5,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);

    fx.streamQueue.testingFake().testingAdvanceMs(120_000);
    const autoclaimed = await fx.streamQueue.autoClaimIdle({
      kind: "render",
      consumerName: "c2",
      minIdleMs: 90_000,
      count: 10,
    });
    assert.equal(autoclaimed.ok && autoclaimed.value.length === 1, true);
    if (!autoclaimed.ok) return;
    const result = await consumeRenderDeliveryOnce({
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      entry: autoclaimed.value[0]!.entry,
      streamId: autoclaimed.value[0]!.streamId,
      nowMs: fx.nowMs + 120_000,
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
      "claim_holder",
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
