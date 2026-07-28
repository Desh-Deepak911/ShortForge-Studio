/**
 * Sprint 11E Phase 2D.1 — stream delivery entry validators + delivery ids.
 * Run: npm run test:headless-queue-delivery-entry
 */

import assert from "node:assert/strict";

import {
  stableHeadlessDeliveryId,
  stableHeadlessVerifyDeliveryId,
  validateHeadlessStreamQueueEntry,
} from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2D.1 — queue delivery entry\n");

  test("stable delivery ids", () => {
    assert.equal(stableHeadlessDeliveryId("job_1", 2), "dlv:job_1:2");
    assert.equal(
      stableHeadlessVerifyDeliveryId("obj_1", 3),
      "dlv:verify:obj_1:3",
    );
  });

  test("valid render entry frozen", () => {
    const v = validateHeadlessStreamQueueEntry({
      deliveryId: "dlv:job_a:1",
      jobId: "job_a",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(Object.isFrozen(v.entry), true);
    assert.equal(v.entry.deliveryKind, "render");
  });

  test("valid verify entry", () => {
    const v = validateHeadlessStreamQueueEntry({
      deliveryId: "dlv:verify:obj_a:1",
      ownedObjectId: "obj_a",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "verify",
    });
    assert.equal(v.ok, true);
  });

  test("rejects extra keys / mismatched deliveryId / hostile", () => {
    assert.equal(
      validateHeadlessStreamQueueEntry({
        deliveryId: "dlv:job_a:1",
        jobId: "job_a",
        ownerId: "owner_1",
        attempt: 1,
        enqueuedAtMs: 1000,
        deliveryKind: "render",
        extra: true,
      }).ok,
      false,
    );
    assert.equal(
      validateHeadlessStreamQueueEntry({
        deliveryId: "dlv:wrong:1",
        jobId: "job_a",
        ownerId: "owner_1",
        attempt: 1,
        enqueuedAtMs: 1000,
        deliveryKind: "render",
      }).ok,
      false,
    );
    const cyclic: Record<string, unknown> = {
      deliveryId: "dlv:job_a:1",
      jobId: "job_a",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    };
    cyclic.self = cyclic;
    assert.equal(validateHeadlessStreamQueueEntry(cyclic).ok, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
