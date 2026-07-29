/**
 * Sprint 11E 2G.13/2G.14 — image/video visual parity and audible voice boost.
 * Run: npm run test:media-visual-audio-parity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  linearGainToDecibels,
  resolveVoiceVolumeGain,
} from "@/features/audio-mixer";
import { buildMediaVisualFilter } from "@/features/media-visual-adjustments/build-media-visual-filter";
import {
  freezeMediaVisualAdjustments,
  normalizeMediaVisualAdjustments,
} from "@/features/media-visual-adjustments/normalize-media-visual-adjustments";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

console.log("\nmedia-visual-audio-parity (Sprint 11E 2G.13/2G.14)\n");

test("identity visual settings are omitted from persisted manifests", () => {
  assert.equal(freezeMediaVisualAdjustments(undefined), null);
  assert.equal(
    freezeMediaVisualAdjustments({
      version: 1,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      shadowEnabled: false,
    }),
    null,
  );
});

test("visual primitives clamp and reject CSS injection", () => {
  const resolved = normalizeMediaVisualAdjustments({
    version: 1,
    brightness: 900,
    contrast: -5,
    saturation: Number.NaN,
    shadowEnabled: true,
    shadowColor: "red); url(https://invalid.example",
    shadowOpacity: 3,
    shadowBlur: 99,
    shadowOffsetX: -99,
    shadowOffsetY: 99,
  });
  assert.equal(resolved.brightness, 200);
  assert.equal(resolved.contrast, 0);
  assert.equal(resolved.saturation, 100);
  assert.equal(resolved.shadowColor, "#000000");
  assert.equal(resolved.shadowOpacity, 1);
  assert.equal(resolved.shadowBlur, 48);
  assert.equal(resolved.shadowOffsetX, -48);
  assert.equal(resolved.shadowOffsetY, 48);
});

test("preview and canvas use one deterministic scaled filter", () => {
  const adjustments = {
    version: 1 as const,
    brightness: 120,
    contrast: 135,
    saturation: 80,
    shadowEnabled: true,
    shadowColor: "#123456",
    shadowOpacity: 0.5,
    shadowBlur: 12,
    shadowOffsetX: 6,
    shadowOffsetY: 8,
  };
  assert.equal(
    buildMediaVisualFilter(adjustments, 2160),
    "brightness(1.2) contrast(1.35) saturate(0.8) drop-shadow(12px 16px 24px rgba(18, 52, 86, 0.5))",
  );
});

test("image, video preview, and export renderer share the filter authority", () => {
  const imagePreview = read("src/features/editor/components/SceneFrameImage.tsx");
  const videoPreview = read("src/features/editor/components/SceneFrameVideo.tsx");
  const exportRenderer = read(
    "src/features/export/utils/export-scene-media-renderer.ts",
  );
  assert.match(imagePreview, /buildMediaVisualFilter/);
  assert.match(videoPreview, /buildMediaVisualFilter/);
  assert.match(exportRenderer, /ctx\.filter = buildMediaVisualFilter/);
  assert.match(exportRenderer, /ctx\.save\(\)/);
  assert.match(exportRenderer, /ctx\.restore\(\)/);
});

test("voice control is linear percentage gain through 200%", () => {
  assert.equal(resolveVoiceVolumeGain(0), 0);
  assert.equal(resolveVoiceVolumeGain(0.5), 0.5);
  assert.equal(resolveVoiceVolumeGain(1), 1);
  assert.equal(resolveVoiceVolumeGain(1.5), 1.5);
  assert.equal(resolveVoiceVolumeGain(2), 2);
  assert.ok(Math.abs(linearGainToDecibels(2) - 6.020599913279624) < 0.01);
  assert.ok(Math.abs(linearGainToDecibels(0.5) + 6.020599913279624) < 0.01);
});

test("preview, browser export, and hosted FFmpeg consume the same effective gain", () => {
  const preview = read(
    "src/features/preview/utils/preview-voice-gain.utils.ts",
  );
  const browserMix = read(
    "src/features/export/utils/export-browser-audio-mix.utils.ts",
  );
  const ffmpeg = read("src/features/export/utils/ffmpeg.utils.ts");
  assert.match(preview, /resolveVoiceStemGain/);
  assert.match(browserMix, /mixSettings\.voiceGain/);
  assert.match(ffmpeg, /volume=\$\{voiceGain/);
});

console.log(`\nmedia-visual-audio-parity: ${passed} passed\n`);
