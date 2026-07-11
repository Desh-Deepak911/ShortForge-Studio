/**
 * Export caption opacity — percent→alpha, composition, no hardcoded full opacity.
 * Run: npm run test:export-caption-opacity
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  composeCaptionAnimationOpacity,
  normalizeCaptionOpacity,
  normalizeCaptionOpacityAlpha,
  normalizeCaptionOpacityPercent,
  buildExportManifest,
} from "@/features/export/domain";
import { syncFootieScript } from "@/lib/utils/voiceover";
import type { FootieScript } from "@/features/story/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("\nexport-caption-opacity\n");

test("percent normalization: 0 / 3 / 50 / 100 / undefined", () => {
  assert.equal(normalizeCaptionOpacityPercent(0), 0);
  assert.equal(normalizeCaptionOpacityPercent(3), 3);
  assert.equal(normalizeCaptionOpacityPercent(50), 50);
  assert.equal(normalizeCaptionOpacityPercent(100), 100);
  assert.equal(normalizeCaptionOpacityPercent(undefined), 100);
  assert.equal(normalizeCaptionOpacityPercent("3%"), 3);
  assert.equal(normalizeCaptionOpacity(3), 0.03);
  assert.equal(normalizeCaptionOpacity(0), 0);
  assert.equal(normalizeCaptionOpacity(100), 1);
});

test("nullish alpha preserves explicit 0 (never || 1)", () => {
  assert.equal(normalizeCaptionOpacityAlpha(0), 0);
  assert.equal(normalizeCaptionOpacityAlpha(0.03), 0.03);
  assert.equal(normalizeCaptionOpacityAlpha(undefined, 1), 1);
  assert.equal(normalizeCaptionOpacityAlpha(null, 1), 1);
});

test("animation opacity composes with configured opacity", () => {
  assert.ok(Math.abs(composeCaptionAnimationOpacity(0.03, 1) - 0.03) < 1e-9);
  assert.ok(Math.abs(composeCaptionAnimationOpacity(0.5, 0.5) - 0.25) < 1e-9);
  assert.ok(Math.abs(composeCaptionAnimationOpacity(1, 1) - 1) < 1e-9);
  assert.ok(Math.abs(composeCaptionAnimationOpacity(0.03, undefined) - 0.03) < 1e-9);
});

test("manifest freezes 3% background opacity from style", () => {
  const story = syncFootieScript({
    title: "Opacity",
    narration: "Hello",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Dim caption",
        captionMode: "generated",
        captionStyle: {
          backgroundOpacity: 3,
          backgroundEnabled: true,
          backgroundColor: "#000000",
        },
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  } as FootieScript);

  const caption = buildExportManifest({ story }).captions[0];
  assert.ok(caption);
  assert.equal(caption!.style.backgroundOpacity, 3);
  assert.equal(normalizeCaptionOpacity(caption!.style.backgroundOpacity), 0.03);
});

test("manifest freezes layout-owned 3% when style is default", () => {
  const story = syncFootieScript({
    title: "Layout opacity",
    narration: "Hello",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        startMs: 0,
        endMs: 3000,
        durationMs: 3000,
        subtitle: "Dim pill",
        captionMode: "generated",
        captionLayout: {
          version: 2,
          anchor: "bottom_center",
          backgroundOpacity: 3,
        },
        media: {
          type: "image",
          url: "https://example.com/a.jpg",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        },
      },
    ],
  } as FootieScript);

  const caption = buildExportManifest({ story }).captions[0];
  assert.ok(caption);
  assert.equal(caption!.style.backgroundOpacity, 3);
  assert.equal(caption!.layout.backgroundOpacity, 3);
});

test("structural: draw path wires layout/style; no opacity || 1 for background", () => {
  const root = process.cwd();
  const canvas = readFileSync(
    join(root, "src/features/export/utils/export-caption-canvas.utils.ts"),
    "utf8",
  );
  const draw = readFileSync(
    join(root, "src/features/export/runtime/draw-prepared-export-frame.ts"),
    "utf8",
  );
  const build = readFileSync(
    join(root, "src/features/export/domain/build-export-manifest.ts"),
    "utf8",
  );

  assert.match(draw, /captionStyleFromManifest/);
  assert.match(draw, /resolveExportCaptionAnimationFromChunk/);
  assert.match(build, /resolveEffectiveCaptionBackgroundOpacityPercent/);
  assert.match(canvas, /styleMetrics\.backgroundAlpha \?\? backgroundAlpha/);
  assert.doesNotMatch(canvas, /backgroundAlpha\s*\|\|\s*1/);
  assert.doesNotMatch(canvas, /opacity\s*\|\|\s*1/);
  assert.match(canvas, /ctx\.restore\(\)/);
});

console.log(`\nexport-caption-opacity: ${passed} passed\n`);
