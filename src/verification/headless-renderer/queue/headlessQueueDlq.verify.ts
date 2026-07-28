/**
 * Sprint 11E Phase 2D.1 — DLQ entry authority.
 * Run: npm run test:headless-queue-dlq
 */

import assert from "node:assert/strict";

import {
  validateHeadlessQueueDlqEntry,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessStreamQueueAdapter } from "@/features/headless-renderer/control-plane/testing";
import { consumeRenderDeliveryOnce } from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/testing";

import { DUAL_LEASE_TEST_LEASES } from "../upstash-live/dual-lease-test-fixture";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1 — queue DLQ\n");

  await test("valid DLQ entry exact shape", () => {
    const v = validateHeadlessQueueDlqEntry({
      deliveryId: "dlv:job_x:1",
      jobId: "job_x",
      ownerId: "owner_1",
      attempt: 1,
      class: "malformed_unauthorized",
      enqueuedAtMs: 1000,
      reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
    });
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(Object.isFrozen(v.entry), true);
  });

  await test("rejects both jobId and ownedObjectId", () => {
    assert.equal(
      validateHeadlessQueueDlqEntry({
        deliveryId: "dlv:job_x:1",
        jobId: "job_x",
        ownedObjectId: "obj_x",
        ownerId: "owner_1",
        attempt: 1,
        class: "malformed_unauthorized",
        enqueuedAtMs: 1000,
        reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
      }).ok,
      false,
    );
  });

  await test("rejects secrets-like extra keys", () => {
    assert.equal(
      validateHeadlessQueueDlqEntry({
        deliveryId: "dlv:job_x:1",
        jobId: "job_x",
        ownerId: "owner_1",
        attempt: 1,
        class: "malformed_unauthorized",
        enqueuedAtMs: 1000,
        reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
        locator: "secret",
      }).ok,
      false,
    );
  });

  await test("unknown job delivery → dlq", async () => {
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({
      envName: "local",
    });
    await streamQueue.ensureConsumerGroups();
    await streamQueue.enqueueRender({
      deliveryId: "dlv:job_missing:1",
      jobId: "job_missing",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    const read = await streamQueue.readGroup({
      kind: "render",
      consumerName: "c1",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    if (!read.ok) return;
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const result = await consumeRenderDeliveryOnce({
      streamQueue,
      jobStore,
      entry: read.value[0]!.entry,
      streamId: read.value[0]!.streamId,
      nowMs: 2000,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      consumerName: "c1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.action, "dlq_acked");
    assert.equal(
      streamQueue.testingFake().testingLength("hfq:render-dlq:local"),
      1,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
