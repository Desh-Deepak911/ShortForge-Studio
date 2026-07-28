/**
 * Sprint 11E Phase 2D.1F.1 — REST transport + exact cleanup authority.
 * Run: npm run test:headless-upstash-run-scoped-rest-cleanup-authority
 *
 * No provider contact.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  interpretExistsResponse,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessUpstashRestClient } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  createFakeUpstashRestClient,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";

import { defaultUpstashLiveCleanup } from "../upstash-live/cleanup";
import { composeQaRunScopedHarnessPorts } from "../upstash-live/compose-qa-run-scoped-ports";
import { buildUpstashLiveSchemaFingerprint } from "../upstash-live/evidence-authority";
import {
  createUpstashLifecycleTracking,
  emptyUpstashLiveSession,
  seedQueuedCanonicalJob,
} from "../upstash-live/live-fixtures";
import {
  createQaRunScopedRestProducerPort,
  deleteExactQaRunScopedKey,
  destroyGroupOnQaRunScopedStream,
} from "../upstash-live/qa-run-scoped-queue";
import {
  canonicalizeQaRunScopedStreamBinding,
  deriveQaRunScopedStreamBinding,
} from "../upstash-live/qa-run-stream-names";
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

async function buildCtx(runId = randomUUID()) {
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
    ownerId: `uq_rc_${runId.slice(0, 8)}`,
    otherOwnerId: `uq_rc_o_${runId.slice(0, 8)}`,
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
    restProducer: scoped!.restProducer,
    tcpConsumer: stream,
    streamQueue: stream,
    streamNames: scoped!.streamNames,
    streamAuthority: "qa_run_scoped",
    groupAuthorityEvidence: "production_protocol",
    qaRunStreamBinding: scoped!.binding,
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
  return { ctx, stream, restClient, binding: scoped!.binding };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2D.1F.1 — REST transport + exact cleanup authority\n",
  );

  await test("REST wrapper receives exact run-scoped key; never TCP qaXaddRaw", async () => {
    const stream = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const binding = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(binding != null);
    let seenKey: string | null = null;
    let tcpXadd = 0;
    const origXadd = stream.qaXaddRaw.bind(stream);
    stream.qaXaddRaw = async (...args) => {
      tcpXadd += 1;
      return origXadd(...args);
    };
    const base = createFakeUpstashRestClient(stream.testingFake());
    const client: HeadlessUpstashRestClient = {
      xadd: async (key, id, fields) => {
        seenKey = key;
        return base.xadd(key, id, fields);
      },
      xtrim: (key, opts) => base.xtrim(key, opts),
    };
    const producer = createQaRunScopedRestProducerPort({ client, binding });
    const enq = await producer.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_rest", 1),
      jobId: "job_rest",
      ownerId: "owner_rest",
      attempt: 1,
      enqueuedAtMs: 1,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    assert.equal(seenKey, binding!.names.renderStream);
    assert.equal(tcpXadd, 0);
  });

  await test("REST XADD failure fails enqueue", async () => {
    const binding = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(binding != null);
    const client: HeadlessUpstashRestClient = {
      xadd: async () => {
        throw new Error("rest_xadd_boom");
      },
      xtrim: async () => 0,
    };
    const producer = createQaRunScopedRestProducerPort({ client, binding });
    const enq = await producer.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_fail", 1),
      jobId: "job_fail",
      ownerId: "owner_fail",
      attempt: 1,
      enqueuedAtMs: 1,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, false);
  });

  await test("XTRIM failure is non-terminal after successful XADD", async () => {
    const stream = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const binding = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(binding != null);
    const base = createFakeUpstashRestClient(stream.testingFake());
    let trimFailed = false;
    const client: HeadlessUpstashRestClient = {
      xadd: (key, id, fields) => base.xadd(key, id, fields),
      xtrim: async () => {
        trimFailed = true;
        throw new Error("trim_boom");
      },
    };
    const producer = createQaRunScopedRestProducerPort({ client, binding });
    const enq = await producer.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_trim", 1),
      jobId: "job_trim",
      ownerId: "owner_trim",
      attempt: 1,
      enqueuedAtMs: 1,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, true);
    assert.equal(trimFailed, true);
  });

  await test("shared staging keys cannot be passed to REST wrapper", async () => {
    const stream = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const ok = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(ok != null);
    const forged = {
      ...ok!,
      names: { ...ok!.names, renderStream: "hfq:render:staging" },
    };
    const producer = createQaRunScopedRestProducerPort({
      client: createFakeUpstashRestClient(stream.testingFake()),
      binding: forged,
    });
    const enq = await producer.enqueueRender({
      deliveryId: stableHeadlessDeliveryId("job_shared", 1),
      jobId: "job_shared",
      ownerId: "owner_shared",
      attempt: 1,
      enqueuedAtMs: 1,
      deliveryKind: "render",
    });
    assert.equal(enq.ok, false);
  });

  await test("DEL success + EXISTS failure fails cleanup", async () => {
    const { ctx, stream, binding } = await buildCtx();
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
    ctx.runOwnedActiveStreamIds.push({
      stream: binding.names.renderStream,
      id: enq.value.streamId,
      kind: "render",
    });
    const orig = stream.qaProbeKeyExists.bind(stream);
    stream.qaProbeKeyExists = async () => ({
      ok: false,
      reasonId: "key_probe_failed",
    });
    const cleanup = await defaultUpstashLiveCleanup(ctx, false);
    stream.qaProbeKeyExists = orig;
    assert.equal(cleanup, "failed");
  });

  await test(
    "DEL zero + EXISTS false follows idempotency rule (already absent)",
    async () => {
      const { stream, binding } = await buildCtx();
      // Never created DLQ keys — DEL 0 + EXISTS false must pass.
      const ok = await deleteExactQaRunScopedKey({
        redis: stream,
        binding,
        streamKey: binding.names.renderDlq,
      });
      assert.equal(ok, true);
      const probe = await stream.qaProbeKeyExists(binding.names.renderDlq);
      assert.deepEqual(probe, { ok: true, exists: false });
    },
  );

  await test("EXISTS true after DEL fails cleanup key delete", async () => {
    const { stream, binding } = await buildCtx();
    await stream.qaXgroupCreate({
      streamKey: binding.names.renderStream,
      group: "hfq:render-workers",
      id: "0",
      mkstream: true,
    });
    const origExists = stream.qaProbeKeyExists.bind(stream);
    stream.qaProbeKeyExists = async () => ({ ok: true, exists: true });
    const ok = await deleteExactQaRunScopedKey({
      redis: stream,
      binding,
      streamKey: binding.names.renderStream,
    });
    stream.qaProbeKeyExists = origExists;
    assert.equal(ok, false);
  });

  await test("malformed EXISTS response fails", () => {
    assert.deepEqual(interpretExistsResponse(2), {
      ok: false,
      reasonId: "key_probe_failed",
    });
    assert.deepEqual(interpretExistsResponse(1.5), {
      ok: false,
      reasonId: "key_probe_failed",
    });
    assert.deepEqual(interpretExistsResponse(null), {
      ok: false,
      reasonId: "key_probe_failed",
    });
    assert.deepEqual(interpretExistsResponse(0), { ok: true, exists: false });
    assert.deepEqual(interpretExistsResponse(1), { ok: true, exists: true });
  });

  await test("group destroy rejects arbitrary and cross-kind groups", async () => {
    const { stream, binding } = await buildCtx();
    assert.equal(
      await destroyGroupOnQaRunScopedStream({
        redis: stream,
        binding,
        streamKey: binding.names.renderStream,
        group: "hfq:qa:render:forged",
      }),
      false,
    );
    assert.equal(
      await destroyGroupOnQaRunScopedStream({
        redis: stream,
        binding,
        streamKey: binding.names.renderStream,
        group: "hfq:verify-workers",
      }),
      false,
    );
    assert.equal(
      await destroyGroupOnQaRunScopedStream({
        redis: stream,
        binding,
        streamKey: binding.names.renderDlq,
        group: "hfq:render-workers",
      }),
      false,
    );
  });

  await test("hostile Proxy/getter/cycle bindings fail without throwing", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    assert.equal(canonicalizeQaRunScopedStreamBinding(cycle), null);

    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("getter_boom");
        },
        ownKeys() {
          return ["streamAuthority"];
        },
        getOwnPropertyDescriptor() {
          return { configurable: true, enumerable: true };
        },
      },
    );
    assert.equal(canonicalizeQaRunScopedStreamBinding(throwing), null);

    const ok = deriveQaRunScopedStreamBinding({
      envName: "staging",
      runId: randomUUID(),
    });
    assert.ok(ok != null);
    const withExtra = Object.assign(Object.create(null), {
      ...ok,
      hostile: true,
    });
    assert.equal(canonicalizeQaRunScopedStreamBinding(withExtra), null);
  });

  await test("concurrent bindings remain isolated; shared staging unchanged", async () => {
    const a = await buildCtx();
    const b = await buildCtx();
    assert.notEqual(a.binding.names.renderStream, b.binding.names.renderStream);
    const before = await a.stream.qaXinfoGroups("hfq:render:staging");
    assert.equal(before.ok, true);
    const seeded = await seedQueuedCanonicalJob(a.ctx);
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;
    await a.ctx.restProducer.enqueueRender({
      deliveryId: seeded.deliveryId,
      jobId: seeded.jobId,
      ownerId: a.ctx.ownerId,
      attempt: seeded.attempt,
      enqueuedAtMs: a.ctx.nowMs,
      deliveryKind: "render",
    });
    const after = await a.stream.qaXinfoGroups("hfq:render:staging");
    assert.deepEqual(after, before);
  });

  await test("unconfigured TCP key probe returns key_probe_failed", async () => {
    const { UpstashTcpStreamConsumerAdapter } = await import(
      "@/features/headless-renderer/worker/queue/upstash-tcp-stream-consumer.adapter"
    );
    const tcp = new UpstashTcpStreamConsumerAdapter({ envName: "staging" });
    assert.deepEqual(await tcp.qaProbeKeyExists("hfq:qa-run:v1:render:staging:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), {
      ok: false,
      reasonId: "key_probe_failed",
    });
  });

  console.log(
    `\n${passed}/12 run-scoped REST + cleanup authority fixtures passed\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
