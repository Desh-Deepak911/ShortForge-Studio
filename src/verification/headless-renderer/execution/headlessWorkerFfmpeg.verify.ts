/**
 * Sprint 11D — Native FFmpeg encode/probe unit checks.
 * Run: npm run test:headless-worker-ffmpeg
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { encodePngSequenceToWebm } from "@/features/headless-renderer/worker/ffmpeg/encode-png-sequence-webm";
import { probeArtifactWithFfprobe } from "@/features/headless-renderer/worker/ffmpeg/probe-artifact";
import { resolveNativeFfmpegBinaries } from "@/features/headless-renderer/worker/ffmpeg/resolve-ffmpeg-binaries";

let passed = 0;

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11D — Worker FFmpeg\n");

  const bins = resolveNativeFfmpegBinaries();
  assert.equal(bins.ok, true);
  if (!bins.ok) return;

  await testAsync("png sequence encodes to 720p30 webm and probes clean", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hf-enc-"));
    const framesDir = join(dir, "frames");
    mkdirSync(framesDir, { recursive: true });
    // 15 frames @ 30fps = 0.5s
    for (let i = 0; i < 15; i++) {
      const out = join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
      const r: { status: number | null } = spawnSync(
        bins.ffmpegExecutable,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=c=0x2244aa:s=720x1280:d=0.04`,
          "-frames:v",
          "1",
          out,
        ],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0);
    }
    const outputPath = join(dir, "out.webm");
    const { buildHeadlessAudioPlan } = await import(
      "@/features/headless-renderer/worker/audio/build-headless-audio-plan"
    );
    const { buildHeadlessReferenceFixture } = await import(
      "@/features/headless-renderer/worker/testing/build-reference-fixture"
    );
    const silentPlan = buildHeadlessAudioPlan(
      buildHeadlessReferenceFixture({ audioMode: "silent", durationMs: 500 })
        .manifestV3,
    );
    assert.equal(silentPlan.ok, true);
    if (!silentPlan.ok) return;
    // 15 frames @ 30fps = 500ms — keep plan duration aligned with frame count.
    const encoded = await encodePngSequenceToWebm({
      ffmpegExecutable: bins.ffmpegExecutable,
      framesDir,
      framePattern: "frame_%06d.png",
      frameCount: 15,
      fps: 30,
      outputPath,
      audioPlan: {
        ...silentPlan.plan,
        combination: "silent",
        mixPolicy: "none",
        outputDurationMs: 500,
        outputDurationSec: 0.5,
        voiceover: null,
        music: null,
      },
      timeoutMs: 60_000,
      maxStderrBytes: 16_384,
      maxOutputBytes: 32 * 1024 * 1024,
    });
    assert.equal(encoded.ok, true, encoded.ok ? "" : encoded.message);

    const probed = await probeArtifactWithFfprobe({
      ffprobeExecutable: bins.ffprobeExecutable,
      artifactPath: outputPath,
      timeoutMs: 15_000,
      maxStderrBytes: 16_384,
    });
    assert.equal(probed.ok, true);
    if (!probed.ok) return;
    assert.equal(probed.probe.hasVideo, true);
    assert.equal(probed.probe.hasAudio, false);
    assert.equal(probed.probe.width, 720);
    assert.equal(probed.probe.height, 1280);
    assert.ok(probed.probe.fps != null && Math.abs(probed.probe.fps - 30) < 0.5);

    rmSync(dir, { recursive: true, force: true });
  });

  await testAsync("process failure is classified non_zero", async () => {
    const { spawnFixedArgv } = await import(
      "@/features/headless-renderer/worker/ffmpeg/spawn-process"
    );
    const bad = await spawnFixedArgv({
      executable: bins.ffmpegExecutable,
      args: ["-y", "-i", "/nonexistent/input.xyz", "out.webm"],
      timeoutMs: 10_000,
      maxStderrBytes: 4096,
    });
    assert.equal(bad.exitClass, "non_zero");
    void writeFileSync;
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
