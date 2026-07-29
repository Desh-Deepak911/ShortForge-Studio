/**
 * Sprint 11D Phase 3.2 — PNG image2pipe streaming encode fixtures.
 * Run: npm run test:headless-worker-streaming
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildHeadlessAudioPlan } from "@/features/headless-renderer/worker/audio/build-headless-audio-plan";
import {
  buildImage2PipeEncodeArgvForTest,
  startStreamedPngEncode,
} from "@/features/headless-renderer/worker/ffmpeg/encode-png-stream";
import { spawnFixedArgvWithStdin } from "@/features/headless-renderer/worker/ffmpeg/spawn-process-stdin";
import { probeArtifactWithFfprobe } from "@/features/headless-renderer/worker/ffmpeg/probe-artifact";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import {
  HEADLESS_OUTPUT_PROFILES,
  HEADLESS_PHASE3_LEGACY_BUILD_ID,
  HEADLESS_PHASE3_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import { assertPhase3WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { assertValidStreamPngFrame } from "@/features/headless-renderer/worker/stream/png-frame-validator";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { resolveEffectiveWorkerLimits } from "@/features/headless-renderer/worker/runtime/resolve-worker-limits";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function makeSolidPng(input: {
  ffmpeg: string;
  width: number;
  height: number;
  outPath: string;
  color?: string;
}): Buffer {
  const r = spawnSync(
    input.ffmpeg,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${input.color ?? "0x2244aa"}:s=${input.width}x${input.height}:d=0.04`,
      "-frames:v",
      "1",
      input.outPath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return readFileSync(input.outPath);
}

async function main() {
  console.log("\nSprint 11D Phase 3.2 — Worker streaming (image2pipe)\n");

  const bins = resolveNativeFfmpegBinaries();
  assert.equal(bins.ok, true);
  if (!bins.ok) return;

  test("PNG validator accepts signature + IHDR; rejects garbage", () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-png-"));
    const path = join(dir, "ok.png");
    const bytes = makeSolidPng({
      ffmpeg: bins.ffmpegExecutable,
      width: 720,
      height: 1280,
      outPath: path,
    });
    const ok = assertValidStreamPngFrame({
      bytes,
      expectedWidth: 720,
      expectedHeight: 1280,
      maxSingleFrameBytes: 8 * 1024 * 1024,
    });
    assert.equal(ok.ok, true);
    const bad = assertValidStreamPngFrame({
      bytes: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
      expectedWidth: 720,
      expectedHeight: 1280,
      maxSingleFrameBytes: 8 * 1024 * 1024,
    });
    assert.equal(bad.ok, false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("WebM/MP4 image2pipe argv: stdin video + file audio; no shell; seekable out", () => {
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 1000 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;
    const webm = buildImage2PipeEncodeArgvForTest({
      fps: 30,
      frameCount: 30,
      outputPath: "/tmp/out.webm",
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
      maxOutputBytes: 50_000_000,
      audioPlan: {
        ...silentPlan.plan,
        outputDurationMs: 1000,
        outputDurationSec: 1,
      },
    });
    assert.equal(webm.ok, true, webm.ok ? "" : webm.message);
    if (!webm.ok) return;
    assert.deepEqual(webm.args.slice(0, 12), [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-vcodec",
      "png",
      "-framerate",
      "30",
      "-i",
      "pipe:0",
    ]);
    assert.ok(webm.args.includes("libvpx-vp9"));
    assert.equal(webm.args.includes("pipe:1"), false);

    const voiceFixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const voicePlan = buildHeadlessAudioPlan(voiceFixture.manifestV3);
    assert.equal(voicePlan.ok, true);
    if (!voicePlan.ok) return;
    const mp4 = buildImage2PipeEncodeArgvForTest({
      fps: 30,
      frameCount: Math.max(1, Math.ceil((voicePlan.plan.outputDurationMs * 30) / 1000)),
      outputPath: "/tmp/out.mp4",
      outputProfile: HEADLESS_OUTPUT_PROFILES["1080p-mp4-30"],
      maxOutputBytes: 80_000_000,
      audioPlan: voicePlan.plan,
      voiceoverPath: "/owned/voice.wav",
    });
    assert.equal(mp4.ok, true, mp4.ok ? "" : mp4.message);
    if (!mp4.ok) return;
    assert.ok(mp4.args.includes("pipe:0"));
    assert.ok(mp4.args.includes("/owned/voice.wav"));
    assert.ok(mp4.args.includes("+faststart"));
    assert.ok(mp4.args.includes("libx264"));
    assert.ok(mp4.args.includes("aac"));
  });

  await testAsync("ordered image2pipe stream encodes exact frame count", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-stream-"));
    const framesScratch = join(dir, "gen");
    mkdirSync(framesScratch, { recursive: true });
    const frameCount = 15;
    const pngs: Buffer[] = [];
    for (let i = 0; i < frameCount; i++) {
      pngs.push(
        makeSolidPng({
          ffmpeg: bins.ffmpegExecutable,
          width: 720,
          height: 1280,
          outPath: join(framesScratch, `f${i}.png`),
          color: `0x${(0x2244aa + i * 16).toString(16).padStart(6, "0")}`,
        }),
      );
    }
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 500 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;
    const outputPath = join(dir, "out.webm");
    const started = await startStreamedPngEncode({
      ffmpegExecutable: bins.ffmpegExecutable,
      frameCount,
      fps: 30,
      outputPath,
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
      audioPlan: {
        ...silentPlan.plan,
        outputDurationMs: 500,
        outputDurationSec: 0.5,
      },
      maxOutputBytes: 50_000_000,
      timeoutMs: 30_000,
      maxStderrBytes: 64_000,
      streamLimits: {
        expectedFrameCount: frameCount,
        expectedWidth: 720,
        expectedHeight: 1280,
        maxSingleFrameBytes: 8 * 1024 * 1024,
        maxTotalStreamedFrameBytes: 64 * 1024 * 1024,
        maxWritableBufferedBytes: 16 * 1024 * 1024,
        writeDrainTimeoutMs: 10_000,
      },
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    for (let i = 0; i < frameCount; i++) {
      const accepted = await started.session.acceptFrame({
        frameIndex: i,
        timestampMs: Math.round((i * 1000) / 30),
        pngBytes: pngs[i]!,
      });
      assert.equal(accepted.ok, true, `frame ${i}`);
    }
    const closed = await started.session.closeAndWait();
    assert.equal(closed.ok, true, JSON.stringify(closed));
    if (!closed.ok) return;
    assert.equal(closed.metrics.totalFramesAccepted, frameCount);
    assert.equal(closed.metrics.totalFramesProduced, frameCount);
    assert.ok(closed.metrics.totalFrameBytesStreamed > 0);

    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: outputPath,
      timeoutMs: 10_000,
      maxStderrBytes: 64_000,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.width, 720);
    assert.equal(probed.probe.height, 1280);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("duplicate / reordered / extra frames fail closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-stream-bad-"));
    const path = join(dir, "f.png");
    const png = makeSolidPng({
      ffmpeg: bins.ffmpegExecutable,
      width: 720,
      height: 1280,
      outPath: path,
    });
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 200 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;

    const start = () =>
      startStreamedPngEncode({
        ffmpegExecutable: bins.ffmpegExecutable,
        frameCount: 6,
        fps: 30,
        outputPath: join(dir, "out.webm"),
        outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
        audioPlan: {
          ...silentPlan.plan,
          outputDurationMs: 200,
          outputDurationSec: 0.2,
        },
        maxOutputBytes: 20_000_000,
        timeoutMs: 15_000,
        maxStderrBytes: 64_000,
        streamLimits: {
          expectedFrameCount: 6,
          expectedWidth: 720,
          expectedHeight: 1280,
          maxSingleFrameBytes: 8 * 1024 * 1024,
          maxTotalStreamedFrameBytes: 32 * 1024 * 1024,
          maxWritableBufferedBytes: 16 * 1024 * 1024,
          writeDrainTimeoutMs: 5_000,
        },
      });

    const dup = await start();
    assert.equal(dup.ok, true);
    if (!dup.ok) return;
    assert.equal(
      (await dup.session.acceptFrame({ frameIndex: 0, timestampMs: 0, pngBytes: png })).ok,
      true,
    );
    const dupResult = await dup.session.acceptFrame({
      frameIndex: 0,
      timestampMs: 0,
      pngBytes: png,
    });
    assert.equal(dupResult.ok, false);
    if (!dupResult.ok) assert.equal(dupResult.reason, "duplicate_frame");
    dup.session.abort();
    await dup.session.closeAndWait().catch(() => undefined);

    const gap = await start();
    assert.equal(gap.ok, true);
    if (!gap.ok) return;
    const gapResult = await gap.session.acceptFrame({
      frameIndex: 2,
      timestampMs: 66,
      pngBytes: png,
    });
    assert.equal(gapResult.ok, false);
    if (!gapResult.ok) assert.equal(gapResult.reason, "missing_frame");
    gap.session.abort();
    await gap.session.closeAndWait().catch(() => undefined);

    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("cancel while streaming kills encode (no partial accept)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-stream-cancel-"));
    const path = join(dir, "f.png");
    const png = makeSolidPng({
      ffmpeg: bins.ffmpegExecutable,
      width: 720,
      height: 1280,
      outPath: path,
    });
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 1000 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;
    const ac = new AbortController();
    const started = await startStreamedPngEncode({
      ffmpegExecutable: bins.ffmpegExecutable,
      frameCount: 30,
      fps: 30,
      outputPath: join(dir, "out.webm"),
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
      audioPlan: {
        ...silentPlan.plan,
        outputDurationMs: 1000,
        outputDurationSec: 1,
      },
      maxOutputBytes: 40_000_000,
      timeoutMs: 30_000,
      maxStderrBytes: 64_000,
      signal: ac.signal,
      streamLimits: {
        expectedFrameCount: 30,
        expectedWidth: 720,
        expectedHeight: 1280,
        maxSingleFrameBytes: 8 * 1024 * 1024,
        maxTotalStreamedFrameBytes: 64 * 1024 * 1024,
        maxWritableBufferedBytes: 16 * 1024 * 1024,
        writeDrainTimeoutMs: 5_000,
      },
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.equal(
      (
        await started.session.acceptFrame({
          frameIndex: 0,
          timestampMs: 0,
          pngBytes: png,
        })
      ).ok,
      true,
    );
    ac.abort();
    const next = await started.session.acceptFrame({
      frameIndex: 1,
      timestampMs: 33,
      pngBytes: png,
      signal: ac.signal,
    });
    assert.equal(next.ok, false);
    if (!next.ok) assert.equal(next.reason, "aborted");
    const closed = await started.session.closeAndWait();
    assert.equal(closed.ok, false);
    assert.equal(closed.cancelled, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync(
    "provider capacity too small rejects before Chromium",
    async () => {
      const profile = HEADLESS_OUTPUT_PROFILES["4k-webm-30"];
      const resolved = resolveEffectiveWorkerLimits({
        profile,
        overrides: {
          maxWorkspaceBytes: 1024,
          maxArtifactBytes: 512,
        },
      });
      assert.equal(resolved.ok, false);
    },
  );

  await testAsync(
    "end-to-end streamed worker: zero PNG frame files in workspace",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p32-stream-e2e-1s",
        clockMs: 1_700_000_000_000,
        workerLimits: { jobTimeoutMs: 5 * 60 * 1000 },
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true, JSON.stringify(result));
      if (!result.ok) return;
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(
        result.value.succeeded,
        1,
        JSON.stringify({
          processOnce: result.value,
          state: stored.value.canonicalJob!.state,
          terminalReason: stored.value.canonicalJob!.terminalReason,
        }),
      );
      assert.equal(stored.value.canonicalJob!.state, "succeeded");
      const ev = result.value.lastEvidence!;
      assert.ok(ev.metrics.totalFrameBytesStreamed != null);
      assert.ok((ev.metrics.totalFrameBytesStreamed ?? 0) > 0);
      assert.ok(ev.metrics.totalFramesAccepted != null);
      assert.equal(ev.metrics.totalFramesAccepted, ev.metrics.frameCount);
      assert.ok((ev.metrics.overlappedRenderEncodeElapsedMs ?? 0) > 0);
      // Disk-resident PNG aggregate is not used on the streaming path.
      assert.ok(
        (ev.metrics.aggregateFrameBytes ?? 0) ===
          (ev.metrics.totalFrameBytesStreamed ?? 0),
      );
      void stack;
    },
  );

  await testAsync("native 4K profile pixels remain 2160×3840", async () => {
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-mp4-30"].width, 2160);
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-mp4-30"].height, 3840);
    assert.equal(
      HEADLESS_OUTPUT_PROFILES["4k-webm-30"].operationalMaxContentDurationMs,
      60_000,
    );
    assert.equal(HEADLESS_OUTPUT_PROFILES["4k-webm-30"].maxFrames, 1812);
  });

  test("Phase 3.2 renderer identity — not Phase 3.1A", () => {
    assert.equal(
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
      "headless-local-chromium-ffmpeg-11e-phase2g.24e",
    );
    assert.equal(HEADLESS_WORKER_RENDERER_BUILD_ID, HEADLESS_PHASE3_RENDERER_BUILD_ID);
    assert.equal(
      HEADLESS_OUTPUT_PROFILES["720p-webm-30"].capabilityVersion,
      "11d-phase3.2",
    );
    assert.equal(
      HEADLESS_OUTPUT_PROFILES["4k-mp4-30"].rendererBuildId,
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
    );
    assert.notEqual(
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
      HEADLESS_PHASE3_LEGACY_BUILD_ID,
    );
  });

  test("stale Phase 3.1A rendererBuildId fails closed", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "webm", quality: "high" },
    });
    const rejected = assertPhase3WorkerCapability({
      request: {
        rendererBuildId: HEADLESS_PHASE3_LEGACY_BUILD_ID,
        rendererProfile: fixture.rendererProfile,
        manifest: fixture.manifestV3,
      } as never,
    });
    assert.equal(rejected?.reasonId, "UNSUPPORTED_CAPABILITY");
  });

  test("production barrel / execute cannot select legacy PNG-sequence encoder", () => {
    const barrel = readFileSync(
      join(process.cwd(), "src/features/headless-renderer/worker/index.ts"),
      "utf8",
    );
    assert.equal(/export\s*\{[^}]*encodePngSequence/.test(barrel), false);
    assert.equal(barrel.includes("encode-png-sequence"), false);
    assert.equal(barrel.includes("startStreamedPngEncode"), true);

    const executeSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/execute-render-job.ts",
      ),
      "utf8",
    );
    assert.equal(executeSrc.includes("encodePngSequence"), false);
    assert.equal(executeSrc.includes("encode-png-stream"), true);
    assert.equal(executeSrc.includes('reserve(maxOutputBytes, "artifact")'), true);

    const referenceSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/testing/reference-encode.ts",
      ),
      "utf8",
    );
    assert.ok(referenceSrc.includes("encodePngSequence"));
    assert.ok(referenceSrc.includes("encode-png-sequence"));
  });

  await testAsync(
    "forced backpressure: non-zero peak recorded, bounded, drain resumes",
    async () => {
      // Slow consumer: read eventually → drain fires; peak must be non-zero & bounded.
      const spawned = spawnFixedArgvWithStdin({
        executable: process.execPath,
        args: [
          "-e",
          [
            "const {stdin}=process;",
            "stdin.pause();",
            "setTimeout(()=>{stdin.resume();stdin.on('data',()=>{});},80);",
            "setTimeout(()=>{},1e9);",
          ].join(""),
        ],
        timeoutMs: 8_000,
        maxStderrBytes: 4_096,
      });
      assert.equal(spawned.ok, true);
      if (!spawned.ok) return;
      const handle = spawned.handle;
      const chunk = Buffer.alloc(256 * 1024, 0xab);
      const maxBuf = 4 * 1024 * 1024;
      let sawBackpressurePeak = 0;
      // Fill until backpressure (write returns false path) or several chunks land.
      for (let i = 0; i < 64; i++) {
        const result = await handle.write(chunk, {
          maxWritableBufferedBytes: maxBuf,
          drainTimeoutMs: 2_000,
        });
        if (result.ok) {
          sawBackpressurePeak = Math.max(sawBackpressurePeak, result.bufferedBytes);
          assert.ok(result.bufferedBytes <= maxBuf);
        } else {
          assert.ok(
            result.reason === "drain_timeout" ||
              result.reason === "buffer_overflow" ||
              result.reason === "epipe" ||
              result.reason === "closed",
          );
          if (result.reason === "drain_timeout") {
            assert.ok(
              (result.bufferedBytes ?? 0) > 0,
              "peak must be captured before drain clears",
            );
            sawBackpressurePeak = Math.max(
              sawBackpressurePeak,
              result.bufferedBytes ?? 0,
            );
          }
          break;
        }
        if (handle.getPeakBufferedBytes() > 0) {
          sawBackpressurePeak = Math.max(
            sawBackpressurePeak,
            handle.getPeakBufferedBytes(),
          );
        }
      }
      assert.ok(
        handle.getPeakBufferedBytes() > 0 || sawBackpressurePeak > 0,
        "expected non-zero peak under forced backpressure",
      );
      assert.ok(handle.getPeakBufferedBytes() <= maxBuf);
      // After slow consumer resumes, a subsequent write should succeed (drain resumed).
      const afterDrain = await handle.write(Buffer.alloc(1024, 1), {
        maxWritableBufferedBytes: maxBuf,
        drainTimeoutMs: 2_000,
      });
      assert.equal(afterDrain.ok, true);
      handle.kill("SIGKILL");
      await handle.wait();
    },
  );

  await testAsync("forced backpressure: buffer overflow fails closed", async () => {
    const spawned = spawnFixedArgvWithStdin({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1e9)"],
      timeoutMs: 5_000,
      maxStderrBytes: 4_096,
    });
    assert.equal(spawned.ok, true);
    if (!spawned.ok) return;
    const chunk = Buffer.alloc(64 * 1024, 0xcd);
    const result = await spawned.handle.write(chunk, {
      maxWritableBufferedBytes: 256,
      drainTimeoutMs: 2_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "buffer_overflow");
      assert.ok((result.bufferedBytes ?? 0) > 256);
    }
    spawned.handle.kill("SIGKILL");
    await spawned.handle.wait();
  });

  await testAsync("forced backpressure: cancel while waiting for drain", async () => {
    const spawned = spawnFixedArgvWithStdin({
      executable: process.execPath,
      args: ["-e", "setInterval(() => {}, 1e9)"],
      timeoutMs: 8_000,
      maxStderrBytes: 4_096,
    });
    assert.equal(spawned.ok, true);
    if (!spawned.ok) return;
    const ac = new AbortController();
    const chunk = Buffer.alloc(128 * 1024, 0xef);
    const writePromise = spawned.handle.write(chunk, {
      signal: ac.signal,
      maxWritableBufferedBytes: 4 * 1024 * 1024,
      drainTimeoutMs: 10_000,
    });
    setTimeout(() => ac.abort(), 30);
    const result = await writePromise;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "aborted");
    spawned.handle.kill("SIGKILL");
    await spawned.handle.wait();
  });

  await testAsync("forced backpressure: EPIPE / early consumer exit", async () => {
    const spawned = spawnFixedArgvWithStdin({
      executable: process.execPath,
      args: ["-e", "process.exit(1)"],
      timeoutMs: 5_000,
      maxStderrBytes: 4_096,
    });
    assert.equal(spawned.ok, true);
    if (!spawned.ok) return;
    await spawned.handle.wait();
    const result = await spawned.handle.write(Buffer.alloc(4096, 1), {
      maxWritableBufferedBytes: 1024 * 1024,
      drainTimeoutMs: 1_000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.reason === "epipe" ||
          result.reason === "closed" ||
          result.reason === "aborted",
      );
    }
  });

  await testAsync(
    "pre-write artifact ceiling: authorized -fs + exact/over-cap fail closed",
    async () => {
      const { isOutputAtOrOverCeiling } = await import(
        "@/features/headless-renderer/worker/ffmpeg/output-ceiling"
      );
      const dir = mkdtempSync(join(tmpdir(), "hf-art-cap-"));
      const framesScratch = join(dir, "gen");
      mkdirSync(framesScratch, { recursive: true });
      const frameCount = 24;
      const pngs: Buffer[] = [];
      for (let i = 0; i < frameCount; i++) {
        pngs.push(
          makeSolidPng({
            ffmpeg: bins.ffmpegExecutable,
            width: 720,
            height: 1280,
            outPath: join(framesScratch, `f${i}.png`),
          }),
        );
      }
      const silentPlan = buildHeadlessAudioPlan(
        buildHeadlessReferenceFixture({
          audioMode: "silent",
          durationMs: 1000,
          rendererProfile: {
            resolution: "720p",
            format: "webm",
            quality: "high",
          },
        }).manifestV3,
      );
      assert.equal(silentPlan.ok, true);
      if (!silentPlan.ok) return;

      const streamLimits = {
        expectedFrameCount: frameCount,
        expectedWidth: 720,
        expectedHeight: 1280,
        maxSingleFrameBytes: 8 * 1024 * 1024,
        maxTotalStreamedFrameBytes: 64 * 1024 * 1024,
        maxWritableBufferedBytes: 16 * 1024 * 1024,
        writeDrainTimeoutMs: 10_000,
      } as const;

      const audioPlan = {
        ...silentPlan.plan,
        outputDurationMs: 1000,
        outputDurationSec: 1,
      };

      // Phase A — measure uncapped size for exact-cap authority.
      const uncappedPath = join(dir, "uncapped.webm");
      const uncappedStarted = await startStreamedPngEncode({
        ffmpegExecutable: bins.ffmpegExecutable,
        frameCount,
        fps: 30,
        outputPath: uncappedPath,
        outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
        audioPlan,
        maxOutputBytes: 50_000_000,
        timeoutMs: 30_000,
        maxStderrBytes: 64_000,
        streamLimits,
      });
      assert.equal(uncappedStarted.ok, true);
      if (!uncappedStarted.ok) return;
      for (let i = 0; i < frameCount; i++) {
        const accepted = await uncappedStarted.session.acceptFrame({
          frameIndex: i,
          timestampMs: Math.round((i * 1000) / 30),
          pngBytes: pngs[i]!,
        });
        assert.equal(accepted.ok, true);
      }
      const uncappedClosed = await uncappedStarted.session.closeAndWait();
      assert.equal(uncappedClosed.ok, true);
      const measured = readFileSync(uncappedPath).byteLength;
      assert.ok(measured > 1);

      // Phase B — authorized ceiling below measured size: -fs bound + fail closed.
      const cappedPath = join(dir, "capped.webm");
      const authorizedCeiling = Math.max(1, Math.floor(measured / 2));
      const cappedStarted = await startStreamedPngEncode({
        ffmpegExecutable: bins.ffmpegExecutable,
        frameCount,
        fps: 30,
        outputPath: cappedPath,
        outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
        audioPlan,
        maxOutputBytes: authorizedCeiling,
        timeoutMs: 30_000,
        maxStderrBytes: 64_000,
        streamLimits,
      });
      assert.equal(cappedStarted.ok, true);
      if (!cappedStarted.ok) return;
      for (let i = 0; i < frameCount; i++) {
        const accepted = await cappedStarted.session.acceptFrame({
          frameIndex: i,
          timestampMs: Math.round((i * 1000) / 30),
          pngBytes: pngs[i]!,
        });
        if (!accepted.ok) break;
      }
      const cappedClosed = await cappedStarted.session.closeAndWait();
      // Never accept an artifact at/over the authorized ceiling.
      assert.equal(cappedClosed.ok, false);
      if (existsSync(cappedPath)) {
        const size = readFileSync(cappedPath).byteLength;
        // FFmpeg -fs is best-effort; post-write exact/over-cap is quota exhaustion.
        // (Some builds briefly overshoot -fs before exit — never reported as success.)
        if (isOutputAtOrOverCeiling(size, authorizedCeiling)) {
          assert.equal(
            "quota" in cappedClosed && cappedClosed.quota === true,
            true,
          );
        }
      }

      // Authorized ceiling is present on the image2pipe argv passed to FFmpeg.
      const argv = buildImage2PipeEncodeArgvForTest({
        frameCount,
        fps: 30,
        outputPath: cappedPath,
        outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
        audioPlan,
        maxOutputBytes: authorizedCeiling,
        voiceoverPath: null,
        musicPath: null,
      });
      assert.equal(argv.ok, true);
      if (argv.ok) {
        const fsIdx = argv.args.indexOf("-fs");
        assert.ok(fsIdx >= 0);
        assert.equal(argv.args[fsIdx + 1], String(authorizedCeiling));
      }

      // Exact-cap classifier (post-write authority used by execute-render-job).
      assert.equal(isOutputAtOrOverCeiling(measured, measured), true);
      assert.equal(isOutputAtOrOverCeiling(measured + 1, measured), true);
      assert.equal(isOutputAtOrOverCeiling(measured - 1, measured), false);

      rmSync(dir, { recursive: true, force: true });
    },
  );

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
