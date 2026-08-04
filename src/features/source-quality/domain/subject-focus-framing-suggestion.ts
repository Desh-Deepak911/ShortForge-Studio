/**
 * Pure deterministic subject-focus framing suggestion for 9:16 vertical.
 *
 * Safe region (documented): keep the focus point inside the central ~70% of the
 * 9:16 frame on both axes (normalized [0.15, 0.85]). Prefer pan before zoom.
 * Never recommend a zoom that worsens upscale or aggressive-crop warnings.
 * Preserve rotation; project focus through fit/fill × zoom × rotation × pan.
 * Prefer reposition under the current fit mode; only consider Fit when pan/zoom
 * under fill cannot land safely and existing SQ rules recommend Fit.
 *
 * No I/O, clocks, randomness, detectors, providers, or network.
 */

import type { SceneMediaFraming } from "@/features/media-framing/media-framing.types";
import {
  MEDIA_FRAMING_POSITION_UI_MAX,
} from "@/features/media-framing/media-framing.types";
import {
  SCENE_IMAGE_REFERENCE_HEIGHT,
  SCENE_IMAGE_REFERENCE_WIDTH,
  clampSceneImageScale,
  getSceneImageContainDimensions,
  getSceneImageCoverDimensions,
} from "@/features/story/utils/scene.utils";
import type { SceneMedia } from "@/features/story/types";
import type {
  SceneMediaFramingSnapshot,
  SceneMediaSubjectFocus,
} from "@/features/story/types/subject-focus.types";
import { normalizeSceneMediaSubjectFocus } from "@/features/story/types/subject-focus.types";

import { assessSourceQuality } from "./assess-source-quality";
import {
  fingerprintSourceQualityMedia,
  recommendSafeVisualAdjustment,
  sourceQualityStableHash,
} from "./safe-visual-adjustment-recommendation";
import { normalizeSourceQualityZoom } from "./source-quality-effective-geometry";
import { SOURCE_QUALITY_TARGET_ASPECT_RATIO } from "./source-quality-thresholds";
import {
  fingerprintSubjectFocus,
  toStoryFramingSnapshot,
} from "./subject-focus";

export const SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION = 1 as const;

/**
 * Vertical/horizontal safe band as a fraction of frame size.
 * Central 70% → margins of 15% on each side.
 */
export const SUBJECT_FOCUS_SAFE_REGION_INSET = 0.15 as const;

export type SubjectFocusFramingSuggestionUnavailableReason =
  | "NO_SUBJECT_FOCUS"
  | "INVALID_SUBJECT_FOCUS"
  | "UNKNOWN_DIMENSIONS"
  | "ALREADY_IN_SAFE_REGION"
  | "NO_SAFE_ADJUSTMENT";

export interface SubjectFocusFramingPatchProposal {
  readonly fitMode?: "fit" | "fill";
  readonly positionX?: number;
  readonly positionY?: number;
  readonly zoom?: number;
}

