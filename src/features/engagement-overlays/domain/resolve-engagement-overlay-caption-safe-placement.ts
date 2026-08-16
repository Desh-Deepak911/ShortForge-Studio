/**
 * Caption-safe CTA placement authority.
 * Reuses resolveCaptionLayout for exclusion geometry. Preview, Browser, and
 * Headless must consume the same translated box — never a second caption model.
 */

import {
  CAPTION_LAYOUT_REFERENCE_WIDTH,
  resolveCaptionLayout,
  type CaptionLayout,
} from "@/features/caption-layout";
import {
  resolveCaptionStyle,
  type CaptionStyle,
} from "@/features/caption-style";

import type { EngagementOverlayLayoutBox } from "./resolve-engagement-overlay-frame";

/** Bounded visual gap between CTA and the caption exclusion, in reference px. */
export const ENGAGEMENT_OVERLAY_CAPTION_GAP_REF_PX = 16;

export type EngagementOverlayCaptionSafeSlot =
  | "requested"
  | "above-caption"
  | "below-caption"
  | "nearest-safe";

export interface EngagementOverlayCaptionCollisionInput {
  /** When false/omitted, placement is a no-op and requested geometry is preserved. */
  readonly present?: boolean;
  readonly sceneLayout?: CaptionLayout | null;
  readonly projectLayout?: CaptionLayout | null;
  readonly sceneStyle?: CaptionStyle | null;
  readonly projectStyle?: CaptionStyle | null;
}

export interface ResolvedEngagementOverlayCaptionSafePlacement {
  readonly requested: EngagementOverlayLayoutBox;
  readonly applied: EngagementOverlayLayoutBox;
  readonly translated: boolean;
  readonly slot: EngagementOverlayCaptionSafeSlot;
  readonly captionExclusion: EngagementOverlayLayoutBox | null;
  readonly gapPx: number;
  /**
   * True only when no collision-free canvas slot exists.
   * Export stays enabled; the nearest in-canvas vertical slot is used.
   */
  readonly unresolved: boolean;
}

function boxesOverlap(
  a: EngagementOverlayLayoutBox,
  b: EngagementOverlayLayoutBox,
  gap: number,
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

function cloneBox(box: EngagementOverlayLayoutBox): EngagementOverlayLayoutBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function withY(
  box: EngagementOverlayLayoutBox,
  y: number,
): EngagementOverlayLayoutBox {
  return { x: box.x, y, width: box.width, height: box.height };
}

/**
 * Stable caption exclusion in output pixels.
 * Height uses style max-lines × line-height + padding — never the active word.
 */
export function resolveEngagementOverlayCaptionExclusion(
  input: EngagementOverlayCaptionCollisionInput & {
    readonly frameWidth: number;
    readonly frameHeight: number;
  },
): EngagementOverlayLayoutBox | null {
  if (input.present !== true) {
    return null;
  }

  const width = Math.max(1, input.frameWidth);
  const height = Math.max(1, input.frameHeight);
  const scale = width / CAPTION_LAYOUT_REFERENCE_WIDTH;
  const { resolvedStyle } = resolveCaptionStyle({
    sceneStyle: input.sceneStyle,
    projectStyle: input.projectStyle,
  });
  const fontSize = resolvedStyle.fontSize * scale;
  const lineHeightPx = fontSize * resolvedStyle.lineHeight;
  const padY = resolvedStyle.paddingY * scale;
  const contentBoxHeight = Math.max(
    1,
    resolvedStyle.maxLines * lineHeightPx + padY * 2,
  );

  const widthOnly = resolveCaptionLayout({
    sceneLayout: input.sceneLayout,
    projectLayout: input.projectLayout,
    canvas: { width, height, scale },
  });
  const resolved = resolveCaptionLayout({
    sceneLayout: input.sceneLayout,
    projectLayout: input.projectLayout,
    canvas: { width, height, scale },
    contentBoxWidth: widthOnly.maxWidth,
    contentBoxHeight,
  });

  return {
    x: resolved.x,
    y: resolved.boxTopY,
    width: resolved.width,
    height: Math.max(1, resolved.boxBottomY - resolved.boxTopY),
  };
}

/**
 * Translate-only caption-safe placement.
 * Does not resize, hide, retarget, or retiming the CTA.
 */
export function resolveEngagementOverlayCaptionSafePlacement(input: {
  readonly requested: EngagementOverlayLayoutBox;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly captionCollision?: EngagementOverlayCaptionCollisionInput;
}): ResolvedEngagementOverlayCaptionSafePlacement {
  const requested = input.requested;
  const frameWidth = Math.max(1, input.frameWidth);
  const frameHeight = Math.max(1, input.frameHeight);
  const scale = frameWidth / CAPTION_LAYOUT_REFERENCE_WIDTH;
  const gapPx = ENGAGEMENT_OVERLAY_CAPTION_GAP_REF_PX * scale;
  const captionExclusion = resolveEngagementOverlayCaptionExclusion({
    frameWidth,
    frameHeight,
    present: input.captionCollision?.present,
    sceneLayout: input.captionCollision?.sceneLayout,
    projectLayout: input.captionCollision?.projectLayout,
    sceneStyle: input.captionCollision?.sceneStyle,
    projectStyle: input.captionCollision?.projectStyle,
  });

  if (!captionExclusion || !boxesOverlap(requested, captionExclusion, gapPx)) {
    return {
      requested,
      applied: requested,
      translated: false,
      slot: "requested",
      captionExclusion,
      gapPx,
      unresolved: false,
    };
  }

  const minY = 0;
  const maxY = Math.max(0, frameHeight - requested.height);
  const yAbove = Math.min(
    maxY,
    Math.max(minY, captionExclusion.y - gapPx - requested.height),
  );
  const yBelow = Math.min(
    maxY,
    Math.max(minY, captionExclusion.y + captionExclusion.height + gapPx),
  );

  const candidates: readonly {
    readonly y: number;
    readonly slot: Exclude<EngagementOverlayCaptionSafeSlot, "requested">;
  }[] = [
    { y: yAbove, slot: "above-caption" },
    { y: yBelow, slot: "below-caption" },
  ];

  const collisionFree = candidates.filter(
    (candidate) =>
      !boxesOverlap(withY(requested, candidate.y), captionExclusion, gapPx),
  );
  const pool = collisionFree.length > 0 ? collisionFree : candidates;
  const chosen = pool.reduce((best, candidate) => {
    const bestDelta = Math.abs(best.y - requested.y);
    const nextDelta = Math.abs(candidate.y - requested.y);
    if (nextDelta < bestDelta) return candidate;
    if (nextDelta > bestDelta) return best;
    return candidate.slot === "above-caption" ? candidate : best;
  });

  const applied = withY(requested, chosen.y);
  const unresolved = collisionFree.length === 0;
  return {
    requested: cloneBox(requested),
    applied,
    translated: applied.y !== requested.y,
    slot: unresolved ? "nearest-safe" : chosen.slot,
    captionExclusion,
    gapPx,
    unresolved,
  };
}
