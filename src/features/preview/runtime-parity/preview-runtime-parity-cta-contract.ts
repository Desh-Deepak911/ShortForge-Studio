/**
 * Prompt 5 CTA measured-parity contract.
 * Tolerances and inner-screen policy — not a second overlay engine.
 */

import {
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
} from "@/features/engagement-overlays/domain/engagement-overlay.presets";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

/** Device chrome on sm+ Preview frames (`sm:p-2` = 8px each side). */
export const PREVIEW_RUNTIME_PARITY_DEVICE_CHROME_PAD_PX = 8;

/** Inner 9:16 screen widths that correspond to 220/260/360 hosts. */
export const PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX = [204, 244, 344] as const;

export const PREVIEW_RUNTIME_PARITY_OUTPUT_TARGETS = [
  { width: 720, height: 1280, label: "720p" },
  { width: 1080, height: 1920, label: "1080p" },
  { width: 2160, height: 3840, label: "4K" },
] as const;

export const PREVIEW_RUNTIME_PARITY_CTA_KINDS: readonly EngagementOverlayKind[] = [
  "like",
  "share",
  "subscribe",
  "combined",
];

export const PREVIEW_RUNTIME_PARITY_CTA_POSITIONS: readonly EngagementOverlayPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "center",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export const PREVIEW_RUNTIME_PARITY_CTA_SIZES: readonly EngagementOverlaySize[] = [
  "small",
  "medium",
  "large",
];

export const PREVIEW_RUNTIME_PARITY_CTA_FINE_SCALES = [
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  1,
  ENGAGEMENT_OVERLAY_MAX_SCALE,
] as const;

export const PREVIEW_RUNTIME_PARITY_CTA_BUILD_MARKER =
  "staging-preview-runtime-parity:prompt-5:cta-measured-parity" as const;

/** Output-space px at 1080 width unless noted. */
export const PREVIEW_RUNTIME_PARITY_CTA_TOLERANCE = {
  outerBoundsPx: 2,
  columnCenterPx: 2,
  separatorXPx: 2,
  iconLabelGroupCenterPx: 3,
  pillHeightPx: 2,
  fontSizeRatio: 0.03,
  iconSizeRatio: 0.03,
  animationScale: 0.005,
  animationTranslatePx: 2,
} as const;

export function resolvePreviewInnerScreenWidthPx(hostWidthPx: number): number {
  if (typeof hostWidthPx !== "number" || !Number.isFinite(hostWidthPx) || hostWidthPx <= 0) {
    return PREVIEW_RUNTIME_PARITY_INNER_SCREEN_WIDTHS_PX[1];
  }
  return Math.max(1, hostWidthPx - PREVIEW_RUNTIME_PARITY_DEVICE_CHROME_PAD_PX * 2);
}

export function resolvePreviewInnerScreenHeightPx(innerWidthPx: number): number {
  return Math.round((innerWidthPx * 1920) / 1080);
}
