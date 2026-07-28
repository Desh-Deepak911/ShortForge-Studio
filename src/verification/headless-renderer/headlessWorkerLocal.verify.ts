/**
 * Sprint 11D Phase 2 — real local Chromium + native FFmpeg artifact + authority negatives.
 * Run: npm run test:headless-worker-local
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { isExportManifestV3 } from "@/features/export/domain";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { resolveSystemChromeExecutable } from "@/features/headless-renderer/worker/chromium/chrome-executable";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

let passed = 0;

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11D Phase 2 — Local worker real artifact\n");

  const chrome = resolveSystemChromeExecutable();
  const ffmpeg = resolveNativeFfmpegBinaries();
  if (!chrome.ok || !ffmpeg.ok) {
    console.error("BLOCKED: Chrome or native FFmpeg unavailable.");
    process.exit(2);
  }

  await testAsync("v3 silent 720p WebM reference artifact", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 2000,
    });
    assert.equal(isExportManifestV3(fixture.manifestV3), true);

    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-v3-silent",
    });

    const started = Date.now();
    const result = await worker.processOnce(1);
    const elapsed = Date.now() - started;
    assert.equal(result.ok, true, result.ok ? "" : result.issues[0]?.message);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);

    const job = await stack.service.getJob({ requestContext: {}, jobId });
    assert.equal(job.ok, true);
    if (!job.ok) return;
    assert.equal(job.value.state, "succeeded");
    assert.equal(job.value.artifactAvailable, true);

    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    const artifact = stored.value.canonicalJob!.artifact;
    assert.ok(artifact);
    assert.equal(artifact!.width, 720);
    assert.equal(artifact!.height, 1280);
    assert.equal(artifact!.fps, 30);
    assert.equal(artifact!.mimeType, "video/webm");
    assert.equal(artifact!.audio.present, false);
    assert.equal(artifact!.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
    assert.ok(artifact!.byteLength > 1000);
    assert.ok(artifact!.contentDigest.startsWith("sha256:"));

    const evidence = {
      chromeVersion: chrome.version,
      ffmpegVersion: ffmpeg.ffmpegVersion,
      ffprobeVersion: ffmpeg.ffprobeVersion,
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      contentDigest: artifact!.contentDigest,
      byteLength: artifact!.byteLength,
      durationMs: artifact!.durationMs,
      width: artifact!.width,
      height: artifact!.height,
      fps: artifact!.fps,
      videoCodec: artifact!.video.codec,
      audioPresent: artifact!.audio.present,
      audioCodec: artifact!.audio.codec,
      audioChannels: artifact!.audio.channels,
      audioSampleRateHz: artifact!.audio.sampleRateHz,
      elapsedRenderMs: elapsed,
      manifestVersion: 3,
      contract: "9C",
      combination: "silent",
    };

    const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "phase2-v3-silent-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log("    evidence:", JSON.stringify(evidence));
  });

  await testAsync("v3 voiceover-only 720p WebM reference artifact", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 2000,
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-v3-voice",
    });
    const started = Date.now();
    const result = await worker.processOnce(1);
    const elapsed = Date.now() - started;
    assert.equal(result.ok, true, result.ok ? "" : result.issues[0]?.message);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    const artifact = stored.value.canonicalJob!.artifact!;
    assert.equal(artifact.audio.present, true);
    assert.equal(artifact.audio.codec, "opus");
    assert.ok((artifact.audio.channels ?? 0) >= 1);
    assert.ok((artifact.audio.sampleRateHz ?? 0) >= 1);
    assert.equal(artifact.width, 720);
    assert.equal(artifact.height, 1280);
    assert.equal(artifact.fps, 30);
    assert.equal(artifact.video.codec, "vp9");
    assert.equal(artifact.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);

    const evidence = {
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      contentDigest: artifact.contentDigest,
      byteLength: artifact.byteLength,
      durationMs: artifact.durationMs,
      width: artifact.width,
      height: artifact.height,
      fps: artifact.fps,
      videoCodec: artifact.video.codec,
      audioPresent: artifact.audio.present,
      audioCodec: artifact.audio.codec,
      audioChannels: artifact.audio.channels,
      audioSampleRateHz: artifact.audio.sampleRateHz,
      elapsedRenderMs: elapsed,
      combination: "voiceover",
    };
    const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "phase2-v3-voiceover-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log("    evidence:", JSON.stringify(evidence));
  });

  await testAsync("v3 voiceover+music 720p WebM reference artifact", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 2000,
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-v3-voice-music",
    });
    const started = Date.now();
    const result = await worker.processOnce(1);
    const elapsed = Date.now() - started;
    assert.equal(result.ok, true, result.ok ? "" : result.issues[0]?.message);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    const artifact = stored.value.canonicalJob!.artifact!;
    assert.equal(artifact.audio.present, true);
    assert.equal(artifact.audio.codec, "opus");
    assert.equal(artifact.width, 720);
    assert.equal(artifact.height, 1280);
    assert.equal(artifact.fps, 30);
    assert.equal(artifact.video.codec, "vp9");

    const evidence = {
      rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      contentDigest: artifact.contentDigest,
      byteLength: artifact.byteLength,
      durationMs: artifact.durationMs,
      width: artifact.width,
      height: artifact.height,
      fps: artifact.fps,
      videoCodec: artifact.video.codec,
      audioPresent: artifact.audio.present,
      audioCodec: artifact.audio.codec,
      audioChannels: artifact.audio.channels,
      audioSampleRateHz: artifact.audio.sampleRateHz,
      elapsedRenderMs: elapsed,
      combination: "voiceover+music",
    };
    const outDir = join(process.cwd(), ".tmp/headless-11d-evidence");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "phase2-v3-voiceover-music-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    console.log("    evidence:", JSON.stringify(evidence));
  });

  await testAsync("crash-after-ack recovery mints one fresh attempt that renders", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 1000,
    });
    let clock = 1_700_000_000_000;
    const { composeTestHeadlessControlPlane, seedOwnedManifestAndBundle } =
      await import("@/features/headless-renderer/control-plane/testing");
    const { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } = await import(
      "@/features/headless-renderer/control-plane/types/control-plane.types"
    );
    const { headlessSourceDigest } = await import(
      "@/features/headless-renderer/domain"
    );
    const { LocalHeadlessWorkerRunner } = await import(
      "@/features/headless-renderer/worker/runtime/local-worker-runner"
    );
    const { DEFAULT_HEADLESS_WORKER_LIMITS } = await import(
      "@/features/headless-renderer/worker/runtime/worker-types"
    );

    const ownerId = "owner-crash";
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId,
        sessionId: "sess-crash",
      },
    authorizedProjectIds: [fixture.manifestV3.project.projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId,
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: clock,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing asset");
      },
      mimeForSlot: () => "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const created = await stack.service.createJob({
      requestContext: {},
      rawBodyText: JSON.stringify({
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "11d-crash-ack",
      }),
      body: {
        version: 1,
        projectId: fixture.manifestV3.project.projectId,
        manifestObject: seeded.value.manifestLocator,
        manifestPayloadDigest: seeded.value.manifestPayloadDigest,
        assetBundleObject: seeded.value.bundleLocator,
        assetBundleFingerprint: seeded.value.bundle.fingerprint,
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: fixture.manifestV3.output.quality,
        },
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        idempotencyKey: "11d-crash-ack",
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const parentJobId = created.value.jobId;

    // 1–2. Drain + claim + ack (simulate worker claim/ack without finishing).
    const drained = await stack.queue.drain(1);
    assert.equal(drained.length, 1);
    const delivery = drained[0]!;
    const before = await stack.jobStore.getByJobIdAndOwner(parentJobId, ownerId);
    assert.equal(before.ok, true);
    if (!before.ok) return;
    const claimed = await stack.jobStore.claimQueuedJob({
      jobId: parentJobId,
      ownerId,
      expectedStoreVersion: before.value.storeVersion,
      claimToken: "claim_crash",
      nowMs: clock,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    // Progress to rendering so the claim is visibly in-flight.
    const { applyHeadlessJobTransition } = await import(
      "@/features/headless-renderer/domain"
    );
    const tRender = Math.max(
      clock + 1,
      claimed.value.record.canonicalJob!.updatedAtMs + 1,
    );
    const stepped = applyHeadlessJobTransition({
      jobValue: claimed.value.record.canonicalJob,
      requestValue: claimed.value.record.canonicalRequest,
      toState: "rendering",
      attempt: claimed.value.record.canonicalJob!.attempt,
      updatedAtMs: tRender,
      progress: { percent: 20, stage: "rendering", updatedAtMs: tRender },
    });
    assert.equal(stepped.ok, true, stepped.ok ? "" : JSON.stringify(stepped));
    if (!stepped.ok) return;
    await stack.jobStore.compareAndSetTransition({
      jobId: parentJobId,
      ownerId,
      expectedStoreVersion: claimed.value.record.storeVersion,
      next: {
        job: stepped.job,
        request: claimed.value.record.canonicalRequest,
        idempotencyAuthorityKey: claimed.value.record.idempotencyAuthorityKey,
        operationId: claimed.value.record.operationId,
        claimToken: "claim_crash",
        claimedAtMs: claimed.value.record.claimedAtMs,
        artifactObjectBinding: null,
        },
    });
    const ack = await stack.queue.markDelivered(delivery.deliveryId);
    assert.equal(ack, true);

    // 3–4. Process death: queue empty, job abandoned in rendering.
    const leftover = await stack.queue.drain(10);
    assert.equal(leftover.length, 0);
    const abandoned = await stack.jobStore.getByJobIdAndOwner(
      parentJobId,
      ownerId,
    );
    assert.equal(abandoned.ok, true);
    if (!abandoned.ok) return;
    assert.equal(abandoned.value.canonicalJob!.state, "rendering");
    assert.equal(abandoned.value.claimToken, "claim_crash");

    // 5. Advance beyond lease.
    clock =
      Math.max(clock, tRender, abandoned.value.claimedAtMs ?? clock) +
      DEFAULT_HEADLESS_WORKER_LIMITS.claimLeaseMs +
      1;

    // 6–7. Explicit recoverDispatch — parent fails; new attempt authorized.
    const recovered = await stack.service.recoverDispatch({
      requestContext: {},
      jobId: parentJobId,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    const parentAfter = await stack.jobStore.getByJobIdAndOwner(
      parentJobId,
      ownerId,
    );
    assert.equal(parentAfter.ok, true);
    if (!parentAfter.ok) return;
    assert.equal(parentAfter.value.canonicalJob!.state, "failed");
    assert.equal(
      parentAfter.value.canonicalJob!.terminalReason?.reasonId,
      "CLAIM_LEASE_EXPIRED",
    );
    assert.notEqual(recovered.value.jobId, parentJobId);

    // 9. Concurrent recovery (Promise.all) produces only one new attempt.
    const [c1, c2] = await Promise.all([
      stack.service.recoverDispatch({
        requestContext: {},
        jobId: parentJobId,
      }),
      stack.service.recoverDispatch({
        requestContext: {},
        jobId: parentJobId,
      }),
    ]);
    assert.equal(c1.ok && c2.ok, true);
    if (!c1.ok || !c2.ok) return;
    assert.equal(c1.value.jobId, recovered.value.jobId);
    assert.equal(c2.value.jobId, recovered.value.jobId);

    // 8. Fresh authorized attempt renders successfully.
    const worker = new LocalHeadlessWorkerRunner({
      jobStore: stack.jobStore,
      queue: stack.queue,
      storage: stack.storage,
      artifactCleanup: stack.artifactCleanup,
      nowMs: () => clock,
    });
    const rendered = await worker.processOnce(1);
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.equal(rendered.value.succeeded, 1);
    const child = await stack.service.getJob({
      requestContext: {},
      jobId: recovered.value.jobId,
    });
    assert.equal(child.ok, true);
    if (!child.ok) return;
    assert.equal(child.value.state, "succeeded");
    assert.equal(child.value.artifactAvailable, true);
  });

  await testAsync("Phase 3: matched MP4 / 1080p accepted; mismatch rejected before Chromium", async () => {
    const { assertPhase3WorkerCapability } = await import(
      "@/features/headless-renderer/worker/runtime/capability-preflight"
    );
    const webm720 = buildHeadlessReferenceFixture({ durationMs: 1000 });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "mp4",
            fps: 30,
            quality: webm720.manifestV3.output.quality,
          },
          manifest: webm720.manifestV3,
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );

    const mp4 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "mp4",
            fps: 30,
            quality: mp4.manifestV3.output.quality,
          },
          manifest: mp4.manifestV3,
        } as never,
      }),
      null,
    );

    const p1080 = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "1080p", format: "webm", quality: "high" },
    });
    assert.equal(
      assertPhase3WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "1080p",
            format: "webm",
            fps: 30,
            quality: p1080.manifestV3.output.quality,
          },
          manifest: p1080.manifestV3,
        } as never,
      }),
      null,
    );
  });

  await testAsync("v2 hard-cut with voiceover succeeds", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 2000,
    });
    const { stack, worker, jobId } = await seedAndCreateReferenceJob({
      fixture,
      manifest: fixture.manifestV2,
      idempotencyKey: "11d-v2-voice",
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    assert.equal(job.ok, true);
    if (!job.ok) return;
    assert.equal(job.value.state, "succeeded");
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, "owner-11d");
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(stored.value.canonicalJob!.artifact?.audio.present, true);
    assert.equal(stored.value.canonicalJob!.artifact?.audio.codec, "opus");
  });

  await testAsync("v2 hard-cut silent regression still succeeds", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "silent",
      durationMs: 2000,
    });
    const { stack, worker, jobId } = await seedAndCreateReferenceJob({
      fixture,
      manifest: fixture.manifestV2,
      idempotencyKey: "11d-v2-hardcut",
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.succeeded, 1);
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    assert.equal(job.ok, true);
    if (!job.ok) return;
    assert.equal(job.value.state, "succeeded");
  });

  await testAsync("duplicate delivery does not double-render", async () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-dup",
    });
    const first = await worker.processOnce(1);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.value.succeeded, 1);

    // Re-enqueue stable delivery after success — must ack/no-op, not re-render.
    const rec = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(rec.ok, true);
    if (!rec.ok) return;
    await stack.queue.enqueue({
      jobId,
      ownerId,
      attempt: 1,
      deliveryId: `dlv:${jobId}:1`,
      enqueuedAtMs: Date.now(),
    });
    const second = await worker.processOnce(1);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.value.succeeded, 0);
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    assert.equal(job.ok, true);
    if (!job.ok) return;
    assert.equal(job.value.state, "succeeded");
  });

  await testAsync("cancellation during render ends cancelled without artifact", async () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 3000 });
    const { stack, worker, jobId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-cancel",
    });
    const ac = new AbortController();
    // Abort quickly after start.
    setTimeout(() => ac.abort(), 50);
    const result = await worker.processOnce(1, ac.signal);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const job = await stack.service.getJob({ requestContext: {}, jobId });
    assert.equal(job.ok, true);
    if (!job.ok) return;
    // May be cancelled or failed/cancelled depending on race; never succeeded with artifact.
    assert.notEqual(job.value.state, "succeeded");
    assert.equal(job.value.artifactAvailable, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