export interface SubjectFocusFramingSuggestion {
  readonly available: boolean;
  readonly generatorVersion: typeof SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION;
  readonly recommendationFingerprint: string;
  readonly mediaFingerprint: string;
  readonly focusFingerprint: string;
  readonly mediaItemId: string | null;
  readonly subjectFocus: SceneMediaSubjectFocus | undefined;
  readonly currentFraming: SceneMediaFramingSnapshot;
  readonly proposedFramingPatch: SubjectFocusFramingPatchProposal;
  readonly projectedFraming: SceneMediaFramingSnapshot;
  readonly summary: string;
  readonly unavailableReason: SubjectFocusFramingSuggestionUnavailableReason | null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/**
 * Execution-relevant semantic equality for Apply validation.
 * Display-only summary copy is ignored; forged patches/identity must not match.
 */
export function subjectFocusSuggestionsSemanticallyEqual(
  left: SubjectFocusFramingSuggestion,
  right: SubjectFocusFramingSuggestion,
): boolean {
  if (
    left.available !== right.available ||
    left.generatorVersion !== right.generatorVersion ||
    left.recommendationFingerprint !== right.recommendationFingerprint ||
    left.mediaFingerprint !== right.mediaFingerprint ||
    left.focusFingerprint !== right.focusFingerprint ||
    left.mediaItemId !== right.mediaItemId ||
    left.unavailableReason !== right.unavailableReason
  ) {
    return false;
  }
  if (
    stableStringify(left.proposedFramingPatch) !==
      stableStringify(right.proposedFramingPatch) ||
    stableStringify(left.currentFraming) !==
      stableStringify(right.currentFraming) ||
    stableStringify(left.projectedFraming) !==
      stableStringify(right.projectedFraming)
  ) {
    return false;
  }
  if (
    stableStringify(left.subjectFocus ?? null) !==
    stableStringify(right.subjectFocus ?? null)
  ) {
    return false;
  }
  return true;
}

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveDimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function maxPanForAxis(axis: "x" | "y"): number {
  const half =
    axis === "x"
      ? SCENE_IMAGE_REFERENCE_WIDTH / 2
      : SCENE_IMAGE_REFERENCE_HEIGHT / 2;
  return (MEDIA_FRAMING_POSITION_UI_MAX / 100) * half;
}

function clampPan(value: number, axis: "x" | "y"): number {
  const limit = maxPanForAxis(axis);
  return Math.min(limit, Math.max(-limit, value));
}

function drawDimensions(
  fitMode: "fit" | "fill",
  sourceWidth: number,
  sourceHeight: number,
): { drawWidth: number; drawHeight: number } {
  if (fitMode === "fit") {
    return getSceneImageContainDimensions(
      sourceWidth,
      sourceHeight,
      SCENE_IMAGE_REFERENCE_WIDTH,
      SCENE_IMAGE_REFERENCE_HEIGHT,
    );
  }
  return getSceneImageCoverDimensions(
    sourceWidth,
    sourceHeight,
    SCENE_IMAGE_REFERENCE_WIDTH,
    SCENE_IMAGE_REFERENCE_HEIGHT,
  );
}

/** Map a source-normalized focus point into reference-frame pixels under framing. */
export function projectSubjectFocusIntoFrame(input: {
  readonly centerX: number;
  readonly centerY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
}): { readonly frameX: number; readonly frameY: number } {
  const fitMode = input.framing.fitMode === "fit" ? "fit" : "fill";
  const zoom = normalizeSourceQualityZoom(input.framing.zoom);
  const { drawWidth, drawHeight } = drawDimensions(
    fitMode,
    input.sourceWidth,
    input.sourceHeight,
  );
  const localX = (input.centerX - 0.5) * drawWidth;
  const localY = (input.centerY - 0.5) * drawHeight;
  const radians = (input.framing.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotatedX = localX * cos - localY * sin;
  const rotatedY = localX * sin + localY * cos;
  return {
    frameX:
      SCENE_IMAGE_REFERENCE_WIDTH / 2 +
      input.framing.positionX +
      rotatedX * zoom,
    frameY:
      SCENE_IMAGE_REFERENCE_HEIGHT / 2 +
      input.framing.positionY +
      rotatedY * zoom,
  };
}

function isInsideSafeRegion(frameX: number, frameY: number): boolean {
  const minX = SCENE_IMAGE_REFERENCE_WIDTH * SUBJECT_FOCUS_SAFE_REGION_INSET;
  const maxX =
    SCENE_IMAGE_REFERENCE_WIDTH * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET);
  const minY = SCENE_IMAGE_REFERENCE_HEIGHT * SUBJECT_FOCUS_SAFE_REGION_INSET;
  const maxY =
    SCENE_IMAGE_REFERENCE_HEIGHT * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET);
  return (
    frameX >= minX && frameX <= maxX && frameY >= minY && frameY <= maxY
  );
}

