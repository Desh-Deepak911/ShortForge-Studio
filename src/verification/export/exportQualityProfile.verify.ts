/**
 * Sprint 6H — export visual quality profiles.
 * Run: npm run test:export-quality-profile
 */
import assert from "node:assert/strict";

import {
  formatExportVideoBitrateArg,
  resolveExportFrameIntermediateQuality,
  resolveExportVisualQualityProfile,
} from "@/features/export/domain";
import { getExportBitrate } from "@/features/export/utils/export-settings.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-quality-profile (Sprint 6H)\n");

test("720p / 1080p × standard / high produce distinct profiles", () => {
  const p720s = resolveExportVisualQualityProfile({
    resolution: "720p",
    quality: "standard",
    bitrate: getExportBitrate("720x1280", "standard"),
    width: 720,
    height: 1280,
  });
  const p720h = resolveExportVisualQualityProfile({
    resolution: "720p",
    quality: "high",
    bitrate: getExportBitrate("720x1280", "high"),
    width: 720,
    height: 1280,
  });
  const p1080s = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "standard",
    bitrate: getExportBitrate("1080x1920", "standard"),
    width: 1080,
    height: 1920,
  });
  const p1080h = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "high",
    bitrate: getExportBitrate("1080x1920", "high"),
    width: 1080,
    height: 1920,
  });

  assert.equal(p720s.videoBitrate, 4_000_000);
  assert.equal(p720h.videoBitrate, 6_000_000);
  assert.equal(p1080s.videoBitrate, 6_000_000);
  assert.equal(p1080h.videoBitrate, 8_000_000);

  assert.equal(p720s.videoBitrateArg, "4M");
  assert.equal(p720h.videoBitrateArg, "6M");
  assert.equal(p1080s.videoBitrateArg, "6M");
  assert.equal(p1080h.videoBitrateArg, "8M");

  assert.ok(p1080h.videoBitrate > p720s.videoBitrate);
  assert.ok(p1080h.frameIntermediateQuality >= p720s.frameIntermediateQuality);
  assert.ok(p1080h.libvpxCpuUsed < p720s.libvpxCpuUsed);
  assert.ok(p1080h.h264Crf < p720s.h264Crf);
  assert.equal(p1080h.libvpxDeadline, "good");
  assert.equal(p720s.libvpxDeadline, "realtime");
});

test("canvas dimensions match advertised resolution", () => {
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
  assert.equal(p720.width, 720);
  assert.equal(p720.height, 1280);
  assert.equal(p1080.width, 1080);
  assert.equal(p1080.height, 1920);
});

test("bitrate formatter and JPEG policy are deterministic", () => {
  assert.equal(formatExportVideoBitrateArg(4_000_000), "4M");
  assert.equal(formatExportVideoBitrateArg(8_000_000), "8M");
  assert.equal(resolveExportFrameIntermediateQuality("720p", "standard"), 0.93);
  assert.equal(resolveExportFrameIntermediateQuality("720p", "high"), 0.95);
  assert.equal(resolveExportFrameIntermediateQuality("1080p", "standard"), 0.95);
  assert.equal(resolveExportFrameIntermediateQuality("1080p", "high"), 0.97);
});

test("standard and high produce meaningfully different encode settings", () => {
  const standard = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "standard",
    bitrate: 6_000_000,
    width: 1080,
    height: 1920,
  });
  const high = resolveExportVisualQualityProfile({
    resolution: "1080p",
    quality: "high",
    bitrate: 8_000_000,
    width: 1080,
    height: 1920,
  });
  assert.notEqual(standard.videoBitrateArg, high.videoBitrateArg);
  assert.notEqual(standard.frameIntermediateQuality, high.frameIntermediateQuality);
  assert.notEqual(standard.libvpxCpuUsed, high.libvpxCpuUsed);
  assert.notEqual(standard.h264Crf, high.h264Crf);
  assert.equal(standard.pixelFormat, "yuv420p");
  assert.equal(high.imageSmoothingQuality, "high");
});

console.log(`\nexport-quality-profile: ${passed} passed\n`);
