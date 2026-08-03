/**
 * Closed engagement-overlay authoring catalog.
 * Deterministic labels/icons only — no remote assets, SVG injection, or scripts.
 */

import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

export const ENGAGEMENT_OVERLAY_PRESET_ID = "compact-pill-v1" as const;

/** Contract minimum; also the shortest usable entrance+hold+exit window. */
export const ENGAGEMENT_OVERLAY_MIN_DURATION_MS = 250;
export const ENGAGEMENT_OVERLAY_MAX_DURATION_MS = 10_000;
export const ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS = 2_500;

/** Prefer top-right so bottom caption safe area stays clear. */
export const ENGAGEMENT_OVERLAY_DEFAULT_POSITION: EngagementOverlayPosition =
  "top-right";

export const ENGAGEMENT_OVERLAY_KIND_OPTIONS: readonly {
  readonly id: EngagementOverlayKind;
  readonly label: string;
}[] = [
  { id: "like", label: "Like" },
  { id: "share", label: "Share" },
  { id: "subscribe", label: "Subscribe" },
  { id: "combined", label: "Like, Share & Subscribe" },
];

/** Closed safe positions offered in UI (subset of the reserved contract). */
export const ENGAGEMENT_OVERLAY_POSITION_OPTIONS: readonly {
  readonly id: EngagementOverlayPosition;
  readonly label: string;
}[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

export type EngagementOverlayIconToken = "heart" | "share" | "bell";

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
      return ["bell"];
    case "combined":
      return ["heart", "share", "bell"];
    default:
      return ["heart"];
  }
}

export function isUiEngagementOverlayPosition(
  value: unknown,
): value is EngagementOverlayPosition {
  return ENGAGEMENT_OVERLAY_POSITION_OPTIONS.some((option) => option.id === value);
}