function clampIntoSafeRegion(
  frameX: number,
  frameY: number,
): { readonly frameX: number; readonly frameY: number } {
  const minX = SCENE_IMAGE_REFERENCE_WIDTH * SUBJECT_FOCUS_SAFE_REGION_INSET;
  const maxX =
    SCENE_IMAGE_REFERENCE_WIDTH * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET);
  const minY = SCENE_IMAGE_REFERENCE_HEIGHT * SUBJECT_FOCUS_SAFE_REGION_INSET;
  const maxY =
    SCENE_IMAGE_REFERENCE_HEIGHT * (1 - SUBJECT_FOCUS_SAFE_REGION_INSET);
  return {
    frameX: Math.min(maxX, Math.max(minX, frameX)),
    frameY: Math.min(maxY, Math.max(minY, frameY)),
  };
}

function framingSnapshotFrom(
  framing: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >,
): SceneMediaFramingSnapshot {
  return toStoryFramingSnapshot({
    fitMode: framing.fitMode === "fit" ? "fit" : "fill",
    positionX: framing.positionX,
    positionY: framing.positionY,
    zoom: normalizeSourceQualityZoom(framing.zoom),
    rotationDeg: framing.rotationDeg,
  });
}

function mergeProjected(
  current: SceneMediaFramingSnapshot,
  patch: SubjectFocusFramingPatchProposal,
): SceneMediaFramingSnapshot {
  return toStoryFramingSnapshot({
    fitMode: patch.fitMode ?? current.fitMode,
    positionX: patch.positionX ?? current.positionX,
    positionY: patch.positionY ?? current.positionY,
    zoom: normalizeSourceQualityZoom(patch.zoom ?? current.zoom),
    rotationDeg: current.rotationDeg,
  });
}

function warningWorsened(
  media: SceneMedia | null | undefined,
  current: SceneMediaFramingSnapshot,
  projected: SceneMediaFramingSnapshot,
): boolean {
  const before = assessSourceQuality({
    media,
    framing: {
      fitMode: current.fitMode,
      zoom: current.zoom,
      rotationDeg: current.rotationDeg,
    },
  });
  const after = assessSourceQuality({
    media,
    framing: {
      fitMode: projected.fitMode,
      zoom: projected.zoom,
      rotationDeg: projected.rotationDeg,
    },
  });
  const riskCodes = [
    "SOURCE_MAY_UPSCALE_AT_720P",
    "SOURCE_MAY_UPSCALE_AT_1080P",
    "SOURCE_MAY_UPSCALE_AT_4K",
    "SOURCE_AGGRESSIVE_VERTICAL_CROP",
  ] as const;
  for (const code of riskCodes) {
    if (!before.warningCodes.includes(code) && after.warningCodes.includes(code)) {
      return true;
    }
  }
  return false;
}

function buildFingerprint(input: {
  readonly mediaFingerprint: string;
  readonly mediaItemId: string | null;
  readonly sourceWidth: number | null;
  readonly sourceHeight: number | null;
  readonly focusFingerprint: string;
  readonly currentFraming: SceneMediaFramingSnapshot;
  readonly proposedFramingPatch: SubjectFocusFramingPatchProposal;
  readonly available: boolean;
  readonly generatorVersion: number;
  readonly targetAspect: number;
}): string {
  return sourceQualityStableHash(
    stableStringify({
      kind: "subject-focus-framing-suggestion",
      generatorVersion: input.generatorVersion,
      mediaFingerprint: input.mediaFingerprint,
      mediaItemId: input.mediaItemId,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      focusFingerprint: input.focusFingerprint,
      currentFraming: input.currentFraming,
      proposedFramingPatch: input.proposedFramingPatch,
      available: input.available,
      targetAspect: input.targetAspect,
    }),
  );
}

function tryPanIntoSafeRegion(input: {
  readonly focus: SceneMediaSubjectFocus;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly framing: SceneMediaFramingSnapshot;
}): SubjectFocusFramingPatchProposal | null {
  const projected = projectSubjectFocusIntoFrame({
    centerX: input.focus.centerX,
    centerY: input.focus.centerY,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    framing: input.framing,
  });
  if (isInsideSafeRegion(projected.frameX, projected.frameY)) {
    return null;
  }
  const desired = clampIntoSafeRegion(projected.frameX, projected.frameY);
  const nextX = clampPan(
    input.framing.positionX + (desired.frameX - projected.frameX),
    "x",
  );
  const nextY = clampPan(
    input.framing.positionY + (desired.frameY - projected.frameY),
    "y",
  );
  const candidate: SubjectFocusFramingPatchProposal = {
    positionX: nextX,
    positionY: nextY,
  };
  const after = projectSubjectFocusIntoFrame({
    centerX: input.focus.centerX,
    centerY: input.focus.centerY,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    framing: mergeProjected(input.framing, candidate),
  });
  // Only a pan that lands in the safe region is a pan-only solution.
  if (!isInsideSafeRegion(after.frameX, after.frameY)) {
    return null;
  }
  return candidate;
}

