/**
 * Caption Engine v2 registry verification
 * (run: npm run test:caption-engine).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAPTION_PRESET_ORDER,
  DEFAULT_CAPTION_PRESET,
  FADE_SAFE_CAPTION_STYLE_TOKENS,
  PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS,
  applyPreviewCaptionStyleClassName,
  buildSceneCaptionPresetPatch,
  buildSceneSubtitleEffectPatch,
  getCaptionPreset,
  getCaptionPresetRegistry,
  getCaptionPresets,
  LEGACY_EXPORT_CAPTION_STYLE_TOKENS,
  LEGACY_SUBTITLE_EFFECT_TO_CAPTION_PRESET,
  mapLegacySubtitleEffectToCaptionPreset,
  resolveCaptionPreset,
  resolveEffectiveSubtitleEffect,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleForDisplay,
  resolveFadeSafeCaptionStyle,
  resolvePreviewCaptionStyle,
  resolvePreviewTikTokMotionStyle,
  resolveSceneCaptionPreset,
  resolveTikTokMotionOverlay,
  resolveTikTokMotionVisualState,
  resolveTikTokPopScale,
  TIKTOK_MOTION_STYLE_TOKENS,
  TIKTOK_POP_DURATION_MS,
  resolveSportsBounceScale,
  resolveSportsMotionOverlay,
  resolveSportsMotionVisualState,
  resolvePreviewSportsMotionStyle,
  resolvePreviewNewsMotionStyle,
  resolveNewsMotionOverlay,
  resolveNewsMotionVisualState,
  resolveNewsSlideOffsetPx,
  SPORTS_BOUNCE_MIN_WINDOW_MS,
  SPORTS_BOUNCE_DURATION_MS,
  NEWS_SLIDE_DURATION_MS,
  NEWS_SLIDE_MIN_WINDOW_MS,
  inferSportsBounceDisabled,
  inferNewsSlideDisabled,
  inferCaptionTooShortForTypewriter,
} from "@/features/caption-engine";
import type { CaptionPresetConfig } from "@/features/caption-engine/caption-engine.types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAPTION_ENGINE_ROOT = join(process.cwd(), "src/features/caption-engine");
const REPO_ROOT = process.cwd();

const RENDERER_PATHS_WITHOUT_CAPTION_ENGINE = [
  "src/features/preview/components/CaptionOverlay.tsx",
  "src/features/preview/components/SubtitleOverlay.tsx",
  "src/features/export/services/video-render.service.ts",
  "src/features/timeline-intelligence/resolve-caption-animation-state.utils.ts",
];

const EXPORT_CAPTION_CANVAS_PATH = "src/features/export/utils/export-caption-canvas.utils.ts";
const PREVIEW_RENDERER_PATH = "src/features/editor/components/subtitleEffectPreview.tsx";

function test(name: string, fn: () => void) {
  fn();
  console.log(`  ✓ ${name}`);
}

function collectCaptionEngineSources(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectCaptionEngineSources(fullPath));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".verify.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function readRepo(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

console.log("caption-engine");

test("all caption presets exist with required fields", () => {
  assert.equal(CAPTION_PRESET_ORDER.length, 6);
  assert.deepEqual(CAPTION_PRESET_ORDER, [
    "minimal",
    "documentary",
    "tiktok",
    "sports",
    "news",
    "cinematic",
  ]);

  for (const id of CAPTION_PRESET_ORDER) {
    const preset = getCaptionPreset(id);
    assert.ok(preset, `preset ${id}`);
    assert.equal(preset!.id, id);
    assert.ok(preset!.label.trim());
    assert.ok(preset!.description.trim());
    assert.ok(preset!.recommendedUse.length > 0);
    assert.ok(["fade", "slide", "pop", "bounce"].includes(preset!.entranceEffect));
    assert.ok(["none", "highlight", "karaoke", "glow"].includes(preset!.emphasisBehavior));
    assert.ok(preset!.fallbackSubtitleEffect);
  }
});

test("caption preset registry is immutable", () => {
  const registry = getCaptionPresetRegistry();
  const presets = getCaptionPresets();

  assert.throws(() => {
    (registry as CaptionPresetConfig[]).push({
      id: "minimal",
      label: "Mutated",
      description: "x",
      entranceEffect: "fade",
      emphasisBehavior: "none",
      motionIntensity: "low",
      textWeight: "normal",
      shadowStyle: "none",
      highlightStyle: "none",
      recommendedUse: [],
      fallbackSubtitleEffect: "fade-up",
    });
  });

  presets[0]!.recommendedUse.push("mutated");
  assert.doesNotMatch(getCaptionPreset("minimal")!.recommendedUse.join(","), /mutated/);
});

test("legacy subtitle effects map to expected caption presets", () => {
  assert.equal(mapLegacySubtitleEffectToCaptionPreset("fade-up"), "minimal");
  assert.equal(mapLegacySubtitleEffectToCaptionPreset("typewriter"), "tiktok");
  assert.equal(mapLegacySubtitleEffectToCaptionPreset("highlight"), "news");
  assert.deepEqual(LEGACY_SUBTITLE_EFFECT_TO_CAPTION_PRESET, {
    "fade-up": "minimal",
    typewriter: "tiktok",
    highlight: "news",
  });
});

test("unknown caption preset falls back to minimal", () => {
  assert.equal(resolveCaptionPreset(undefined), DEFAULT_CAPTION_PRESET);
  assert.equal(resolveCaptionPreset(""), DEFAULT_CAPTION_PRESET);
  assert.equal(resolveCaptionPreset("unknown-preset"), DEFAULT_CAPTION_PRESET);
  assert.equal(
    resolveSceneCaptionPreset({ captionPreset: "not-a-preset", subtitleEffect: "typewriter" }),
    DEFAULT_CAPTION_PRESET,
  );
});

test("resolveSceneCaptionPreset prefers explicit captionPreset over legacy effect", () => {
  assert.equal(
    resolveSceneCaptionPreset({ captionPreset: "cinematic", subtitleEffect: "typewriter" }),
    "cinematic",
  );
  assert.equal(resolveSceneCaptionPreset({ subtitleEffect: "highlight" }), "news");
  assert.equal(resolveSceneCaptionPreset({ subtitleEffect: "fade-up" }), "minimal");
});

test("resolveEffectiveSubtitleEffect keeps legacy subtitleEffect authoritative for renderers", () => {
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "tiktok", subtitleEffect: "fade-up" }),
    "fade-up",
  );
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "news" }),
    "highlight",
  );
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "minimal", subtitleEffect: undefined }),
    "fade-up",
  );
});

test("caption engine utils do not mutate scene objects", () => {
  const scene = {
    captionPreset: "sports" as const,
    subtitleEffect: "fade-up" as const,
  };
  const snapshot = JSON.stringify(scene);

  resolveSceneCaptionPreset(scene);
  resolveEffectiveSubtitleEffect(scene);

  assert.equal(JSON.stringify(scene), snapshot);
});

test("caption engine module has no preview/export/renderer imports", () => {
  const forbidden = [
    "@/features/preview/",
    "@/features/export/",
    "subtitleEffectPreview",
    "resolve-caption-animation-state",
    "export-caption-canvas",
    "video-render.service",
  ];

  for (const filePath of collectCaptionEngineSources(CAPTION_ENGINE_ROOT)) {
    const source = readFileSync(filePath, "utf8");
    for (const token of forbidden) {
      assert.doesNotMatch(
        source,
        new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        `${filePath} must not import ${token}`,
      );
    }
  }
});

test("export canvas and timeline renderers stay isolated from caption-engine except export canvas", () => {
  for (const relativePath of RENDERER_PATHS_WITHOUT_CAPTION_ENGINE) {
    const source = readRepo(relativePath);
    assert.doesNotMatch(source, /@\/features\/caption-engine/);
    assert.doesNotMatch(source, /caption-engine/);
  }

  const exportCanvas = readRepo(EXPORT_CAPTION_CANVAS_PATH);
  assert.match(exportCanvas, /resolveExportCaptionStyleForDisplay/);
  assert.match(exportCanvas, /applyExportCaptionTextDrawState/);
  assert.doesNotMatch(exportCanvas, /video-render\.service/);
});

test("preview renderer imports caption-engine style adapter only", () => {
  const previewRenderer = readRepo(PREVIEW_RENDERER_PATH);

  assert.match(previewRenderer, /@\/features\/caption-engine/);
  assert.match(previewRenderer, /resolvePreviewCaptionStyle/);
  assert.match(previewRenderer, /applyPreviewCaptionStyleClassName/);
});

test("fade-safe caption presets apply preview style overlay on fade-up only", () => {
  for (const presetId of PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS) {
    const style = resolvePreviewCaptionStyle({
      captionPreset: presetId,
      subtitleEffect: "fade-up",
    });

    assert.equal(style.presetId, presetId);
    assert.equal(style.usesFadeSafeStyleOverlay, true);
    assert.match(style.containerClassName, /caption-preset-/);
    assert.equal(getCaptionPreset(presetId)!.fallbackSubtitleEffect, "fade-up");
    assert.equal(getCaptionPreset(presetId)!.entranceEffect, "fade");
  }

  const minimal = resolvePreviewCaptionStyle({
    captionPreset: "minimal",
    subtitleEffect: "fade-up",
  });
  const documentary = resolvePreviewCaptionStyle({
    captionPreset: "documentary",
    subtitleEffect: "fade-up",
  });
  const cinematic = resolvePreviewCaptionStyle({
    captionPreset: "cinematic",
    subtitleEffect: "fade-up",
  });

  assert.match(minimal.containerClassName, /caption-preset-minimal/);
  assert.match(documentary.containerClassName, /caption-preset-documentary/);
  assert.match(cinematic.containerClassName, /caption-preset-cinematic/);
  assert.notEqual(minimal.containerClassName, documentary.containerClassName);
  assert.notEqual(documentary.containerClassName, cinematic.containerClassName);
});

test("tiktok sports and news presets keep legacy subtitleEffect preview fallback", () => {
  for (const presetId of ["tiktok", "sports", "news"] as const) {
    const style = resolvePreviewCaptionStyle({ captionPreset: presetId });
    assert.equal(style.usesFadeSafeStyleOverlay, false);
    assert.equal(style.containerClassName, "");
    assert.equal(style.lineClassName, "");
  }

  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "tiktok" }),
    "typewriter",
  );
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "sports" }),
    "highlight",
  );
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "news" }),
    "highlight",
  );
});

test("safe preset style overlay is skipped when subtitleEffect is not fade-up", () => {
  const cinematicWithTypewriter = resolvePreviewCaptionStyle({
    captionPreset: "cinematic",
    subtitleEffect: "typewriter",
  });

  assert.equal(cinematicWithTypewriter.usesFadeSafeStyleOverlay, false);
  assert.equal(cinematicWithTypewriter.containerClassName, "");
  assert.equal(cinematicWithTypewriter.lineClassName, "");
});

test("applyPreviewCaptionStyleClassName preserves base classes", () => {
  const style = resolvePreviewCaptionStyle({
    captionPreset: "documentary",
    subtitleEffect: "fade-up",
  });
  const merged = applyPreviewCaptionStyleClassName("preview-narration-subtitle-text", style);

  assert.match(merged, /^preview-narration-subtitle-text /);
  assert.match(merged, /caption-preset-documentary/);
});

test("resolve-caption-animation-state remains unchanged by caption-engine preview adapter", () => {
  const resolver = readRepo(
    "src/features/timeline-intelligence/resolve-caption-animation-state.utils.ts",
  );

  assert.doesNotMatch(resolver, /caption-engine/);
  assert.doesNotMatch(resolver, /resolvePreviewCaptionStyle/);
});

test("safe caption presets resolve export fade-safe styles", () => {
  for (const presetId of PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS) {
    const style = resolveExportCaptionStyle({
      captionPreset: presetId,
      subtitleEffect: "fade-up",
    });

    assert.equal(style.presetId, presetId);
    assert.equal(style.usesFadeSafeStyleOverlay, true);
    assert.deepEqual(style, {
      presetId,
      usesFadeSafeStyleOverlay: true,
      ...FADE_SAFE_CAPTION_STYLE_TOKENS[presetId],
    });
  }

  assert.equal(
    resolveExportCaptionStyle({ captionPreset: "minimal", subtitleEffect: "fade-up" }).fontWeight,
    "500",
  );
  assert.equal(
    resolveExportCaptionStyle({ captionPreset: "documentary", subtitleEffect: "fade-up" })
      .letterSpacingEm,
    0.025,
  );
  assert.ok(
    resolveExportCaptionStyle({ captionPreset: "cinematic", subtitleEffect: "fade-up" }).textShadow,
  );
});

test("non-safe caption presets keep legacy export styling", () => {
  for (const presetId of ["tiktok", "sports", "news"] as const) {
    const style = resolveExportCaptionStyle({ captionPreset: presetId });
    assert.equal(style.usesFadeSafeStyleOverlay, false);
    assert.equal(style.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
    assert.equal(style.lineHeightRatio, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.lineHeightRatio);
    assert.equal(style.letterSpacingEm, 0);
    assert.equal(style.textShadow, null);
  }
});

test("non-fade subtitle effects skip export preset styling", () => {
  const cinematicTypewriter = resolveExportCaptionStyle({
    captionPreset: "cinematic",
    subtitleEffect: "typewriter",
  });

  assert.equal(cinematicTypewriter.usesFadeSafeStyleOverlay, false);
  assert.equal(cinematicTypewriter.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
});

test("preview and export share fade-safe preset resolution", () => {
  const scene = { captionPreset: "documentary" as const, subtitleEffect: "fade-up" as const };
  const preview = resolvePreviewCaptionStyle(scene);
  const exportStyle = resolveExportCaptionStyle(scene);
  const fadeSafe = resolveFadeSafeCaptionStyle(scene);

  assert.equal(preview.usesFadeSafeStyleOverlay, true);
  assert.equal(exportStyle.usesFadeSafeStyleOverlay, true);
  assert.equal(fadeSafe.usesFadeSafeStyleOverlay, true);
  assert.equal(exportStyle.fontWeight, FADE_SAFE_CAPTION_STYLE_TOKENS.documentary.fontWeight);
  assert.match(preview.containerClassName, /caption-preset-documentary/);
});

test("FootieScene exposes optional captionPreset field", () => {
  const storyTypes = readRepo("src/features/story/types/story.types.ts");
  assert.match(storyTypes, /captionPreset\?: CaptionPresetId/);
});

test("buildSceneCaptionPresetPatch updates captionPreset and fallback subtitleEffect", () => {
  assert.deepEqual(buildSceneCaptionPresetPatch("tiktok"), {
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.deepEqual(buildSceneCaptionPresetPatch("news"), {
    captionPreset: "news",
    subtitleEffect: "highlight",
  });
  assert.deepEqual(buildSceneCaptionPresetPatch("unknown"), {
    captionPreset: DEFAULT_CAPTION_PRESET,
    subtitleEffect: "fade-up",
  });
});

test("buildSceneSubtitleEffectPatch keeps legacy effect mapping in sync", () => {
  assert.deepEqual(buildSceneSubtitleEffectPatch("typewriter"), {
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.deepEqual(buildSceneSubtitleEffectPatch("highlight"), {
    captionPreset: "news",
    subtitleEffect: "highlight",
  });
});

test("caption preset selection patch leaves subtitle text and caption mode untouched", () => {
  const scene = {
    captionMode: "subtitles" as const,
    subtitleText: "Keep this copy intact.",
    subtitleEffect: "fade-up" as const,
    narration: "Voiceover excerpt",
  };
  const patch = buildSceneCaptionPresetPatch("sports");

  assert.equal(patch.captionPreset, "sports");
  assert.equal(patch.subtitleEffect, "highlight");
  assert.doesNotMatch(JSON.stringify(patch), /subtitleText/);
  assert.doesNotMatch(JSON.stringify(patch), /captionMode/);
  assert.doesNotMatch(JSON.stringify(patch), /narration/);
  assert.doesNotMatch(JSON.stringify(patch), /voiceover/);
  assert.equal(scene.subtitleText, "Keep this copy intact.");
  assert.equal(scene.captionMode, "subtitles");
});

test("tiktok preset uses typewriter path with pop motion styling", () => {
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "tiktok" }),
    "typewriter",
  );
  assert.equal(getCaptionPreset("tiktok")!.entranceEffect, "pop");
  assert.equal(getCaptionPreset("tiktok")!.emphasisBehavior, "none");

  const overlay = resolveTikTokMotionOverlay({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.equal(overlay.usesTikTokMotionOverlay, true);
  assert.equal(overlay.usesLegacyTypewriterFallback, false);

  const previewStyle = resolvePreviewTikTokMotionStyle({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.match(previewStyle.containerClassName, /caption-preset-tiktok/);
  assert.match(previewStyle.containerClassName, /tracking-tight/);

  const exportStyle = resolveExportCaptionStyleForDisplay({
    captionPreset: "tiktok",
    effect: "typewriter",
    captionTooShortForEffect: false,
  });
  assert.equal(exportStyle.fontWeight, TIKTOK_MOTION_STYLE_TOKENS.fontWeight);
  assert.equal(exportStyle.letterSpacingEm, TIKTOK_MOTION_STYLE_TOKENS.letterSpacingEm);
});

test("tiktok pop scale is visual-only and eases to 1", () => {
  assert.equal(resolveTikTokPopScale(0), 0.92);
  assert.ok(resolveTikTokPopScale(TIKTOK_POP_DURATION_MS / 2) > 0.92);
  assert.equal(resolveTikTokPopScale(TIKTOK_POP_DURATION_MS), 1);

  const motion = resolveTikTokMotionVisualState(
    resolveTikTokMotionOverlay({
      captionPreset: "tiktok",
      subtitleEffect: "typewriter",
    }),
    { localElapsedMs: 80 },
  );
  assert.match(motion.transform, /scale\(/);
});

test("short subtitle windows degrade tiktok motion to legacy typewriter", () => {
  const overlay = resolveTikTokMotionOverlay({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
    captionTooShortForEffect: true,
  });
  assert.equal(overlay.usesTikTokMotionOverlay, false);
  assert.equal(overlay.usesLegacyTypewriterFallback, true);

  const previewStyle = resolvePreviewTikTokMotionStyle({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
    captionTooShortForEffect: true,
  });
  assert.equal(previewStyle.containerClassName, "");

  const exportStyle = resolveExportCaptionStyleForDisplay({
    captionPreset: "tiktok",
    effect: "typewriter",
    captionTooShortForEffect: true,
  });
  assert.equal(exportStyle.fontWeight, LEGACY_EXPORT_CAPTION_STYLE_TOKENS.fontWeight);
});

test("inferCaptionTooShortForTypewriter detects tight windows", () => {
  const longChunk = "one two three four five six seven eight nine ten eleven twelve";
  assert.equal(inferCaptionTooShortForTypewriter("Hi", 5000), false);
  assert.equal(inferCaptionTooShortForTypewriter(longChunk, 120), true);
});

test("preview and export renderers wire tiktok motion without touching timing resolver", () => {
  const previewRenderer = readRepo(PREVIEW_RENDERER_PATH);
  const exportCanvas = readRepo(EXPORT_CAPTION_CANVAS_PATH);

  assert.match(previewRenderer, /resolvePreviewTikTokMotionStyle/);
  assert.match(previewRenderer, /resolveTikTokMotionVisualState/);
  assert.match(exportCanvas, /resolveTikTokMotionOverlay/);
  assert.match(exportCanvas, /resolveTikTokPopScale|resolveTikTokMotionVisualState/);
  assert.doesNotMatch(exportCanvas, /resolveTypewriterVisibleText/);
});

test("fade-safe presets remain unchanged by tiktok motion module", () => {
  for (const presetId of PREVIEW_FADE_SAFE_CAPTION_PRESET_IDS) {
    const preview = resolvePreviewCaptionStyle({
      captionPreset: presetId,
      subtitleEffect: "fade-up",
    });
    assert.equal(preview.usesFadeSafeStyleOverlay, true);

    const exportStyle = resolveExportCaptionStyle({
      captionPreset: presetId,
      subtitleEffect: "fade-up",
    });
    assert.equal(exportStyle.usesFadeSafeStyleOverlay, true);
  }
});

test("sports preset uses highlight path with bounce and glow motion styling", () => {
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "sports" }),
    "highlight",
  );
  assert.equal(getCaptionPreset("sports")!.entranceEffect, "bounce");
  assert.equal(getCaptionPreset("sports")!.emphasisBehavior, "glow");

  const overlay = resolveSportsMotionOverlay({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.equal(overlay.usesSportsMotionOverlay, true);
  assert.equal(overlay.usesLegacyHighlightFallback, false);

  const previewStyle = resolvePreviewSportsMotionStyle({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.match(previewStyle.containerClassName, /caption-preset-sports/);
  assert.match(previewStyle.textGlowClassName, /caption-preset-sports-glow/);

  const motion = resolveSportsMotionVisualState(overlay, { localElapsedMs: 100 });
  assert.ok(motion.usesSportsGlow);
  assert.match(motion.transform, /scale\(/);
});

test("sports bounce scale is visual-only and eases to 1", () => {
  assert.equal(resolveSportsBounceScale(0), 0.94);
  assert.ok(resolveSportsBounceScale(SPORTS_BOUNCE_DURATION_MS / 2) > 0.94);
  assert.equal(resolveSportsBounceScale(SPORTS_BOUNCE_DURATION_MS), 1);
});

test("short subtitle windows degrade sports motion to legacy highlight", () => {
  const overlay = resolveSportsMotionOverlay({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: SPORTS_BOUNCE_MIN_WINDOW_MS - 50,
  });
  assert.equal(overlay.usesSportsMotionOverlay, false);
  assert.equal(overlay.usesLegacyHighlightFallback, true);

  const previewStyle = resolvePreviewSportsMotionStyle({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 200,
  });
  assert.equal(previewStyle.containerClassName, "");
  assert.equal(previewStyle.textGlowClassName, "");

  const motion = resolveSportsMotionVisualState(overlay, { localElapsedMs: 50 });
  assert.equal(motion.bounceScale, 1);
  assert.equal(motion.usesSportsGlow, false);
});

test("inferSportsBounceDisabled detects tight highlight windows", () => {
  assert.equal(inferSportsBounceDisabled(SPORTS_BOUNCE_MIN_WINDOW_MS), false);
  assert.equal(inferSportsBounceDisabled(SPORTS_BOUNCE_MIN_WINDOW_MS - 1), true);
  assert.equal(inferSportsBounceDisabled(undefined), false);
});

test("preview and export renderers wire sports motion without touching timing resolver", () => {
  const previewRenderer = readRepo(PREVIEW_RENDERER_PATH);
  const exportCanvas = readRepo(EXPORT_CAPTION_CANVAS_PATH);

  assert.match(previewRenderer, /resolvePreviewSportsMotionStyle/);
  assert.match(previewRenderer, /resolveSportsMotionVisualState/);
  assert.match(exportCanvas, /resolveSportsMotionOverlay/);
  assert.match(exportCanvas, /SPORTS_MOTION_STYLE_TOKENS/);
  assert.doesNotMatch(exportCanvas, /resolveCaptionAnimationState/);
});

test("tiktok preset remains unchanged by sports motion module", () => {
  const overlay = resolveTikTokMotionOverlay({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
  });
  assert.equal(overlay.usesTikTokMotionOverlay, true);

  const sportsOnTiktok = resolveSportsMotionOverlay({
    captionPreset: "tiktok",
    subtitleEffect: "typewriter",
    subtitleAvailableDurationMs: 5000,
  });
  assert.equal(sportsOnTiktok.usesSportsMotionOverlay, false);
});

test("news preset uses highlight path with lower-third slide styling", () => {
  assert.equal(
    resolveEffectiveSubtitleEffect({ captionPreset: "news" }),
    "highlight",
  );
  assert.equal(getCaptionPreset("news")!.entranceEffect, "slide");
  assert.equal(getCaptionPreset("news")!.emphasisBehavior, "highlight");

  const overlay = resolveNewsMotionOverlay({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.equal(overlay.usesNewsMotionOverlay, true);
  assert.equal(overlay.usesLegacyHighlightFallback, false);

  const previewStyle = resolvePreviewNewsMotionStyle({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 2000,
  });
  assert.match(previewStyle.containerClassName, /caption-preset-news/);
  assert.match(previewStyle.textAccentClassName, /caption-preset-news-text/);

  const motion = resolveNewsMotionVisualState(overlay, { localElapsedMs: 100 });
  assert.ok(motion.usesNewsLowerThird);
  assert.match(motion.transform, /translateY\(/);
});

test("news slide offset is visual-only and settles to zero", () => {
  assert.equal(resolveNewsSlideOffsetPx(0), 14);
  assert.ok(resolveNewsSlideOffsetPx(NEWS_SLIDE_DURATION_MS / 2) < 14);
  assert.equal(resolveNewsSlideOffsetPx(NEWS_SLIDE_DURATION_MS), 0);
});

test("short subtitle windows degrade news motion to standard highlight", () => {
  const overlay = resolveNewsMotionOverlay({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: NEWS_SLIDE_MIN_WINDOW_MS - 50,
  });
  assert.equal(overlay.usesNewsMotionOverlay, false);
  assert.equal(overlay.usesLegacyHighlightFallback, true);

  const previewStyle = resolvePreviewNewsMotionStyle({
    captionPreset: "news",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 200,
  });
  assert.equal(previewStyle.containerClassName, "");

  const motion = resolveNewsMotionVisualState(overlay, { localElapsedMs: 50 });
  assert.equal(motion.slideOffsetPx, 0);
  assert.equal(motion.usesNewsLowerThird, false);
});

test("inferNewsSlideDisabled detects tight highlight windows", () => {
  assert.equal(inferNewsSlideDisabled(NEWS_SLIDE_MIN_WINDOW_MS), false);
  assert.equal(inferNewsSlideDisabled(NEWS_SLIDE_MIN_WINDOW_MS - 1), true);
});

test("preview and export renderers wire news motion without touching timing resolver", () => {
  const previewRenderer = readRepo(PREVIEW_RENDERER_PATH);
  const exportCanvas = readRepo(EXPORT_CAPTION_CANVAS_PATH);

  assert.match(previewRenderer, /resolvePreviewNewsMotionStyle/);
  assert.match(previewRenderer, /resolveNewsMotionVisualState/);
  assert.match(exportCanvas, /resolveNewsMotionOverlay/);
  assert.match(exportCanvas, /NEWS_MOTION_STYLE_TOKENS/);
});

test("sports preset remains unchanged by news motion module", () => {
  const overlay = resolveSportsMotionOverlay({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 5000,
  });
  assert.equal(overlay.usesSportsMotionOverlay, true);

  const newsOnSports = resolveNewsMotionOverlay({
    captionPreset: "sports",
    subtitleEffect: "highlight",
    subtitleAvailableDurationMs: 5000,
  });
  assert.equal(newsOnSports.usesNewsMotionOverlay, false);
});

test("StudioSceneInspector wires CaptionPresetPanel without voiceover side effects", () => {
  const inspector = readRepo("src/features/editor/components/caption-workspace/CaptionWorkspace.tsx");
  const panel = readRepo("src/features/caption-engine/CaptionPresetPanel.tsx");

  assert.match(inspector, /CaptionPresetPanel/);
  assert.match(inspector, /buildSceneCaptionPresetPatch/);
  assert.match(inspector, /buildSceneSubtitleEffectPatch/);
  assert.match(inspector, /Advanced subtitle effect/);
  assert.match(panel, /Presets control caption style\. Rendering remains export-safe\./);
  assert.match(panel, /role="radiogroup"/);
  assert.match(panel, /studioCard/);
  assert.doesNotMatch(panel, /studioChip/);
  assert.doesNotMatch(panel, /min-h-\[6/);
  assert.doesNotMatch(panel, /min-h-\[7/);
  assert.doesNotMatch(inspector, /generate-voiceover/);
  assert.doesNotMatch(inspector, /applyVoiceover/);
});

console.log("\nAll caption engine checks passed.");
