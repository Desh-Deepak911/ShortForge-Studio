/**
 * Deterministic staleness evaluation for applied source-quality adjustment provenance.
 * Only media identity, framing, and recommendation fingerprints enter this evaluation.
 *
 * RECOMMENDATION_CHANGED:
 * When media fingerprint and media-item identity still match the provenance, regenerate
 * the comparable recommendation from provenance.previousFraming (the pre-Apply state).
 * Compare that fingerprint to the stored recommendation fingerprint. This avoids false
 * stale immediately after Apply (when current framing equals appliedFraming).
 *
 * Undo may remain allowed when only RECOMMENDATION_CHANGED is present, provided media,
 * item identity, and applied framing still match the stored provenance.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import type { SceneMedia } from "@/features/story/types";

import {
  framingSnapshotsEqual,
  normalizeSourceQualityAdjustmentProvenance,
  toFramingSnapshot,
  type SourceQualityAdjustmentProvenance,
  type SourceQualityNormalizedFramingSnapshot,
} from "./source-quality-adjustment-provenance";
import {
  fingerprintSourceQualityMedia,
  recommendSafeVisualAdjustment,
} from "./safe-visual-adjustment-recommendation";

export type SourceQualityAdjustmentStaleReason =
  | "MEDIA_CHANGED"
  | "MEDIA_ITEM_CHANGED"
  | "FRAMING_CHANGED"
  | "RECOMMENDATION_CHANGED"
  | "PROVENANCE_INVALID";

export type SourceQualityAdjustmentPresenceStatus =
  | "absent"
  | "applied"
  | "stale"
  | "invalid";

export interface SourceQualityAdjustmentStalenessProjection {
  readonly provenance: SourceQualityAdjustmentProvenance | undefined;
  readonly effectiveStatus: SourceQualityAdjustmentPresenceStatus;
  readonly reasons: readonly SourceQualityAdjustmentStaleReason[];
  readonly applyAllowed: boolean;
  readonly undoAllowed: boolean;
  readonly dismissAllowed: boolean;
  readonly currentMediaFingerprint: string;
  readonly currentFraming: SourceQualityNormalizedFramingSnapshot;
}

const REASON_ORDER: readonly SourceQualityAdjustmentStaleReason[] = [
  "PROVENANCE_INVALID",
  "MEDIA_ITEM_CHANGED",
  "MEDIA_CHANGED",
  "FRAMING_CHANGED",
  "RECOMMENDATION_CHANGED",
];

function sortReasons(
  reasons: readonly SourceQualityAdjustmentStaleReason[],
): readonly SourceQualityAdjustmentStaleReason[] {
  return Object.freeze(
    [...reasons].sort(
      (left, right) => REASON_ORDER.indexOf(left) - REASON_ORDER.indexOf(right),
    ),
  );
}

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Evaluate whether stored provenance still binds to the current media + framing.
 * Malformed provenance is invalid but never blocks preview/export.
 */
export function evaluateSourceQualityAdjustmentStaleness(input: {
  readonly provenance: unknown;
  readonly media: SceneMedia | null | undefined;
  readonly framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  readonly mediaItemId?: string | null;
}): SourceQualityAdjustmentStalenessProjection {
  const currentMediaFingerprint = fingerprintSourceQualityMedia(input.media);
  const currentFraming = toFramingSnapshot({
    fitMode: input.framing.fitMode === "fit" ? "fit" : "fill",
    positionX: input.framing.positionX,
    positionY: input.framing.positionY,
    zoom: input.framing.zoom,
    rotationDeg: input.framing.rotationDeg,
  });
  const selectedMediaItemId = normalizeMediaItemId(input.mediaItemId);

  if (input.provenance == null) {
    return Object.freeze({
      provenance: undefined,
      effectiveStatus: "absent",
      reasons: Object.freeze([]),
      applyAllowed: true,
      undoAllowed: false,
      dismissAllowed: false,
      currentMediaFingerprint,
      currentFraming,
    });
  }

  const provenance = normalizeSourceQualityAdjustmentProvenance(input.provenance);
  if (!provenance) {
    return Object.freeze({
      provenance: undefined,
      effectiveStatus: "invalid",
      reasons: Object.freeze(["PROVENANCE_INVALID"] as const),
      applyAllowed: true,
      undoAllowed: false,
      dismissAllowed: true,
      currentMediaFingerprint,
      currentFraming,
    });
  }

  const reasons: SourceQualityAdjustmentStaleReason[] = [];

  if (provenance.mediaItemId !== selectedMediaItemId) {
    reasons.push("MEDIA_ITEM_CHANGED");
  }
  if (provenance.mediaFingerprint !== currentMediaFingerprint) {
    reasons.push("MEDIA_CHANGED");
  }
  if (!framingSnapshotsEqual(provenance.appliedFraming, currentFraming)) {
    reasons.push("FRAMING_CHANGED");
  }

  // Only when media + item identity still bind — never speculate after identity drift.
  if (
    !reasons.includes("MEDIA_CHANGED") &&
    !reasons.includes("MEDIA_ITEM_CHANGED")
  ) {
    const regenerated = recommendSafeVisualAdjustment({
      media: input.media,
      framing: provenance.previousFraming,
      mediaItemId: provenance.mediaItemId,
    });
    if (
      regenerated.recommendationFingerprint !==
      provenance.recommendationFingerprint
    ) {
      reasons.push("RECOMMENDATION_CHANGED");
    }
  }

  const sorted = sortReasons(reasons);
  const mediaAndItemAligned =
    !sorted.includes("MEDIA_CHANGED") &&
    !sorted.includes("MEDIA_ITEM_CHANGED");
  const framingAligned = !sorted.includes("FRAMING_CHANGED");
  // Exact Undo remains allowed when media/item/applied framing match, even if the
  // recommendation contract alone changed (RECOMMENDATION_CHANGED).
  const undoAllowed = mediaAndItemAligned && framingAligned;
  const effectiveStatus: SourceQualityAdjustmentPresenceStatus =
    sorted.length === 0 ? "applied" : "stale";

  return Object.freeze({
    provenance,
    effectiveStatus,
    reasons: sorted,
    applyAllowed: !undoAllowed,
    undoAllowed,
    dismissAllowed: true,
    currentMediaFingerprint,
    currentFraming,
  });
}
