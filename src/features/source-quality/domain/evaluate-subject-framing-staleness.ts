/**
 * Deterministic staleness for subject-aware framing provenance.
 * Ignores narration/music/keyframes/effects/CTA/sting/window timing when
 * media identity, subject focus, and framing still match.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import type { SceneMedia } from "@/features/story/types";
import type { SceneMediaSubjectAwareFramingProvenance } from "@/features/story/types/subject-focus.types";
import {
  normalizeSceneMediaSubjectAwareFramingProvenance,
  sceneMediaFramingSnapshotsEqual,
} from "@/features/story/types/subject-focus.types";

import { fingerprintSourceQualityMedia } from "./safe-visual-adjustment-recommendation";
import {
  buildSubjectFocusFramingSuggestion,
  SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
} from "./subject-focus-framing-suggestion";
import {
  fingerprintSubjectFocus,
  toStoryFramingSnapshot,
} from "./subject-focus";
import { normalizeSourceQualityZoom } from "./source-quality-effective-geometry";

export type SubjectAwareFramingStaleReason =
  | "MEDIA_CHANGED"
  | "MEDIA_ITEM_CHANGED"
  | "SUBJECT_FOCUS_CHANGED"
  | "FRAMING_CHANGED"
  | "RECOMMENDATION_CHANGED"
  | "PROVENANCE_INVALID";

export type SubjectAwareFramingPresenceStatus =
  | "absent"
  | "applied"
  | "stale"
  | "invalid";

export interface SubjectAwareFramingStalenessProjection {
  readonly provenance: SceneMediaSubjectAwareFramingProvenance | undefined;
  readonly effectiveStatus: SubjectAwareFramingPresenceStatus;
  readonly reasons: readonly SubjectAwareFramingStaleReason[];
  readonly applyAllowed: boolean;
  readonly undoAllowed: boolean;
  readonly keepDismissAllowed: boolean;
  readonly currentMediaFingerprint: string;
  readonly currentFocusFingerprint: string;
  readonly currentFraming: ReturnType<typeof toStoryFramingSnapshot>;
}

const REASON_ORDER: readonly SubjectAwareFramingStaleReason[] = [
  "PROVENANCE_INVALID",
  "MEDIA_ITEM_CHANGED",
  "MEDIA_CHANGED",
  "SUBJECT_FOCUS_CHANGED",
  "FRAMING_CHANGED",
  "RECOMMENDATION_CHANGED",
];

function sortReasons(
  reasons: readonly SubjectAwareFramingStaleReason[],
): readonly SubjectAwareFramingStaleReason[] {
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
 * Evaluate whether stored subject-aware provenance still binds to current state.
 * Malformed provenance is invalid but never blocks preview/export.
 */
export function evaluateSubjectFramingStaleness(input: {
  readonly provenance: unknown;
  readonly media: SceneMedia | null | undefined;
  readonly framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  readonly mediaItemId?: string | null;
}): SubjectAwareFramingStalenessProjection {
  const currentMediaFingerprint = fingerprintSourceQualityMedia(input.media);
  const currentFocusFingerprint = fingerprintSubjectFocus(
    input.media?.subjectFocus,
  );
  const currentFraming = toStoryFramingSnapshot({
    fitMode: input.framing.fitMode === "fit" ? "fit" : "fill",
    positionX: input.framing.positionX,
    positionY: input.framing.positionY,
    zoom: normalizeSourceQualityZoom(input.framing.zoom),
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
      keepDismissAllowed: false,
      currentMediaFingerprint,
      currentFocusFingerprint,
      currentFraming,
    });
  }

  const provenance = normalizeSceneMediaSubjectAwareFramingProvenance(
    input.provenance,
  );
  if (!provenance) {
    return Object.freeze({
      provenance: undefined,
      effectiveStatus: "invalid",
      reasons: Object.freeze(["PROVENANCE_INVALID"] as const),
      applyAllowed: true,
      undoAllowed: false,
      keepDismissAllowed: true,
      currentMediaFingerprint,
      currentFocusFingerprint,
      currentFraming,
    });
  }

  const reasons: SubjectAwareFramingStaleReason[] = [];

  if (normalizeMediaItemId(provenance.mediaItemId) !== selectedMediaItemId) {
    reasons.push("MEDIA_ITEM_CHANGED");
  }
  if (provenance.mediaFingerprint !== currentMediaFingerprint) {
    reasons.push("MEDIA_CHANGED");
  }
  if (provenance.focusFingerprint !== currentFocusFingerprint) {
    reasons.push("SUBJECT_FOCUS_CHANGED");
  }
  if (!sceneMediaFramingSnapshotsEqual(provenance.appliedFraming, currentFraming)) {
    reasons.push("FRAMING_CHANGED");
  }

  // Compare recommendation against pre-Apply framing to avoid false stale after Apply.
  if (
    !reasons.includes("MEDIA_CHANGED") &&
    !reasons.includes("MEDIA_ITEM_CHANGED") &&
    !reasons.includes("SUBJECT_FOCUS_CHANGED")
  ) {
    const regenerated = buildSubjectFocusFramingSuggestion({
      media: input.media,
      mediaItemId: selectedMediaItemId,
      currentFraming: {
        fitMode: provenance.previousFraming.fitMode,
        positionX: provenance.previousFraming.positionX,
        positionY: provenance.previousFraming.positionY,
        zoom: provenance.previousFraming.zoom,
        rotationDeg: provenance.previousFraming.rotationDeg,
      },
      subjectFocus: provenance.subjectFocus,
      generatorVersion:
        provenance.generatorVersion || SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
    });
    if (
      regenerated.recommendationFingerprint !==
      provenance.recommendationFingerprint
    ) {
      reasons.push("RECOMMENDATION_CHANGED");
    }
  }

  const sorted = sortReasons(reasons);
  const blockingForUndo = sorted.filter(
    (reason) => reason !== "RECOMMENDATION_CHANGED",
  );
  const undoAllowed =
    blockingForUndo.length === 0 &&
    sceneMediaFramingSnapshotsEqual(provenance.appliedFraming, currentFraming);

  const effectiveStatus: SubjectAwareFramingPresenceStatus =
    sorted.length === 0 ? "applied" : "stale";

  return Object.freeze({
    provenance,
    effectiveStatus,
    reasons: sorted,
    applyAllowed: true,
    undoAllowed,
    keepDismissAllowed: true,
    currentMediaFingerprint,
    currentFocusFingerprint,
    currentFraming,
  });
}
