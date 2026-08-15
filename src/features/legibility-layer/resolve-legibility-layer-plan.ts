/**
 * Deterministic shared legibility-layer plan for Preview / Browser / Headless.
 */

import type { CaptionAnchor } from "@/features/caption-layout";

import {
  LEGIBILITY_REFERENCE_HEIGHT,
  LEGIBILITY_REFERENCE_WIDTH,
  type LegibilityCaptionPlacement,
  type LegibilityLayerPlan,
  type ResolveLegibilityLayerPlanInput,
} from "./legibility-layer.types";
import { resolveLegibilityTitleTiming } from "./resolve-legibility-title-timing";

/** Creator background opacity (0–100) at/above this is treated as sufficient local contrast. */
export const LEGIBILITY_CAPTION_BACKGROUND_SUFFICIENT_OPACITY = 30;

export function mapCaptionAnchorToLegibilityPlacement(
  anchor: CaptionAnchor | string | null | undefined,
): LegibilityCaptionPlacement {
  if (!anchor) return "bottom";
  if (anchor.startsWith("top")) return "top";
  if (anchor.startsWith("bottom")) return "bottom";
  if (anchor.includes("center") || anchor === "center") return "center";
  return "bottom";
}

function scaleRegion(
  region: { x: number; y: number; width: number; height: number },
  frameWidth: number,
  frameHeight: number,
) {
  const sx = frameWidth / LEGIBILITY_REFERENCE_WIDTH;
  const sy = frameHeight / LEGIBILITY_REFERENCE_HEIGHT;
  return {
    x: region.x * sx,
    y: region.y * sy,
    width: region.width * sx,
    height: region.height * sy,
  };
}

export function resolveLegibilityLayerPlan(
  input: ResolveLegibilityLayerPlanInput,
): LegibilityLayerPlan {
  const frameWidth =
    typeof input.frameWidth === "number" && input.frameWidth > 0
      ? input.frameWidth
      : LEGIBILITY_REFERENCE_WIDTH;
  const frameHeight =
    typeof input.frameHeight === "number" && input.frameHeight > 0
      ? input.frameHeight
      : LEGIBILITY_REFERENCE_HEIGHT;

  const titleText = typeof input.storyTitle === "string" ? input.storyTitle.trim() : "";
  const titleTiming = resolveLegibilityTitleTiming({
    absoluteContentTimeMs: input.absoluteContentTimeMs,
    contentDurationMs: input.contentDurationMs,
    hasTitleText: titleText.length > 0,
  });

  const titleRegion = scaleRegion(
    { x: 48, y: 120, width: 984, height: 160 },
    frameWidth,
    frameHeight,
  );

  const suppressCaptionOverlays = input.suppressCaptionOverlays === true;
  const hasActiveCaption = input.hasActiveCaption && !suppressCaptionOverlays;
  const placement = hasActiveCaption ? input.captionPlacement : "none";
  const styleProvidesBackground =
    input.captionStyleBackgroundEnabled === true &&
    Number.isFinite(input.captionStyleBackgroundOpacity) &&
    input.captionStyleBackgroundOpacity >=
      LEGIBILITY_CAPTION_BACKGROUND_SUFFICIENT_OPACITY;

  const captionRegionRef =
    placement === "top"
      ? { x: 72, y: 280, width: 936, height: 220 }
      : placement === "center"
        ? { x: 72, y: 820, width: 936, height: 220 }
        : placement === "bottom"
          ? { x: 72, y: 1480, width: 936, height: 280 }
          : null;

  const captionRegion = captionRegionRef
    ? scaleRegion(captionRegionRef, frameWidth, frameHeight)
    : null;

  const brandingRegion = scaleRegion(
    { x: 48, y: 72, width: 420, height: 56 },
    frameWidth,
    frameHeight,
  );

  return Object.freeze({
    version: 1 as const,
    globalGradientEnabled: false as const,
    title: Object.freeze({
      visible: titleTiming.visible,
      opacity: titleTiming.opacity,
      region: Object.freeze(titleRegion),
      fadePhase: titleTiming.fadePhase,
    }),
    caption: Object.freeze({
      active: hasActiveCaption,
      placement,
      styleProvidesBackground,
      needsLocalScrim: hasActiveCaption && !styleProvidesBackground,
      region: captionRegion ? Object.freeze(captionRegion) : null,
    }),
    branding: Object.freeze({
      enabled: input.watermarkEnabled === true,
      treatment: input.watermarkEnabled === true ? ("shadow_outline" as const) : ("none" as const),
      region: Object.freeze(brandingRegion),
    }),
    suppressCaptionOverlays,
  });
}
