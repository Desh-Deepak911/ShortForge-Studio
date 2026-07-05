import {
  DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY,
  LEGACY_EXPORT_BOTTOM_MARGIN_PX,
} from "./caption-layout.defaults";
import type {
  CaptionAnchor,
  CaptionLayoutDiagnostics,
  CaptionLayoutResolveInput,
  CaptionResolvedLayout,
  CaptionTextAlign,
} from "./caption-layout.types";
import {
  isDefaultCaptionLayoutStorage,
  mergeCaptionLayoutSettings,
  resolveCaptionBackgroundOpacityPercent,
  resolveSafeAreaInsets,
} from "./caption-layout.utils";

function resolveAnchorPoint(
  anchor: CaptionAnchor,
  safeLeft: number,
  safeTop: number,
  safeRight: number,
  safeBottom: number,
): { x: number; y: number } {
  const safeCenterX = safeLeft + (safeRight - safeLeft) / 2;
  const safeCenterY = safeTop + (safeBottom - safeTop) / 2;

  switch (anchor) {
    case "bottom_center":
      return { x: safeCenterX, y: safeBottom };
    case "center":
      return { x: safeCenterX, y: safeCenterY };
    case "top_center":
      return { x: safeCenterX, y: safeTop };
    case "top_left":
      return { x: safeLeft, y: safeTop };
    case "top_right":
      return { x: safeRight, y: safeTop };
    case "center_left":
      return { x: safeLeft, y: safeCenterY };
    case "center_right":
      return { x: safeRight, y: safeCenterY };
    case "bottom_left":
      return { x: safeLeft, y: safeBottom };
    case "bottom_right":
      return { x: safeRight, y: safeBottom };
    default: {
      const _exhaustive: never = anchor;
      return _exhaustive;
    }
  }
}

function resolveBoxOrigin(
  anchor: CaptionAnchor,
  anchorX: number,
  anchorY: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  switch (anchor) {
    case "bottom_center":
      return { x: anchorX - boxWidth / 2, y: anchorY - boxHeight };
    case "center":
      return { x: anchorX - boxWidth / 2, y: anchorY - boxHeight / 2 };
    case "top_center":
      return { x: anchorX - boxWidth / 2, y: anchorY };
    case "top_left":
    case "center_left":
    case "bottom_left":
      return { x: anchorX, y: anchorY - (anchor.startsWith("bottom") ? boxHeight : anchor.startsWith("center") ? boxHeight / 2 : 0) };
    case "top_right":
    case "center_right":
    case "bottom_right":
      return { x: anchorX - boxWidth, y: anchorY - (anchor.startsWith("bottom") ? boxHeight : anchor.startsWith("center") ? boxHeight / 2 : 0) };
    default: {
      const _exhaustive: never = anchor;
      return _exhaustive;
    }
  }
}

function clampBoxToSafeArea(
  boxLeft: number,
  boxTop: number,
  boxWidth: number,
  boxHeight: number,
  safeLeft: number,
  safeTop: number,
  safeRight: number,
  safeBottom: number,
): { x: number; y: number; applied: boolean } {
  const maxLeft = Math.max(safeLeft, safeRight - boxWidth);
  const maxTop = Math.max(safeTop, safeBottom - boxHeight);
  const clampedX = Math.min(maxLeft, Math.max(safeLeft, boxLeft));
  const clampedY = Math.min(maxTop, Math.max(safeTop, boxTop));
  const applied = clampedX !== boxLeft || clampedY !== boxTop;

  return { x: clampedX, y: clampedY, applied };
}

function clampAnchorToSafeArea(
  x: number,
  y: number,
  safeLeft: number,
  safeTop: number,
  safeRight: number,
  safeBottom: number,
): { x: number; y: number; applied: boolean } {
  const clampedX = Math.min(safeRight, Math.max(safeLeft, x));
  const clampedY = Math.min(safeBottom, Math.max(safeTop, y));
  return {
    x: clampedX,
    y: clampedY,
    applied: clampedX !== x || clampedY !== y,
  };
}

function resolveLegacyBottomCenterLayout(
  width: number,
  height: number,
  scale: number,
  boxWidth: number,
  boxHeight: number,
  backgroundOpacityPercent: number | null,
): CaptionResolvedLayout {
  const centerX = width / 2;
  const boxBottomY = height - LEGACY_EXPORT_BOTTOM_MARGIN_PX * scale;
  const boxTopY = boxBottomY - boxHeight;
  const maxWidth = width * 0.9;
  const resolvedWidth = boxWidth > 0 ? Math.min(boxWidth, maxWidth) : maxWidth;
  const boxLeft = centerX - resolvedWidth / 2;

  return {
    x: boxLeft,
    y: boxTopY,
    width: resolvedWidth,
    maxWidth,
    textAlign: "center",
    anchor: "bottom_center",
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
    safeAreaApplied: false,
    usesLegacyBottomCenter: true,
    centerX,
    boxTopY,
    boxBottomY,
    backgroundOpacityPercent,
  };
}

