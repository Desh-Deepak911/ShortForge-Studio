/**
 * Silent visual timestamp normalization (4.2C-8B.2).
 * Run: npm run test:export-timestamp-normalization
 *
 * Manual capture guarantees ordered frame content and count.
 * Image-sequence encode guarantees FPS and duration.
 * requestFrame() alone does not guarantee constant-FPS container timestamps.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertFrameExtractArgs,
  assertFrameSequenceEncodeArgs,
  assertNormalizeArgsRebuildTimestamps,
  buildSilentVisualFrameExtractArgs,
  buildSilentVisualFrameSequenceEncodeArgs,
  buildSilentVisualNormalizeArgs,
  describeRawSilentTiming,
  listNormalizedFrameFilenames,
  modelNormalizedSilentTiming,
  resolveNormalizedDurationToleranceSec,
  resolveNormalizedVisualDurationSec,
  resolveSemanticFrameTimestampSec,
  SILENT_VISUAL_NORMALIZE_STRATEGY,
  EXPORT_TIMING_NORMALIZE_USER_ERROR,
} from "@/features/export/utils/export-timestamp-normalization.utils";
import { resolveTimelineFrameCount } from "@/features/timeline-intelligence/timeline-playback.utils";
import { MIXED_MEDIA_QA_CONTENT_DURATION_MS } from "@/verification/export/mixedMediaQaFixture";

let passed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    });
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function hasSystemFfmpeg(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return result.status === 0;
}

function probeDurationSec(filePath: string): number {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const duration = Number(result.stdout.trim());
  assert.ok(Number.isFinite(duration) && duration > 0);
  return duration;
}

async function main() {
  console.log("\nexport-timestamp-normalization\n");

  await test("production failure model: 952 frames / 30fps → 31.73s", () => {
    const model = modelNormalizedSilentTiming({
      capturedFrameCount: 952,
      requestedFps: 30,
      rawDurationSec: null,
    });
    assert.ok(Math.abs(model.expectedNormalizedDurationSec - 952 / 30) < 1e-9);
    assert.equal(model.expectedEffectiveFps, 30);
    assert.equal(model.rawTimingAvailable, false);
    assert.equal(model.rawEffectiveFps, null);
    // Failed normalize at 24.43s must not pass validation.
    const tol = resolveNormalizedDurationToleranceSec(952 / 30, 30);
    assert.ok(Math.abs(952 / 30 - 24.43) > tol);
  });

  await test("zero raw duration does not report absurd effective FPS", () => {
    const info = describeRawSilentTiming({
      capturedFrameCount: 952,
      rawDurationSec: 0,
    });
    assert.equal(info.rawTimingAvailable, false);
    assert.equal(info.rawEffectiveFps, null);
    assert.match(info.rawTimingLabel, /unavailable/i);
    assert.match(info.rawTimingLabel, /952/);
  });

  await test("too-fast raw input normalizes to frameCount/fps", () => {
    const model = modelNormalizedSilentTiming({
      capturedFrameCount: 952,
      requestedFps: 30,
      rawDurationSec: 24.43,
    });
    assert.ok(Math.abs(model.expectedNormalizedDurationSec - 31.733333) < 0.001);
    assert.ok(model.rawEffectiveFps != null && model.rawEffectiveFps > 35);
    assert.equal(model.expectedEffectiveFps, 30);
  });

  await test("too-slow raw input normalizes to frameCount/fps", () => {
    const model = modelNormalizedSilentTiming({
      capturedFrameCount: 600,
      requestedFps: 30,
      rawDurationSec: 90,
    });
    assert.equal(model.expectedNormalizedDurationSec, 20);
    assert.equal(model.expectedEffectiveFps, 30);
  });

  await test("correct raw input stays at expected duration", () => {
    const model = modelNormalizedSilentTiming({
      capturedFrameCount: 600,
      requestedFps: 30,
      rawDurationSec: 20,
    });
    assert.equal(model.expectedNormalizedDurationSec, 20);
  });

  await test("24 / 30 / 60 FPS duration + packet timestamps", () => {
    for (const fps of [24, 30, 60] as const) {
      const frames = fps * 20;
      assert.equal(resolveNormalizedVisualDurationSec(frames, fps), 20);
      assert.equal(resolveSemanticFrameTimestampSec(0, fps), 0);
      assert.ok(Math.abs(resolveSemanticFrameTimestampSec(1, fps) - 1 / fps) < 1e-12);
      assert.ok(
        Math.abs(resolveSemanticFrameTimestampSec(frames - 1, fps) + 1 / fps - frames / fps) <
          1e-12,
      );
    }
  });

  await test("fractional project duration uses ceil frame count / fps", () => {
    const durationMs = 10_050;
    const fps = 30;
    const frames = resolveTimelineFrameCount(durationMs, fps);
    assert.equal(resolveNormalizedVisualDurationSec(frames, fps), frames / fps);
  });

  await test("final-frame preservation: N frames include last interval", () => {
    const fps = 30;
    const frameCount = 952;
    const duration = resolveNormalizedVisualDurationSec(frameCount, fps);
    const lastPts = resolveSemanticFrameTimestampSec(frameCount - 1, fps);
    assert.ok(lastPts + 1 / fps <= duration + 1e-9);
    const encodeArgs = buildSilentVisualFrameSequenceEncodeArgs({
      outputFile: "out.webm",
      fps,
      frameCount,
    });
    assert.equal(encodeArgs[encodeArgs.indexOf("-frames:v") + 1], String(frameCount));
    assert.equal(listNormalizedFrameFilenames(3).length, 3);
    assert.equal(listNormalizedFrameFilenames(3)[2], "norm-frame-000003.jpg");
  });

  await test("extract args: passthrough demux, no conflicting rate controls", () => {
    const args = buildSilentVisualFrameExtractArgs({ inputFile: "silent-timing-in.webm" });
    const checks = assertFrameExtractArgs(args);
    assert.equal(checks.hasVsyncPassthrough, true);
    assert.equal(checks.hasInputRateOverride, false);
    assert.equal(checks.hasFpsFilter, false);
    assert.equal(checks.hasVideoOnly, true);
  });

  await test("encode args: sole timing authority is -framerate", () => {
    const args = buildSilentVisualFrameSequenceEncodeArgs({
      outputFile: "silent-timing-out.webm",
      fps: 30,
      frameCount: 952,
    });
    const checks = assertFrameSequenceEncodeArgs(args);
    assert.equal(checks.hasFramerateInput, true);
    assert.equal(checks.hasFrameCountLimit, true);
    assert.equal(checks.hasVideoOnly, true);
    assert.equal(checks.hasConflictingOutputRate, false);
    assert.equal(checks.hasFpsFilter, false);
    assert.equal(checks.hasSetpts, false);
    assert.equal(checks.timingAuthority, "framerate-input");

    const legacy = assertNormalizeArgsRebuildTimestamps(
      buildSilentVisualNormalizeArgs({
        inputFile: "in.webm",
        outputFile: "out.webm",
        fps: 30,
        frameCount: 952,
      }),
    );
    assert.equal(legacy.hasFramerateInput, true);
    assert.equal(legacy.timingAuthority, "framerate-input");
  });

  await test("six-scene fixture compressed raw maps to semantic duration", () => {
    const fps = 30;
    const frames = resolveTimelineFrameCount(MIXED_MEDIA_QA_CONTENT_DURATION_MS, fps);
    const expected = resolveNormalizedVisualDurationSec(frames, fps);
    const model = modelNormalizedSilentTiming({
      capturedFrameCount: frames,
      requestedFps: fps,
      rawDurationSec: expected * (24.43 / 31.73),
    });
    assert.ok(Math.abs(model.expectedNormalizedDurationSec - expected) < 1e-9);
    assert.equal(model.expectedEffectiveFps, fps);
  });

  await test("production uses chunked segment encode; mux copies video; legacy normalize retained", () => {
    const runtime = readSrc("src/features/export/runtime/render-export.ts");
    const chunked = readSrc("src/features/export/chunking/render-chunked-silent-visual.ts");
    const encode = readSrc("src/features/export/chunking/encode-export-chunk.ts");
    const legacy = readSrc("src/features/export/services/video-render.service.ts");
    const ffmpeg = readSrc("src/features/export/utils/ffmpeg.utils.ts");
    assert.match(runtime, /renderChunkedSilentVisual/);
    assert.match(chunked, /buildExportSegmentEncodeArgs/);
    assert.match(encode, /-framerate/);
    assert.match(encode, /-frames:v/);
    assert.match(legacy, /normalizeSilentVisualFrameTiming/);
    assert.match(ffmpeg, /buildSilentVisualFrameExtractArgs/);
    assert.match(ffmpeg, /buildSilentVisualFrameSequenceEncodeArgs/);
    assert.match(ffmpeg, /"-c:v",\s*"copy"/);
    assert.ok(SILENT_VISUAL_NORMALIZE_STRATEGY.includes("framerate"));
    assert.ok(EXPORT_TIMING_NORMALIZE_USER_ERROR.includes("normalized"));
  });

  await test("system ffmpeg fixture: bad timestamps rebuild to frameCount/fps", () => {
    if (!hasSystemFfmpeg()) {
      console.log("  ⊘ skipped (ffmpeg not installed)");
      return;
    }

    const dir = mkdtempSync(join(tmpdir(), "sf-norm-"));
    try {
      const frameCount = 45;
      const fps = 30;
      const expected = frameCount / fps;

      for (let i = 0; i < frameCount; i++) {
        const name = join(dir, `f-${String(i).padStart(6, "0")}.jpg`);
        const color = spawnSync(
          "ffmpeg",
          [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=0x${(i * 5).toString(16).padStart(2, "0")}0000:s=160x120:d=0.04`,
            "-frames:v",
            "1",
            name,
          ],
          { encoding: "utf8" },
        );
        assert.equal(color.status, 0, color.stderr);
      }

      const badWebm = join(dir, "bad.webm");
      // Intentionally wrong cadence (45fps) — same failure class as MediaRecorder.
      const bad = spawnSync(
        "ffmpeg",
        [
          "-y",
          "-framerate",
          "45",
          "-i",
          join(dir, "f-%06d.jpg"),
          "-c:v",
          "libvpx",
          "-b:v",
          "200k",
          "-auto-alt-ref",
          "0",
          badWebm,
        ],
        { encoding: "utf8" },
      );
      assert.equal(bad.status, 0, bad.stderr);
      const badDuration = probeDurationSec(badWebm);
      assert.ok(Math.abs(badDuration - frameCount / 45) < 0.05);

      const extractPattern = join(dir, "ext-%06d.jpg");
      const extractArgs = buildSilentVisualFrameExtractArgs({
        inputFile: badWebm,
        framePattern: extractPattern,
      });
      const extract = spawnSync("ffmpeg", ["-y", ...extractArgs], { encoding: "utf8" });
      assert.equal(extract.status, 0, extract.stderr);
      assert.ok(existsSync(join(dir, "ext-000001.jpg")));
      assert.ok(existsSync(join(dir, `ext-${String(frameCount).padStart(6, "0")}.jpg`)));

      const outWebm = join(dir, "out.webm");
      const encodeArgs = buildSilentVisualFrameSequenceEncodeArgs({
        outputFile: outWebm,
        fps,
        frameCount,
        framePattern: extractPattern,
      });
      const encode = spawnSync("ffmpeg", ["-y", ...encodeArgs], { encoding: "utf8" });
      assert.equal(encode.status, 0, encode.stderr);

      const outDuration = probeDurationSec(outWebm);
      const tol = resolveNormalizedDurationToleranceSec(expected, fps);
      assert.ok(
        Math.abs(outDuration - expected) <= tol,
        `expected ~${expected}s got ${outDuration}s`,
      );
      const effectiveFps = frameCount / outDuration;
      assert.ok(Math.abs(effectiveFps - fps) / fps <= 0.15);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
