/**
 * Preview caption placement — maps the shared caption-layout engine onto
 * an anchor-relative DOM surface. Does not invent a second layout engine.
 */

import type { CSSProperties } from "react";

import {
  CAPTION_LAYOUT_REFERENCE_HEIGHT,
  CAPTION_LAYOUT_REFERENCE_WIDTH,
} from "@/features/caption-layout/caption-layout.defaults";
import type {
  CaptionAnchor,
  CaptionResolvedLayout,
} from "@/features/caption-layout/caption-layout.types";

/** Reference-space center drift allowed after content-width changes. */
export const PREVIEW_CAPTION_CENTER_DRIFT_TOLERANCE_REFERENCE_PX = 1;

export function resolvePreviewCaptionAnchorTranslate(
  anchor: CaptionAnchor,
): string {
  switch (anchor) {
    case "center":
      return "translate(-50%, -50%)";
    case "top_center":
      return "translate(-50%, 0)";
    case "bottom_center":
      return "translate(-50%, -100%)";
    case "top_left":
      return "translate(0, 0)";
    case "center_left":
      return "translate(0, -50%)";
    case "bottom_left":
      return "translate(0, -100%)";
    case "top_right":
      return "translate(-100%, 0)";
    case "center_right":
      return "translate(-100%, -50%)";
    case "bottom_right":
      return "translate(-100%, -100%)";
    default: {
      const _exhaustive: never = anchor;
      return _exhaustive;
    }
  }
}

export function resolvePreviewCaptionAnchorPoint(
  resolved: CaptionResolvedLayout,
): { readonly x: number; readonly y: number } {
  const midY = (resolved.boxTopY + resolved.boxBottomY) / 2;
  switch (resolved.anchor) {
    case "center":
      return { x: resolved.centerX, y: midY };
    case "top_center":
      return { x: resolved.centerX, y: resolved.boxTopY };
    case "bottom_center":
      return { x: resolved.centerX, y: resolved.boxBottomY };
    case "top_left":
      return { x: resolved.x, y: resolved.boxTopY };
    case "center_left":
      return { x: resolved.x, y: midY };
    case "bottom_left":
      return { x: resolved.x, y: resolved.boxBottomY };
    case "top_right":
      return { x: resolved.x + resolved.width, y: resolved.boxTopY };
    case "center_right":
      return { x: resolved.x + resolved.width, y: midY };
    case "bottom_right":
      return { x: resolved.x + resolved.width, y: resolved.boxBottomY };
    default: {
      const _exhaustive: never = resolved.anchor;
      return _exhaustive;
    }
  }
}

export function resolvePreviewCaptionTranslateFractions(
  anchor: CaptionAnchor,
): { readonly x: number; readonly y: number } {
  switch (anchor) {
    case "center":
      return { x: -0.5, y: -0.5 };
    case "top_center":
      return { x: -0.5, y: 0 };
    case "bottom_center":
      return { x: -0.5, y: -1 };
    case "top_left":
      return { x: 0, y: 0 };
    case "center_left":
      return { x: 0, y: -0.5 };
    case "bottom_left":
      return { x: 0, y: -1 };
    case "top_right":
      return { x: -1, y: 0 };
    case "center_right":
      return { x: -1, y: -0.5 };
    case "bottom_right":
      return { x: -1, y: -1 };
    default: {
      const _exhaustive: never = anchor;
      return _exhaustive;
    }
  }
}

export interface PreviewCaptionVisualBox {
  readonly anchor: CaptionAnchor;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * Visual box in 1080×1920 reference pixels after the anchor-relative translate.
 * Content size may change; the selected anchor reference stays put.
 */
export function resolvePreviewCaptionVisualBox(
  resolved: CaptionResolvedLayout,
  contentWidth: number,
  contentHeight: number,
): PreviewCaptionVisualBox {
  const width =
    typeof contentWidth === "number" && Number.isFinite(contentWidth)
      ? Math.max(0, contentWidth)
      : 0;
  const height =
    typeof contentHeight === "number" && Number.isFinite(contentHeight)
      ? Math.max(0, contentHeight)
      : 0;
  const anchor = resolvePreviewCaptionAnchorPoint(resolved);
  const translate = resolvePreviewCaptionTranslateFractions(resolved.anchor);
  const left = anchor.x + width * translate.x;
  const top = anchor.y + height * translate.y;
  return {
    anchor: resolved.anchor,
    anchorX: anchor.x,
    anchorY: anchor.y,
    left,
    top,
    width,
    height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
}

export function resolvePreviewCaptionPlacementStyle(
  resolved: CaptionResolvedLayout,
): CSSProperties {
  if (resolved.usesLegacyBottomCenter) {
    return {};
  }

  const anchor = resolvePreviewCaptionAnchorPoint(resolved);
  const leftPercent = (anchor.x / CAPTION_LAYOUT_REFERENCE_WIDTH) * 100;
  const topPercent = (anchor.y / CAPTION_LAYOUT_REFERENCE_HEIGHT) * 100;
  const maxWidthPercent = (resolved.maxWidth / CAPTION_LAYOUT_REFERENCE_WIDTH) * 100;

  return {
    pointerEvents: "none",
    position: "absolute",
    zIndex: 10,
    display: "flex",
    boxSizing: "border-box",
    overflow: "visible",
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    maxWidth: `${maxWidthPercent}%`,
    width: "max-content",
    transform: resolvePreviewCaptionAnchorTranslate(resolved.anchor),
    justifyContent: "center",
  };
}

export function resolvePreviewCaptionOutputScale(frameWidth: number): number {
  if (typeof frameWidth !== "number" || !Number.isFinite(frameWidth) || frameWidth <= 0) {
    return 13 / 64;
  }
  return frameWidth / CAPTION_LAYOUT_REFERENCE_WIDTH;
}
