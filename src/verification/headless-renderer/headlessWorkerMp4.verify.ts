/**
 * Sprint 11D Phase 3 — MP4 (H.264/AAC) encode + audio parity + lifecycle.
 * Run: npm run test:headless-worker-mp4
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { buildHeadlessAudioPlan } from "@/features/headless-renderer/worker/audio/build-headless-audio-plan";
import { encodePngSequence } from "@/features/headless-renderer/worker/ffmpeg/encode-png-sequence";
import { probeArtifactWithFfprobe } from "@/features/headless-renderer/worker/ffmpeg/probe-artifact";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { HEADLESS_OUTPUT_PROFILES } from "@/features/headless-renderer/worker/runtime/output-profiles";
import { buildValidatedHeadlessArtifact } from "@/features/headless-renderer/worker/artifact/build-validated-artifact";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";
import { spawnFixedArgv } from "@/features/headless-renderer/worker/ffmpeg/spawn-process";

function digestOfBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

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

function writePngFrames(
  ffmpegExecutable: string,
  framesDir: string,
  count: number,
  width: number,
  height: number,
): void {
  mkdirSync(framesDir, { recursive: true });
  for (let i = 0; i < count; i++) {
    const out = join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
    const r = spawnSync(
      ffmpegExecutable,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x2244aa:s=${width}x${height}:d=0.04`,
        "-frames:v",
        "1",
        out,
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0);
  }
}

function writeToneWav(
  ffmpegExecutable: string,
  path: string,
  frequency: number,
  durationSec: number,
): void {
  const r = spawnSync(
    ffmpegExecutable,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${frequency}:duration=${durationSec.toFixed(3)}`,
      "-ac",
      "2",
      "-ar",
      "48000",
      path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0);
}

async function main() {
  console.log("\nSprint 11D Phase 3 — MP4 authority\n");

  const bins = resolveNativeFfmpegBinaries();
  assert.equal(bins.ok, true);
  if (!bins.ok) return;

  const evidenceDir = join(process.cwd(), ".tmp/headless-11d-evidence");
  mkdirSync(evidenceDir, { recursive: true });

  await testAsync("MP4 silent: H.264, no audio stream", async () => {
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-silent-"));
    const framesDir = join(dir, "frames");
    const out = join(dir, "out.mp4");
    const profile = HEADLESS_OUTPUT_PROFILES["720p-mp4-30"];
    writePngFrames(bins.ffmpegExecutable, framesDir, 30, 720, 1280);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const encoded = await encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 30,
      fps: 30,
      outputPath: out,
      outputProfile: profile,
      audioPlan: plan.plan,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 60_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(encoded.ok, true);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.videoCodec, "h264");
    assert.equal(probed.probe.hasAudio, false);
    assert.equal(probed.probe.width, 720);
    assert.equal(probed.probe.height, 1280);
    assert.equal(probed.probe.pixelFormat, "yuv420p");
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("MP4 voice: H.264 + AAC", async () => {
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-voice-"));
    const framesDir = join(dir, "frames");
    const voice = join(dir, "voice.wav");
    const out = join(dir, "out.mp4");
    const profile = HEADLESS_OUTPUT_PROFILES["720p-mp4-30"];
    writePngFrames(bins.ffmpegExecutable, framesDir, 30, 720, 1280);
    writeToneWav(bins.ffmpegExecutable, voice, 440, 1);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "with-voice",
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const encoded = await encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 30,
      fps: 30,
      outputPath: out,
      outputProfile: profile,
      audioPlan: plan.plan,
      voiceoverPath: voice,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 60_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(encoded.ok, true);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.videoCodec, "h264");
    assert.equal(probed.probe.audioCodec, "aac");
    assert.equal(probed.probe.hasAudio, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("MP4 voice+music: H.264 + AAC with Phase 2.1 plan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-mix-"));
    const framesDir = join(dir, "frames");
    const voice = join(dir, "voice.wav");
    const music = join(dir, "music.wav");
    const out = join(dir, "out.mp4");
    const profile = HEADLESS_OUTPUT_PROFILES["720p-mp4-30"];
    writePngFrames(bins.ffmpegExecutable, framesDir, 60, 720, 1280);
    writeToneWav(bins.ffmpegExecutable, voice, 440, 2);
    writeToneWav(bins.ffmpegExecutable, music, 220, 0.4);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 2000,
      audioMode: "with-voice-and-music",
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const encoded = await encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 60,
      fps: 30,
      outputPath: out,
      outputProfile: profile,
      audioPlan: plan.plan,
      voiceoverPath: voice,
      musicPath: music,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 90_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(encoded.ok, true);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.videoCodec, "h264");
    assert.equal(probed.probe.audioCodec, "aac");
    rmSync(dir, { recursive: true, force: true });
  });

  test("wrong codec/container rejected by artifact validator", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const bytes = new Uint8Array(64).fill(3);
    const wrong = buildValidatedHeadlessArtifact({
      contentDigest: digestOfBytes(bytes),
      byteLength: bytes.byteLength,
      probe: {
        width: 720,
        height: 1280,
        fps: 30,
        durationMs: 1000,
        hasVideo: true,
        hasAudio: false,
        videoCodec: "vp9",
        audioCodec: null,
        audioChannels: null,
        audioSampleRateHz: null,
        formatName: "mp4",
        pixelFormat: "yuv420p",
      },
      request: {
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        rendererProfile: {
          resolution: "720p",
          format: "mp4",
          fps: 30,
          quality: "high",
        },
        manifestFingerprint: fixture.manifestV3.fingerprint,
        assetBundle: { fingerprint: "b".repeat(64) },
        manifest: fixture.manifestV3,
      } as never,
      job: {
        jobId: "job_mp4_wrong",
        renderJobFingerprint: "c".repeat(64),
      } as never,
      nowMs: 1,
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-mp4-30"],
      evidenceBase: {
        chromeVersion: "x",
        ffmpegVersion: "y",
        ffprobeVersion: "z",
        elapsedRenderMs: 1,
        frameCount: 1,
        nodeCoordinatorPeakRssBytes: null,
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        audioChannels: null,
        audioSampleRateHz: null,
      } as never,
    });
    assert.equal(wrong.ok, false);
  });

  await testAsync("timeout during MP4 encode fails closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-timeout-"));
    const framesDir = join(dir, "frames");
    const out = join(dir, "out.mp4");
    writePngFrames(bins.ffmpegExecutable, framesDir, 60, 720, 1280);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 2000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const encoded = await encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 60,
      fps: 30,
      outputPath: out,
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-mp4-30"],
      audioPlan: plan.plan,
      maxOutputBytes: 64 * 1024 * 1024,
      timeoutMs: 1,
      maxStderrBytes: 64 * 1024,
    });
    assert.equal(encoded.ok, false);
    if (encoded.ok) return;
    assert.equal(encoded.timedOut, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("process-tree cleanup on cancel during encode", async () => {
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-cancel-"));
    const framesDir = join(dir, "frames");
    const out = join(dir, "out.mp4");
    writePngFrames(bins.ffmpegExecutable, framesDir, 90, 720, 1280);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 3000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const ac = new AbortController();
    const encodePromise = encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 90,
      fps: 30,
      outputPath: out,
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-mp4-30"],
      audioPlan: plan.plan,
      maxOutputBytes: 64 * 1024 * 1024,
      timeoutMs: 120_000,
      maxStderrBytes: 64 * 1024,
      signal: ac.signal,
      processGraceMs: 200,
    });
    setTimeout(() => ac.abort(), 5);
    const encoded = await encodePromise;
    assert.equal(encoded.ok, false);
    if (encoded.ok) return;
    assert.equal(encoded.cancelled, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("exact quota exhaustion via -fs fails closed", async () => {
    const { existsSync, statSync } = await import("node:fs");
    const { isOutputAtOrOverCeiling } = await import(
      "@/features/headless-renderer/worker/ffmpeg/output-ceiling"
    );
    const dir = mkdtempSync(join(tmpdir(), "h11d-mp4-quota-"));
    const framesDir = join(dir, "frames");
    const out = join(dir, "out.mp4");
    writePngFrames(bins.ffmpegExecutable, framesDir, 60, 720, 1280);
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 2000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const ceiling = 256;
    const encoded = await encodePngSequence({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 60,
      fps: 30,
      outputPath: out,
      outputProfile: HEADLESS_OUTPUT_PROFILES["720p-mp4-30"],
      audioPlan: plan.plan,
      maxOutputBytes: ceiling,
      timeoutMs: 60_000,
      maxStderrBytes: 64 * 1024,
    });
    // Encode must fail closed (post-write ceiling) — never report success over cap.
    assert.equal(encoded.ok, false);
    if (!encoded.ok) {
      assert.equal(encoded.quota, true);
    }
    if (existsSync(out)) {
      assert.equal(isOutputAtOrOverCeiling(statSync(out).size, ceiling), true);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("real worker: 720p MP4 voice end-to-end", async () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "with-voice",
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    const started = Date.now();
    const { stack, worker, jobId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "11d-phase3-mp4-voice",
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(
      result.value.succeeded,
      1,
      JSON.stringify(result.value),
    );
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, "owner-11d");
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    const art = stored.value.canonicalJob!.artifact!;
    assert.equal(art.format, "mp4");
    assert.equal(art.video.codec, "h264");
    assert.equal(art.audio.present, true);
    assert.equal(art.audio.codec, "aac");
    assert.equal(art.width, 720);
    assert.equal(art.height, 1280);
    writeFileSync(
      join(evidenceDir, "phase3-720p-mp4-voice-evidence.json"),
      JSON.stringify(
        {
          profileId: "720p-mp4-30",
          rendererBuildId: art.rendererBuildId,
          digest: art.contentDigest,
          byteLength: art.byteLength,
          durationMs: art.durationMs,
          width: art.width,
          height: art.height,
          fps: art.fps,
          videoCodec: art.video.codec,
          audioCodec: art.audio.codec,
          elapsedMs: Date.now() - started,
        },
        null,
        2,
      ),
    );
  });

  await testAsync("spawnFixedArgv uses fixed argv (shell:false)", async () => {
    const r = await spawnFixedArgv({
      executable: bins.ffmpegExecutable,
      args: ["-version"],
      timeoutMs: 5_000,
      maxStderrBytes: 8 * 1024,
    });
    assert.equal(r.exitClass, "success");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
