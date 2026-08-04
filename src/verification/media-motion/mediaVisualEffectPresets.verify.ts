/**
 * Visual-effect preset catalog, commands, composition, and v4/v5 dispatch verification.
 * Run via: npm run test:media-visual-effects
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import {
  applyMediaVisualEffectPreset,
  buildComposedMediaVisualFilter,
  isActiveMediaVisualEffect,
  listMediaVisualEffectPresets,
  multiplyVisualAdjustmentChannel,
  normalizeSceneMediaVisualEffect,
  projectMediaVisualEffectToManifest,
  readFrozenMediaVisualEffectParams,
  resetMediaVisualEffect,
  resolveMediaVisualEffect,
  setMediaVisualEffectIntensity,
  setMediaMotionEnabledPreservingKeyframes,
  initializeMediaMotionKeyframes,
  normalizeSceneMediaMotion,
} from "@/features/media-motion";
import { buildMediaFramingPatch } from "@/features/media-framing/media-framing-patch.utils";
import type { FootieScene, FootieScript, SceneMedia } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const CAPABLE = { keyframedVisualEffectsEnabled: true } as const;

const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
};

function baseMedia(effect?: SceneMedia["visualEffect"]): SceneMedia {
  return {
    type: "image",
    url: "https://example.com/look.jpg",
    source: "upload",
    motion: normalizeSceneMediaMotion({
      version: 1,
      enabled: true,
      presetId: "slow-zoom-in",
      easing: "linear",
      intensity: 1,
      startTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      endTransform: { x: 20, y: 0, scale: 1.1, rotation: 0 },
    }),
    ...(effect ? { visualEffect: effect } : {}),
  };
}

function storyFromMedia(media: SceneMedia): FootieScript {
  const scene: FootieScene = {
    id: "look-scene",
    start: 0,
    end: 4,
    duration: 4,
    startMs: 0,
    endMs: 4000,
    durationMs: 4000,
    subtitle: "Look",
    narration: "Look",
    media,
    image: {
      url: "https://example.com/look.jpg",
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      fitMode: "fill",
    },
  };
  return syncFootieScript({
    title: "Look",
    narration: "Look",
    totalDuration: 4,
    scenes: [scene],
  });
}

function main(): void {
  console.log("\nmedia-visual-effect-presets\n");

  test("story types own visual-effect contract without media-motion imports", () => {
    const storyTypes = readSrc("src/features/story/types/story.types.ts");
    assert.match(storyTypes, /export interface SceneMediaVisualEffect/);
    assert.match(storyTypes, /SceneMediaVisualEffectPresetId/);
    assert.doesNotMatch(
      storyTypes,
      /from\s+["']@\/features\/media-motion(?:\/[^"']*)?["']/,
    );
    const presets = readSrc(
      "src/features/media-motion/domain/media-visual-effect-presets.ts",
    );
    assert.match(
      presets,
      /from ["']@\/features\/story\/types\/story\.types["']/,
    );
    assert.match(presets, /import type \{/);
    const exportRenderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    const previewImage = readSrc(
      "src/features/editor/components/SceneFrameImage.tsx",
    );
    assert.match(exportRenderer, /from ["']@\/features\/media-motion["']/);
    assert.match(previewImage, /from ["']@\/features\/media-motion["']/);
    assert.doesNotMatch(exportRenderer, /from ["']@\/features\/media-motion\/domain\//);
    assert.doesNotMatch(previewImage, /from ["']@\/features\/media-motion\/domain\//);
  });

  test("catalog is closed, deterministic, and non-technical", () => {
    const presets = listMediaVisualEffectPresets();
    assert.deepEqual(
      presets.map((preset) => preset.id),
      ["none", "vivid", "cinematic", "monochrome"],
    );
    assert.deepEqual(
      presets.map((preset) => preset.label),
      ["None", "Vivid", "Cinematic", "Monochrome"],
    );
    assert.doesNotMatch(JSON.stringify(presets), /blur|shader|filter\(/i);
  });

  test("unknown / malformed normalize fail-closed to absent", () => {
    assert.equal(normalizeSceneMediaVisualEffect(undefined), undefined);
    assert.equal(normalizeSceneMediaVisualEffect({ presetId: "neon", intensity: 1 }), undefined);
    assert.equal(
      normalizeSceneMediaVisualEffect({ presetId: "vivid", intensity: Number.NaN }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaVisualEffect({ presetId: "vivid", intensity: 0 }),
      undefined,
    );
    assert.equal(
      normalizeSceneMediaVisualEffect({
        version: 1,
        presetId: "vivid",
        intensity: 1,
        brightness: 108,
        contrast: 112,
        saturation: 140,
      })?.brightness,
      undefined,
    );
  });

  test("intensity interpolates from identity to full preset", () => {
    const half = resolveMediaVisualEffect({
      visualEffect: { version: 1, presetId: "vivid", intensity: 0.5 },
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(half.available, true);
    assert.ok(half.params.saturation > 100 && half.params.saturation < 140);
    const full = resolveMediaVisualEffect({
      visualEffect: { version: 1, presetId: "vivid", intensity: 1 },
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(full.params.saturation, 140);
    const zero = resolveMediaVisualEffect({
      visualEffect: { version: 1, presetId: "vivid", intensity: 0 },
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(zero.available, false);
  });

  test("adjustment×effect composition multiplies once with clamp bounds", () => {
    assert.equal(multiplyVisualAdjustmentChannel(100, 100), 100);
    assert.equal(multiplyVisualAdjustmentChannel(110, 140), 154);
    assert.equal(multiplyVisualAdjustmentChannel(200, 200), 200);
    assert.equal(multiplyVisualAdjustmentChannel(50, 0), 0);
    const resolveSrc = readSrc(
      "src/features/media-motion/domain/resolve-media-visual-effect.ts",
    );
    assert.match(resolveSrc, /Identity basis per channel = 100/);
    assert.match(
      resolveSrc,
      /composed = clamp\(\(adjustment\/100\) \* \(effect\/100\) \* 100/,
    );

    const adjustments = {
      version: 1 as const,
      brightness: 110,
      contrast: 120,
      saturation: 130,
    };
    for (const presetId of ["vivid", "cinematic", "monochrome"] as const) {
      const once = buildComposedMediaVisualFilter(
        adjustments,
        { version: 1, presetId, intensity: 1 },
        { keyframedVisualEffectsEnabled: true, effectSource: "catalog" },
      );
      const again = buildComposedMediaVisualFilter(
        adjustments,
        { version: 1, presetId, intensity: 1 },
        { keyframedVisualEffectsEnabled: true, effectSource: "catalog" },
      );
      assert.equal(once, again);
      // Must not equal adjustment-only nor effect-only (except monochrome sat path).
      const adjOnly = buildComposedMediaVisualFilter(adjustments, undefined, {
        keyframedVisualEffectsEnabled: true,
      });
      const effectOnly = buildComposedMediaVisualFilter(
        undefined,
        { version: 1, presetId, intensity: 1 },
        { keyframedVisualEffectsEnabled: true },
      );
      assert.notEqual(once, adjOnly);
      if (presetId !== "monochrome") {
        assert.notEqual(once, effectOnly);
      }
    }
  });

  test("reset removes only visualEffect and retains visualAdjustments by reference", () => {
    const adjustments = Object.freeze({
      version: 1 as const,
      brightness: 115,
      contrast: 105,
      saturation: 125,
      shadowEnabled: false,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 8,
    });
    const media: SceneMedia = {
      ...applyMediaVisualEffectPreset(baseMedia(), "vivid", CAPABLE).media,
      visualAdjustments: adjustments,
    };
    const reset = resetMediaVisualEffect(media, CAPABLE);
    assert.equal(reset.media.visualEffect, undefined);
    assert.equal(reset.media.visualAdjustments, adjustments);
    assert.deepEqual(reset.media.visualAdjustments, adjustments);
    assert.equal(reset.media.motion?.presetId, media.motion?.presetId);
  });

  test("capability off ignores dormant effect metadata", () => {
    const dormant = { version: 1 as const, presetId: "cinematic" as const, intensity: 1 };
    assert.equal(isActiveMediaVisualEffect(dormant, false), false);
    const resolved = resolveMediaVisualEffect({
      visualEffect: dormant,
      keyframedVisualEffectsEnabled: false,
    });
    assert.equal(resolved.available, false);
    assert.equal(resolved.params.brightness, 100);
    const filter = buildComposedMediaVisualFilter(
      { version: 1, brightness: 100, contrast: 100, saturation: 100 },
      dormant,
      { keyframedVisualEffectsEnabled: false },
    );
    const identity = buildComposedMediaVisualFilter(undefined, undefined, {
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(filter, identity);
  });

  test("commands require capability and preserve motion/keyframes on reset", () => {
    const keyed = initializeMediaMotionKeyframes(
      baseMedia().motion!,
      4000,
      CAPABLE,
    ).motion;
    const media = { ...baseMedia(), motion: keyed };
    const applied = applyMediaVisualEffectPreset(media, "monochrome", CAPABLE);
    assert.equal(applied.status, "ok");
    assert.equal(applied.media.visualEffect?.presetId, "monochrome");
    assert.equal(applied.media.motion?.keyframes?.length, 2);

    const disabledMotion = setMediaMotionEnabledPreservingKeyframes(
      applied.media.motion!,
      false,
    ).motion;
    const withDisabledMotion = { ...applied.media, motion: disabledMotion };
    assert.equal(withDisabledMotion.visualEffect?.presetId, "monochrome");
    assert.equal(
      isActiveMediaVisualEffect(withDisabledMotion.visualEffect, true),
      true,
    );

    const reset = resetMediaVisualEffect(withDisabledMotion, CAPABLE);
    assert.equal(reset.media.visualEffect, undefined);
    assert.equal(reset.media.motion?.keyframes?.length, 2);
    assert.equal(reset.media.motion?.enabled, false);

    const refused = applyMediaVisualEffectPreset(media, "vivid");
    assert.equal(refused.status, "terminal");
    assert.equal(refused.media.visualEffect, undefined);
  });

  test("intensity zero clears effect and selection-required refuses", () => {
    const media = applyMediaVisualEffectPreset(baseMedia(), "vivid", CAPABLE).media;
    const cleared = setMediaVisualEffectIntensity(media, 0, CAPABLE);
    assert.equal(cleared.media.visualEffect, undefined);
    const blocked = applyMediaVisualEffectPreset(media, "vivid", {
      keyframedVisualEffectsEnabled: true,
      requiresMediaItemSelection: true,
    });
    assert.equal(blocked.status, "terminal");
    const restored = setMediaVisualEffectIntensity(media, Number.NaN, CAPABLE);
    assert.equal(restored.media.visualEffect?.intensity, media.visualEffect?.intensity);
    assert.ok(restored.warnings.length > 0);
  });

  test("frozen manifest embeds resolved BCS and replay ignores catalog", () => {
    const media = applyMediaVisualEffectPreset(baseMedia(), "vivid", CAPABLE).media;
    const frozen = projectMediaVisualEffectToManifest(media.visualEffect, true);
    assert.ok(frozen);
    assert.equal(frozen.presetId, "vivid");
    assert.equal(frozen.brightness, 108);
    assert.equal(frozen.contrast, 112);
    assert.equal(frozen.saturation, 140);
    assert.ok(readFrozenMediaVisualEffectParams(frozen));

    // Spoofed preset identity with frozen monochrome saturation must not catalog-resolve.
    const spoofed = {
      version: 1 as const,
      presetId: "vivid" as const,
      intensity: 1,
      brightness: 100,
      contrast: 110,
      saturation: 0,
    };
    const frozenFilter = buildComposedMediaVisualFilter(undefined, spoofed, {
      keyframedVisualEffectsEnabled: true,
      effectSource: "frozen",
    });
    const catalogFilter = buildComposedMediaVisualFilter(undefined, spoofed, {
      keyframedVisualEffectsEnabled: true,
      effectSource: "catalog",
    });
    assert.match(frozenFilter, /saturate\(0\)/);
    assert.notEqual(frozenFilter, catalogFilter);
    assert.match(catalogFilter, /saturate\(1\.4/);

    const exportRenderer = readSrc(
      "src/features/export/utils/export-scene-media-renderer.ts",
    );
    assert.match(exportRenderer, /effectSource:\s*["']frozen["']/);
    assert.doesNotMatch(exportRenderer, /getMediaVisualEffectPreset/);
    assert.doesNotMatch(
      JSON.stringify(frozen),
      /brightness\(|filter:|canvas/,
    );
  });

  test("v4 identity stability and v5 effect-only / keyframe-only / combined", () => {
    const plain = buildExportManifest({
      story: storyFromMedia(baseMedia()),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: false,
    });
    const dormant = buildExportManifest({
      story: storyFromMedia(
        baseMedia({ version: 1, presetId: "vivid", intensity: 1 }),
      ),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: false,
    });
    assert.equal(dormant.version, 4);
    assert.equal(dormant.fingerprint, plain.fingerprint);
    assert.doesNotMatch(JSON.stringify(dormant), /"visualEffect"/);

    const effectOnly = buildExportManifest({
      story: storyFromMedia(
        applyMediaVisualEffectPreset(baseMedia(), "cinematic", CAPABLE).media,
      ),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(effectOnly.version, 5);
    assert.deepEqual(effectOnly.requiredCapabilities, ["keyframed-visual-effects-v1"]);
    const effectMedia = effectOnly.scenes[0]!.mediaTimeline.items[0]!.media;
    assert.ok(effectMedia.type === "image");
    assert.equal(effectMedia.visualEffect?.presetId, "cinematic");
    assert.equal(effectMedia.visualEffect?.brightness, 94);
    assert.equal(effectMedia.motion?.keyframes, undefined);
    assert.ok(validateExportManifest(effectOnly).ok);

    const keyed = initializeMediaMotionKeyframes(baseMedia().motion!, 4000, CAPABLE).motion;
    const keyframeOnly = buildExportManifest({
      story: storyFromMedia({ ...baseMedia(), motion: keyed }),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(keyframeOnly.version, 5);
    const keyframeMedia = keyframeOnly.scenes[0]!.mediaTimeline.items[0]!.media;
    assert.ok(keyframeMedia.type !== "placeholder");
    assert.equal(
      keyframeMedia.type === "image" || keyframeMedia.type === "video"
        ? keyframeMedia.visualEffect
        : undefined,
      undefined,
    );

    const combinedMedia = applyMediaVisualEffectPreset(
      { ...baseMedia(), motion: keyed },
      "vivid",
      CAPABLE,
    ).media;
    const combined = buildExportManifest({
      story: storyFromMedia(combinedMedia),
      environment: CAPABLE_ENV,
      audioMode: "silent",
      keyframedVisualEffectsEnabled: true,
    });
    assert.equal(combined.version, 5);
    const combinedItem = combined.scenes[0]!.mediaTimeline.items[0]!.media;
    assert.ok(combinedItem.type === "image");
    assert.ok(combinedItem.motion?.keyframes);
    assert.equal(combinedItem.visualEffect?.presetId, "vivid");
    assert.equal(combinedItem.visualEffect?.saturation, 140);
    assert.notEqual(combined.fingerprint, keyframeOnly.fingerprint);
    assert.notEqual(combined.fingerprint, effectOnly.fingerprint);
  });

  test("source-quality framing Apply retains visualEffect and visualAdjustments", () => {
    const adjustments = {
      version: 1 as const,
      brightness: 112,
      contrast: 108,
      saturation: 120,
      shadowEnabled: false,
      shadowColor: "#000000",
      shadowOpacity: 0.35,
      shadowBlur: 16,
      shadowOffsetX: 0,
      shadowOffsetY: 8,
    };
    const media = {
      ...applyMediaVisualEffectPreset(baseMedia(), "cinematic", CAPABLE).media,
      visualAdjustments: adjustments,
    };
    const script = storyFromMedia(media);
    const framed = buildMediaFramingPatch(script.scenes[0]!, { zoom: 1.15 });
    assert.ok(framed?.media);
    assert.equal(framed!.media!.visualEffect?.presetId, "cinematic");
    assert.deepEqual(framed!.media!.visualAdjustments, adjustments);
    const framingSrc = readSrc(
      "src/features/media-framing/media-framing-patch.utils.ts",
    );
    assert.match(framingSrc, /cloneMediaPreservingPlayback/);
    const sqCommands = readSrc(
      "src/features/source-quality/editor/source-quality-adjustment.commands.ts",
    );
    assert.match(sqCommands, /buildMediaFramingPatch/);
    assert.match(sqCommands, /withProvenance/);
  });

  test("commands never invent capability fetch or alter framing/timing fields", () => {
    const commands = readSrc(
      "src/features/media-motion/editor/media-visual-effect.commands.ts",
    );
    assert.doesNotMatch(commands, /fetch\(|visualSequence|narration|backgroundMusic|fitMode|positionX/);
  });

  console.log(`\n${passed} passed\n`);
}

main();
