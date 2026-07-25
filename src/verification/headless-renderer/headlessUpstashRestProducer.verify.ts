/**
 * Sprint 11E Phase 2D.1 — Upstash REST producer (injected fake).
 * Run: npm run test:headless-upstash-rest-producer
 */

import assert from "node:assert/strict";

import { UpstashRestQueueProducerAdapter } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import {
  createFakeUpstashRestClient,
  FakeRedisStreams,
} from "@/features/headless-renderer/control-plane/testing";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1 — Upstash REST producer\n");

  await test("enqueue render XADD + trim via injected client", async () => {
    const fake = new FakeRedisStreams({ nowMs: () => 1_700_000_000_000 });
    const client = createFakeUpstashRestClient(fake);
    const producer = new UpstashRestQueueProducerAdapter({
      client,
      envName: "staging",
    });
    const result = await producer.enqueueRender({
      deliveryId: "dlv:job_r:1",
      jobId: "job_r",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1_700_000_000_000,
      deliveryKind: "render",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(typeof result.value.streamId === "string");
    assert.equal(fake.testingLength("hfq:render:staging"), 1);
  });

  await test("enqueue verify", async () => {
    const fake = new FakeRedisStreams();
    const producer = new UpstashRestQueueProducerAdapter({
      client: createFakeUpstashRestClient(fake),
      envName: "local",
    });
    const result = await producer.enqueueVerify({
      deliveryId: "dlv:verify:obj_1:1",
      ownedObjectId: "obj_1",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "verify",
    });
    assert.equal(result.ok, true);
    assert.equal(fake.testingLength("hfq:verify:local"), 1);
  });

  await test("unconfigured → CONFIGURATION_UNAVAILABLE", async () => {
    // Force unconfigured without consulting ambient process.env.
    const producer = new UpstashRestQueueProducerAdapter({ config: null });
    const result = await producer.enqueueRender({
      deliveryId: "dlv:job_r:1",
      jobId: "job_r",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
  });

  await test("injected write failure → QUEUE_ENQUEUE_FAILED", async () => {
    const fake = new FakeRedisStreams();
    fake.testingSetFailNextWrites(1);
    const producer = new UpstashRestQueueProducerAdapter({
      client: createFakeUpstashRestClient(fake),
      envName: "local",
    });
    const result = await producer.enqueueRender({
      deliveryId: "dlv:job_r:1",
      jobId: "job_r",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.issues[0]?.code, "QUEUE_ENQUEUE_FAILED");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
