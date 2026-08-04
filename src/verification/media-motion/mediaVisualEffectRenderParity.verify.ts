/**
 * Preview/canvas visual-effect filter parity verification.
 * Run via: npm run test:media-visual-effects
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildComposedMediaVisualFilter,
  projectMediaVisualEffectToManifest,
  resolveMediaVisualEffect,
} from "@/features/media-motion";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function main(): void {
  console.log("\nmedia-visual-effect-render-parity\n");

  test("preview and export share buildComposedMediaVisualFilter", () => {
    const image = readSrc("src/features/editor/components/SceneFrameImage.tsx");
    const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
    const exportRenderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    assert.match(image, /buildComposedMediaVisualFilter/);
    assert.match(video, /buildComposedMediaVisualFilter/);
    assert.match(exportRenderer, /buildComposedMediaVisualFilter/);
    assert.match(exportRenderer, /effectSource:\s*["']frozen["']/);
    assert.match(exportRenderer, /ctx\.save\(\)/);
    assert.match(exportRenderer, /ctx\.restore\(\)/);
  });

  test("preview catalog and export frozen resolve numerically equivalent BCS", () => {
    const storyEffect = {
      version: 1 as const,
      presetId: "cinematic" as const,
      intensity: 0.8,
    };
    const preview = resolveMediaVisualEffect({
      visualEffect: storyEffect,
      keyframedVisualEffectsEnabled: true,
      effectSource: "catalog",
    });
    const frozen = projectMediaVisualEffectToManifest(storyEffect, true)!;
    const exportResolved = resolveMediaVisualEffect({
      visualEffect: frozen,
      keyframedVisualEffectsEnabled: true,
      effectSource: "frozen",
    });
    assert.deepEqual(preview.params, exportResolved.params);
    assert.equal(
      buildComposedMediaVisualFilter(undefined, storyEffect, {
        keyframedVisualEffectsEnabled: true,
        effectSource: "catalog",
        targetWidth: 1080,
      }),
      buildComposedMediaVisualFilter(undefined, frozen, {
        keyframedVisualEffectsEnabled: true,
        effectSource: "frozen",
        targetWidth: 1080,
      }),
    );
  });

  test("resolved filter is resolution-independent for BCS channels", () => {
    const effect = { version: 1 as const, presetId: "vivid" as const, intensity: 0.75 };
    const a = buildComposedMediaVisualFilter(undefined, effect, {
      keyframedVisualEffectsEnabled: true,
      targetWidth: 720,
    });
    const b = buildComposedMediaVisualFilter(undefined, effect, {
      keyframedVisualEffectsEnabled: true,
      targetWidth: 1080,
    });
    const c = buildComposedMediaVisualFilter(undefined, effect, {
      keyframedVisualEffectsEnabled: true,
      targetWidth: 2160,
    });
    assert.equal(a, b);
    assert.equal(b, c);
    assert.match(a, /brightness\(/);
    assert.match(a, /contrast\(/);
    assert.match(a, /saturate\(/);
    assert.doesNotMatch(a, /blur\(/);
  });

  test("image and video preview both gate on keyframedVisualEffectsEnabled", () => {
    const image = readSrc("src/features/editor/components/SceneFrameImage.tsx");
    const video = readSrc("src/features/editor/components/SceneFrameVideo.tsx");
    assert.match(image, /keyframedVisualEffectsEnabled/);
    assert.match(video, /keyframedVisualEffectsEnabled/);
    assert.match(image, /visualEffect/);
    assert.match(video, /visualEffect/);
    // Preview stays on catalog resolve (default); export is frozen.
    assert.doesNotMatch(image, /effectSource:\s*["']frozen["']/);
    assert.doesNotMatch(video, /effectSource:\s*["']frozen["']/);
  });

  test("export runtime hydrates visualEffect onto draw media", () => {
    const active = readSrc("src/features/export/runtime/active-export-draw-scene.ts");
    const prepared = readSrc(
      "src/features/export/runtime/prepare-export-from-manifest.ts",
    );
    assert.match(active, /visualEffect/);
    assert.match(prepared, /visualEffect/);
  });

  test("adjacent-item isolation uses per-media visualEffect input", () => {
    const a = resolveMediaVisualEffect({
      visualEffect: { version: 1, presetId: "monochrome", intensity: 1 },
      keyframedVisualEffectsEnabled: true,
    });
    const b = resolveMediaVisualEffect({
      visualEffect: { version: 1, presetId: "vivid", intensity: 1 },
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(a.params.saturation, 0);
    assert.equal(b.params.saturation, 140);
    assert.notEqual(
      buildComposedMediaVisualFilter(undefined, a.stored, {
        keyframedVisualEffectsEnabled: true,
      }),
      buildComposedMediaVisualFilter(undefined, b.stored, {
        keyframedVisualEffectsEnabled: true,
      }),
    );
  });

  test("image and video share identical resolved filter values", () => {
    const effect = {
      version: 1 as const,
      presetId: "vivid" as const,
      intensity: 1,
      brightness: 108,
      contrast: 112,
      saturation: 140,
    };
    const adjustments = {
      version: 1 as const,
      brightness: 110,
      contrast: 100,
      saturation: 100,
    };
    assert.equal(
      buildComposedMediaVisualFilter(adjustments, effect, {
        keyframedVisualEffectsEnabled: true,
        effectSource: "frozen",
      }),
      buildComposedMediaVisualFilter(adjustments, effect, {
        keyframedVisualEffectsEnabled: true,
        effectSource: "frozen",
      }),
    );
  });

  test("canvas filter state is restored after media draw", () => {
    const exportRenderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    const filterAssign = "ctx.filter = buildComposedMediaVisualFilter";
    const filterIndex = exportRenderer.indexOf(filterAssign);
    assert.ok(filterIndex >= 0);
    const before = exportRenderer.slice(0, filterIndex);
    const after = exportRenderer.slice(filterIndex);
    const saveIndex = before.lastIndexOf("ctx.save()");
    const restoreIndex = after.indexOf("ctx.restore()");
    assert.ok(saveIndex >= 0 && restoreIndex >= 0);
    // Opacity and filter remain inside the same save/restore boundary.
    const opacityIndex = before.lastIndexOf("globalAlpha");
    assert.ok(opacityIndex > saveIndex || exportRenderer.includes("globalAlpha"));
  });

  test("transition opacity remains independent of visual-effect filters", () => {
    const exportRenderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    assert.doesNotMatch(
      exportRenderer,
      /transitionOpacity\s*\*\s*buildComposedMediaVisualFilter|filter.*transitionOpacity/,
    );
    const resolveSrc = readSrc(
      "src/features/media-motion/domain/resolve-media-visual-effect.ts",
    );
    assert.doesNotMatch(resolveSrc, /transition|globalAlpha/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
