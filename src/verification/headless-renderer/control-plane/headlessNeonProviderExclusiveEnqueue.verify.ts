/**
 * Neon-mode create/upload-observe/verify-wake/promote/render-dispatch
 * must issue zero Upstash queue commands. Rollback Upstash path remains.
 * Run: npm run test:headless-neon-provider-exclusive-enqueue
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { UpstashRestQueueProducerAdapter } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";
import {
  classifyHeadlessQueueProvider,
  dispatchWorkerWakeAfterQueuedCommit,
  shouldConstructUpstashRestProducer,
} from "@/features/headless-renderer/control-plane";
import {
  FakeRedisStreams,
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessRenderDispatchOutboxAdapter,
  MemoryHeadlessWorkerWakeAdapter,
  createFakeUpstashRestClient,
} from "@/features/headless-renderer/control-plane/testing";
import { dispatchRenderOutboxIntentOnce } from "@/features/headless-renderer/control-plane/services/dispatch-render-outbox";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  finalizeHeadlessRenderJobRequest,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";
import { buildExportManifest } from "@/features/export/domain";
import { syncFootieScript } from "@/lib/utils/voiceover";
import { seedOwnedManifestAndBundle } from "@/features/headless-renderer/control-plane/testing";
import { composeTestHeadlessControlPlane } from "@/features/headless-renderer/control-plane/testing";

const CLOCK = 1_700_000_000_000;

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

async function main() {
console.log("\nNeon provider-exclusive enqueue\n");

await test("staging/production still fail closed without an explicit provider", () => {
  const staging = classifyHeadlessQueueProvider({
    HEADLESS_ENV_NAME: "staging",
  });
  const production = classifyHeadlessQueueProvider({
    HEADLESS_ENV_NAME: "production",
  });
  assert.equal(staging.status, "invalid");
  assert.equal(production.status, "invalid");
  assert.equal(shouldConstructUpstashRestProducer(staging), false);
  assert.equal(shouldConstructUpstashRestProducer(production), false);
});

await test("neon create/upload-observe/verify-wake/render-dispatch issues zero Upstash commands", async () => {
  const commands: string[] = [];
  const fake = new FakeRedisStreams();
  const rest = createFakeUpstashRestClient(fake);
  const recording = {
    xadd: async (
      key: string,
      id: "*" | `${number}-*` | string,
      fields: Record<string, unknown>,
    ) => {
      commands.push("XADD");
      return rest.xadd(key, id, fields);
    },
    xtrim: async (
      key: string,
      opts: {
        strategy: "MAXLEN" | "MINID";
        exactness?: "~" | "=";
        threshold: number | string;
        limit?: number;
      },
    ) => {
      commands.push("XTRIM");
      return rest.xtrim(key, opts);
    },
  };
  const producer = new UpstashRestQueueProducerAdapter({
    client: recording,
    envName: "staging",
  });

  const neon = classifyHeadlessQueueProvider({
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_QUEUE_PROVIDER: "neon",
  });
  assert.equal(neon.status, "configured");
  assert.equal(neon.provider, "neon");
  assert.equal(shouldConstructUpstashRestProducer(neon), false);

  const story = syncFootieScript({
    title: "Neon exclusive",
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
  const manifest = buildExportManifest({
    story,
    audioMode: "with-voice",
    environment: {
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
    },
  });
  const ownerId = "owner-neon-exclusive";
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-1" },
    authorizedProjectIds: [manifest.project.projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId: manifest.project.projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId, projectId: manifest.project.projectId },
    manifest,
    assetBundle: seeded.value.bundle,
    rendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    rendererBuildId: "renderer-build-1",
    idempotencyKey: "neon-exclusive",
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
    ownership: { ownerId, projectId: manifest.project.projectId },
    idempotencyKey: "neon-exclusive",
  });
  assert.equal(idem.ok, true);
  if (!idem.ok) throw new Error("idem failed");

  const outbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
  const store = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox: outbox });
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

  const wake = new MemoryHeadlessWorkerWakeAdapter();
  const woken = await dispatchWorkerWakeAfterQueuedCommit({
    jobStore: store,
    outbox,
    wake,
    jobId: created.value.record.jobId,
    ownerId,
    nowMs: CLOCK + 10,
  });
  assert.equal(woken.ok, true);
  assert.ok(wake.wakeCalls >= 1);

  const streamCommands: string[] = [];
  const streamQueue = {
    enqueueRender: async () => {
      streamCommands.push("enqueueRender");
      return {
        ok: true as const,
        value: { streamId: "0-1" },
      };
    },
  };

  const dispatched = await dispatchRenderOutboxIntentOnce({
    outbox,
    jobStore: store,
    streamQueue,
    dispatchId: `dispatch_${created.value.record.jobId}`,
    ownerId,
    nowMs: CLOCK + 20,
    queueProvider: "neon",
    wake,
  });
  assert.equal(dispatched.ok, true);
  assert.deepEqual(streamCommands, []);
  assert.deepEqual(commands, []);
  void producer;
});

await test("upload and render dispatch stay provider-exclusive in source", () => {
  const upload = readSrc(
    "src/features/headless-renderer/control-plane/services/staging-owned-upload.service.ts",
  );
  assert.match(upload, /if \(!neonVerify\)/);
  assert.match(upload, /enqueueVerify/);
  assert.match(upload, /dispatchVerifyWakeAfterObservedUpload/);
  const dispatch = readSrc(
    "src/features/headless-renderer/control-plane/services/dispatch-render-outbox.ts",
  );
  assert.match(dispatch, /input\.queueProvider === "neon"/);
  assert.match(dispatch, /deliverNeonWakeOrFailClosed/);
  assert.match(dispatch, /Never dual-enqueues/);
  const compose = readSrc(
    "src/features/headless-renderer/control-plane/runtime/compose-production-control-plane.ts",
  );
  assert.match(compose, /shouldConstructUpstashRestProducer\(queueProvider\)/);
  assert.match(compose, /queueProvider.provider === "neon"/);
});

await test("Upstash rollback producer remains constructible", () => {
  const upstash = classifyHeadlessQueueProvider({
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_QUEUE_PROVIDER: "upstash",
  });
  assert.equal(upstash.provider, "upstash");
  assert.equal(shouldConstructUpstashRestProducer(upstash), true);
  const local = classifyHeadlessQueueProvider({});
  assert.equal(local.provider, "upstash");
});

console.log(`\n${passed} passed`);
}

void main();
