/**
 * Sprint 11E Phase 2D.1 — dual-lease post-ACK recovery.
 * Run: npm run test:headless-dual-lease-recovery
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  recoverExpiredRenderClaimAndRequeue,
  recoverExpiredVerifyClaimAndRequeue,
  stableHeadlessVerifyDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessStreamQueueAdapter } from "@/features/headless-renderer/control-plane/testing";

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
  console.log("\nSprint 11E Phase 2D.1 — dual-lease recovery\n");

  await test("expired render claim → new delivery enqueue", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "claim_expired",
      nowMs: fx.nowMs,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);

    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => fx.nowMs,
    });
    await streamQueue.ensureConsumerGroups();

    const recovered = await recoverExpiredRenderClaimAndRequeue({
      streamQueue,
      jobStore: fx.stack.jobStore,
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + DUAL_LEASE_TEST_LEASES.renderClaimMs + 1,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      expectedClaimToken: "claim_expired",
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.value.action, "requeued");
    assert.ok(recovered.value.newJobId);
    assert.ok(recovered.value.newDeliveryId);
    assert.notEqual(recovered.value.newJobId, fx.record.jobId);
  });

  await test("live render claim → rejected_live_claim", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "claim_live",
      nowMs: fx.nowMs,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
    });
    const recovered = await recoverExpiredRenderClaimAndRequeue({
      streamQueue,
      jobStore: fx.stack.jobStore,
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 1000,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.value.action, "rejected_live_claim");
  });

  await test("expired verify claim → new verify delivery", async () => {
    const nowMs = 1_700_000_000_000;
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
      expectedContentDigestClaim: `sha256:${"cd".repeat(32)}`,
      expectedByteLength: 64,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: nowMs,
      uploadCapabilityExpiresAtMs: nowMs + 60_000,
      expiresAtMs: nowMs + 3_600_000,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const claimed = await store.acquireVerificationClaim({
      objectId,
      ownerId,
      claimToken: "vclaim_old",
      nowMs,
      expectedStoreVersion: created.value.storeVersion,
      claimLeaseMs: DUAL_LEASE_TEST_LEASES.verifyClaimMs,
    });
    assert.equal(claimed.ok, true);

    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
      nowMs: () => nowMs,
    });
    await streamQueue.ensureConsumerGroups();
    const recovered = await recoverExpiredVerifyClaimAndRequeue({
      streamQueue,
      ownedObjectStore: store,
      ownedObjectId: objectId,
      ownerId,
      previousAttempt: 1,
      nowMs: nowMs + DUAL_LEASE_TEST_LEASES.verifyClaimMs + 1,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      expectedClaimToken: "vclaim_old",
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.value.action, "requeued");
    assert.equal(
      recovered.value.newDeliveryId,
      stableHeadlessVerifyDeliveryId(objectId, 2),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