function tryZoomAssist(input: {
  readonly media: SceneMedia | null | undefined;
  readonly focus: SceneMediaSubjectFocus;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly framing: SceneMediaFramingSnapshot;
  readonly basePatch: SubjectFocusFramingPatchProposal;
}): SubjectFocusFramingPatchProposal | null {
  const baseFraming = mergeProjected(input.framing, input.basePatch);
  const afterPan = projectSubjectFocusIntoFrame({
    centerX: input.focus.centerX,
    centerY: input.focus.centerY,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    framing: baseFraming,
  });
  if (isInsideSafeRegion(afterPan.frameX, afterPan.frameY)) {
    return input.basePatch;
  }

  // Modest discrete zoom steps; refuse any that worsen SQ risk warnings.
  const zoomSteps = [1.05, 1.1, 1.15, 1.25, 1.35, 1.5, 1.75, 2];
  for (const step of zoomSteps) {
    const candidateZoom = clampSceneImageScale(
      Math.max(baseFraming.zoom, step),
    );
    if (candidateZoom <= baseFraming.zoom + 1e-9) {
      continue;
    }
    const withZoom: SubjectFocusFramingPatchProposal = {
      ...input.basePatch,
      zoom: candidateZoom,
    };
    // Re-pan after zoom so the focus lands in the safe band.
    const zoomedFraming = mergeProjected(input.framing, withZoom);
    const atZoom = projectSubjectFocusIntoFrame({
      centerX: input.focus.centerX,
      centerY: input.focus.centerY,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      framing: zoomedFraming,
    });
    const desired = clampIntoSafeRegion(atZoom.frameX, atZoom.frameY);
    const panPatch: SubjectFocusFramingPatchProposal = {
      ...withZoom,
      positionX: clampPan(
        zoomedFraming.positionX + (desired.frameX - atZoom.frameX),
        "x",
      ),
      positionY: clampPan(
        zoomedFraming.positionY + (desired.frameY - atZoom.frameY),
        "y",
      ),
    };
    const projected = mergeProjected(input.framing, panPatch);
    if (warningWorsened(input.media, input.framing, projected)) {
      continue;
    }
    const landed = projectSubjectFocusIntoFrame({
      centerX: input.focus.centerX,
      centerY: input.focus.centerY,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      framing: projected,
    });
    if (isInsideSafeRegion(landed.frameX, landed.frameY)) {
      return panPatch;
    }
  }
  return null;
}

/**
 * Build a subject-aware framing suggestion. Non-terminal when unavailable.
 */
