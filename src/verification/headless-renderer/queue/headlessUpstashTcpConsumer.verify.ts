/**
 * Sprint 11E Phase 2D.1 — Upstash TCP consumer (injected fake).
 * Run: npm run test:headless-upstash-tcp-consumer
 */

import assert from "node:assert/strict";

import { UpstashTcpStreamConsumerAdapter } from "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter";
import {
  createFakeIoredisLike,
  createFakeUpstashRestClient,
  FakeRedisStreams,
} from "@/features/headless-renderer/control-plane/testing";
import { UpstashRestQueueProducerAdapter } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2D.1 — Upstash TCP consumer\n");

  await test("ensure groups + readGroup + ack", async () => {
    const fake = new FakeRedisStreams({ nowMs: () => 2_000_000_000_000 });
    const producer = new UpstashRestQueueProducerAdapter({
      client: createFakeUpstashRestClient(fake),
      envName: "staging",
    });
    const consumer = new UpstashTcpStreamConsumerAdapter({
      client: createFakeIoredisLike(fake),
      envName: "staging",
    });
    const groups = await consumer.ensureConsumerGroups();
    assert.equal(groups.ok, true);
    const again = await consumer.ensureConsumerGroups();
    assert.equal(again.ok, true);

    const enq = await producer.enqueueRender({
      deliveryId: "dlv:job_t:1",
      jobId: "job_t",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 2_000_000_000_000,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);

    const read = await consumer.readGroup({
      kind: "render",
      consumerName: "worker-a",
      count: 10,
      blockMs: 1,
    });
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.value.length, 1);
    assert.equal(read.value[0]!.entry.deliveryKind, "render");

    const ack = await consumer.ack({
      kind: "render",
      streamId: read.value[0]!.streamId,
      deliveryId: "dlv:job_t:1",
    });
    assert.equal(ack.ok, true);
    assert.equal(
      fake.testingPendingCount("hfq:render:staging", "hfq:render-workers"),
      0,
    );
  });

  await test("autoClaimIdle after idle", async () => {
    const fake = new FakeRedisStreams({ nowMs: () => 1000 });
    const producer = new UpstashRestQueueProducerAdapter({
      client: createFakeUpstashRestClient(fake),
      envName: "local",
    });
    const consumer = new UpstashTcpStreamConsumerAdapter({
      client: createFakeIoredisLike(fake),
      envName: "local",
    });
    await consumer.ensureConsumerGroups();
    await producer.enqueueRender({
      deliveryId: "dlv:job_i:1",
      jobId: "job_i",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    const read = await consumer.readGroup({
      kind: "render",
      consumerName: "worker-a",
      count: 1,
      blockMs: 0,
    });
    assert.equal(read.ok && read.value.length === 1, true);
    fake.testingAdvanceMs(120_000);
    const claimed = await consumer.autoClaimIdle({
      kind: "render",
      consumerName: "worker-b",
      minIdleMs: 90_000,
      count: 10,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    assert.equal(claimed.value.length, 1);
    assert.equal(claimed.value[0]!.entry.deliveryId, "dlv:job_i:1");
  });

  await test("moveToDlq", async () => {
    const fake = new FakeRedisStreams();
    const consumer = new UpstashTcpStreamConsumerAdapter({
      client: createFakeIoredisLike(fake),
      envName: "local",
    });
    const dlq = await consumer.moveToDlq({
      kind: "render",
      entry: {
        deliveryId: "dlv:job_d:1",
        jobId: "job_d",
        ownerId: "owner_1",
        attempt: 1,
        enqueuedAtMs: 1000,
        deliveryKind: "render",
      },
      class: "malformed_unauthorized",
      reasonId: "QUEUE_ENTRY_UNAUTHORIZED",
    });
    assert.equal(dlq.ok, true);
    assert.equal(fake.testingLength("hfq:render-dlq:local"), 1);
  });

  await test("TCP consumer refuses enqueue when unconfigured", async () => {
    const consumer = new UpstashTcpStreamConsumerAdapter();
    const enq = await consumer.enqueueRender({
      deliveryId: "dlv:job_d:1",
      jobId: "job_d",
      ownerId: "owner_1",
      attempt: 1,
      enqueuedAtMs: 1000,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, false);
    if (enq.ok) return;
    assert.equal(enq.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
