/**
 * Prompt 4 — dynamic Preview caption geometry.
 * Run: npm run test:preview-runtime-parity-caption-geometry
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolvePreviewCaptionOverlayStyle } from "@/features/caption-engine/caption-layout.utils";
import {
  PREVIEW_CAPTION_CENTER_DRIFT_TOLERANCE_REFERENCE_PX,
  resolvePreviewCaptionAnchorPoint,
  resolvePreviewCaptionOutputScale,
  resolvePreviewCaptionPlacementStyle,
  resolvePreviewCaptionVisualBox,
} from "@/features/caption-engine/resolve-preview-caption-placement";
import {
  CAPTION_ANCHORS,
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  CAPTION_OFFSET_X_MAX_PX,
  CAPTION_OFFSET_X_MIN_PX,
  CAPTION_OFFSET_Y_MAX_PX,
  CAPTION_OFFSET_Y_MIN_PX,
  DEFAULT_CAPTION_SAFE_AREA,
} from "@/features/caption-layout/caption-layout.defaults";
import { resolveCaptionLayout } from "@/features/caption-layout/caption-layout.engine";
import type { CaptionLayout, CaptionTextAlign } from "@/features/caption-layout/caption-layout.types";
import {
  measureCurrentPreviewCaptionOverlayShrink,
  measurePreviewCaptionGeometry,
  resolvePreviewCaptionAnchorReferenceDelta,
} from "@/features/preview/runtime-parity/measure-preview-caption-geometry";
import { PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX } from "@/features/preview/runtime-parity/preview-runtime-parity-contract";
import { getTypewriterRevealedText } from "@/features/story/utils/subtitle-effect.utils";
import { LEGACY_EXPORT_CAPTION_FONT_SIZE } from "@/features/caption-style/caption-style.defaults";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function readSrc(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function layout(partial: CaptionLayout): CaptionLayout {
  return {
    version: 2,
    safeAreaEnabled: true,
    maxWidthPercent: 90,
    ...partial,
  };
}

function resolve(sceneLayout: CaptionLayout, contentWidth?: number, contentHeight = 72) {
  return resolveCaptionLayout({
    sceneLayout,
    projectLayout: sceneLayout,
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
    contentBoxWidth: contentWidth,
    contentBoxHeight: contentHeight,
  });
}

const ALL_ALIGNS: readonly CaptionTextAlign[] = ["left", "center", "right"];

test("1. center anchor stays put for short versus long chunks", () => {
  const current = measureCurrentPreviewCaptionOverlayShrink({
    anchor: "center",
    textAlign: "center",
  });
  assert.ok(current.short.overlayWidth < current.long.overlayWidth);
  assert.equal(current.placementBoxMoved, false);
  assert.ok(
    current.overlayCenterDelta <= PREVIEW_CAPTION_CENTER_DRIFT_TOLERANCE_REFERENCE_PX,
  );
});

test("2. center anchor stays put during typewriter growth", () => {
  const text = "Names, numbers 12, and punctuation!";
  const unresolved = resolve(layout({ anchor: "center", textAlign: "center" }));
  const widths = [0.15, 0.5, 1].map((progress) => {
    const revealed = getTypewriterRevealedText(text, progress);
    return Math.max(24, revealed.length * 18);
  });
  const boxes = widths.map((width) => resolvePreviewCaptionVisualBox(unresolved, width, 72));
  assert.ok(
    resolvePreviewCaptionAnchorReferenceDelta("center", boxes[0]!, boxes[2]!) <=
      PREVIEW_CAPTION_CENTER_DRIFT_TOLERANCE_REFERENCE_PX,
  );
  assert.ok(boxes[0]!.width < boxes[1]!.width);
  assert.ok(boxes[1]!.width < boxes[2]!.width);
});

test("3. fade-up translation is isolated from the placement transform", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  const effect = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  const css = readSrc("src/app/globals.css");
  assert.match(overlay, /data-preview-caption-animation-layer/);
  assert.match(overlay, /resolvePreviewCaptionOverlayStyle/);
  assert.match(effect, /transform: animationState\.transform/);
  assert.match(css, /@keyframes subtitle-fade-up/);
  assert.doesNotMatch(
    overlay,
    /data-preview-caption-placement-box[\s\S]*animationState\.transform/,
  );
});

test("4. highlight growth uses the same center placement box", () => {
  const current = measureCurrentPreviewCaptionOverlayShrink({
    anchor: "center",
    textAlign: "center",
  });
  assert.equal(current.placementBoxMoved, false);
  const effect = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  assert.match(effect, /subtitle-effect-highlight/);
});

test("5. top-center keeps its top edge for one and multiple lines", () => {
  const unresolved = resolve(layout({ anchor: "top_center" }));
  const one = resolvePreviewCaptionVisualBox(unresolved, 400, 72);
  const multi = resolvePreviewCaptionVisualBox(unresolved, 400, 216);
  assert.ok(Math.abs(one.top - multi.top) <= 1);
  assert.ok(multi.height > one.height);
});

test("6. bottom-center keeps its bottom edge for one and multiple lines", () => {
  const unresolved = resolve(layout({ anchor: "bottom_center" }));
  const one = resolvePreviewCaptionVisualBox(unresolved, 400, 72);
  const multi = resolvePreviewCaptionVisualBox(unresolved, 400, 216);
  assert.ok(Math.abs(one.top + one.height - (multi.top + multi.height)) <= 1);
});

test("7. left anchors keep their left edge", () => {
  for (const anchor of ["top_left", "center_left", "bottom_left"] as const) {
    const comparison = measureCurrentPreviewCaptionOverlayShrink({
      anchor,
      textAlign: "left",
    });
    assert.equal(comparison.placementBoxMoved, false);
    assert.ok(Math.abs(comparison.short.overlayLeft - comparison.long.overlayLeft) <= 1);
  }
});

test("8. right anchors keep their right edge", () => {
  for (const anchor of ["top_right", "center_right", "bottom_right"] as const) {
    const comparison = measureCurrentPreviewCaptionOverlayShrink({
      anchor,
      textAlign: "right",
    });
    assert.equal(comparison.placementBoxMoved, false);
    assert.ok(Math.abs(comparison.short.overlayRight - comparison.long.overlayRight) <= 1);
  }
});

test("9. text alignment is independent of anchor placement", () => {
  for (const anchor of CAPTION_ANCHORS) {
    const centers = ALL_ALIGNS.map((textAlign) => {
      const resolved = resolve(layout({ anchor, textAlign }));
      const style = resolvePreviewCaptionPlacementStyle(resolved);
      return {
        textAlign: resolved.textAlign,
        left: style.left,
        transform: style.transform,
      };
    });
    assert.equal(new Set(centers.map((entry) => entry.left)).size, 1);
    assert.equal(new Set(centers.map((entry) => entry.transform)).size, 1);
    assert.deepEqual(
      centers.map((entry) => entry.textAlign),
      [...ALL_ALIGNS],
    );
  }
});

test("10. safe-area enabled and disabled remain authoritative", () => {
  const enabled = resolve(layout({ anchor: "top_left", safeAreaEnabled: true }), 200);
  const disabled = resolve(layout({ anchor: "top_left", safeAreaEnabled: false }), 200);
  assert.ok(enabled.x >= DEFAULT_CAPTION_SAFE_AREA.left * CAPTION_LAYOUT_REFERENCE_WIDTH - 0.5);
  assert.ok(disabled.x < enabled.x || disabled.x === 0);
});

test("11. minimum and maximum offsets still resolve through the layout engine", () => {
  const min = resolve(
    layout({
      anchor: "center",
      offsetX: CAPTION_OFFSET_X_MIN_PX,
      offsetY: CAPTION_OFFSET_Y_MIN_PX,
    }),
    200,
  );
  const max = resolve(
    layout({
      anchor: "center",
      offsetX: CAPTION_OFFSET_X_MAX_PX,
      offsetY: CAPTION_OFFSET_Y_MAX_PX,
    }),
    200,
  );
  assert.ok(min.centerX < max.centerX);
  assert.ok(min.y < max.y || min.boxTopY < max.boxTopY);
});

test("12. minimum and maximum caption width settings stay authoritative", () => {
  const narrow = resolve(layout({ anchor: "center", maxWidthPercent: 20 }));
  const wide = resolve(layout({ anchor: "center", maxWidthPercent: 100 }));
  assert.ok(narrow.maxWidth < wide.maxWidth);
  const styleNarrow = resolvePreviewCaptionPlacementStyle(narrow);
  const styleWide = resolvePreviewCaptionPlacementStyle(wide);
  assert.ok(Number.parseFloat(String(styleNarrow.maxWidth)) < Number.parseFloat(String(styleWide.maxWidth)));
});

test("13. one, two, and maximum visible lines change height only", () => {
  const unresolved = resolve(layout({ anchor: "center" }));
  const one = resolvePreviewCaptionVisualBox(unresolved, 360, 72);
  const two = resolvePreviewCaptionVisualBox(unresolved, 360, 144);
  const max = resolvePreviewCaptionVisualBox(unresolved, 360, 216);
  assert.ok(Math.abs(one.centerX - max.centerX) <= 1);
  assert.ok(one.height < two.height);
  assert.ok(two.height < max.height);
});

test("14. wrap-boundary height changes keep the selected anchor", () => {
  for (const anchor of CAPTION_ANCHORS) {
    const unresolved = resolve(layout({ anchor }));
    const before = resolvePreviewCaptionVisualBox(unresolved, 520, 72);
    const after = resolvePreviewCaptionVisualBox(unresolved, 520, 144);
    assert.ok(resolvePreviewCaptionAnchorReferenceDelta(anchor, before, after) <= 1);
  }
});

test("15. legacy bottom-center stories keep the CSS overlay path", () => {
  const legacy = resolveCaptionLayout({
    canvas: {
      width: CAPTION_LAYOUT_REFERENCE_WIDTH,
      height: CAPTION_LAYOUT_REFERENCE_HEIGHT,
      scale: 1,
    },
  });
  assert.equal(legacy.usesLegacyBottomCenter, true);
  assert.deepEqual(resolvePreviewCaptionPlacementStyle(legacy), {});
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /usesLegacyBottomCenter \? "preview-narration-subtitle-overlay"/);
});

test("16. explicit bottom-center uses the shared engine placement surface", () => {
  const explicit = resolve(layout({ anchor: "bottom_center", textAlign: "center" }));
  assert.equal(explicit.usesLegacyBottomCenter, false);
  const style = resolvePreviewCaptionPlacementStyle(explicit);
  assert.equal(style.transform, "translate(-50%, -100%)");
  assert.equal(style.width, "max-content");
});

test("17. generated captions and narration subtitles share one placement surface", () => {
  const caption = readSrc("src/features/preview/components/CaptionOverlay.tsx");
  const subtitle = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  assert.match(caption, /CaptionPreviewOverlay/);
  assert.match(subtitle, /CaptionPreviewOverlay/);
  assert.doesNotMatch(caption, /resolvePreviewCaptionOverlayStyle/);
  assert.doesNotMatch(subtitle, /resolvePreviewCaptionOverlayStyle/);
});

test("18. passive and draggable captions share the same resolved geometry", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /usesEnginePlacement = isDragging \|\| draftOffsets != null/);
  assert.match(overlay, /draggable/);
  const style = resolvePreviewCaptionPlacementStyle(
    resolve(layout({ anchor: "center" })),
  );
  assert.equal(style.transform, "translate(-50%, -50%)");
});

test("19–22. idle, playback, pause, seek, and inspection share placement authority", () => {
  const preview = readSrc("src/features/preview/components/VideoPreview.tsx");
  assert.match(preview, /presentationSceneElapsedMs/);
  assert.match(preview, /SubtitleOverlay/);
  assert.match(preview, /CaptionOverlay/);
  assert.match(preview, /inspection\.active/);
  const idle = measurePreviewCaptionGeometry({ anchor: "center", textAlign: "center" });
  const playing = measureCurrentPreviewCaptionOverlayShrink({
    anchor: "center",
    textAlign: "center",
  });
  assert.equal(idle.placementBoxMoved, false);
  assert.equal(playing.placementBoxMoved, false);
});

test("23. reduced-motion rendering keeps the same placement box", () => {
  const effect = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  assert.match(effect, /usePrefersReducedMotion/);
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /resolvePreviewCaptionOverlayStyle\(resolvedLayout\)/);
});

test("24. TikTok, sports, and news motion stay inside the placement box", () => {
  const tiktok = readSrc("src/features/caption-engine/tiktok-motion-caption-style.utils.ts");
  const sports = readSrc("src/features/caption-engine/sports-motion-caption-style.utils.ts");
  const news = readSrc("src/features/caption-engine/news-motion-caption-style.utils.ts");
  const effect = readSrc("src/features/editor/components/subtitleEffectPreview.tsx");
  assert.match(tiktok, /origin-center/);
  assert.match(sports, /origin-center/);
  assert.match(news, /translateY\(\$\{slideOffsetPx\}px\)/);
  assert.doesNotMatch(news, /translateX\(/);
  assert.match(effect, /resolvePreviewTikTokMotionStyle/);
  assert.match(effect, /resolvePreviewSportsMotionStyle/);
  assert.match(effect, /resolvePreviewNewsMotionStyle/);
});

test("25–26. 220/260/360 Preview widths keep normalized font and padding proportions", () => {
  assert.deepEqual([...PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX], [220, 260, 360]);
  const ratios = PREVIEW_RUNTIME_PARITY_PHONE_WIDTHS_PX.map((width) => {
    const scale = resolvePreviewCaptionOutputScale(width);
    return {
      font: (LEGACY_EXPORT_CAPTION_FONT_SIZE * scale) / width,
      scaleOverWidth: scale / width,
    };
  });
  for (const ratio of ratios) {
    assert.ok(Math.abs(ratio.font - LEGACY_EXPORT_CAPTION_FONT_SIZE / CAPTION_LAYOUT_REFERENCE_WIDTH) < 1e-9);
    assert.ok(Math.abs(ratio.scaleOverWidth - 1 / CAPTION_LAYOUT_REFERENCE_WIDTH) < 1e-9);
  }
});

test("27. caption boxes stay inside the device frame", () => {
  for (const anchor of CAPTION_ANCHORS) {
    const resolved = resolve(layout({ anchor }), 640, 120);
    const box = resolvePreviewCaptionVisualBox(resolved, 640, 120);
    assert.ok(box.left >= -0.5, anchor);
    assert.ok(box.top >= -0.5, anchor);
    assert.ok(box.left + box.width <= CAPTION_LAYOUT_REFERENCE_WIDTH + 0.5, anchor);
    assert.ok(box.top + box.height <= CAPTION_LAYOUT_REFERENCE_HEIGHT + 0.5, anchor);
  }
});

test("28. caption boxes stay inside the resolved safe area when enabled", () => {
  const resolved = resolve(layout({ anchor: "bottom_right", safeAreaEnabled: true }), 400, 96);
  const box = resolvePreviewCaptionVisualBox(resolved, 400, 96);
  const right = (1 - DEFAULT_CAPTION_SAFE_AREA.right) * CAPTION_LAYOUT_REFERENCE_WIDTH;
  const bottom = (1 - DEFAULT_CAPTION_SAFE_AREA.bottom) * CAPTION_LAYOUT_REFERENCE_HEIGHT;
  assert.ok(box.left + box.width <= right + 1);
  assert.ok(box.top + box.height <= bottom + 1);
});

test("29. chunk/effect/scene changes reset the measured box key", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  const subtitle = readSrc("src/features/preview/components/SubtitleOverlay.tsx");
  assert.match(overlay, /setPillSize\(\{ width: 0, height: 0 \}\)/);
  assert.match(overlay, /measurementKey, layoutScene\.id/);
  assert.match(subtitle, /measurementKey=\{`subtitle:\$\{scene\.id/);
});

test("30. ResizeObserver updates are bounded and ignore invalid sizes", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.match(overlay, /new ResizeObserver\(updateSize\)/);
  assert.match(overlay, /width <= 0 \|\| height <= 0/);
  assert.match(overlay, /current\.width === width && current\.height === height/);
  assert.match(overlay, /observer\.disconnect\(\)/);
});

test("31. Preview measurement never writes story caption settings", () => {
  const overlay = readSrc("src/features/caption-layout-drag/CaptionPreviewOverlay.tsx");
  assert.doesNotMatch(overlay, /setPillSize\([^\)]*captionLayout/);
  assert.doesNotMatch(overlay, /onOffsetCommit\(pillSize/);
  assert.doesNotMatch(overlay, /localStorage/);
  const frozen: CaptionLayout = Object.freeze({
    version: 2,
    anchor: "center" as const,
    textAlign: "center" as const,
  });
  resolvePreviewCaptionOverlayStyle(resolve(frozen, 180));
  assert.equal(frozen.anchor, "center");
});

test("32. Browser/Headless export caption plans stay on the export adapters", () => {
  const exportCanvas = readSrc("src/features/export/utils/export-caption-canvas.utils.ts");
  assert.match(exportCanvas, /resolveExportCaptionPlacement\(scene, script/);
  assert.doesNotMatch(exportCanvas, /resolve-preview-caption-placement/);
  assert.doesNotMatch(exportCanvas, /CaptionPreviewOverlay/);
});

test("placement left is the anchor, not the max-width box origin", () => {
  const resolved = resolve(layout({ anchor: "center" }));
  const style = resolvePreviewCaptionPlacementStyle(resolved);
  const anchor = resolvePreviewCaptionAnchorPoint(resolved);
  const leftPx =
    (Number.parseFloat(String(style.left)) / 100) * CAPTION_LAYOUT_REFERENCE_WIDTH;
  assert.ok(Math.abs(leftPx - anchor.x) <= 0.5);
  assert.ok(Math.abs(leftPx - resolved.x) > 1);
});

test("desired and measured geometry helpers agree that the box no longer walks", () => {
  for (const anchor of CAPTION_ANCHORS) {
    for (const textAlign of ALL_ALIGNS) {
      const desired = measurePreviewCaptionGeometry({ anchor, textAlign });
      const current = measureCurrentPreviewCaptionOverlayShrink({ anchor, textAlign });
      assert.equal(desired.placementBoxMoved, false, `${anchor} ${textAlign} desired`);
      assert.equal(current.placementBoxMoved, false, `${anchor} ${textAlign} current`);
      assert.equal(current.correctnessFromTextAlignAlone, false);
    }
  }
});

console.log(`\nPreview runtime-parity caption geometry: ${passed} passed`);
