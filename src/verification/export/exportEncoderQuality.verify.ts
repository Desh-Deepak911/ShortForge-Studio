/**
 * Sprint 6H — encoder quality wiring (libvpx + H.264).
 * Run: npm run test:export-encoder-quality
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveExportVisualQualityProfile } from "@/features/export/domain";
import { buildExportSegmentEncodeArgs } from "@/features/export/chunking";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nexport-encoder-quality (Sprint 6H)\n");

test("1080p does not reuse 720p bitrate in encode args", () => {
  const p720 = resolveExportVisualQualityProfile({
    resolution: "720p",
    quality: "standard",
    bitrate: 4_000_000,
    width: 720,
    height: 1280,
  });
  const p1080 = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "high",
    bitrate: 8_000_000,
    width: 1080,
    height: 1920,
  });
  const a720 = buildExportSegmentEncodeArgs({
    outputFile: "s.webm",
    fps: 30,
    frameCount: 120,
    qualityProfile: p720,
  });
  const a1080 = buildExportSegmentEncodeArgs({
    outputFile: "s.webm",
    fps: 30,
    frameCount: 90,
    qualityProfile: p1080,
  });
  assert.equal(a720[a720.indexOf("-b:v") + 1], "4M");
  assert.equal(a1080[a1080.indexOf("-b:v") + 1], "8M");
  assert.notEqual(a720[a720.indexOf("-b:v") + 1], "2M");
  assert.notEqual(a1080[a1080.indexOf("-b:v") + 1], "2M");
});

test("chunked silent visual passes qualityProfile into encode", () => {
  const source = read("src/features/export/chunking/render-chunked-silent-visual.ts");
  assert.match(source, /resolveExportVisualQualityProfile/);
  assert.match(source, /qualityProfile/);
  assert.match(source, /buildExportSegmentEncodeArgs\(\{[\s\S]*qualityProfile/);
});

test("MP4 adapter and ffmpeg mux consume profile h264Crf", () => {
  const mp4 = read("src/features/export/formats/mp4-export-format-adapter.ts");
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(mp4, /h264Crf:\s*qualityProfile\.h264Crf/);
  assert.match(ffmpeg, /h264Crf/);
  assert.match(ffmpeg, /buildMuxOutputProfile\(outputFormat,\s*\{\s*h264Crf/);
});

test("pixel format remains yuv420p for compatibility", () => {
  const profile = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "high",
    bitrate: 8_000_000,
    width: 1080,
    height: 1920,
  });
  assert.equal(profile.pixelFormat, "yuv420p");
  const args = buildExportSegmentEncodeArgs({
    outputFile: "s.webm",
    fps: 30,
    frameCount: 90,
    qualityProfile: profile,
  });
  assert.equal(args[args.indexOf("-pix_fmt") + 1], "yuv420p");
});

console.log(`\nexport-encoder-quality: ${passed} passed\n`);
