/**
 * Caption Layout Engine — 4.1A-1 / 4.1A-2
 * Run: npm run test:caption-layout
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildResetCaptionLayout,
  CAPTION_ANCHORS,
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  CAPTION_OFFSET_X_MAX_PX,
  CAPTION_OFFSET_X_MIN_PX,
  CAPTION_OFFSET_Y_MAX_PX,
  CAPTION_OFFSET_Y_MIN_PX,
  clampCaptionOffsetXPx,
  clampCaptionOffsetYPx,
  DEFAULT_CAPTION_LAYOUT,
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  LEGACY_EXPORT_BOTTOM_MARGIN_PX,
  mergeCaptionLayoutSettings,
  normalizeCaptionTextAlign,
  resolveCaptionLayout,
  resolveCaptionLayoutDiagnostics,
} from "@/features/caption-layout";
import {
  resolveExportCaptionPlacement,
  resolvePreviewCaptionLayout,
} from "@/features/caption-engine/caption-layout.utils";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const BOX_W = 420;
const BOX_H = 110;

test("all 9 anchors resolve deterministically", () => {
  for (const anchor of CAPTION_ANCHORS) {
    const resolved = resolveCaptionLayout({
      sceneLayout: { anchor, version: 2 },
      canvas: { width: 1080, height: 1920, scale: 1 },
      contentBoxWidth: BOX_W,
      contentBoxHeight: BOX_H,
    });
    assert.equal(resolved.anchor, anchor);
    assert.ok(Number.isFinite(resolved.x));
    assert.ok(Number.isFinite(resolved.y));
    assert.ok(resolved.maxWidth > 0);
    assert.equal(resolved.usesLegacyBottomCenter, false);
  }
});

test("text alignment is independent of anchor positioning", () => {
  const resolved = resolveCaptionLayout({
    sceneLayout: { anchor: "top_center", textAlign: "left", version: 2 },
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(resolved.anchor, "top_center");
  assert.equal(resolved.textAlign, "left");
});

test("text alignment defaults to center for existing stories", () => {
  const settings = mergeCaptionLayoutSettings(undefined, undefined);
  assert.equal(settings.textAlign, "center");
});

test("offset x clamps to -300–300 px", () => {
  assert.equal(clampCaptionOffsetXPx(-999), CAPTION_OFFSET_X_MIN_PX);
  assert.equal(clampCaptionOffsetXPx(999), CAPTION_OFFSET_X_MAX_PX);
});

test("offset y clamps to -500–500 px", () => {
  assert.equal(clampCaptionOffsetYPx(-999), CAPTION_OFFSET_Y_MIN_PX);
  assert.equal(clampCaptionOffsetYPx(999), CAPTION_OFFSET_Y_MAX_PX);
});

test("pixel offsets shift anchor position deterministically", () => {
  const base = resolveCaptionLayout({
    sceneLayout: { anchor: "center", version: 2, offsetX: 0, offsetY: 0 },
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  const shifted = resolveCaptionLayout({
    sceneLayout: { anchor: "center", version: 2, offsetX: 120, offsetY: -80 },
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(shifted.x, base.x + 120);
  assert.equal(shifted.y, base.y - 80);
});

test("v1 percent offsets migrate to reference-frame pixels", () => {
  const settings = mergeCaptionLayoutSettings({ version: 1, offsetX: 10, offsetY: -5 }, undefined);
  assert.equal(settings.offsetX, Math.round(0.1 * CAPTION_LAYOUT_REFERENCE_WIDTH));
  assert.equal(settings.offsetY, Math.round(-0.05 * CAPTION_LAYOUT_REFERENCE_HEIGHT));
});

test("reset layout restores factory defaults", () => {
  const reset = buildResetCaptionLayout();
  assert.equal(reset.anchor, "bottom_center");
  assert.equal(reset.textAlign, "center");
  assert.equal(reset.offsetX, 0);
  assert.equal(reset.offsetY, 0);
  assert.equal(reset.maxWidthPercent, DEFAULT_CAPTION_LAYOUT.maxWidthPercent);
  assert.equal(reset.safeAreaEnabled, true);
  assert.equal(reset.backgroundOpacity, undefined);
});

test("bottom center matches current legacy implementation", () => {
  const resolved = resolveCaptionLayout({
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(resolved.usesLegacyBottomCenter, true);
  assert.equal(resolved.centerX, 540);
  assert.equal(resolved.boxBottomY, 1920 - LEGACY_EXPORT_BOTTOM_MARGIN_PX);
  assert.equal(resolved.anchor, "bottom_center");
});

test("safe area clamps caption box inside margins", () => {
  const resolved = resolveCaptionLayout({
    sceneLayout: {
      anchor: "top_left",
      offsetX: CAPTION_OFFSET_X_MIN_PX,
      offsetY: CAPTION_OFFSET_Y_MIN_PX,
      safeAreaEnabled: true,
      version: 2,
    },
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(resolved.safeAreaApplied, true);
  assert.ok(resolved.x >= resolved.safeAreaInsets.left);
  assert.ok(resolved.y >= resolved.safeAreaInsets.top);
});

test("preview and export receive identical coordinates", () => {
  const scene = {
    captionLayout: {
      anchor: "center" as const,
      textAlign: "right" as const,
      version: 2,
      offsetX: 0,
      offsetY: 0,
    },
  };
  const script = { defaultCaptionLayout: DEFAULT_CAPTION_LAYOUT };

  const preview = resolvePreviewCaptionLayout(scene, script, BOX_W, BOX_H);
  const exportPlacement = resolveExportCaptionPlacement(
    scene,
    script,
    CAPTION_LAYOUT_REFERENCE_WIDTH,
    CAPTION_LAYOUT_REFERENCE_HEIGHT,
    1,
    BOX_W,
    BOX_H,
  );

  assert.equal(preview.centerX, exportPlacement.centerX);
  assert.equal(preview.boxBottomY, exportPlacement.boxBottomY);
  assert.equal(preview.textAlign, exportPlacement.textAlign);
  assert.equal(preview.textAlign, "right");
  assert.equal(preview.x, 540 - BOX_W / 2);
});

test("existing stories default to bottom_center with zero offsets", () => {
  const settings = mergeCaptionLayoutSettings(undefined, undefined);
  assert.equal(settings.anchor, "bottom_center");
  assert.equal(settings.offsetX, 0);
  assert.equal(settings.offsetY, 0);
  assert.equal(normalizeCaptionTextAlign(undefined), "center");

  const resolved = resolveCaptionLayout({
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(resolved.usesLegacyBottomCenter, true);
});

test("layout engine source is pure with no React dependency", () => {
  const engine = readSrc("src/features/caption-layout/caption-layout.engine.ts");
  assert.doesNotMatch(engine, /from "react"/);
  assert.doesNotMatch(engine, /from "@\/features\/story-sync"/);
  assert.doesNotMatch(engine, /from "@\/features\/subtitle-timing"/);
});

test("diagnostics expose resolvedLayout anchor and safeAreaApplied", () => {
  const diagnostics = resolveCaptionLayoutDiagnostics({
    sceneLayout: { anchor: "top_right", version: 2 },
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(diagnostics.anchor, "top_right");
  assert.ok(diagnostics.resolvedLayout);
  assert.equal(typeof diagnostics.safeAreaApplied, "boolean");
});

test("caption layout inspector exposes grouped controls", () => {
  const control = readSrc("src/features/caption-engine/CaptionLayoutControl.tsx");
  const workflow = readSrc("src/features/caption-layout-workflow/CaptionLayoutWorkflow.tsx");
  assert.match(control, /Placement/);
  assert.match(control, /Sizing/);
  assert.match(control, /Safe Area Enabled/);
  assert.doesNotMatch(control, /Background Opacity/);
  assert.doesNotMatch(control, /Appearance/);
  assert.match(control, /Text Alignment/);
  assert.match(control, /CAPTION_OFFSET_X_MIN_PX/);
  assert.match(workflow, /Reset/);
  assert.match(workflow, /buildResetCaptionLayoutPatch/);
});

test("preview overlays call caption layout engine adapters", () => {
  const subtitleOverlay = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  const captionOverlay = readSrc("src/features/preview/components/CaptionOverlay.tsx");
  const placementSurface = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(subtitleOverlay, /CaptionPreviewOverlay/);
  assert.match(captionOverlay, /CaptionPreviewOverlay/);
  assert.match(placementSurface, /resolvePreviewCaptionLayoutForScene/);
  assert.match(placementSurface, /resolvePreviewCaptionOverlayStyle/);
});

test("export renderer calls caption layout engine adapters", () => {
  const canvasUtils = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(canvasUtils, /resolveExportCaptionPlacement\(scene, script/);
  assert.match(canvasUtils, /resolveExportCaptionTextX/);
  assert.match(canvasUtils, /placement\.textAlign/);
});

test("legacy v0 position migrates to anchor model", () => {
  const settings = mergeCaptionLayoutSettings({ position: "top_left" }, undefined);
  assert.equal(settings.anchor, "top_left");
});

test("export default background alpha remains 45% for legacy layout", () => {
  const resolved = resolveCaptionLayout({
    canvas: { width: 1080, height: 1920, scale: 1 },
    contentBoxWidth: BOX_W,
    contentBoxHeight: BOX_H,
  });
  assert.equal(resolved.backgroundOpacityPercent, null);
  const placement = resolveExportCaptionPlacement(
    {},
    undefined,
    1080,
    1920,
    1,
    BOX_W,
    BOX_H,
  );
  assert.equal(placement.backgroundAlpha, DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100);
});

console.log(`\ncaption-layout: ${passed} passed`);
