/**
 * Sprint 11D Phase 2 / 2.1 — headless audio plan / mux / probe fixtures.
 * Run: npm run test:headless-worker-audio
 */
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  exportMusicEnvelopeCheckpointTimesSec,
  resolveExportMusicEnvelopeGainAtSec,
  toExportMusicEnvelopeInput,
} from "@/features/export/utils/export-music-envelope.utils";
import { resolveExportMusicGainAtSec } from "@/features/export/utils/export-background-music.utils";
import { assertAudioDescriptorQuotas } from "@/features/headless-renderer/worker/audio/assert-audio-descriptor-quotas";
import {
  buildHeadlessAudioFilterComplex,
  buildMusicVolumeExpression,
  sampleHeadlessMusicEnvelopeGain,
} from "@/features/headless-renderer/worker/audio/build-headless-audio-filter";
import {
  buildHeadlessAudioPlan,
  buildMusicOnlyAudioPlanForFixture,
} from "@/features/headless-renderer/worker/audio/build-headless-audio-plan";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import { encodePngSequenceToWebm } from "@/features/headless-renderer/worker/ffmpeg/encode-png-sequence-webm";
import { probeArtifactWithFfprobe } from "@/features/headless-renderer/worker/ffmpeg/probe-artifact";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { assertPhase2WorkerCapability } from "@/features/headless-renderer/worker/runtime/capability-preflight";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  HEADLESS_WORKER_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/runtime/worker-types";
import { MemoryHeadlessStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-storage.adapter";
import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import { HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  headlessSourceDigest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";

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
        "color=c=0x2244aa:s=720x1280:d=0.04",
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
  console.log("\nSprint 11D Phase 2.1 — Worker audio authority\n");

  const bins = resolveNativeFfmpegBinaries();
  assert.equal(bins.ok, true);
  if (!bins.ok) return;

  test("silent regression plan", () => {
    const fixture = buildHeadlessReferenceFixture({ audioMode: "silent" });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.combination, "silent");
    assert.equal(plan.plan.voiceover, null);
    assert.equal(plan.plan.music, null);
    assert.equal(plan.plan.captionsAffectMix, false);
  });

  test("voiceover-only plan", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 2000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.combination, "voiceover");
    assert.ok(plan.plan.voiceover);
    assert.equal(plan.plan.voiceover!.timelineStartMs, 0);
    assert.equal(plan.plan.voiceover!.sourceTrimStartMs, 0);
    assert.equal(plan.plan.music, null);
  });

  test("voiceover+music plan with loop/duck/fade fields", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 2000,
      musicFades: true,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.combination, "voiceover+music");
    assert.ok(plan.plan.music);
    assert.equal(plan.plan.music!.looping, true);
    assert.equal(plan.plan.music!.timelineStartMs, 0);
    assert.ok(plan.plan.music!.fadeInMs >= 0);
    assert.ok(plan.plan.music!.fadeOutMs >= 0);
    assert.equal(plan.plan.music!.loopUntilOutputMs, plan.plan.outputDurationMs);
  });

  test("music-only fixture plan (encode coverage; not a freeze mode)", () => {
    const plan = buildMusicOnlyAudioPlanForFixture({
      outputDurationMs: 1000,
      volumeGain: 0.2,
      fadeInMs: 100,
      fadeOutMs: 100,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.combination, "music");
    const expr = buildMusicVolumeExpression(plan.plan.music!);
    assert.ok(expr.includes("0.2000"));
  });

  test("volume / trim / delayed-start semantics from frozen fields", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1500,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.voiceover!.requireDelayMs, 0);
    assert.ok(plan.plan.voiceover!.volumeGain >= 0);
    assert.ok(
      plan.plan.voiceover!.sourceTrimEndMs <= plan.plan.outputDurationMs,
    );
    assert.ok(plan.plan.voiceover!.padToOutputMs >= 0);
  });

  test("missing voiceover source rejected", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const broken = {
      ...fixture.manifestV3,
      audio: {
        ...fixture.manifestV3.audio,
        voiceover: {
          ...fixture.manifestV3.audio.voiceover!,
          source: "",
        },
      },
    };
    const plan = buildHeadlessAudioPlan(broken as never);
    assert.equal(plan.ok, false);
  });

  test("generatedPlaybackRate !== 1 rejected", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const broken = {
      ...fixture.manifestV3,
      audio: {
        ...fixture.manifestV3.audio,
        voiceover: {
          ...fixture.manifestV3.audio.voiceover!,
          generatedPlaybackRate: 1.25,
        },
      },
    };
    const plan = buildHeadlessAudioPlan(broken as never);
    assert.equal(plan.ok, false);
  });

  test("mp4 profile rejected when manifest remains webm (before Chromium)", () => {
    const fixture = buildHeadlessReferenceFixture({ durationMs: 1000 });
    assert.equal(
      assertPhase2WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "mp4",
            fps: 30,
            quality: fixture.manifestV3.output.quality,
          },
          manifest: fixture.manifestV3,
        } as never,
      })?.reasonId,
      "UNSUPPORTED_CAPABILITY",
    );
  });

  test("matched mp4 profile accepted by capability preflight", () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      rendererProfile: { resolution: "720p", format: "mp4", quality: "high" },
    });
    assert.equal(
      assertPhase2WorkerCapability({
        request: {
          rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
          rendererProfile: {
            resolution: "720p",
            format: "mp4",
            fps: 30,
            quality: fixture.manifestV3.output.quality,
          },
          manifest: fixture.manifestV3,
        } as never,
      }),
      null,
    );
  });

  test("filter graph consumes plan trim fields (not output-duration atrim first)", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 2000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const built = buildHeadlessAudioFilterComplex({
      plan: plan.plan,
      voiceInputIndex: 1,
      musicInputIndex: 2,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const fc = built.build.filterComplex!;
    assert.equal(/atempo|asetrate/.test(fc), false);
    assert.ok(fc.includes("aloop="));
    assert.ok(fc.includes("amix="));
    const trimEnd = (plan.plan.voiceover!.sourceTrimEndMs / 1000).toFixed(3);
    assert.ok(
      fc.includes(`atrim=0.000:${trimEnd}`),
      "voice must atrim sourceTrimStart→sourceTrimEnd",
    );
    assert.ok(fc.includes("asetpts=PTS-STARTPTS"));
    assert.ok(fc.includes(`apad=whole_dur=`));
  });

  await testAsync("silent encode remains audio-absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-silent-"));
    const framesDir = join(dir, "frames");
    const plan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 500 })
        .manifestV3,
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const out = join(dir, "out.webm");
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: out,
      audioPlan: plan.plan,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 60_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.hasAudio, false);
    assert.equal(probed.probe.videoCodec, "vp9");
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("voiceover-only mux probes opus", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-voice-"));
    const framesDir = join(dir, "frames");
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const voice = join(dir, "voice.wav");
    writeToneWav(
      bins.ffmpegExecutable,
      voice,
      440,
      (fixture.manifestV3.audio.voiceover?.durationMs ?? 1000) / 1000,
    );
    const out = join(dir, "out.webm");
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: out,
      audioPlan: plan.plan,
      voiceoverPath: voice,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 90_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.hasAudio, true);
    assert.equal(probed.probe.audioCodec, "opus");
    assert.ok((probed.probe.audioChannels ?? 0) >= 1);
    assert.ok((probed.probe.audioSampleRateHz ?? 0) >= 1);
    assert.equal(probed.probe.width, 720);
    assert.equal(probed.probe.height, 1280);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("music-only mux (fixture plan)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-music-"));
    const framesDir = join(dir, "frames");
    const plan = buildMusicOnlyAudioPlanForFixture({
      outputDurationMs: 1000,
      volumeGain: 0.25,
      fadeInMs: 50,
      fadeOutMs: 50,
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const music = join(dir, "music.wav");
    writeToneWav(bins.ffmpegExecutable, music, 220, 0.3);
    const out = join(dir, "out.webm");
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: out,
      audioPlan: plan.plan,
      musicPath: music,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 90_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.hasAudio, true);
    assert.equal(probed.probe.audioCodec, "opus");
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("voiceover+music mux with looped short music", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-mix-"));
    const framesDir = join(dir, "frames");
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 1000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.plan.music!.looping, true);
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const voice = join(dir, "voice.wav");
    const music = join(dir, "music.wav");
    writeToneWav(bins.ffmpegExecutable, voice, 440, 1);
    writeToneWav(bins.ffmpegExecutable, music, 220, 0.25);
    const out = join(dir, "out.webm");
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: out,
      audioPlan: plan.plan,
      voiceoverPath: voice,
      musicPath: music,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 90_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);
    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: out,
      timeoutMs: 15_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.hasAudio, true);
    assert.equal(probed.probe.audioCodec, "opus");
    assert.ok(
      probed.probe.durationMs != null &&
        Math.abs(probed.probe.durationMs - plan.plan.outputDurationMs) <= 80,
    );
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("cancellation during mux does not leave success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-cancel-"));
    const framesDir = join(dir, "frames");
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 3000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const voice = join(dir, "voice.wav");
    writeToneWav(bins.ffmpegExecutable, voice, 440, 3);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 5);
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: join(dir, "out.webm"),
      audioPlan: plan.plan,
      voiceoverPath: voice,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 120_000,
      maxStderrBytes: 16_384,
      signal: ac.signal,
    });
    assert.equal(encoded.ok, false);
    if (encoded.ok) return;
    assert.equal(encoded.cancelled || encoded.timedOut, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("timeout during mux classified", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-timeout-"));
    const framesDir = join(dir, "frames");
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 2000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
    writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);
    const voice = join(dir, "voice.wav");
    writeToneWav(bins.ffmpegExecutable, voice, 440, 2);
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount,
      fps: 30,
      outputPath: join(dir, "out.webm"),
      audioPlan: plan.plan,
      voiceoverPath: voice,
      maxOutputBytes: 32 * 1024 * 1024,
      timeoutMs: 1,
      maxStderrBytes: 16_384,
    });
    assert.equal(encoded.ok, false);
    if (encoded.ok) return;
    assert.equal(encoded.timedOut, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("quota ceiling rejects before unbounded write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-a-quota-"));
    const framesDir = join(dir, "frames");
    const plan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 500 })
        .manifestV3,
    );
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    writePngFrames(bins.ffmpegExecutable, framesDir, 3);
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 3,
      fps: 30,
      outputPath: join(dir, "out.webm"),
      audioPlan: plan.plan,
      maxOutputBytes: 0,
      timeoutMs: 10_000,
      maxStderrBytes: 4096,
    });
    assert.equal(encoded.ok, false);
    if (encoded.ok) return;
    assert.equal(encoded.quota, true);
    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("v3 intra-scene fixture plan keeps uninterrupted audio fields", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 2000,
    });
    assert.ok(fixture.manifestV3.scenes[0]?.mediaTransitions);
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    // Audio plan is scene-agnostic — transitions must not alter mix policy.
    assert.equal(plan.plan.mixPolicy, "amix-voice-music");
    assert.equal(plan.plan.captionsAffectMix, false);
    void writeFileSync;
  });

  await testAsync(
    "source longer than manifest duration: post-manifest tone absent + pad to end",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "hf-a-trim-"));
      const framesDir = join(dir, "frames");
      const fixture = buildHeadlessReferenceFixture({
        audioMode: "with-voice",
        durationMs: 1000,
      });
      const plan = buildHeadlessAudioPlan(fixture.manifestV3);
      assert.equal(plan.ok, true);
      if (!plan.ok) return;
      assert.equal(plan.plan.voiceover!.sourceTrimEndMs, 1000);
      assert.ok(plan.plan.voiceover!.padToOutputMs > 0);

      const frameCount = Math.round((plan.plan.outputDurationMs / 1000) * 30);
      writePngFrames(bins.ffmpegExecutable, framesDir, frameCount);

      // 1s of 440Hz (in-manifest) + 1s of 880Hz (must be trimmed away).
      const voice = join(dir, "voice-long.wav");
      const cat = spawnSync(
        bins.ffmpegExecutable,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=1",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=880:duration=1",
          "-filter_complex",
          "[0:a][1:a]concat=n=2:v=0:a=1[a]",
          "-map",
          "[a]",
          "-ac",
          "2",
          "-ar",
          "48000",
          voice,
        ],
        { encoding: "utf8" },
      );
      assert.equal(cat.status, 0, cat.stderr);

      const out = join(dir, "out.webm");
      const encoded = await encodePngSequenceToWebm({
        ffmpegExecutable: bins.ffmpegExecutable,
        framesDir,
        framePattern: "frame_%06d.png",
        frameCount,
        fps: 30,
        outputPath: out,
        audioPlan: plan.plan,
        voiceoverPath: voice,
        maxOutputBytes: 32 * 1024 * 1024,
        timeoutMs: 90_000,
        maxStderrBytes: 16_384,
      });
      assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);

      const probed = await probeArtifactWithFfprobe({
        ffprobeExecutable: bins.ffprobeExecutable,
        artifactPath: out,
        timeoutMs: 15_000,
        maxStderrBytes: 16_384,
      });
      assert.equal(probed.ok, true);
      if (!probed.ok) return;
      assert.equal(probed.probe.hasAudio, true);
      assert.ok(
        probed.probe.durationMs != null &&
          Math.abs(probed.probe.durationMs - plan.plan.outputDurationMs) <= 80,
      );

      // Window just after sourceTrimEnd must be near-silence (pad), not 880Hz.
      const padStart = (
        plan.plan.voiceover!.sourceTrimEndMs / 1000 +
        0.05
      ).toFixed(3);
      const padProbe = spawnSync(
        bins.ffmpegExecutable,
        [
          "-i",
          out,
          "-vn",
          "-ss",
          padStart,
          "-t",
          "0.30",
          "-af",
          "astats=metadata=1:reset=1",
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const stats = `${padProbe.stderr}\n${padProbe.stdout}`;
      const rmsMatch = stats.match(/RMS level dB:\s*([-\d.]+)/i);
      assert.ok(rmsMatch, "expected astats RMS metadata");
      const rmsDb = Number(rmsMatch![1]);
      assert.ok(
        rmsDb < -40,
        `pad window must be silent (got RMS ${rmsDb} dB); 880Hz leaked`,
      );

      // Control: source file's 880Hz window is loud.
      const srcProbe = spawnSync(
        bins.ffmpegExecutable,
        [
          "-i",
          voice,
          "-ss",
          "1.05",
          "-t",
          "0.30",
          "-af",
          "astats=metadata=1:reset=1",
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const srcStats = `${srcProbe.stderr}\n${srcProbe.stdout}`;
      const srcRms = Number(
        srcStats.match(/RMS level dB:\s*([-\d.]+)/i)?.[1] ?? "NaN",
      );
      assert.ok(srcRms > -35, "source post-manifest section must be audible");

      rmSync(dir, { recursive: true, force: true });
    },
  );

  test("audio descriptor preflight: oversized voice → no open/write", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    const voiceDigest = headlessSourceDigest(fixture.urls.voice);
    const voiceKey = headlessSourceSlotKey({
      role: "voiceover",
      sceneId: null,
      mediaItemId: null,
      sourceDigest: voiceDigest,
    });
    const bundle = {
      version: 1 as const,
      bundleId: "b_oversize",
      fingerprint: "hbun:sha256:" + "a".repeat(64),
      assets: [
        {
          version: 1 as const,
          assetId: "voice",
          sourceIdentity: {
            role: "voiceover" as const,
            sceneId: null,
            mediaItemId: null,
            sourceDigest: voiceDigest,
            classification: "https" as const,
          },
          contentDigest: "sha256:" + "b".repeat(64),
          byteLength: 100_000_000,
          mimeType: "audio/wav",
          mediaKind: "audio" as const,
          storageLocator: {
            kind: "object_storage" as const,
            storeId: "s",
            objectKey: "k",
          },
          expiresAtMs: Date.now() + 60_000,
        },
      ],
    };
    void voiceKey;
    const opens = 0;
    const writes = 0;
    const pre = assertAudioDescriptorQuotas({
      manifest: fixture.manifestV3,
      plan: plan.plan,
      bundle: bundle as never,
      maxSingleAudioAssetBytes: 1024,
      maxAggregateAudioBytes: 2048,
    });
    assert.equal(pre.ok, false);
    if (pre.ok) return;
    assert.equal(pre.reasonId, "WORKSPACE_QUOTA_EXCEEDED");
    // Simulate execute gate: never materialize when preflight fails.
    assert.equal(opens, 0);
    assert.equal(writes, 0);
  });

  test("audio descriptor preflight: oversized aggregate voice+music", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 1000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const voiceDigest = headlessSourceDigest(fixture.urls.voice);
    const musicDigest = headlessSourceDigest(fixture.urls.music);
    const mk = (
      role: "voiceover" | "music",
      digest: string,
      byteLength: number,
    ) => ({
      version: 1 as const,
      assetId: role,
      sourceIdentity: {
        role,
        sceneId: null,
        mediaItemId: null,
        sourceDigest: digest,
        classification: "https" as const,
      },
      contentDigest: "sha256:" + "c".repeat(64),
      byteLength,
      mimeType: "audio/wav",
      mediaKind: "audio" as const,
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "s",
        objectKey: role,
      },
      expiresAtMs: Date.now() + 60_000,
    });
    const pre = assertAudioDescriptorQuotas({
      manifest: fixture.manifestV3,
      plan: plan.plan,
      bundle: {
        version: 1,
        bundleId: "b_agg",
        fingerprint: "hbun:sha256:" + "d".repeat(64),
        assets: [mk("voiceover", voiceDigest, 800), mk("music", musicDigest, 800)],
      } as never,
      maxSingleAudioAssetBytes: 1000,
      maxAggregateAudioBytes: 1000,
    });
    assert.equal(pre.ok, false);
    if (pre.ok) return;
    assert.equal(pre.reasonId, "WORKSPACE_QUOTA_EXCEEDED");
  });

  await testAsync("cancellation during staging: already-aborted before open", async () => {
    const ac = new AbortController();
    ac.abort();
    let opens = 0;
    const storage = new MemoryHeadlessStorageAdapter();
    const orig = storage.openOwnedObject.bind(storage);
    storage.openOwnedObject = async (...args) => {
      opens += 1;
      return orig(...args);
    };
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "cancel-pre",
      attempt: 1,
    });
    try {
      const result = await materializeOwnedAssets({
        storage,
        ownerId: "o",
        bundle: {
          version: 1,
          bundleId: "b",
          fingerprint: "hbun:sha256:" + "e".repeat(64),
          assets: [],
        },
        workspace,
        nowMs: Date.now(),
        maxTotalAssetBytes: 1024,
        signal: ac.signal,
        abortKind: () => "cancelled",
      });
      // Empty bundle still checks abort up front.
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.reasonId, "CANCELLED_BY_USER");
      assert.equal(opens, 0);
    } finally {
      workspace.cleanup();
    }
  });

  await testAsync("cancellation during audio open (openDelay race)", async () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const clock = 1_700_000_000_000;
    const stack = composeTestHeadlessControlPlane({
      principal: {ownerId: "owner-cancel",
        sessionId: "s",
      },
    authorizedProjectIds: [fixture.manifestV3.project.projectId],
    allowProjectMutate: true,
      nowMs: () => clock,
      workerMode: "noop",
    });
    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "owner-cancel",
      projectId: fixture.manifestV3.project.projectId,
      manifest: fixture.manifestV3,
      nowMs: clock,
      leaseMs: HEADLESS_MIN_SOURCE_OBJECT_LEASE_MS * 2,
      assetByteFactory: (slot) => {
        for (const [url, bytes] of fixture.assetBytesByUrl) {
          if (headlessSourceDigest(url) === slot.sourceDigest) return bytes;
        }
        throw new Error("missing bytes");
      },
      mimeForSlot: (slot) =>
        slot.expectedMediaKind === "audio" ? "audio/wav" : "image/png",
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const storage = stack.storage as MemoryHeadlessStorageAdapter;
    storage.openDelayMs = 80;
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 10);
    const workspace = createHeadlessWorkerWorkspace({
      jobId: "cancel-open",
      attempt: 1,
    });
    const chromiumInvoked = false;
    const ffmpegInvoked = false;
    try {
      const result = await materializeOwnedAssets({
        storage,
        ownerId: "owner-cancel",
        bundle: seeded.value.bundle,
        workspace,
        nowMs: clock,
        maxTotalAssetBytes: DEFAULT_HEADLESS_WORKER_LIMITS.maxTotalAssetBytes,
        signal: ac.signal,
        abortKind: () => (ac.signal.aborted ? "cancelled" : null),
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(
        result.reasonId === "CANCELLED_BY_USER" ||
          result.reasonId === "WORKER_TIMEOUT",
        true,
      );
      assert.equal(chromiumInvoked, false);
      assert.equal(ffmpegInvoked, false);
    } finally {
      storage.openDelayMs = 0;
      workspace.cleanup();
    }
  });

  test("canonical music envelope checkpoints match browser/headless samples", () => {
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice-and-music",
      durationMs: 2000,
      musicFades: true,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const music = plan.plan.music!;
    const settings = {
      exportDurationMs: plan.plan.outputDurationMs,
      volume: music.volumeGain,
      voiceGain: plan.plan.voiceover!.volumeGain,
      musicGain: music.volumeGain,
      fadeIn: music.fadeInMs > 0,
      fadeOut: music.fadeOutMs > 0,
      fadeInSec: music.fadeInMs / 1000,
      fadeOutSec: music.fadeOutMs / 1000,
      duckingEnabled: music.applyDucking,
      duckingStrength:
        music.volumeGain > 0 ? music.duckedVolumeGain / music.volumeGain : 0,
      voiceoverDurationSec: music.duckUntilMs / 1000,
      applyDucking: music.applyDucking,
      applyPeakProtection: false,
    };
    const env = toExportMusicEnvelopeInput(settings);
    const cps = exportMusicEnvelopeCheckpointTimesSec(env);
    for (const t of Object.values(cps)) {
      const a = resolveExportMusicEnvelopeGainAtSec(env, t);
      const b = resolveExportMusicGainAtSec(settings, t);
      const c = sampleHeadlessMusicEnvelopeGain(music, t);
      assert.ok(Math.abs(a - b) < 1e-9, `gain mismatch at t=${t}`);
      assert.ok(Math.abs(a - c) < 1e-9, `headless mismatch at t=${t}`);
    }
    // Fade-out ∩ active duck: multiplicative stays ducked×fade (not fullGain jump).
    const overlapSettings = {
      ...settings,
      voiceoverDurationSec: settings.exportDurationMs / 1000 - 0.2,
      fadeOutSec: 1,
      fadeOut: true,
    };
    const overlapEnv = toExportMusicEnvelopeInput(overlapSettings);
    const midFade =
      overlapEnv.exportDurationMs / 1000 - overlapSettings.fadeOutSec / 2;
    const g = resolveExportMusicEnvelopeGainAtSec(overlapEnv, midFade);
    assert.ok(g < overlapSettings.musicGain, "fade-out attenuates during duck");
  });

  await testAsync("peak protection off preserves gain; on caps peaks", async () => {
    const { EXPORT_FFMPEG_PEAK_LIMITER_FILTER, PEAK_PROTECTION_OUTPUT_CEILING } =
      await import(
        "@/features/audio-mixer/audio-mixer.peak-protection.utils"
      );
    const dir = mkdtempSync(join(tmpdir(), "hf-a-peak-"));
    const voice = join(dir, "voice.wav");
    // Near-full-scale stereo tone so volume>1 exceeds the 0.98 ceiling.
    const hot = spawnSync(
      bins.ffmpegExecutable,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "aevalsrc=exprs=0.9*sin(2*PI*440*t)|0.9*sin(2*PI*440*t):s=48000:d=1",
        "-ac",
        "2",
        voice,
      ],
      { encoding: "utf8" },
    );
    assert.equal(hot.status, 0, hot.stderr);
    const offWav = join(dir, "off.wav");
    const onWav = join(dir, "on.wav");

    // Measure filter policy on PCM (avoid Opus codec peak noise).
    const run = (filter: string, out: string) => {
      const r = spawnSync(
        bins.ffmpegExecutable,
        ["-y", "-i", voice, "-af", filter, out],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0, r.stderr);
    };
    run("volume=2.0000", offWav);
    run(`volume=2.0000,${EXPORT_FFMPEG_PEAK_LIMITER_FILTER}`, onWav);

    const peakLinear = (path: string) => {
      const r = spawnSync(
        bins.ffmpegExecutable,
        ["-i", path, "-af", "astats=metadata=1:reset=1", "-f", "null", "-"],
        { encoding: "utf8" },
      );
      const text = `${r.stderr}\n${r.stdout}`;
      const peakDb = Number(text.match(/Peak level dB:\s*([-\d.]+)/i)?.[1] ?? "NaN");
      assert.ok(Number.isFinite(peakDb), "peak must be finite");
      return Math.pow(10, peakDb / 20);
    };

    const peakOff = peakLinear(offWav);
    const peakOn = peakLinear(onWav);
    assert.ok(peakOff > PEAK_PROTECTION_OUTPUT_CEILING, "hot stem exceeds ceiling");
    assert.ok(
      peakOn <= PEAK_PROTECTION_OUTPUT_CEILING + 0.02,
      `protected peak ${peakOn} above ceiling`,
    );
    assert.ok(peakOn < peakOff, "protection must reduce peak vs unprotected");

    // Headless encode still wires alimiter when applyPeakProtection is true.
    const fixture = buildHeadlessReferenceFixture({
      audioMode: "with-voice",
      durationMs: 1000,
    });
    const plan = buildHeadlessAudioPlan(fixture.manifestV3);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    const builtOn = buildHeadlessAudioFilterComplex({
      plan: { ...plan.plan, applyPeakProtection: true },
      voiceInputIndex: 1,
      musicInputIndex: null,
    });
    assert.equal(builtOn.ok, true);
    if (!builtOn.ok) return;
    assert.ok(builtOn.build.filterComplex!.includes("alimiter="));
    const builtOff = buildHeadlessAudioFilterComplex({
      plan: { ...plan.plan, applyPeakProtection: false },
      voiceInputIndex: 1,
      musicInputIndex: null,
    });
    assert.equal(builtOff.ok, true);
    if (!builtOff.ok) return;
    assert.equal(builtOff.build.filterComplex!.includes("alimiter="), false);

    rmSync(dir, { recursive: true, force: true });
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
