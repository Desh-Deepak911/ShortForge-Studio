/**
 * Closed engagement-overlay authoring catalog.
 * Deterministic labels/icons only — no remote assets, SVG injection, or scripts.
 */

import {
  SHORTFORGE_MOTION_PALETTE,
  shortforgeMotionHexToRgba,
} from "@/features/shortforge-motion-design";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
  EngagementOverlaySize,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

export const ENGAGEMENT_OVERLAY_PRESET_ID = "compact-pill-v1" as const;

/** Contract minimum; also the shortest usable entrance+hold+exit window. */
export const ENGAGEMENT_OVERLAY_MIN_DURATION_MS = 250;
export const ENGAGEMENT_OVERLAY_MAX_DURATION_MS = 10_000;
export const ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS = 2_500;

/** Prefer top-right so bottom caption safe area stays clear. */
export const ENGAGEMENT_OVERLAY_DEFAULT_POSITION: EngagementOverlayPosition =
  "top-right";
export const ENGAGEMENT_OVERLAY_DEFAULT_SIZE: EngagementOverlaySize = "medium";
export const ENGAGEMENT_OVERLAY_DEFAULT_SCALE = 1;
export const ENGAGEMENT_OVERLAY_MIN_SCALE = 0.85;
export const ENGAGEMENT_OVERLAY_MAX_SCALE = 1.15;

export const ENGAGEMENT_OVERLAY_KIND_OPTIONS: readonly {
  readonly id: EngagementOverlayKind;
  readonly label: string;
}[] = [
  { id: "like", label: "Like" },
  { id: "share", label: "Share" },
  { id: "subscribe", label: "Subscribe" },
  { id: "combined", label: "Like, Share & Subscribe" },
];

/** All contract-supported caption-safe anchors offered in the editor. */
export const ENGAGEMENT_OVERLAY_POSITION_OPTIONS: readonly {
  readonly id: EngagementOverlayPosition;
  readonly label: string;
}[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-center", label: "Top center" },
  { id: "top-right", label: "Top right" },
  { id: "center", label: "Center" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-center", label: "Bottom center" },
  { id: "bottom-right", label: "Bottom right" },
];

export const ENGAGEMENT_OVERLAY_SIZE_OPTIONS: readonly {
  readonly id: EngagementOverlaySize;
  readonly label: string;
}[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

export type EngagementOverlayIconToken = "heart" | "share" | "circle-plus";

/**
 * Engagement-owned visual tokens for the midnight-navy glass pill.
 * Palette is shared; geometry and clocks stay in this feature.
 * Do not import brand-sting colors.
 */
export const ENGAGEMENT_OVERLAY_STYLE = Object.freeze({
  /** Semi-transparent midnight-navy glass fill. */
  cardFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.backgroundSecondary,
    0.88,
  ),
  /** Subtle inset/border highlight. */
  cardStroke: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.borderSubtle,
    0.72,
  ),
  cardInsetHighlight: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.softWhite,
    0.1,
  ),
  /** Inactive icon/label — high-contrast soft white. */
  inactiveFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.softWhite,
    0.96,
  ),
  settledFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.softWhite,
    0.72,
  ),
  /** Electric-lime active segment (engagement-owned application). */
  accentFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.accentActive,
    0.98,
  ),
  /** Strongest Subscribe/confirmation accent — label stays Subscribe. */
  confirmationFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.accentActive,
    1,
  ),
  /** Restrained accent glow only — never a large opaque bloom. */
  accentGlow: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.accentActive,
    0.22,
  ),
  /** Navy glass gradient stops — identical tokens for DOM and canvas. */
  cardFillTop: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.backgroundSecondary,
    0.94,
  ),
  cardFillBottom: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.backgroundPrimary,
    0.9,
  ),
  separatorFill: shortforgeMotionHexToRgba(
    SHORTFORGE_MOTION_PALETTE.borderSubtle,
    0.55,
  ),
} as const);

/** Typography and icon metrics consumed by the frame plan — not by renderers. */
export const ENGAGEMENT_OVERLAY_TYPE = Object.freeze({
  fontWeight: 600,
  letterSpacingEm: 0.01,
  fontSizeRatio: 0.22,
  minFontSize: 12,
  iconSizeRatio: 0.34,
  iconLabelGapRatio: 0.1,
  iconStrokeViewBox: 2,
  iconViewBox: 24,
} as const);

/**
 * Scene-local motion constants. Preview/canvas must consume the resolved
 * frame plan rather than re-deriving these values.
 */
export const ENGAGEMENT_OVERLAY_MOTION = Object.freeze({
  entranceScaleFrom: 0.94,
  entranceScaleTo: 1,
  exitScaleDelta: 0.04,
  pulseScalePeak: 0.06,
  confirmationPulseExtra: 0.02,
  glowOpacityPeak: 0.2,
} as const);

/** Medium combined reference size in the 1080×1920 design frame. */
export const ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH = 680;
export const ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT = 112;
export const ENGAGEMENT_OVERLAY_SINGLE_REF_WIDTH = 300;
export const ENGAGEMENT_OVERLAY_SINGLE_REF_HEIGHT = 96;

export function engagementOverlayKindLabel(kind: EngagementOverlayKind): string {
  return (
    ENGAGEMENT_OVERLAY_KIND_OPTIONS.find((option) => option.id === kind)?.label ??
    "Like"
  );
}

export function engagementOverlayLabelsForKind(
  kind: EngagementOverlayKind,
): readonly string[] {
  switch (kind) {
    case "like":
      return ["Like"];
    case "share":
      return ["Share"];
    case "subscribe":
      return ["Subscribe"];
    case "combined":
      return ["Like", "Share", "Subscribe"];
    default:
      return ["Like"];
  }
}

export function engagementOverlayIconsForKind(
  kind: EngagementOverlayKind,
): readonly EngagementOverlayIconToken[] {
  switch (kind) {
    case "like":
      return ["heart"];
    case "share":
      return ["share"];
    case "subscribe":
      return ["circle-plus"];
    case "combined":
      return ["heart", "share", "circle-plus"];
    default:
      return ["heart"];
  }
}

export function isUiEngagementOverlayPosition(
  value: unknown,
): value is EngagementOverlayPosition {
  return ENGAGEMENT_OVERLAY_POSITION_OPTIONS.some((option) => option.id === value);
}