export function buildSubjectFocusFramingSuggestion(input: {
  readonly media: SceneMedia | null | undefined;
  readonly mediaItemId?: string | null;
  readonly sourceWidth?: number | null;
  readonly sourceHeight?: number | null;
  readonly currentFraming: Pick<
    SceneMediaFraming,
    "fitMode" | "positionX" | "positionY" | "zoom" | "rotationDeg"
  >;
  readonly subjectFocus: unknown;
  readonly targetAspect?: number;
  readonly generatorVersion?: number;
}): SubjectFocusFramingSuggestion {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  const generatorVersion =
    typeof input.generatorVersion === "number" &&
    Number.isFinite(input.generatorVersion) &&
    input.generatorVersion >= 1
      ? Math.floor(input.generatorVersion)
      : SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION;
  const targetAspect =
    typeof input.targetAspect === "number" &&
    Number.isFinite(input.targetAspect) &&
    input.targetAspect > 0
      ? input.targetAspect
      : SOURCE_QUALITY_TARGET_ASPECT_RATIO;

  const currentFraming = framingSnapshotFrom(input.currentFraming);
  const mediaFingerprint = fingerprintSourceQualityMedia(input.media);
  const focus = normalizeSceneMediaSubjectFocus(input.subjectFocus);
  const focusFingerprint = fingerprintSubjectFocus(focus);

  const finish = (overrides: {
    readonly available: boolean;
    readonly proposedFramingPatch?: SubjectFocusFramingPatchProposal;
    readonly summary: string;
    readonly unavailableReason: SubjectFocusFramingSuggestionUnavailableReason | null;
    readonly subjectFocus?: SceneMediaSubjectFocus;
  }): SubjectFocusFramingSuggestion => {
    const proposed = overrides.proposedFramingPatch ?? {};
    const projected = mergeProjected(currentFraming, proposed);
    const sourceWidth = positiveDimension(
      input.sourceWidth ?? input.media?.width,
    );
    const sourceHeight = positiveDimension(
      input.sourceHeight ?? input.media?.height,
    );
    return Object.freeze({
      available: overrides.available,
      generatorVersion: SUBJECT_FOCUS_FRAMING_GENERATOR_VERSION,
      recommendationFingerprint: buildFingerprint({
        mediaFingerprint,
        mediaItemId,
        sourceWidth,
        sourceHeight,
        focusFingerprint,
        currentFraming,
        proposedFramingPatch: proposed,
        available: overrides.available,
        generatorVersion,
        targetAspect,
      }),
      mediaFingerprint,
      focusFingerprint,
      mediaItemId,
      subjectFocus: overrides.subjectFocus ?? focus,
      currentFraming,
      proposedFramingPatch: Object.freeze({ ...proposed }),
      projectedFraming: projected,
      summary: overrides.summary,
      unavailableReason: overrides.unavailableReason,
    });
  };

  if (input.subjectFocus == null) {
    return finish({
      available: false,
      summary: "Choose a subject focus to get a framing suggestion.",
      unavailableReason: "NO_SUBJECT_FOCUS",
    });
  }
  if (!focus) {
    return finish({
      available: false,
      summary: "Subject focus could not be read.",
      unavailableReason: "INVALID_SUBJECT_FOCUS",
    });
  }

  const sourceWidth = positiveDimension(
    input.sourceWidth ?? input.media?.width,
  );
  const sourceHeight = positiveDimension(
    input.sourceHeight ?? input.media?.height,
  );
  if (sourceWidth == null || sourceHeight == null) {
    return finish({
      available: false,
      summary:
        "Source dimensions are unavailable, so subject framing cannot be suggested yet.",
      unavailableReason: "UNKNOWN_DIMENSIONS",
      subjectFocus: focus,
    });
  }

  const currentProjection = projectSubjectFocusIntoFrame({
    centerX: focus.centerX,
    centerY: focus.centerY,
    sourceWidth,
    sourceHeight,
    framing: currentFraming,
  });
  if (isInsideSafeRegion(currentProjection.frameX, currentProjection.frameY)) {
    return finish({
      available: false,
      summary: "The chosen subject is already inside the vertical safe area.",
      unavailableReason: "ALREADY_IN_SAFE_REGION",
      subjectFocus: focus,
    });
  }

  // 1) Prefer pan under the current fit mode (no unnecessary Fit switches).
  let proposed: SubjectFocusFramingPatchProposal = {};
  const panOnly = tryPanIntoSafeRegion({
    focus,
    sourceWidth,
    sourceHeight,
    framing: currentFraming,
  });
  if (panOnly) {
    proposed = panOnly;
  }

  let projected = mergeProjected(currentFraming, proposed);
  let landed = projectSubjectFocusIntoFrame({
    centerX: focus.centerX,
    centerY: focus.centerY,
    sourceWidth,
    sourceHeight,
    framing: projected,
  });

  // 2) Zoom assist under current fit mode when pan alone cannot land.
  if (!isInsideSafeRegion(landed.frameX, landed.frameY)) {
    const zoomed = tryZoomAssist({
      media: input.media,
      focus,
      sourceWidth,
      sourceHeight,
      framing: currentFraming,
      basePatch: {},
    });
    if (zoomed) {
      proposed = zoomed;
      projected = mergeProjected(currentFraming, proposed);
      landed = projectSubjectFocusIntoFrame({
        centerX: focus.centerX,
        centerY: focus.centerY,
        sourceWidth,
        sourceHeight,
        framing: projected,
      });
    }
  }

  // 3) Last resort: safer Fit only when SQ recommends it and placement lands.
  if (
    !isInsideSafeRegion(landed.frameX, landed.frameY) &&
    currentFraming.fitMode === "fill"
  ) {
    const sq = recommendSafeVisualAdjustment({
      media: input.media,
      framing: input.currentFraming,
      mediaItemId,
    });
    if (
      sq.applicable &&
      sq.recommendationCodes.includes("USE_FIT_FRAMING") &&
      sq.proposedFramingPatch.fitMode === "fit"
    ) {
      const fitBase = mergeProjected(currentFraming, { fitMode: "fit" });
      if (!warningWorsened(input.media, currentFraming, fitBase)) {
        const underFit = projectSubjectFocusIntoFrame({
          centerX: focus.centerX,
          centerY: focus.centerY,
          sourceWidth,
          sourceHeight,
          framing: fitBase,
        });
        if (isInsideSafeRegion(underFit.frameX, underFit.frameY)) {
          proposed = { fitMode: "fit" };
        } else {
          const fitPan = tryPanIntoSafeRegion({
            focus,
            sourceWidth,
            sourceHeight,
            framing: fitBase,
          });
          if (fitPan) {
            proposed = { fitMode: "fit", ...fitPan };
          } else {
            const fitZoom = tryZoomAssist({
              media: input.media,
              focus,
              sourceWidth,
              sourceHeight,
              framing: fitBase,
              basePatch: { fitMode: "fit" },
            });
            if (fitZoom) {
              proposed = { fitMode: "fit", ...fitZoom };
            }
          }
        }
        projected = mergeProjected(currentFraming, proposed);
        landed = projectSubjectFocusIntoFrame({
          centerX: focus.centerX,
          centerY: focus.centerY,
          sourceWidth,
          sourceHeight,
          framing: projected,
        });
      }
    }
  }

  if (
    !isInsideSafeRegion(landed.frameX, landed.frameY) ||
    warningWorsened(input.media, currentFraming, projected)
  ) {
    return finish({
      available: false,
      summary:
        "No safe pan or zoom keeps this subject in the vertical safe area.",
      unavailableReason: "NO_SAFE_ADJUSTMENT",
      subjectFocus: focus,
    });
  }

  const unchanged =
    (proposed.fitMode == null || proposed.fitMode === currentFraming.fitMode) &&
    (proposed.positionX == null ||
      proposed.positionX === currentFraming.positionX) &&
    (proposed.positionY == null ||
      proposed.positionY === currentFraming.positionY) &&
    (proposed.zoom == null || proposed.zoom === currentFraming.zoom);
  if (unchanged) {
    return finish({
      available: false,
      summary: "The chosen subject is already inside the vertical safe area.",
      unavailableReason: "ALREADY_IN_SAFE_REGION",
      subjectFocus: focus,
    });
  }

  const parts: string[] = [];
  if (proposed.fitMode === "fit") {
    parts.push("switch to Fit");
  }
  if (
    proposed.positionX != null ||
    proposed.positionY != null
  ) {
    parts.push("reposition the frame");
  }
  if (proposed.zoom != null && proposed.zoom !== currentFraming.zoom) {
    parts.push("adjust zoom slightly");
  }
  const summary =
    parts.length > 0
      ? `Suggestion: ${parts.join(" and ")} so the subject stays in the vertical safe area.`
      : "Suggestion: update framing so the subject stays in the vertical safe area.";

  return finish({
    available: true,
    proposedFramingPatch: proposed,
    summary,
    unavailableReason: null,
    subjectFocus: focus,
  });
}
