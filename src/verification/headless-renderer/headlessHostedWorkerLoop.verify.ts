/**
 * Sprint 11E Phase 2E.1 — Hosted worker loop: shutdown, isolation, one-in-flight.
 * Run: npm run test:headless-hosted-worker-loop
 */

import assert from "node:assert/strict";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import {
  cpFail,
  cpOk,
} from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { createHostedWorkerLoop } from "@/features/headless-renderer/worker/hosted";
import { buildHeadlessChromeLaunchArgs } from "@/features/headless-renderer/worker/chromium/chrome-launch-args";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

const leaseSettings = Object.freeze({
  deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
  verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
});

/** Deterministic stream port — empty reads until aborted; no provider. */
function createIdleStreamQueue(): HeadlessStreamQueuePort & {
  readonly readCount: () => number;
} {
  let reads = 0;
  return {
    readCount: () => reads,
    enqueueRender: async () => cpOk({ streamId: "0-0" }),
    enqueueVerify: async () => cpOk({ streamId: "0-0" }),
    ensureConsumerGroups: async () => cpOk(true as const),
    readGroup: async (input) => {
      reads += 1;
      if (input.signal?.aborted) {
        return cpFail("INTERNAL_ERROR", "Read aborted.");
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, Math.min(input.blockMs, 30));
        input.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });
      if (input.signal?.aborted) {
        return cpFail("INTERNAL_ERROR", "Read aborted.");
      }
      return cpOk([]);
    },
    ack: async () => cpOk(true as const),
    autoClaimIdle: async () => cpOk([]),
    moveToDlq: async () => cpOk(true as const),
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.1 — Hosted worker loop\n");

  await test("render concurrency must be 1", () => {
    const streamQueue = createIdleStreamQueue();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    assert.throws(
      () =>
        createHostedWorkerLoop({
          mode: "render",
          streamQueue,
          jobStore,
          leaseSettings,
          concurrency: 2,
        }),
      /HOSTED_RENDER_CONCURRENCY_MUST_BE_1/,
    );
  });

  await test("graceful shutdown before delivery stops accepting", async () => {
    const streamQueue = createIdleStreamQueue();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const events: string[] = [];
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue,
      jobStore,
      leaseSettings,
      concurrency: 1,
      blockMs: 30,
      eventSink: (e) => events.push(e.name),
      onClaimedRender: async () => undefined,
    });
    const runPromise = loop.run();
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(loop.isAcceptingDeliveries(), true);
    assert.ok(streamQueue.readCount() >= 1);
    loop.requestShutdown();
    assert.equal(loop.isAcceptingDeliveries(), false);
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
    assert.ok(events.includes("hosted.loop.shutdown"));
  });

  await test("graceful shutdown while loop is running exits cleanly", async () => {
    const streamQueue = createIdleStreamQueue();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue,
      jobStore,
      leaseSettings,
      concurrency: 1,
      blockMs: 20,
      onClaimedRender: async () => undefined,
    });
    const runPromise = loop.run();
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(loop.isBusy(), false);
    loop.requestShutdown();
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
    assert.equal(loop.isAcceptingDeliveries(), false);
  });

  await test("verify mode requires ownedObjectStore", async () => {
    const streamQueue = createIdleStreamQueue();
    assert.throws(
      () =>
        createHostedWorkerLoop({
          mode: "verify",
          streamQueue,
          leaseSettings,
          concurrency: 1,
        }),
      /HOSTED_VERIFY_REQUIRES_OWNED_OBJECT_STORE/,
    );
    const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
    assert.throws(
      () =>
        createHostedWorkerLoop({
          mode: "verify",
          streamQueue,
          ownedObjectStore,
          leaseSettings,
          concurrency: 1,
        }),
      /HOSTED_VERIFY_REQUIRES_ON_CLAIMED_VERIFY/,
    );
    const loop = createHostedWorkerLoop({
      mode: "verify",
      streamQueue,
      ownedObjectStore,
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      leaseSettings,
      concurrency: 1,
      blockMs: 10,
      onClaimedVerify: async () => undefined,
    });
    const runPromise = loop.run();
    await new Promise((r) => setTimeout(r, 15));
    loop.requestShutdown();
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
  });

  await test("render mode requires onClaimedRender before intake", () => {
    const streamQueue = createIdleStreamQueue();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    assert.throws(
      () =>
        createHostedWorkerLoop({
          mode: "render",
          streamQueue,
          jobStore,
          leaseSettings,
          concurrency: 1,
        }),
      /HOSTED_RENDER_REQUIRES_ON_CLAIMED_RENDER/,
    );
  });

  await test("stream isolation: render loop kind is render-only", async () => {
    const kinds: string[] = [];
    const streamQueue: HeadlessStreamQueuePort = {
      ...createIdleStreamQueue(),
      readGroup: async (input) => {
        kinds.push(input.kind);
        return cpOk([]);
      },
    };
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue,
      jobStore,
      leaseSettings,
      concurrency: 1,
      blockMs: 5,
      onClaimedRender: async () => undefined,
    });
    const runPromise = loop.run();
    await new Promise((r) => setTimeout(r, 20));
    loop.requestShutdown();
    await runPromise;
    assert.ok(kinds.length >= 1);
    assert.ok(kinds.every((k) => k === "render"));
  });

  await test("chrome default argv has no --no-sandbox", () => {
    const args = buildHeadlessChromeLaunchArgs({});
    assert.equal(args.includes("--no-sandbox"), false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
