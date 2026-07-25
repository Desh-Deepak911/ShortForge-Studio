/**
 * Sprint 11E Phase 2D.1 — dual-lease verify consume protocol.
 * Run: npm run test:headless-dual-lease-verify
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  consumeVerifyDeliveryOnce,
  stableHeadlessVerifyDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessStreamQueueAdapter } from "@/features/headless-renderer/control-plane/testing";

import { DUAL_LEASE_TEST_LEASES } from "./upstash-live/dual-lease-test-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function seedStaging(nowMs: number) {
  const store = new MemoryHeadlessOwnedObjectStoreAdapter();
  const objectId = `obj_${randomUUID()}`;
  const ownerId = `owner_${randomUUID()}`;
  const created = await store.createStagingRecord({
    objectId,
    ownerId,
    projectId: `proj_${randomUUID()}`,
    jobId: `job_${randomUUID()}`,
    operationId: `op_${randomUUID()}`,
    purpose: "manifest",
    slotKey: null,
    storeId: "assets",
    objectKey: `owners/${ownerId}/manifests/${objectId}`,
    createdAtMs: nowMs,
    expectedContentDigestClaim: `sha256:${"ab".repeat(32)}`,
    expectedByteLength: 128,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: nowMs,
    uploadCapabilityExpiresAtMs: nowMs + 60_000,
    expiresAtMs: nowMs + 3_600_000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("staging create failed");
  return { store, objectId, ownerId, record: created.value };
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1 — dual-lease verify consume\n");

  await test("claim + ack success", async () => {
    const nowMs = 1_700_000_000_000;
    const { store, objectId, ownerId } = await seedStaging(nowMs);
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => nowMs,
    });
    await streamQueue.ensureConsumerGroups();
    const deliveryId = stableHeadlessVerifyDeliveryId(objectId, 1);
    const enq = await streamQueue.enqueueVerify({
      deliveryId,
      ownedObjectId: objectId,
      ownerId,
      attempt: 1,
      enqueuedAtMs: nowMs,
      deliveryKind: "verify",
    });
    assert.equal(enq.ok, true);
    const read = await streamQueue.readGroup({
      kind: "verify",
      consumerName: "v1",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const result = await consumeVerifyDeliveryOnce({
      streamQueue,
      ownedObjectStore: store,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: nowMs + 10,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "v1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "claimed_and_acked");
  });

  await test("live verify claim → acked_duplicate_live", async () => {
    const nowMs = 1_700_000_000_000;
    const { store, objectId, ownerId, record } = await seedStaging(nowMs);
    const claimed = await store.acquireVerificationClaim({
      objectId,
      ownerId,
      claimToken: "vclaim_other",
      nowMs: nowMs + 5,
      expectedStoreVersion: record.storeVersion,
      claimLeaseMs: DUAL_LEASE_TEST_LEASES.verifyClaimMs,
    });
    assert.equal(claimed.ok, true);

    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => nowMs,
    });
    await streamQueue.ensureConsumerGroups();
    const deliveryId = stableHeadlessVerifyDeliveryId(objectId, 1);
    await streamQueue.enqueueVerify({
      deliveryId,
      ownedObjectId: objectId,
      ownerId,
      attempt: 1,
      enqueuedAtMs: nowMs,
      deliveryKind: "verify",
    });
    const read = await streamQueue.readGroup({
      kind: "verify",
      consumerName: "v2",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const result = await consumeVerifyDeliveryOnce({
      streamQueue,
      ownedObjectStore: store,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: nowMs + 20,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "v2",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "acked_duplicate_live");
  });

  await test("expired verify claim → reclaim (no steal)", async () => {
    const nowMs = 1_700_000_000_000;
    const { store, objectId, ownerId, record } = await seedStaging(nowMs);
    const claimedAt = nowMs + 5;
    const claimed = await store.acquireVerificationClaim({
      objectId,
      ownerId,
      claimToken: "vclaim_expired",
      nowMs: claimedAt,
      expectedStoreVersion: record.storeVersion,
      claimLeaseMs: DUAL_LEASE_TEST_LEASES.verifyClaimMs,
    });
    assert.equal(claimed.ok, true);

    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => nowMs,
    });
    await streamQueue.ensureConsumerGroups();
    await streamQueue.enqueueVerify({
      deliveryId: stableHeadlessVerifyDeliveryId(objectId, 1),
      ownedObjectId: objectId,
      ownerId,
      attempt: 1,
      enqueuedAtMs: nowMs,
      deliveryKind: "verify",
    });
    const read = await streamQueue.readGroup({
      kind: "verify",
      consumerName: "v-exp",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const result = await consumeVerifyDeliveryOnce({
      streamQueue,
      ownedObjectStore: store,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: claimedAt + DUAL_LEASE_TEST_LEASES.verifyClaimMs + 1,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "v-exp",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Expired verify claim is reclaimable via acquireVerificationClaim.
    assert.equal(result.value.action, "claimed_and_acked");
  });

  await test("finalized → acked_noop_terminal", async () => {
    const nowMs = 1_700_000_000_000;
    const { store, objectId, ownerId, record } = await seedStaging(nowMs);
    const rejected = await store.markRejected({
      objectId,
      ownerId,
      expectedStoreVersion: record.storeVersion,
      terminalReason: "verify_rejected",
      nowMs: nowMs + 1,
    });
    assert.equal(rejected.ok, true);

    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => nowMs,
    });
    await streamQueue.ensureConsumerGroups();
    await streamQueue.enqueueVerify({
      deliveryId: stableHeadlessVerifyDeliveryId(objectId, 1),
      ownedObjectId: objectId,
      ownerId,
      attempt: 1,
      enqueuedAtMs: nowMs,
      deliveryKind: "verify",
    });
    const read = await streamQueue.readGroup({
      kind: "verify",
      consumerName: "v3",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const result = await consumeVerifyDeliveryOnce({
      streamQueue,
      ownedObjectStore: store,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: nowMs + 20,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "v3",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "acked_noop_terminal");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
