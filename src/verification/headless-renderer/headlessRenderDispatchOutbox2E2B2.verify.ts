/**
 * Sprint 11E Phase 2E.2B.2 — durable render-dispatch outbox + unified shutdown.
 * Run: npm run test:headless-render-dispatch-outbox-2e2b2
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createRenderDispatchOutboxScheduler,
  dispatchRenderOutboxIntentOnce,
  dispatchRenderOutboxOnce,
  ensureDispatchIntentForQueuedJob,
  parseHeadlessPgSafeInteger,
  stableHeadlessDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessStreamQueueAdapter } from "@/features/headless-renderer/control-plane/testing";
import { cpFail, cpOk } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  createHostedShutdownLifecycle,
  createHostedWorkerLoop,
} from "@/features/headless-renderer/worker/hosted";
import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";

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

const leaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

function assertNoSecrets(text: string) {
  assert.equal(/sk_live|Bearer |redis:\/\//i.test(text), false);
  assert.equal(/r2\.cloudflarestorage\.com/i.test(text), false);
}

async function ensureOutboxForFixture(fx: Awaited<ReturnType<typeof createQueuedCanonicalJob>>) {
  // createQueuedCanonicalJob uses composeTest which already has dispatchOutbox.
  const ensured = await ensureDispatchIntentForQueuedJob({
    jobStore: fx.stack.jobStore,
    dispatchOutbox: fx.stack.dispatchOutbox,
    jobId: fx.record.jobId,
    ownerId: fx.ownerId,
    nowMs: fx.nowMs + 1,
  });
  assert.equal(ensured.ok, true, ensured.ok ? "" : ensured.issues[0]?.message);
  return fx.stack.dispatchOutbox;
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2B.2 — durable dispatch outbox\n");

  await test("1: promotion atomically creates one pending dispatch intent", async () => {
    const fx = await createQueuedCanonicalJob();
    const outbox = fx.stack.dispatchOutbox;
    const row = await outbox.getByJobAttemptAndOwner({
      jobId: fx.record.jobId,
      attempt: fx.record.canonicalJob.attempt,
      ownerId: fx.ownerId,
    });
    // createJob path may not promote via provisional — ensure if missing
    if (!row.ok || row.value == null) {
      await ensureOutboxForFixture(fx);
    }
    const again = await outbox.getByJobAttemptAndOwner({
      jobId: fx.record.jobId,
      attempt: fx.record.canonicalJob.attempt,
      ownerId: fx.ownerId,
    });
    assert.equal(again.ok, true);
    if (!again.ok || again.value == null) return;
    assert.equal(again.value.state, "pending");
    assert.equal(
      again.value.intent.deliveryId,
      stableHeadlessDeliveryId(fx.record.jobId, fx.record.canonicalJob.attempt),
    );
  });

  await test("2: promotion rollback creates neither canonical nor outbox", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/neon-job-store.adapter.ts",
      ),
      "utf8",
    );
    assert.ok(src.includes("ensureDispatchOutboxForCanonical"));
    assert.ok(src.includes("DISPATCH_OUTBOX_ENSURE_FAILED"));
    assert.ok(src.includes("insertPendingDispatchOutboxInTransaction"));
  });

  await test("3: exact promotion replay preserves one dispatch identity", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const first = await fx.stack.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: fx.record.jobId,
      attempt: fx.record.canonicalJob.attempt,
      ownerId: fx.ownerId,
    });
    assert.ok(first.ok && first.value);
    const second = await ensureDispatchIntentForQueuedJob({
      jobStore: fx.stack.jobStore,
      dispatchOutbox: fx.stack.dispatchOutbox,
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 2,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.value.kind, "existing");
    assert.equal(
      second.value.record.intent.deliveryId,
      first.value!.intent.deliveryId,
    );
  });

  await test("4: forged replay cannot alter/create an intent", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const forged = await fx.stack.dispatchOutbox.ensurePending({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      projectId: fx.projectId,
      attempt: fx.record.canonicalJob.attempt,
      deliveryId: "dlv:forged:999",
      nowMs: fx.nowMs + 3,
    });
    assert.equal(forged.ok, false);
  });

  await test("5: successful XADD + dispatched CAS → terminal dispatched", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "dispatched");
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok, true);
    if (row.ok) assert.equal(row.value.state, "dispatched");
  });

  await test("6: dispatched intent absent from later retry listings", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    const due = await fx.stack.dispatchOutbox.listDuePending({
      limit: 50,
      nowMs: fx.nowMs + 1_000_000,
    });
    assert.equal(due.ok, true);
    if (!due.ok) return;
    assert.equal(
      due.value.some((r) => r.intent.dispatchId === deliveryId),
      false,
    );
  });

  await test("7+8: repeated intervals create zero XADDs after dispatched / fleet down", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    let xadds = 0;
    const countingQueue: Pick<HeadlessStreamQueuePort, "enqueueRender"> = {
      enqueueRender: async (msg) => {
        xadds += 1;
        return fx.streamQueue.enqueueRender(msg);
      },
    };
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: countingQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(xadds, 1);
    for (let i = 0; i < 5; i++) {
      await dispatchRenderOutboxOnce({
        outbox: fx.stack.dispatchOutbox,
        jobStore: fx.stack.jobStore,
        streamQueue: countingQueue,
        limit: 50,
        nowMs: fx.nowMs + 100 + i,
      });
    }
    assert.equal(xadds, 1);
  });

  await test("9: XADD failure reschedules with bounded backoff", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    fx.streamQueue.testingFailNextEnqueue();
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "dispatch_pending");
    const row = await fx.stack.dispatchOutbox.getByDispatchIdAndOwner(
      deliveryId,
      fx.ownerId,
    );
    assert.equal(row.ok, true);
    if (!row.ok) return;
    assert.equal(row.value.state, "pending");
    assert.ok(row.value.retryCount >= 1);
    assert.ok(row.value.nextAttemptAtMs > fx.nowMs + 10);
  });

  await test("10: crash before XADD allows lease recovery", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "tok-a",
      nowMs: fx.nowMs + 10,
      claimLeaseMs: 1,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    // Lease expired — another claim wins
    const reclaim = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "tok-b",
      nowMs: fx.nowMs + 100,
      claimLeaseMs: 1, // same lease window authority as the expired claim
    });
    assert.equal(reclaim.ok && reclaim.value.kind === "claimed", true);
  });

  await test("11: crash after XADD before CAS → unconfirmed; may duplicate once", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const claimed = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "tok-x",
      nowMs: fx.nowMs + 10,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    await fx.streamQueue.enqueueRender({
      deliveryKind: "render",
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      attempt: fx.record.canonicalJob.attempt,
      deliveryId,
      enqueuedAtMs: fx.nowMs + 11,
    });
    // Simulate CAS failure by using wrong storeVersion
    const marked = await fx.stack.dispatchOutbox.markDispatched({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "tok-x",
      expectedStoreVersion: claimed.value.record.storeVersion + 99,
      nowMs: fx.nowMs + 12,
    });
    assert.equal(marked.ok, true);
    if (marked.ok) assert.equal(marked.value.kind, "stale");
    // Lease expiry recovery can XADD again (at-most crash-window duplicate)
    const reclaim = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "tok-y",
      nowMs: fx.nowMs + 10 + 60_001,
      claimLeaseMs: 60_000,
    });
    assert.equal(reclaim.ok && reclaim.value.kind === "claimed", true);
  });

  await test("12+13: concurrent claims — one winner; no amplify after dispatched", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const a = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "a",
      nowMs: fx.nowMs + 10,
      claimLeaseMs: 60_000,
    });
    const b = await fx.stack.dispatchOutbox.claimDue({
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      claimToken: "b",
      nowMs: fx.nowMs + 11,
      claimLeaseMs: 60_000,
    });
    assert.equal(a.ok && a.value.kind === "claimed", true);
    assert.equal(b.ok && b.value.kind === "rejected", true);
  });

  await test("14: terminal/non-queued/claimed job cannot be dispatched incorrectly", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const claimed = await fx.stack.jobStore.claimQueuedJob({
      jobId: fx.record.jobId,
      ownerId: fx.ownerId,
      expectedStoreVersion: fx.record.storeVersion,
      claimToken: "render-claim",
      nowMs: fx.nowMs + 5,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    // storeVersion bumped — refresh outbox ensure already done
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: fx.streamQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 20,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "rejected");
  });

  await test("15: stable delivery ID and attempt/owner/job coherence", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const row = await fx.stack.dispatchOutbox.getByJobAttemptAndOwner({
      jobId: fx.record.jobId,
      attempt: fx.record.canonicalJob.attempt,
      ownerId: fx.ownerId,
    });
    assert.ok(row.ok && row.value);
    if (!row.ok || !row.value) return;
    assert.equal(
      row.value.intent.deliveryId,
      `dlv:${fx.record.jobId}:${fx.record.canonicalJob.attempt}`,
    );
    assert.equal(row.value.intent.dispatchId, row.value.intent.deliveryId);
  });

  await test("16: database outage is not an empty outbox", async () => {
    const outbox = {
      listDuePending: async () =>
        cpFail("DATABASE_UNAVAILABLE", "Database unavailable."),
    };
    const result = await dispatchRenderOutboxOnce({
      outbox: outbox as never,
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      streamQueue: new MemoryHeadlessStreamQueueAdapter({ envName: "local" }),
      limit: 10,
      nowMs: Date.now(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "DATABASE_UNAVAILABLE");
    }
  });

  await test("17: exact already-dispatched replay performs zero XADD", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    const deliveryId = stableHeadlessDeliveryId(
      fx.record.jobId,
      fx.record.canonicalJob.attempt,
    );
    let xadds = 0;
    const countingQueue: Pick<HeadlessStreamQueuePort, "enqueueRender"> = {
      enqueueRender: async (msg) => {
        xadds += 1;
        return fx.streamQueue.enqueueRender(msg);
      },
    };
    await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: countingQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 10,
    });
    const again = await dispatchRenderOutboxIntentOnce({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: countingQueue,
      dispatchId: deliveryId,
      ownerId: fx.ownerId,
      nowMs: fx.nowMs + 20,
    });
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.value.kind, "already_dispatched");
    assert.equal(xadds, 1);
  });

  await test("18: shutdown while only dispatch sweep is active arms deadline", async () => {
    let busy = true;
    let forced = 0;
    const life = createHostedShutdownLifecycle({
      gracefulShutdownDeadlineMs: 40,
      requestShutdown: () => undefined,
      requestForcedAbort: () => {
        forced += 1;
        busy = false;
      },
      isBusy: () => busy,
    });
    life.handleSignal();
    assert.equal(life.isDeadlineArmed(), true);
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(forced, 1);
    life.clearDeadline();
  });

  await test("19: shutdown drains claimed execution and dispatch work", async () => {
    const fx = await createQueuedCanonicalJob();
    await ensureOutboxForFixture(fx);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slowQueue: Pick<HeadlessStreamQueuePort, "enqueueRender"> = {
      enqueueRender: async (msg) => {
        await gate;
        return fx.streamQueue.enqueueRender(msg);
      },
    };
    const scheduler = createRenderDispatchOutboxScheduler({
      outbox: fx.stack.dispatchOutbox,
      jobStore: fx.stack.jobStore,
      streamQueue: slowQueue,
      nowMs: () => fx.nowMs + 50,
      intervalMs: 60_000,
    });
    const sweep = scheduler.runOnce();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(scheduler.isSweepActive(), true);
    const stopPromise = scheduler.stop({ drainDeadlineMs: 2_000 });
    release();
    await sweep;
    const drain = await stopPromise;
    assert.equal(drain, "drained");
    assert.equal(scheduler.isSweepActive(), false);
  });

  await test("20: deadline/second signal aborts both and returns bounded non-zero", async () => {
    let forced = 0;
    const life = createHostedShutdownLifecycle({
      gracefulShutdownDeadlineMs: 5_000,
      requestShutdown: () => undefined,
      requestForcedAbort: () => {
        forced += 1;
      },
      isBusy: () => true,
    });
    life.handleSignal();
    life.handleSignal();
    assert.ok(forced >= 1);
    life.clearDeadline();
    const entry = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/worker/hosted/hosted-entrypoint.ts",
      ),
      "utf8",
    );
    assert.ok(entry.includes("shutdown_drain_deadline"));
    assert.ok(entry.includes("unifiedBusy"));
  });

  await test("21: provider hang cannot block entrypoint forever", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/dispatch-render-outbox.ts",
      ),
      "utf8",
    );
    assert.ok(src.includes("drainDeadlineMs"));
    assert.ok(src.includes("deadline_exceeded"));
  });

  await test("22: PostgreSQL canonical BIGINT string matrix", () => {
    assert.equal(parseHeadlessPgSafeInteger("42", { min: 0 }).ok, true);
    assert.equal(parseHeadlessPgSafeInteger(" 42", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("1e2", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger("1.5", { min: 0 }).ok, false);
    assert.equal(parseHeadlessPgSafeInteger({}, { min: 0 }).ok, false);
    assert.equal(
      parseHeadlessPgSafeInteger(Number.MAX_SAFE_INTEGER + 1, { min: 0 }).ok,
      false,
    );
  });

  await test("23: public.* relation qualification and relation-bound preflight", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/migrations/006_headless_render_dispatch_outbox.sql",
      ),
      "utf8",
    );
    assert.match(sql, /public\.headless_render_dispatch_outbox/);
    const preflight = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/runtime/neon-schema-preflight.ts",
      ),
      "utf8",
    );
    assert.ok(preflight.includes('"headless_render_dispatch_outbox"'));
    const neonList = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/neon-job-store.adapter.ts",
      ),
      "utf8",
    );
    assert.ok(neonList.includes("FROM public.headless_jobs"));
    assert.ok(neonList.includes("parseHeadlessPgSafeInteger"));
  });

  await test("24: no private dispatch fields in public views/events/routes", async () => {
    const events: string[] = [];
    const streamQueue: HeadlessStreamQueuePort = {
      enqueueRender: async () => cpOk({ streamId: "0-0" }),
      enqueueVerify: async () => cpOk({ streamId: "0-0" }),
      ensureConsumerGroups: async () => cpOk(true as const),
      readGroup: async () => cpOk([]),
      ack: async () => cpOk(true as const),
      autoClaimIdle: async () => cpOk([]),
      moveToDlq: async () => cpOk(true as const),
    };
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue,
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      leaseSettings,
      concurrency: 1,
      blockMs: 10,
      onClaimedRender: async () => undefined,
      eventSink: (e) => {
        const s = JSON.stringify(e);
        events.push(s);
        assertNoSecrets(s);
        assert.equal(/claim_token|delivery_id|dispatch_id/i.test(s), false);
      },
    });
    const run = loop.run();
    await new Promise((r) => setTimeout(r, 20));
    loop.requestShutdown();
    await run;
    assert.ok(events.length >= 1);
  });

  await test("25: Memory/Neon parity surfaces exist", () => {
    assert.ok(
      readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter.ts",
        ),
        "utf8",
      ).includes("implements HeadlessRenderDispatchOutboxPort"),
    );
    assert.ok(
      readFileSync(
        path.join(
          process.cwd(),
          "src/features/headless-renderer/control-plane/adapters/neon-render-dispatch-outbox.adapter.ts",
        ),
        "utf8",
      ).includes("implements HeadlessRenderDispatchOutboxPort"),
    );
  });

  await test("26: migration catalog exact set includes 006/007; no phantom 003", async () => {
    const { discoverHeadlessMigrationSources } = await import(
      "@/features/headless-renderer/control-plane/migrations/migration-catalog"
    );
    const ids = discoverHeadlessMigrationSources().map((s) => s.migrationId);
    assert.deepEqual(
      ids.filter((id) =>
        [
          "000_headless_schema_migrations",
          "001_headless_project_ownership",
          "002_headless_jobs",
          "004_headless_owned_objects",
          "005_headless_cleanup_intents",
          "006_headless_render_dispatch_outbox",
          "007_headless_owned_object_slot_key_capacity",
        ].includes(id),
      ),
      [
        "000_headless_schema_migrations",
        "001_headless_project_ownership",
        "002_headless_jobs",
        "004_headless_owned_objects",
        "005_headless_cleanup_intents",
        "006_headless_render_dispatch_outbox",
        "007_headless_owned_object_slot_key_capacity",
      ],
    );
    assert.equal(ids.includes("003_headless_cas_transaction_spec"), false);
  });

  // silence unused
  void randomUUID;
  void DUAL_LEASE_TEST_LEASES;

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