/**
 * Single source of truth for caption positioning.
 * Pure — no React, timing, or story-sync dependencies.
 */
export function resolveCaptionLayout(input: CaptionLayoutResolveInput): CaptionResolvedLayout {
  const { canvas, sceneLayout, projectLayout, contentBoxWidth = 0, contentBoxHeight = 0 } = input;
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  const scale = canvas.scale ?? 1;

  const usesLegacyBottomCenter = isDefaultCaptionLayoutStorage(sceneLayout, projectLayout);
  const settings = mergeCaptionLayoutSettings(sceneLayout, projectLayout);
  const backgroundOpacityPercent = resolveCaptionBackgroundOpacityPercent(settings);

  if (usesLegacyBottomCenter) {
    return resolveLegacyBottomCenterLayout(
      width,
      height,
      scale,
      contentBoxWidth,
      contentBoxHeight,
      backgroundOpacityPercent,
    );
  }

  const insets = resolveSafeAreaInsets(width, height, input.safeArea);
  const safeLeft = settings.safeAreaEnabled ? insets.left : 0;
  const safeTop = settings.safeAreaEnabled ? insets.top : 0;
  const safeRight = settings.safeAreaEnabled ? width - insets.right : width;
  const safeBottom = settings.safeAreaEnabled ? height - insets.bottom : height;

  const anchor = settings.anchor ?? "bottom_center";
  const textAlign: CaptionTextAlign = settings.textAlign ?? "center";

  const baseAnchor = resolveAnchorPoint(anchor, safeLeft, safeTop, safeRight, safeBottom);
  let anchorX = baseAnchor.x + (settings.offsetX ?? 0) * scale;
  let anchorY = baseAnchor.y + (settings.offsetY ?? 0) * scale;

  let safeAreaApplied = false;
  if (settings.safeAreaEnabled) {
    const clampedAnchor = clampAnchorToSafeArea(
      anchorX,
      anchorY,
      safeLeft,
      safeTop,
      safeRight,
      safeBottom,
    );
    anchorX = clampedAnchor.x;
    anchorY = clampedAnchor.y;
    safeAreaApplied = clampedAnchor.applied;
  }

  const safeWidth = Math.max(1, safeRight - safeLeft);
  const maxWidth = Math.min(
    width * ((settings.maxWidthPercent ?? 90) / 100),
    safeWidth,
  );

  const layoutBoxWidth = contentBoxWidth > 0 ? Math.min(contentBoxWidth, maxWidth) : maxWidth;
  const layoutBoxHeight = Math.max(1, contentBoxHeight);

  const origin = resolveBoxOrigin(anchor, anchorX, anchorY, layoutBoxWidth, layoutBoxHeight);
  let boxLeft = origin.x;
  let boxTop = origin.y;

  if (settings.safeAreaEnabled && layoutBoxHeight > 0) {
    const clampedBox = clampBoxToSafeArea(
      boxLeft,
      boxTop,
      layoutBoxWidth,
      layoutBoxHeight,
      safeLeft,
      safeTop,
      safeRight,
      safeBottom,
    );
    boxLeft = clampedBox.x;
    boxTop = clampedBox.y;
    safeAreaApplied = safeAreaApplied || clampedBox.applied;
  }

  const centerX = boxLeft + layoutBoxWidth / 2;
  const boxBottomY = boxTop + layoutBoxHeight;
  const resolvedWidth = contentBoxWidth > 0 ? layoutBoxWidth : maxWidth;

  return {
    x: boxLeft,
    y: boxTop,
    width: resolvedWidth,
    maxWidth,
    textAlign,
    anchor,
    safeAreaInsets: insets,
    safeAreaApplied,
    usesLegacyBottomCenter: false,
    centerX,
    boxTopY: boxTop,
    boxBottomY,
    backgroundOpacityPercent,
  };
}

/** Development diagnostics snapshot — no production logging. */
export function resolveCaptionLayoutDiagnostics(
  input: CaptionLayoutResolveInput,
): CaptionLayoutDiagnostics {
  const resolvedLayout = resolveCaptionLayout(input);
  return {
    resolvedLayout,
    anchor: resolvedLayout.anchor,
    safeAreaApplied: resolvedLayout.safeAreaApplied,
  };
}

export function resolveCaptionBackgroundAlpha(resolved: CaptionResolvedLayout): number {
  if (resolved.backgroundOpacityPercent != null) {
    return resolved.backgroundOpacityPercent / 100;
  }

  return DEFAULT_EXPORT_CAPTION_BACKGROUND_OPACITY / 100;
}
