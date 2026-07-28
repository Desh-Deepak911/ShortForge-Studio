/**
 * Caption Style Engine — 4.1B-1
 * Run: npm run test:caption-style
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyExportCaptionGlow,
  applyExportCaptionOutline,
  applyExportCaptionShadow,
  applyExportCaptionTextDrawState,
  applyCaptionTextTransform,
  DEFAULT_CAPTION_STYLE,
  LEGACY_EXPORT_CAPTION_BOX_PAD_X,
  LEGACY_EXPORT_CAPTION_BOX_PAD_Y,
  LEGACY_EXPORT_CAPTION_BOX_RADIUS,
  LEGACY_EXPORT_CAPTION_FONT_SIZE,
  mergeCaptionStyleSettings,
  PREVIEW_CAPTION_STYLE_UI_SCALE,
  resolveCaptionGlow,
  resolveCaptionOutline,
  resolveCaptionShadow,
  resolveCaptionStyle,
  resolveExportCaptionBackgroundFill,
  resolveExportCaptionStyle,
  resolveExportCaptionStyleForDisplay,
  resolveExportCaptionStyleMetrics,
  resolvePreviewCaptionContainerStyle,
  resolvePreviewCaptionStyle,
  resolvePreviewCaptionTextEffectStyle,
  resolvePreviewCaptionTypographyStyleForScene,
  formatExportCaptionLineText,
} from "@/features/caption-style";
import {
  applyPresentationSceneUpdate,
} from "@/lib/utils/voiceover";
import { classifyStoryPatch } from "@/features/editor/story-patches";
import {
  applyStorySyncEdit,
  createInitialStorySynchronizationState,
  resolvePresentationSyncEditKind,
} from "@/features/story-sync";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("default resolution matches legacy export renderer values", () => {
  const { resolvedStyle, diagnostics } = resolveCaptionStyle();

  assert.equal(diagnostics.styleSource, "legacy");
  assert.equal(diagnostics.usesLegacyFallback, true);
  assert.equal(resolvedStyle.fontSize, LEGACY_EXPORT_CAPTION_FONT_SIZE);
  assert.equal(resolvedStyle.paddingX, LEGACY_EXPORT_CAPTION_BOX_PAD_X);
  assert.equal(resolvedStyle.paddingY, LEGACY_EXPORT_CAPTION_BOX_PAD_Y);
  assert.equal(resolvedStyle.cornerRadius, LEGACY_EXPORT_CAPTION_BOX_RADIUS);
  assert.equal(resolvedStyle.textColor, "#ffffff");
  assert.equal(resolvedStyle.backgroundEnabled, true);
  assert.equal(resolvedStyle.outlineEnabled, false);
  assert.equal(resolvedStyle.shadowEnabled, false);
  assert.equal(resolvedStyle.glowEnabled, false);
});

test("scene override wins over project default and engine defaults", () => {
  const { resolvedStyle, diagnostics } = resolveCaptionStyle({
    projectStyle: { textColor: "#cccccc", fontWeight: "500" },
    sceneStyle: { textColor: "#ff0000", fontWeight: "800" },
  });

  assert.equal(diagnostics.styleSource, "scene");
  assert.equal(diagnostics.usesSceneOverride, true);
  assert.equal(resolvedStyle.textColor, "#ff0000");
  assert.equal(resolvedStyle.fontWeight, "800");
});

test("project default applies when scene has no override", () => {
  const { resolvedStyle, diagnostics } = resolveCaptionStyle({
    projectStyle: { fontSize: 72, letterSpacing: 0.02 },
  });

  assert.equal(diagnostics.styleSource, "project");
  assert.equal(diagnostics.usesProjectDefault, true);
  assert.equal(resolvedStyle.fontSize, 72);
  assert.equal(resolvedStyle.letterSpacing, 0.02);
});

test("legacy stories without captionStyle use engine defaults", () => {
  const merged = mergeCaptionStyleSettings(undefined, undefined);
  assert.equal(merged.fontSize, DEFAULT_CAPTION_STYLE.fontSize);
  assert.equal(merged.fontFamily, DEFAULT_CAPTION_STYLE.fontFamily);
});

test("preview adapter exposes resolved style and preset overlay metadata", () => {
  const style = resolvePreviewCaptionStyle({
    captionPreset: "documentary",
    subtitleEffect: "fade-up",
  });

  assert.equal(style.presetId, "documentary");
  assert.equal(style.usesFadeSafeStyleOverlay, true);
  assert.match(style.containerClassName, /caption-preset-documentary/);
  assert.equal(style.resolvedStyle.fontSize, LEGACY_EXPORT_CAPTION_FONT_SIZE);
  const containerStyle = resolvePreviewCaptionContainerStyle(
    { captionStyle: { backgroundEnabled: true, backgroundColor: "#112233", backgroundOpacity: 80 } },
  );
  assert.match(String(containerStyle.backgroundColor), /rgba\(17, 34, 51/);
});

test("export adapter parity with preview for fade-safe minimal preset", () => {
  const scene = { captionPreset: "minimal" as const, subtitleEffect: "fade-up" as const };
  const preview = resolvePreviewCaptionStyle(scene);
  const exportStyle = resolveExportCaptionStyle(scene);

  assert.equal(preview.usesFadeSafeStyleOverlay, exportStyle.usesFadeSafeStyleOverlay);
  assert.equal(preview.presetId, exportStyle.presetId);
  assert.equal(exportStyle.fontWeight, "500");
  assert.equal(exportStyle.resolvedStyle.textColor, preview.resolvedStyle.textColor);
});

test("export metrics derive box sizing from resolved style", () => {
  const exportStyle = resolveExportCaptionStyleForDisplay(undefined);
  const metrics = resolveExportCaptionStyleMetrics(exportStyle, 2);

  assert.equal(metrics.fontSize, LEGACY_EXPORT_CAPTION_FONT_SIZE * 2);
  assert.equal(metrics.padX, LEGACY_EXPORT_CAPTION_BOX_PAD_X * 2);
  assert.equal(metrics.padY, LEGACY_EXPORT_CAPTION_BOX_PAD_Y * 2);
  assert.equal(metrics.cornerRadius, LEGACY_EXPORT_CAPTION_BOX_RADIUS * 2);
});

test("engine source is pure with no React dependency", () => {
  const engine = readSrc("src/features/caption-style/caption-style.engine.ts");
  const utils = readSrc("src/features/caption-style/caption-style.utils.ts");
  const defaults = readSrc("src/features/caption-style/caption-style.defaults.ts");

  assert.doesNotMatch(engine, /from "react"|from 'react'/);
  assert.doesNotMatch(utils, /from "react"|from 'react'/);
  assert.doesNotMatch(defaults, /from "react"|from 'react'/);
});

test("caption style module does not import story sync", () => {
  const files = [
    "src/features/caption-style/caption-style.engine.ts",
    "src/features/caption-style/caption-style.utils.ts",
    "src/features/caption-style/caption-style.defaults.ts",
    "src/features/caption-style/caption-style.types.ts",
  ];

  for (const file of files) {
    const source = readSrc(file);
    assert.doesNotMatch(source, /story-sync/);
  }
});

test("caption style module does not import timeline or voice modules", () => {
  const engine = readSrc("src/features/caption-style/caption-style.engine.ts");
  const utils = readSrc("src/features/caption-style/caption-style.utils.ts");

  assert.doesNotMatch(engine, /timeline|voiceover|voice-/i);
  assert.doesNotMatch(utils, /timeline|voiceover|voice-/i);
});

test("caption style engine does not import caption layout", () => {
  const engine = readSrc("src/features/caption-style/caption-style.engine.ts");
  const utils = readSrc("src/features/caption-style/caption-style.utils.ts");
  const defaults = readSrc("src/features/caption-style/caption-style.defaults.ts");

  assert.doesNotMatch(engine, /caption-layout/);
  assert.doesNotMatch(utils, /caption-layout/);
  assert.doesNotMatch(defaults, /caption-layout/);
});

test("export canvas consumes caption style adapters", () => {
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(exportCanvas, /resolveExportCaptionStyleForDisplay/);
  assert.match(exportCanvas, /resolveExportCaptionStyleMetrics/);
  assert.match(exportCanvas, /from "@\/features\/caption-style"/);
  assert.doesNotMatch(exportCanvas, /SUBTITLE_BOX_PAD_X = 18/);
});

test("preview renderer consumes caption style adapters via caption engine", () => {
  const previewRenderer = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  const captionEnginePreview = readSrc(
    "src/features/caption-engine/resolve-preview-caption-style.utils.ts",
  );

  assert.match(previewRenderer, /resolvePreviewCaptionStyle/);
  assert.match(captionEnginePreview, /from "@\/features\/caption-style"/);
});

test("applyExportCaptionTextDrawState uses resolved font family and text color", () => {
  const canvas = {
    font: "",
    fillStyle: "",
    letterSpacing: "",
    shadowBlur: 0,
    shadowColor: "",
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as CanvasRenderingContext2D;

  const exportStyle = resolveExportCaptionStyle({
    captionPreset: "cinematic",
    subtitleEffect: "fade-up",
    captionStyle: { fontFamily: "Georgia, serif", textColor: "#fefefe" },
  });

  applyExportCaptionTextDrawState(canvas, 64, exportStyle, 1);
  assert.match(canvas.font, /Georgia, serif/);
  assert.equal(canvas.fillStyle, "#fefefe");
});

test("background enabled resolves correctly", () => {
  const enabled = resolveCaptionStyle({ sceneStyle: { backgroundEnabled: true } }).resolvedStyle;
  const disabled = resolveCaptionStyle({ sceneStyle: { backgroundEnabled: false } }).resolvedStyle;
  assert.equal(enabled.backgroundEnabled, true);
  assert.equal(disabled.backgroundEnabled, false);
});

test("background color resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { backgroundColor: "#ff5500" } }).resolvedStyle;
  assert.equal(resolved.backgroundColor, "#ff5500");
});

test("opacity resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { backgroundOpacity: 72 } }).resolvedStyle;
  assert.equal(resolved.backgroundOpacity, 72);
});

test("padding resolves correctly", () => {
  const resolved = resolveCaptionStyle({
    sceneStyle: { paddingX: 24, paddingY: 14 },
  }).resolvedStyle;
  assert.equal(resolved.paddingX, 24);
  assert.equal(resolved.paddingY, 14);
});

test("corner radius resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { cornerRadius: 20 } }).resolvedStyle;
  assert.equal(resolved.cornerRadius, 20);
});

test("scene override beats project default for caption style", () => {
  const resolved = resolveCaptionStyle({
    projectStyle: { backgroundColor: "#111111", paddingX: 12 },
    sceneStyle: { backgroundColor: "#222222", paddingX: 28 },
  }).resolvedStyle;
  assert.equal(resolved.backgroundColor, "#222222");
  assert.equal(resolved.paddingX, 28);
});

test("project default beats engine default for caption style", () => {
  const resolved = resolveCaptionStyle({
    projectStyle: { maxLines: 2, cornerRadius: 8 },
  }).resolvedStyle;
  assert.equal(resolved.maxLines, 2);
  assert.equal(resolved.cornerRadius, 8);
});

test("preview and export parity preserved for container metrics", () => {
  const scene = {
    captionStyle: {
      backgroundColor: "#101010",
      backgroundOpacity: 50,
      paddingX: 20,
      paddingY: 12,
      cornerRadius: 16,
    },
  };
  const preview = resolvePreviewCaptionContainerStyle(scene);
  const exportStyle = resolveExportCaptionStyle(scene);
  const exportMetrics = resolveExportCaptionStyleMetrics(exportStyle, 1);
  assert.equal(exportMetrics.padX, 20);
  assert.equal(exportMetrics.padY, 12);
  assert.equal(exportMetrics.cornerRadius, 16);
  assert.equal(exportMetrics.backgroundColor, "#101010");
  assert.match(String(preview.backgroundColor), /rgba\(16, 16, 16/);
  assert.equal(
    resolveExportCaptionBackgroundFill(exportMetrics),
    "rgba(16, 16, 16, 0.5)",
  );
});

test("caption style edits do not dirty narration or voice", () => {
  const prev = {
    title: "Style story",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Caption",
        captionStyle: { backgroundOpacity: 45 },
      },
    ],
  };
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionStyle: { ...prev.scenes[0]!.captionStyle, backgroundOpacity: 80 },
  });
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_style"));
  const kind = resolvePresentationSyncEditKind(classification);
  assert.equal(kind, "caption_style");
  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("caption style inspector wiring uses presentation intent", () => {
  const inspector = readSrc("src/features/editor/components/caption-workspace/CaptionWorkspace.tsx");
  assert.match(inspector, /CaptionStyleControl/);
  assert.match(inspector, /CAPTION_WORKSPACE_TAB_LABELS\[tabId\]/);
  assert.match(inspector, /onCommitPresentationPatch/);
});

test("font family resolves correctly", () => {
  const resolved = resolveCaptionStyle({
    sceneStyle: { fontFamily: "Poppins, system-ui, sans-serif" },
  }).resolvedStyle;
  assert.equal(resolved.fontFamily, "Poppins, system-ui, sans-serif");
});

test("font weight resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { fontWeight: "600" } }).resolvedStyle;
  assert.equal(resolved.fontWeight, "600");
});

test("font size resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { fontSize: 72 } }).resolvedStyle;
  assert.equal(resolved.fontSize, 72);
});

test("text color resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { textColor: "#aabbcc" } }).resolvedStyle;
  assert.equal(resolved.textColor, "#aabbcc");
});

test("line height resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { lineHeight: 1.6 } }).resolvedStyle;
  assert.equal(resolved.lineHeight, 1.6);
});

test("letter spacing resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { letterSpacing: 0.08 } }).resolvedStyle;
  assert.equal(resolved.letterSpacing, 0.08);
});

test("text transform resolves correctly", () => {
  const resolved = resolveCaptionStyle({ sceneStyle: { textTransform: "uppercase" } }).resolvedStyle;
  assert.equal(resolved.textTransform, "uppercase");
  assert.equal(applyCaptionTextTransform("hello world", "uppercase"), "HELLO WORLD");
});

test("typography scene override beats project default", () => {
  const resolved = resolveCaptionStyle({
    projectStyle: { fontSize: 56, textColor: "#cccccc" },
    sceneStyle: { fontSize: 80, textColor: "#ff0000" },
  }).resolvedStyle;
  assert.equal(resolved.fontSize, 80);
  assert.equal(resolved.textColor, "#ff0000");
});

test("typography project default beats engine default", () => {
  const resolved = resolveCaptionStyle({
    projectStyle: { fontWeight: "500", letterSpacing: 0.04 },
  }).resolvedStyle;
  assert.equal(resolved.fontWeight, "500");
  assert.equal(resolved.letterSpacing, 0.04);
});

test("preview and export typography parity preserved", () => {
  const scene = {
    captionStyle: {
      fontFamily: "Montserrat, system-ui, sans-serif",
      fontWeight: "600",
      fontSize: 72,
      textColor: "#eeeeee",
      letterSpacing: 0.05,
      lineHeight: 1.5,
      textTransform: "uppercase" as const,
    },
  };
  const previewTypography = resolvePreviewCaptionTypographyStyleForScene(scene)!;
  const exportStyle = resolveExportCaptionStyle(scene);
  const exportMetrics = resolveExportCaptionStyleMetrics(exportStyle, 1);

  assert.equal(previewTypography.fontFamily, "Montserrat, system-ui, sans-serif");
  assert.equal(previewTypography.fontWeight, "600");
  assert.equal(
    previewTypography.fontSize,
    `${72 * PREVIEW_CAPTION_STYLE_UI_SCALE}px`,
  );
  assert.equal(previewTypography.color, "#eeeeee");
  assert.equal(exportStyle.fontWeight, "600");
  assert.equal(exportStyle.letterSpacingEm, 0.05);
  assert.equal(exportStyle.lineHeightRatio, 1.5);
  assert.equal(exportMetrics.fontSize, 72);
  assert.equal(exportMetrics.textColor, "#eeeeee");
  assert.equal(exportMetrics.fontFamily, "Montserrat, system-ui, sans-serif");
  assert.equal(formatExportCaptionLineText("hello", exportStyle), "HELLO");
});

test("typography edits do not dirty narration or voice", () => {
  const prev = {
    title: "Typography story",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Caption",
        captionStyle: { fontSize: 64 },
      },
    ],
  };
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionStyle: { ...prev.scenes[0]!.captionStyle, fontSize: 72, fontWeight: "800" },
  });
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_style"));
  const kind = resolvePresentationSyncEditKind(classification);
  assert.equal(kind, "caption_style");
  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("preview typography adapter wired in preview overlays", () => {
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  const captionOverlay = readSrc("src/features/preview/components/CaptionOverlay.tsx");
  assert.match(subtitleOverlay, /resolvePreviewCaptionTypographyStyleForScene/);
  assert.match(captionOverlay, /resolvePreviewCaptionTypographyStyleForScene/);
});

test("export typography uses caption style adapters without duplication", () => {
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const adapters = readSrc("src/features/caption-style/caption-style.adapters.ts");
  assert.match(exportCanvas, /formatExportCaptionLineText/);
  assert.match(adapters, /withStoredCaptionTypography/);
  assert.doesNotMatch(exportCanvas, /fontWeight:\s*["']700["']/);
});

test("caption style control exposes typography inspector fields", () => {
  const control = readSrc("src/features/caption-engine/CaptionStyleControl.tsx");
  assert.match(control, /title="Typography"/);
  assert.match(control, /Font family/);
  assert.match(control, /Font weight/);
  assert.match(control, /Font size/);
  assert.match(control, /Letter spacing/);
  assert.match(control, /Line height/);
  assert.match(control, /Text transform/);
  assert.match(control, /Text color/);
});

test("outline only resolves and exposes preview stroke", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: { outlineEnabled: true, outlineColor: "#ff0000", outlineWidth: 4 },
  });
  const outline = resolveCaptionOutline(resolvedStyle);
  assert.equal(outline.enabled, true);
  assert.equal(outline.color, "#ff0000");
  assert.equal(outline.width, 4);
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.match(String(preview.WebkitTextStroke), /#ff0000/);
});

test("shadow only resolves and exposes preview text shadow", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: {
      shadowEnabled: true,
      shadowColor: "#000000",
      shadowBlur: 10,
      shadowOffsetX: 2,
      shadowOffsetY: 4,
    },
  });
  const shadow = resolveCaptionShadow(resolvedStyle);
  assert.equal(shadow.enabled, true);
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  const scale = PREVIEW_CAPTION_STYLE_UI_SCALE;
  assert.match(String(preview.textShadow), new RegExp(`${2 * scale}px ${4 * scale}px ${10 * scale}px`));
});

test("glow only resolves and exposes preview filter", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: { glowEnabled: true, glowColor: "#00ff88", glowBlur: 16 },
  });
  const glow = resolveCaptionGlow(resolvedStyle);
  assert.equal(glow.enabled, true);
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.match(String(preview.filter), /drop-shadow/);
  assert.match(String(preview.filter), /#00ff88/);
});

test("outline and shadow resolve together", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: {
      outlineEnabled: true,
      outlineWidth: 3,
      shadowEnabled: true,
      shadowBlur: 8,
    },
  });
  assert.equal(resolveCaptionOutline(resolvedStyle).enabled, true);
  assert.equal(resolveCaptionShadow(resolvedStyle).enabled, true);
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.ok(preview.WebkitTextStroke);
  assert.ok(preview.textShadow);
});

test("shadow and glow resolve together", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: { shadowEnabled: true, shadowBlur: 6, glowEnabled: true, glowBlur: 12 },
  });
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.ok(preview.textShadow);
  assert.ok(preview.filter);
});

test("outline shadow and glow resolve together", () => {
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: {
      outlineEnabled: true,
      outlineWidth: 2,
      shadowEnabled: true,
      shadowBlur: 6,
      glowEnabled: true,
      glowBlur: 10,
    },
  });
  const preview = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.ok(preview.WebkitTextStroke);
  assert.ok(preview.textShadow);
  assert.ok(preview.filter);
});

test("effect scene override beats project default", () => {
  const { diagnostics } = resolveCaptionStyle({
    projectStyle: { shadowEnabled: true, shadowBlur: 4 },
    sceneStyle: { shadowEnabled: true, shadowBlur: 20 },
  });
  assert.equal(diagnostics.shadowSource, "scene");
  assert.equal(diagnostics.resolvedShadow.blur, 20);
});

test("effect project default beats engine defaults", () => {
  const { diagnostics } = resolveCaptionStyle({
    projectStyle: { glowEnabled: true, glowBlur: 18 },
  });
  assert.equal(diagnostics.glowSource, "project");
  assert.equal(diagnostics.resolvedGlow.blur, 18);
});

test("preview and export effect parity preserved", () => {
  const scene = {
    captionStyle: {
      outlineEnabled: true,
      outlineColor: "#111111",
      outlineWidth: 3,
      shadowEnabled: true,
      shadowColor: "#000000",
      shadowBlur: 8,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      glowEnabled: true,
      glowColor: "#ffffff",
      glowBlur: 10,
    },
  };
  const preview = resolvePreviewCaptionTypographyStyleForScene(scene)!;
  const exportStyle = resolveExportCaptionStyle(scene);
  const canvas = {
    lineWidth: 0,
    strokeStyle: "",
    lineJoin: "",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;

  assert.match(String(preview.WebkitTextStroke), /#111111/);
  assert.match(String(preview.textShadow), new RegExp(`${8 * PREVIEW_CAPTION_STYLE_UI_SCALE}px`));
  assert.match(String(preview.filter), /drop-shadow/);

  assert.equal(applyExportCaptionOutline(canvas, exportStyle.resolvedStyle, 1), true);
  assert.equal(canvas.lineWidth, 3);
  assert.equal(applyExportCaptionShadow(canvas, exportStyle.resolvedStyle, 1), true);
  assert.equal(canvas.shadowBlur, 8);
  assert.equal(applyExportCaptionGlow(canvas, exportStyle.resolvedStyle, 1), true);
  assert.equal(canvas.shadowBlur, 10);
});

test("effect presentation edits do not dirty narration", () => {
  const prev = {
    title: "Effects story",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [
      {
        id: "s1",
        start: 0,
        end: 3,
        duration: 3,
        subtitle: "Caption",
        captionStyle: { shadowEnabled: false },
      },
    ],
  };
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionStyle: { ...prev.scenes[0]!.captionStyle, shadowEnabled: true, shadowBlur: 12 },
  });
  const classification = classifyStoryPatch(prev, next);
  const kind = resolvePresentationSyncEditKind(classification);
  let state = createInitialStorySynchronizationState();
  state = applyStorySyncEdit(state, kind!);
  assert.equal(state.narrationDirty, false);
  assert.equal(state.voiceDirty, false);
  assert.equal(state.exportDirty, true);
});

test("effect presentation edits mark export dirty only", () => {
  const prev = {
    title: "Glow story",
    narration: "Narration.",
    totalDuration: 3,
    scenes: [{ id: "s1", start: 0, end: 3, duration: 3, subtitle: "Caption" }],
  };
  const next = applyPresentationSceneUpdate(prev, "s1", {
    captionStyle: { glowEnabled: true, glowBlur: 14 },
  });
  const classification = classifyStoryPatch(prev, next);
  assert.ok(classification.classes.includes("caption_style"));
  assert.equal(classification.classes.includes("narration" as import("@/features/editor/story-patches").StoryPatchClass), false);
  assert.equal(classification.classes.includes("voice" as import("@/features/editor/story-patches").StoryPatchClass), false);
});

test("legacy stories remain visually unchanged without stored caption style", () => {
  assert.equal(resolvePreviewCaptionTypographyStyleForScene({}, undefined), null);
  const { diagnostics, resolvedStyle } = resolveCaptionStyle();
  assert.equal(diagnostics.usesLegacyFallback, true);
  assert.equal(diagnostics.resolvedOutline.enabled, false);
  assert.equal(diagnostics.resolvedShadow.enabled, false);
  assert.equal(diagnostics.resolvedGlow.enabled, false);
  assert.equal(resolvedStyle.outlineEnabled, false);
  const previewEffects = resolvePreviewCaptionTextEffectStyle(resolvedStyle);
  assert.equal(previewEffects.WebkitTextStroke, undefined);
  assert.equal(previewEffects.textShadow, undefined);
  assert.equal(previewEffects.filter, undefined);
});

test("caption style engine purity for effects module", () => {
  const effects = readSrc("src/features/caption-style/caption-style.effects.ts");
  const engine = readSrc("src/features/caption-style/caption-style.engine.ts");
  assert.doesNotMatch(effects, /from "react"|from 'react'/);
  assert.doesNotMatch(effects, /story-sync|timeline|voiceover|voice-/i);
  assert.doesNotMatch(engine, /from "react"|from 'react'/);
  assert.match(engine, /resolvedOutline/);
  assert.match(engine, /outlineSource/);
});

test("export canvas uses centralized styled line drawing", () => {
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  const adapters = readSrc("src/features/caption-style/caption-style.adapters.ts");
  assert.match(exportCanvas, /drawExportCaptionStyledLine/);
  assert.match(adapters, /applyExportCaptionOutline/);
  assert.match(adapters, /applyExportCaptionShadow/);
  assert.match(adapters, /applyExportCaptionGlow/);
});

test("caption style control exposes effect inspector fields", () => {
  const control = readSrc("src/features/caption-engine/CaptionStyleControl.tsx");
  assert.match(control, /title="Outline"/);
  assert.match(control, /title="Shadow"/);
  assert.match(control, /title="Glow"/);
  assert.match(control, /Enable outline/);
  assert.match(control, /Enable shadow/);
  assert.match(control, /Enable glow/);
});

console.log(`\ncaption-style: ${passed} passed`);
