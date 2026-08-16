/**
 * Neon queue wake, idle-stop, and HEADLESS_QUEUE_PROVIDER.
 * Run: npm run test:headless-neon-queue-wake-provider
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  classifyHeadlessQueueProvider,
  dispatchWorkerWakeAfterQueuedCommit,
  headlessQueueProviderDiagnostic,
  shouldConstructUpstashRestProducer,
  shouldPersistHeadlessProgress,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  FlyMachineWakeAdapter,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessRenderDispatchOutboxAdapter,
  MemoryHeadlessWorkerWakeAdapter,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { createNeonWorkerLoop } from "@/features/headless-renderer/worker/hosted/neon-worker-loop";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  finalizeHeadlessRenderJobRequest,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

const CLOCK = 1_700_000_000_000;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Neon Wake Verify",
    narration: "Hello world narration for export.",
    totalDuration: 6,
    voiceoverUrl: "https://example.com/voice.mp3",
    voiceoverDurationMs: 6000,
    scenes: [
      {
        id: "scene-1",
        start: 0,
        end: 6,
        duration: 6,
        startMs: 0,
        endMs: 6000,
        durationMs: 6000,
        subtitle: "Hello",
        captionMode: "generated",
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          source: "upload",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  });
}

async function enqueue(
  store: MemoryHeadlessJobStoreAdapter,
  ownerId: string,
  creatorKey: string,
) {
  const manifest = buildExportManifest({
    story: fixStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  });
  const projectId = manifest.project.projectId;
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-1" },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");
  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId, projectId },
    manifest,
    assetBundle: seeded.value.bundle,
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    rendererBuildId: "renderer-build-1",
    idempotencyKey: creatorKey,
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) throw new Error("request failed");
  const accepted = createAcceptedHeadlessRenderJob({
    jobId: `job_${randomUUID()}`,
    requestValue: requestResult.request,
    createdAtMs: CLOCK,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("accept failed");
  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: CLOCK + 1,
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error("queue failed");
  const idem = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: creatorKey,
  });
  assert.equal(idem.ok, true);
  if (!idem.ok) throw new Error("idem failed");
  const created = await store.createIfAbsent({
    idempotencyAuthorityKey: idem.fingerprint,
    record: {
      job: queued.job,
      request: accepted.request,
      idempotencyAuthorityKey: idem.fingerprint,
      operationId: `op_${randomUUID()}`,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    },
  });
  assert.equal(created.ok && created.value.kind === "created", true);
  if (!created.ok || created.value.kind !== "created") {
    throw new Error("create failed");
  }
  return created.value.record;
}

async function main() {
  console.log("\nNeon queue wake + provider\n");

  await test("staging/production missing provider fails closed", () => {
    const staging = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "staging",
    });
    assert.equal(staging.status, "invalid");
    assert.equal(staging.provider, null);
    const production = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "production",
    });
    assert.equal(production.status, "invalid");
    const hostile = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "redis",
    });
    assert.equal(hostile.status, "invalid");
  });

  await test("explicit neon/upstash configure; local default is upstash", () => {
    const neon = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "neon",
    });
    assert.equal(neon.status, "configured");
    assert.equal(neon.provider, "neon");
    const upstash = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "upstash",
    });
    assert.equal(upstash.provider, "upstash");
    const local = classifyHeadlessQueueProvider({});
    assert.equal(local.status, "unconfigured");
    assert.equal(local.provider, "upstash");
    const diag = headlessQueueProviderDiagnostic({
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "neon",
      FLY_API_TOKEN: "should-never-appear",
    });
    assert.equal(diag.queueProvider, "neon");
    assert.equal(JSON.stringify(diag).includes("should-never-appear"), false);
    assert.equal(shouldConstructUpstashRestProducer(neon), false);
    assert.equal(shouldConstructUpstashRestProducer(upstash), true);
    assert.equal(neon.provider, "neon");
    assert.equal(
      shouldConstructUpstashRestProducer(
        classifyHeadlessQueueProvider({
          HEADLESS_ENV_NAME: "production",
        }),
      ),
      false,
    );
  });

  await test("duplicate wake is idempotent; startup failure leaves job queued", async () => {
    const outbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const store = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox: outbox });
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const job = await enqueue(store, "owner-wake-1", "wake-job");

    const first = await dispatchWorkerWakeAfterQueuedCommit({
      jobStore: store,
      outbox,
      wake,
      jobId: job.jobId,
      ownerId: job.ownerId,
      nowMs: CLOCK + 10,
    });
    assert.equal(first.ok && first.value.kind === "woken", true);
    assert.equal(wake.wakeCalls, 1);

    const second = await dispatchWorkerWakeAfterQueuedCommit({
      jobStore: store,
      outbox,
      wake,
      jobId: job.jobId,
      ownerId: job.ownerId,
      nowMs: CLOCK + 11,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.ok(
      second.value.kind === "already_running" ||
        second.value.kind === "already_dispatched" ||
        second.value.kind === "woken",
    );
    assert.ok(wake.wakeCalls >= 2);

    const failOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const failStore = new MemoryHeadlessJobStoreAdapter({
      dispatchOutbox: failOutbox,
    });
    const failWake = new MemoryHeadlessWorkerWakeAdapter();
    failWake.testingFailNextWake();
    const failJob = await enqueue(failStore, "owner-wake-fail", "fail-job");
    const failed = await dispatchWorkerWakeAfterQueuedCommit({
      jobStore: failStore,
      outbox: failOutbox,
      wake: failWake,
      jobId: failJob.jobId,
      ownerId: failJob.ownerId,
      nowMs: CLOCK + 20,
    });
    assert.equal(failed.ok && failed.value.kind === "failed_queued", true);
    const still = await failStore.getByJobIdAndOwner(
      failJob.jobId,
      failJob.ownerId,
    );
    assert.equal(still.ok, true);
    if (!still.ok || still.value.stage !== "canonical") return;
    assert.equal(still.value.canonicalJob.state, "queued");
    assert.equal(still.value.claimToken, null);
  });

  await test("Fly adapter treats 409 as already-running and hides the token", async () => {
    const seen: string[] = [];
    const adapter = new FlyMachineWakeAdapter({
      config: {
        apiBaseUrl: "https://api.machines.dev/v1",
        appName: "shortforge-hw-staging",
        machineId: "machine123",
        apiToken: "secret-token-value",
      },
      fetchImpl: async (url, init) => {
        seen.push(`${init.method} ${url} ${init.headers.Authorization ?? ""}`);
        return { status: 409 };
      },
    });
    const result = await adapter.wake({ nowMs: CLOCK });
    assert.equal(result.ok && result.value.kind === "already_running", true);
    assert.equal(JSON.stringify(result).includes("secret-token-value"), false);
    assert.equal(seen[0]?.includes("secret-token-value"), true);
    assert.equal(seen[0]?.includes("/start"), true);
  });

  await test("neon loop drains jobs then idle-stops; shutdown ignores late jobs", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    await enqueue(store, "owner-loop", "loop-1");
    await enqueue(store, "owner-loop", "loop-2");
    const claimed: string[] = [];
    let now = CLOCK;
    const loop = createNeonWorkerLoop({
      jobStore: store,
      wake,
      nowMs: () => now,
      idleGraceMs: 50,
      heartbeatMs: 10_000,
      sleep: async () => {
        now += 20;
      },
      onClaimedRender: async (input) => {
        claimed.push(input.claimedRecord.jobId);
      },
    });
    const ran = await loop.run();
    assert.equal(ran.exitCode, 0);
    assert.equal(claimed.length, 2);
    assert.equal(wake.stopCalls, 1);

    const lateStore = new MemoryHeadlessJobStoreAdapter();
    const lateWake = new MemoryHeadlessWorkerWakeAdapter();
    let lateNow = CLOCK;
    const lateLoop = createNeonWorkerLoop({
      jobStore: lateStore,
      wake: lateWake,
      nowMs: () => lateNow,
      idleGraceMs: 5_000,
      sleep: async () => {
        lateNow += 10;
      },
      onClaimedRender: async () => {
        throw new Error("should not claim after shutdown");
      },
    });
    lateLoop.requestShutdown();
    await enqueue(lateStore, "owner-late", "late-job");
    const lateRan = await lateLoop.run();
    assert.equal(lateRan.exitCode, 0);
    const leftover = await lateStore.listCanonicalQueuedJobIds(10);
    assert.equal(leftover.ok && leftover.value.length === 1, true);
  });

  await test("job arriving during idle grace is claimed before stop", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const claimed: string[] = [];
    let now = CLOCK;
    let sleeps = 0;
    const loop = createNeonWorkerLoop({
      jobStore: store,
      wake,
      nowMs: () => now,
      idleGraceMs: 80,
      heartbeatMs: 10_000,
      sleep: async () => {
        sleeps += 1;
        if (sleeps === 1) {
          await enqueue(store, "owner-grace", "grace-job");
        }
        now += 20;
      },
      onClaimedRender: async (input) => {
        claimed.push(input.claimedRecord.jobId);
      },
    });
    const ran = await loop.run();
    assert.equal(ran.exitCode, 0);
    assert.equal(claimed.length, 1);
    assert.equal(wake.stopCalls, 1);
  });

  await test("progress persist throttle requires interval or percent change", () => {
    assert.equal(
      shouldPersistHeadlessProgress({
        lastPersistAtMs: CLOCK,
        lastPercent: 40,
        nextPercent: 40,
        nowMs: CLOCK + 1000,
      }),
      false,
    );
    assert.equal(
      shouldPersistHeadlessProgress({
        lastPersistAtMs: CLOCK,
        lastPercent: 40,
        nextPercent: 40,
        nowMs: CLOCK + 3000,
      }),
      true,
    );
    assert.equal(
      shouldPersistHeadlessProgress({
        lastPersistAtMs: CLOCK,
        lastPercent: 40,
        nextPercent: 45,
        nowMs: CLOCK + 500,
      }),
      true,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
