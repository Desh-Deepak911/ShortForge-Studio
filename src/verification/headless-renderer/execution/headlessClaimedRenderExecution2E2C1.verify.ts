/**
 * Sprint 11E Phase 2E.2C.1 — claimed-render execution composition.
 * Run: npm run test:headless-claimed-render-execution-2e2c1
 *
 * Deterministic local fixtures — no Neon/R2/Upstash/Fly contact.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  applyHeadlessJobTransition,
  buildHeadlessAuthorityFingerprint,
} from "@/features/headless-renderer/domain";
import { createProvisionalMaterializingRecord } from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import type { HeadlessStoragePort } from "@/features/headless-renderer/control-plane/ports/storage.port";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";
import {
  cpFail,
  cpOk,
} from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  CLAIMED_RENDER_EXECUTOR_ID,
  confirmDurableClaimCoherence,
  executeClaimedRender,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker";
import {
  composeHostedHeadlessWorker,
  createHostedWorkerLoop,
  HEADLESS_HOSTED_IMAGE_CLASS,
} from "@/features/headless-renderer/worker/hosted";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";

import {
  createQueuedCanonicalJob,
  DUAL_LEASE_TEST_LEASES,
} from "../upstash-live/dual-lease-test-fixture";

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

function createIdleStreamQueue(counters?: {
  ensure?: { n: number };
  read?: { n: number };
}): HeadlessStreamQueuePort {
  return {
    enqueueRender: async () => cpOk({ streamId: "0-0" }),
    enqueueVerify: async () => cpOk({ streamId: "0-0" }),
    ensureConsumerGroups: async () => {
      if (counters?.ensure) counters.ensure.n += 1;
      return cpOk(true as const);
    },
    readGroup: async (input) => {
      if (counters?.read) counters.read.n += 1;
      if (input.signal?.aborted) {
        return cpFail("INTERNAL_ERROR", "Read aborted.");
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, Math.min(input.blockMs, 20));
        input.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });
      return cpOk([]);
    },
    ack: async () => cpOk(true as const),
    autoClaimIdle: async () => cpOk([]),
    moveToDlq: async () => cpOk(true as const),
  };
}

function readSrc(rel: string): string {
  return readFileSync(
    path.join(process.cwd(), "src/features/headless-renderer", rel),
    "utf8",
  );
}

function validHostedEnv(mode: "verify" | "render"): Record<string, string> {
  return {
    HEADLESS_WORKER_MODE: mode,
    HEADLESS_ENV_NAME: "staging",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
    HEADLESS_WORKER_CONCURRENCY: "1",
  };
}

async function claimExactRecord(fx: Awaited<ReturnType<typeof createQueuedCanonicalJob>>) {
  const { consumeRenderDeliveryOnce } = await import(
    "@/features/headless-renderer/control-plane/services/dual-lease-render-consume"
  );
  const read = await fx.streamQueue.readGroup({
    kind: "render",
    consumerName: "claim-once",
    count: 1,
    blockMs: 0,
  });
  assert.equal(read.ok && read.value.length === 1, true);
  if (!read.ok) throw new Error("read failed");
  const result = await consumeRenderDeliveryOnce({
    streamQueue: fx.streamQueue,
    jobStore: fx.stack.jobStore,
    entry: read.value[0]!.entry,
    streamId: read.value[0]!.streamId,
    nowMs: fx.nowMs + 10,
    leaseSettings: DUAL_LEASE_TEST_LEASES,
    consumerName: "claim-once",
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("consume failed");
  assert.equal(result.value.action, "claimed_and_acked");
  assert.ok(result.value.claimedRecord != null);
  assert.ok(result.value.claimToken != null);
  return {
    claimedRecord: result.value.claimedRecord!,
    claimToken: result.value.claimToken!,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2C.1 — Claimed render execution\n");

  await test("1: claimed render success uses exact record/token → succeeded once", async () => {
    const chrome = resolveSystemChromeExecutable();
    const ffmpeg = resolveNativeFfmpegBinaries();
    if (!chrome.ok || !ffmpeg.ok) {
      throw new Error("BLOCKED: Chrome or native FFmpeg unavailable for success fixture.");
    }
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 1000,
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `2e2c1-success-${randomUUID().slice(0, 8)}`,
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true, result.ok ? "" : result.issues[0]?.message);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    assert.equal(result.value.processed, 1);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(stored.value.stage, "canonical");
    assert.equal(stored.value.canonicalJob!.state, "succeeded");
    assert.ok(stored.value.artifactObjectBinding != null);
    assert.equal(stored.value.claimToken, null);
  });

  await test("2: hosted render claims/ACKs and invokes render hook exactly once", async () => {
    const fx = await createQueuedCanonicalJob();
    let hookCalls = 0;
    let seenToken: string | null = null;
    let seenJobId: string | null = null;
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      concurrency: 1,
      blockMs: 20,
      nowMs: () => fx.nowMs + 50,
      onClaimedRender: async (input) => {
        hookCalls += 1;
        seenToken = input.claimToken;
        seenJobId = input.claimedRecord.jobId;
      },
    });
    const runPromise = loop.run();
    const deadline = Date.now() + 3_000;
    while (hookCalls < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    loop.requestShutdown();
    const result = await runPromise;
    assert.equal(hookCalls, 1);
    assert.equal(seenJobId, fx.record.jobId);
    assert.ok(
      typeof seenToken === "string" &&
        (seenToken as unknown as string).length > 0,
    );
    assert.equal(result.exitCode, 0);
  });

  await test("3: ACK failure after durable claim still invokes render exactly once", async () => {
    const fx = await createQueuedCanonicalJob();
    fx.streamQueue.testingFailNextAck();
    let hookCalls = 0;
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      concurrency: 1,
      blockMs: 20,
      nowMs: () => fx.nowMs + 50,
      onClaimedRender: async () => {
        hookCalls += 1;
      },
    });
    const runPromise = loop.run();
    const deadline = Date.now() + 3_000;
    while (hookCalls < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    loop.requestShutdown();
    await runPromise;
    assert.equal(hookCalls, 1);
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(stored.value.stage, "canonical");
    assert.ok(stored.value.claimToken != null);
  });

  await test("4: missing render hook fails before ensure/read/claim", () => {
    const counters = { ensure: { n: 0 }, read: { n: 0 } };
    const streamQueue = createIdleStreamQueue(counters);
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
    assert.equal(counters.ensure.n, 0);
    assert.equal(counters.read.n, 0);
  });

  await test("5: missing verify hook fails closed before intake", () => {
    const counters = { ensure: { n: 0 }, read: { n: 0 } };
    const streamQueue = createIdleStreamQueue(counters);
    assert.throws(
      () =>
        createHostedWorkerLoop({
          mode: "verify",
          streamQueue,
          ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
          jobStore: new MemoryHeadlessJobStoreAdapter(),
          leaseSettings,
          concurrency: 1,
        }),
      /HOSTED_VERIFY_REQUIRES_ON_CLAIMED_VERIFY/,
    );
    assert.equal(counters.ensure.n, 0);
    assert.equal(counters.read.n, 0);
  });

  await test("6: claim-token mismatch → zero storage resolve / zero success", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimed = await claimExactRecord(fx);
    let resolveCount = 0;
    let uploadCount = 0;
    const baseStorage = fx.stack.storage;
    const trackingStorage = {
      ...baseStorage,
      createUploadSession: async (input: never) => {
        uploadCount += 1;
        return baseStorage.createUploadSession(input);
      },
    } as unknown as HeadlessStoragePort;
    const result = await executeClaimedRender({
      claimedRecord: claimed.claimedRecord,
      claimToken: "claim_forged_token",
      jobStore: fx.stack.jobStore,
      artifactCleanup: fx.stack.artifactCleanup,
      nowMs: () => fx.nowMs + 20,
      resolveStorage: () => {
        resolveCount += 1;
        return trackingStorage;
      },
    });
    assert.equal(result.kind, "claim_coherence_rejected");
    assert.equal(result.coherenceRejection, "claim_token_mismatch");
    assert.equal(resolveCount, 0);
    assert.equal(uploadCount, 0);
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.notEqual(stored.value.canonicalJob!.state, "succeeded");
  });

  await test("7: provisional/terminal/stale-attempt/cross-owner/forged fail closed", async () => {
    const fx = await createQueuedCanonicalJob();
    const claimed = await claimExactRecord(fx);
    let resolveCount = 0;
    const resolveStorage = () => {
      resolveCount += 1;
      return fx.stack.storage;
    };

    const tokenMismatch = await confirmDurableClaimCoherence({
      jobStore: fx.stack.jobStore,
      claimedRecord: claimed.claimedRecord,
      claimToken: "forged",
    });
    assert.equal(tokenMismatch.ok, false);
    if (tokenMismatch.ok) return;
    assert.equal(tokenMismatch.reasonId, "claim_token_mismatch");

    const crossOwner = await confirmDurableClaimCoherence({
      jobStore: fx.stack.jobStore,
      claimedRecord: {
        ...claimed.claimedRecord,
        ownerId: "other-owner",
        canonicalJob: {
          ...claimed.claimedRecord.canonicalJob,
          ownership: {
            ...claimed.claimedRecord.canonicalJob!.ownership,
            ownerId: "other-owner",
          },
        },
        canonicalRequest: {
          ...claimed.claimedRecord.canonicalRequest,
          ownership: {
            ...claimed.claimedRecord.canonicalRequest!.ownership,
            ownerId: "other-owner",
          },
        },
      },
      claimToken: claimed.claimToken,
    });
    assert.equal(crossOwner.ok, false);

    const staleAttempt = await confirmDurableClaimCoherence({
      jobStore: fx.stack.jobStore,
      claimedRecord: {
        ...claimed.claimedRecord,
        canonicalJob: {
          ...claimed.claimedRecord.canonicalJob,
          attempt: claimed.claimedRecord.canonicalJob!.attempt + 1,
        },
      },
      claimToken: claimed.claimToken,
    });
    assert.equal(staleAttempt.ok, false);
    if (!staleAttempt.ok) {
      assert.equal(staleAttempt.reasonId, "attempt_mismatch");
    }

    const failed = applyHeadlessJobTransition({
      jobValue: claimed.claimedRecord.canonicalJob,
      requestValue: claimed.claimedRecord.canonicalRequest,
      toState: "failed",
      attempt: claimed.claimedRecord.canonicalJob!.attempt,
      updatedAtMs:
        Math.max(fx.nowMs, claimed.claimedRecord.canonicalJob!.updatedAtMs) + 1,
      terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
    });
    assert.equal(failed.ok, true);
    if (!failed.ok) return;
    const cas = await fx.stack.jobStore.compareAndSetTransition({
      jobId: claimed.claimedRecord.jobId,
      ownerId: claimed.claimedRecord.ownerId,
      expectedStoreVersion: claimed.claimedRecord.storeVersion,
      next: {
        job: failed.job,
        request: claimed.claimedRecord.canonicalRequest,
        idempotencyAuthorityKey: claimed.claimedRecord.idempotencyAuthorityKey,
        operationId: claimed.claimedRecord.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    assert.equal(cas.ok && cas.value.kind === "updated", true);
    const terminal = await executeClaimedRender({
      claimedRecord: claimed.claimedRecord,
      claimToken: claimed.claimToken,
      jobStore: fx.stack.jobStore,
      artifactCleanup: fx.stack.artifactCleanup,
      nowMs: () => fx.nowMs + 40,
      resolveStorage,
    });
    assert.equal(terminal.kind, "claim_coherence_rejected");
    assert.equal(resolveCount, 0);

    const fx2 = await createQueuedCanonicalJob();
    const provJobId = `job_prov_${randomUUID().slice(0, 8)}`;
    const provOpId = `op_prov_${randomUUID().slice(0, 8)}`;
    const digest = "sha256:" + "ab".repeat(32);
    const idem = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: { ownerId: fx2.ownerId, projectId: fx2.record.projectId },
      idempotencyKey: `prov-idem-${randomUUID().slice(0, 8)}`,
    });
    assert.equal(idem.ok, true);
    if (!idem.ok) return;
    const materialize = createProvisionalMaterializingRecord({
      jobId: provJobId,
      ownerId: fx2.ownerId,
      projectId: fx2.record.projectId,
      operationId: provOpId,
      creatorIdempotencyKey: `cik-${randomUUID().slice(0, 8)}`,
      idempotencyAuthorityKey: idem.fingerprint,
      requestedRendererProfile: fx2.record.canonicalJob!.rendererProfile,
      requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      snapshotClaim: {
        manifestPayloadDigestClaim: digest,
        assetBundleFingerprintClaim: "hab:sha256:" + "cd".repeat(32),
        expectedSlotClaims: [],
      },
      stagingObjectRefs: [],
      createdAtMs: fx2.nowMs,
      updatedAtMs: fx2.nowMs,
      expiresAtMs: fx2.nowMs + 7_200_000,
    });
    assert.equal(materialize.ok, true);
    if (!materialize.ok) return;
    const provisional = await fx2.stack.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: materialize.record,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) return;
    // Forged canonical input that points at a provisional job id fails closed.
    const forged = await confirmDurableClaimCoherence({
      jobStore: fx2.stack.jobStore,
      claimedRecord: {
        ...fx2.record,
        jobId: provJobId,
        claimToken: "claim_x",
        claimedAtMs: fx2.nowMs,
        canonicalJob: {
          ...fx2.record.canonicalJob,
          jobId: provJobId,
        },
      },
      claimToken: "claim_x",
    });
    assert.equal(forged.ok, false);
    if (!forged.ok) {
      assert.equal(forged.reasonId, "provisional");
    }
  });

  await test("8: local and hosted paths delegate to the same post-claim executor", () => {
    const local = readSrc("worker/runtime/local-worker-runner.ts");
    const materialize = readSrc("worker/hosted/materialize-hosted-worker-adapters.ts");
    const executor = readSrc("worker/runtime/execute-claimed-render.ts");
    assert.match(local, /executeClaimedRender\(/);
    assert.match(materialize, /executeClaimedRender\(/);
    assert.match(executor, new RegExp(CLAIMED_RENDER_EXECUTOR_ID));
    assert.equal(CLAIMED_RENDER_EXECUTOR_ID, "executeClaimedRender");
    assert.equal(local.includes("executeHeadlessRenderJob("), false);
    assert.equal(materialize.includes("LocalHeadlessWorkerRunner"), false);
    assert.equal(materialize.includes("processOnce"), false);
  });

  await test("9: render failure terminalizes truthfully", async () => {
    const chrome = resolveSystemChromeExecutable();
    const ffmpeg = resolveNativeFfmpegBinaries();
    if (!chrome.ok || !ffmpeg.ok) {
      throw new Error("BLOCKED: Chrome/FFmpeg required for failure fixture.");
    }
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 1000,
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `2e2c1-fail-${randomUUID().slice(0, 8)}`,
      workerLimits: { jobTimeoutMs: 1 },
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 0);
    assert.ok(result.value.failed >= 1);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.ok(
      stored.value.canonicalJob!.state === "failed" ||
        stored.value.canonicalJob!.state === "cancelled",
    );
    assert.equal(stored.value.artifactObjectBinding, null);
  });

  await test("10: upload/finalize/binding/succeeded CAS order preserved in executor", () => {
    const src = readSrc("worker/runtime/execute-claimed-render.ts");
    const upload = src.indexOf("storage.createUploadSession");
    const write = src.indexOf("storage.writeUploadStream");
    const uploadCompleted = src.indexOf('emit("artifact_upload_completed"');
    const finalizeStarted = src.indexOf('emit("owned_object_finalize_started"');
    const finalize = src.indexOf("storage.finalizeUploadedObject");
    const providerFinalizeCompleted = src.indexOf(
      'finalizeSubstage: "provider_finalize"',
    );
    const succeeded = src.indexOf('toState: "succeeded"');
    const bindingValidationStarted = src.indexOf(
      'emit("artifact_binding_validation_started"',
    );
    const binding = src.indexOf("evaluateArtifactObjectBindingCoherence({");
    const bindingValidationCompleted = src.indexOf(
      'emit("artifact_binding_validation_completed"',
    );
    const cas = src.indexOf("artifactObjectBinding: bindingEvaluated");
    assert.ok(upload > 0 && write > upload, "upload before write");
    assert.ok(uploadCompleted > write, "write before upload_completed");
    assert.ok(finalizeStarted > uploadCompleted, "upload_completed before finalize_started");
    assert.ok(finalize > finalizeStarted, "finalize_started before storage finalize");
    assert.ok(
      providerFinalizeCompleted > finalize,
      "storage finalize before provider finalize_completed",
    );
    assert.ok(succeeded > providerFinalizeCompleted, "provider finalize before succeeded job build");
    assert.ok(bindingValidationStarted > succeeded, "succeeded job before binding_validation_started");
    assert.ok(binding > bindingValidationStarted, "binding_validation_started before binding build");
    assert.ok(
      bindingValidationCompleted > binding,
      "binding build before binding_validation_completed",
    );
    assert.ok(cas > bindingValidationCompleted, "binding_validation_completed before succeeded CAS attach");
  });

  await test("11: lost succeeded CAS invokes orphan cleanup authority", async () => {
    const chrome = resolveSystemChromeExecutable();
    const ffmpeg = resolveNativeFfmpegBinaries();
    if (!chrome.ok || !ffmpeg.ok) {
      throw new Error("BLOCKED: Chrome/FFmpeg required for CAS-loss fixture.");
    }
    let release!: () => void;
    let paused = false;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 1000,
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: `2e2c1-cas-${randomUUID().slice(0, 8)}`,
      testHooks: {
        afterFinalizeBeforeSucceededCas: async () => {
          paused = true;
          await gate;
        },
      },
    });
    const runPromise = worker.processOnce(1);
    const deadline = Date.now() + 60_000;
    while (!paused && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(paused, true);
    assert.equal(stack.jobStore.testingBumpStoreVersion(jobId), true);
    release();
    const result = await runPromise;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 0);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.notEqual(stored.value.canonicalJob!.state, "succeeded");
    assert.equal(stored.value.artifactObjectBinding, null);
    assert.ok(result.value.lastOrphanCleanup != null);
  });

  await test("12: forced abort preserves durable claim for recovery", async () => {
    const fx = await createQueuedCanonicalJob();
    let abortSeen = false;
    const loop = createHostedWorkerLoop({
      mode: "render",
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      concurrency: 1,
      blockMs: 20,
      nowMs: () => fx.nowMs + 50,
      onClaimedRender: async (input) => {
        const started = Date.now();
        while (!input.signal.aborted && Date.now() - started < 2_000) {
          await new Promise((r) => setTimeout(r, 20));
        }
        abortSeen = input.signal.aborted;
      },
    });
    const runPromise = loop.run();
    const deadline = Date.now() + 3_000;
    while (!loop.isBusy() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.equal(loop.isBusy(), true);
    loop.requestForcedAbort();
    const result = await runPromise;
    assert.equal(abortSeen, true);
    assert.equal(result.exitCode, 0);
    const stored = await fx.stack.jobStore.getByJobIdAndOwner(
      fx.record.jobId,
      fx.ownerId,
    );
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    // Hook did not terminalize — Neon claim remains recovery authority.
    assert.ok(stored.value.claimToken != null);
  });

  await test("13: render mode never invokes verify; verify never invokes render", async () => {
    const fx = await createQueuedCanonicalJob();
    let renderHooks = 0;
    let verifyHooks = 0;
    const renderLoop = createHostedWorkerLoop({
      mode: "render",
      streamQueue: fx.streamQueue,
      jobStore: fx.stack.jobStore,
      leaseSettings: DUAL_LEASE_TEST_LEASES,
      concurrency: 1,
      blockMs: 15,
      nowMs: () => fx.nowMs + 40,
      onClaimedRender: async () => {
        renderHooks += 1;
      },
      onClaimedVerify: async () => {
        verifyHooks += 1;
      },
    });
    const run = renderLoop.run();
    const deadline = Date.now() + 3_000;
    while (renderHooks < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15));
    }
    renderLoop.requestShutdown();
    await run;
    assert.equal(renderHooks, 1);
    assert.equal(verifyHooks, 0);

    const verifyLoop = createHostedWorkerLoop({
      mode: "verify",
      streamQueue: createIdleStreamQueue(),
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      leaseSettings,
      concurrency: 1,
      blockMs: 10,
      onClaimedVerify: async () => {
        verifyHooks += 1;
      },
      onClaimedRender: async () => {
        renderHooks += 1;
      },
    });
    const vRun = verifyLoop.run();
    await new Promise((r) => setTimeout(r, 30));
    verifyLoop.requestShutdown();
    await vRun;
    assert.equal(renderHooks, 1);
  });

  await test("14: no testing/memory adapters in production hosted barrels", () => {
    const materialize = readSrc("worker/hosted/materialize-hosted-worker-adapters.ts");
    const entry = readSrc("worker/hosted/hosted-entrypoint.ts");
    const loop = readSrc("worker/hosted/hosted-worker-loop.ts");
    const hostedIndex = readSrc("worker/hosted/index.ts");
    for (const src of [materialize, entry, loop, hostedIndex]) {
      assert.equal(src.includes("memory-job-store"), false);
      assert.equal(src.includes("MemoryHeadless"), false);
      assert.equal(src.includes("create-test-local-worker"), false);
      assert.equal(src.includes("FakeS3"), false);
    }
    assert.match(materialize, /createOnClaimedRender/);
    assert.match(entry, /onClaimedRender/);
    assert.match(materialize, /NeonHeadlessJobStoreAdapter/);
    assert.match(materialize, /createR2JobBoundStorageAdapter/);
  });

  await test("classification: packaging resolved; configured loop allowed", () => {
    const c = composeHostedHeadlessWorker(validHostedEnv("render"));
    assert.equal(c.canStartConsumerLoop, true);
    assert.equal(c.reasonId, "composition_ready");
    assert.equal(HEADLESS_HOSTED_IMAGE_CLASS, "deployable_worker");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
