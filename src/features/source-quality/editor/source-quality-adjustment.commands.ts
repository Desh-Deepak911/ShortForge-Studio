/**
 * Immutable Apply / Undo / Dismiss commands for source-quality framing adjustments.
 * Reuses media-framing write authority; never invents BCS/color patches.
 * Capability flags are explicit inputs — never read from environment here.
 */

import {
  buildMediaFramingPatch,
  type MediaFramingPatchResult,
} from "@/features/media-framing/media-framing-patch.utils";
import type { SceneMediaFramingPatch } from "@/features/media-framing/media-framing.types";
import {
  mergeSceneMediaFraming,
  resolveSceneMediaFraming,
} from "@/features/media-framing/resolve-scene-media-framing";
import {
  readMixedMediaSequenceItems,
  writeMixedMediaSequenceItems,
} from "@/features/mixed-media-scenes/editor/mixed-media-scene.commands";
import {
  buildTemporarySceneForMediaItemEdit,
  updateSceneMediaItemMedia,
} from "@/features/scene-media-timeline/editor/scene-media-timeline.commands";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";

import { evaluateSourceQualityAdjustmentStaleness } from "../domain/evaluate-source-quality-adjustment-staleness";
import {
  recommendSafeVisualAdjustment,
  sourceQualityRecommendationsSemanticallyEqual,
  type SourceQualityFramingPatchProposal,
  type SourceQualitySafeAdjustmentRecommendation,
} from "../domain/safe-visual-adjustment-recommendation";
import {
  normalizeSourceQualityAdjustmentProvenance,
  toFramingSnapshot,
  type SourceQualityAdjustmentProvenance,
  type SourceQualityNormalizedFramingSnapshot,
} from "../domain/source-quality-adjustment-provenance";

export type SourceQualityAdjustmentTerminalCode =
  | "SOURCE_QUALITY_CAPABILITY_OFF"
  | "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE"
  | "SOURCE_QUALITY_RECOMMENDATION_STALE"
  | "SOURCE_QUALITY_RECOMMENDATION_INVALID"
  | "SOURCE_QUALITY_MEDIA_ITEM_MISMATCH"
  | "SOURCE_QUALITY_UNDO_UNAVAILABLE"
  | "SOURCE_QUALITY_PROVENANCE_INVALID"
  | "SOURCE_QUALITY_FRAMING_UNAVAILABLE";

export type SourceQualityAdjustmentCommandSuccess = {
  readonly ok: true;
  readonly scene: FootieScene;
  readonly mediaItemId: string | null;
  readonly provenance: SourceQualityAdjustmentProvenance | undefined;
};

export type SourceQualityAdjustmentCommandFailure = {
  readonly ok: false;
  readonly scene: FootieScene;
  readonly mediaItemId: string | null;
  readonly terminalCode: SourceQualityAdjustmentTerminalCode;
};

export type SourceQualityAdjustmentCommandResult =
  | SourceQualityAdjustmentCommandSuccess
  | SourceQualityAdjustmentCommandFailure;

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure(
  scene: FootieScene,
  mediaItemId: string | null,
  terminalCode: SourceQualityAdjustmentTerminalCode,
): SourceQualityAdjustmentCommandFailure {
  return { ok: false, scene, mediaItemId, terminalCode };
}

function success(
  scene: FootieScene,
  mediaItemId: string | null,
  provenance: SourceQualityAdjustmentProvenance | undefined,
): SourceQualityAdjustmentCommandSuccess {
  return { ok: true, scene, mediaItemId, provenance };
}

function resolveTargetMedia(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): SceneMedia | null {
  if (mediaItemId) {
    if (mixedMediaScenesEnabled) {
      const items = readMixedMediaSequenceItems(scene);
      return items.find((item) => item.id === mediaItemId)?.media ?? null;
    }
    const timelineItem = scene.mediaTimeline?.items.find(
      (item) => item.id === mediaItemId,
    );
    return timelineItem?.media ?? null;
  }
  return getSceneMedia(scene) ?? null;
}

/**
 * Raw media object for provenance dismiss — avoids normalizeSceneMedia stripping
 * malformed authoring metadata before the field can be cleared.
 */
function resolveRawTargetMedia(
  scene: FootieScene,
  mediaItemId: string | null,
  mixedMediaScenesEnabled: boolean,
): SceneMedia | null {
  if (mediaItemId) {
    if (mixedMediaScenesEnabled) {
      const fromSequence = scene.visualSequence?.items.find(
        (item) => item.id === mediaItemId,
      )?.media;
      if (fromSequence) {
        return fromSequence;
      }
    }
    return (
      scene.mediaTimeline?.items.find((item) => item.id === mediaItemId)?.media ??
      null
    );
  }
  if (scene.media != null) {
    return scene.media;
  }
  return getSceneMedia(scene) ?? null;
}

function resolveTargetFraming(
  scene: FootieScene,
  media: SceneMedia | null,
  mediaItemId: string | null,
) {
  if (mediaItemId && media) {
    return resolveSceneMediaFraming({ media }, { media });
  }
  return resolveSceneMediaFraming(scene, { media: media ?? undefined });
}

function proposalToFramingPatch(
  proposal: SourceQualityFramingPatchProposal,
): SceneMediaFramingPatch {
  return {
    ...(proposal.fitMode === "fit" || proposal.fitMode === "fill"
      ? { fitMode: proposal.fitMode }
      : {}),
    ...(typeof proposal.zoom === "number" && Number.isFinite(proposal.zoom)
      ? { zoom: proposal.zoom }
      : {}),
  };
}

function snapshotToFramingPatch(
  snapshot: SourceQualityNormalizedFramingSnapshot,
): SceneMediaFramingPatch {
  return {
    fitMode: snapshot.fitMode,
    positionX: snapshot.positionX,
    positionY: snapshot.positionY,
    zoom: snapshot.zoom,
    rotationDeg: snapshot.rotationDeg,
  };
}

function withProvenance(
  media: SceneMedia,
  provenance: SourceQualityAdjustmentProvenance | undefined,
): SceneMedia {
  const next: SceneMedia = { ...media };
  if (provenance) {
    next.sourceQualityAdjustmentProvenance = provenance;
  } else {
    delete next.sourceQualityAdjustmentProvenance;
  }
  return next;
}

function withoutProvenance(media: SceneMedia): SceneMedia {
  if (!("sourceQualityAdjustmentProvenance" in media)) {
    return { ...media };
  }
  const next: SceneMedia = { ...media };
  delete next.sourceQualityAdjustmentProvenance;
  return next;
}

function applyFramingToSingleMediaScene(
  scene: FootieScene,
  framingPatch: SceneMediaFramingPatch,
  provenance: SourceQualityAdjustmentProvenance | undefined,
): FootieScene | null {
  const result = buildMediaFramingPatch(scene, framingPatch);
  if (!result?.media) {
    return null;
  }
  const media = withProvenance(result.media, provenance);
  return {
    ...scene,
    ...result.patch,
    media,
  };
}

function applyFramingToTimelineItem(
  scene: FootieScene,
  mediaItemId: string,
  framingPatch: SceneMediaFramingPatch,
  provenance: SourceQualityAdjustmentProvenance | undefined,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  const media = resolveTargetMedia(scene, mediaItemId, mixedMediaScenesEnabled);
  if (!media) {
    return null;
  }

  const temp = buildTemporarySceneForMediaItemEdit(scene, media);
  const framed: MediaFramingPatchResult | null = buildMediaFramingPatch(
    temp,
    framingPatch,
  );
  if (!framed?.media) {
    return null;
  }
  const nextMedia = withProvenance(framed.media, provenance);

  if (mixedMediaScenesEnabled) {
    const items = readMixedMediaSequenceItems(scene).map((item) =>
      item.id === mediaItemId ? { ...item, media: nextMedia } : { ...item },
    );
    if (!items.some((item) => item.id === mediaItemId)) {
      return null;
    }
    return writeMixedMediaSequenceItems(scene, items, {
      mixedMediaScenesEnabled: true,
    }).scene;
  }

  return updateSceneMediaItemMedia(scene, mediaItemId, nextMedia).scene;
}

function applyFramingAuthority(
  scene: FootieScene,
  mediaItemId: string | null,
  framingPatch: SceneMediaFramingPatch,
  provenance: SourceQualityAdjustmentProvenance | undefined,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  if (mediaItemId) {
    return applyFramingToTimelineItem(
      scene,
      mediaItemId,
      framingPatch,
      provenance,
      mixedMediaScenesEnabled,
    );
  }
  return applyFramingToSingleMediaScene(scene, framingPatch, provenance);
}

function isCompleteRecommendationShape(
  value: unknown,
): value is SourceQualitySafeAdjustmentRecommendation {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.recommendationFingerprint === "string" &&
    typeof record.mediaFingerprint === "string" &&
    typeof record.applicable === "boolean" &&
    Array.isArray(record.recommendationCodes) &&
    record.proposedFramingPatch != null &&
    typeof record.proposedFramingPatch === "object" &&
    record.currentFraming != null &&
    typeof record.currentFraming === "object" &&
    record.projectedFraming != null &&
    typeof record.projectedFraming === "object" &&
    (record.mediaItemId === null || typeof record.mediaItemId === "string")
  );
}

/**
 * Validate an untrusted supplied recommendation against the canonical recomputation.
 * Apply always executes the canonical patch/provenance — never caller-altered fields.
 */
function resolveCanonicalRecommendationForApply(input: {
  readonly media: SceneMedia;
  readonly framing: ReturnType<typeof resolveSceneMediaFraming>;
  readonly mediaItemId: string | null;
  readonly recommendation: unknown;
  readonly expectedRecommendationFingerprint?: string | null;
}):
  | { readonly ok: true; readonly recommendation: SourceQualitySafeAdjustmentRecommendation }
  | { readonly ok: false; readonly terminalCode: SourceQualityAdjustmentTerminalCode } {
  if (input.recommendation == null) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE" };
  }
  if (!isCompleteRecommendationShape(input.recommendation)) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_INVALID" };
  }

  const provided = input.recommendation;
  const canonical = recommendSafeVisualAdjustment({
    media: input.media,
    framing: input.framing,
    mediaItemId: input.mediaItemId,
  });

  if (normalizeMediaItemId(provided.mediaItemId) !== input.mediaItemId) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_MEDIA_ITEM_MISMATCH" };
  }

  const expectedFingerprint =
    typeof input.expectedRecommendationFingerprint === "string" &&
    input.expectedRecommendationFingerprint.trim()
      ? input.expectedRecommendationFingerprint.trim()
      : null;
  if (
    expectedFingerprint &&
    expectedFingerprint !== canonical.recommendationFingerprint
  ) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_STALE" };
  }

  if (!canonical.applicable) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE" };
  }

  if (
    provided.recommendationFingerprint !== canonical.recommendationFingerprint
  ) {
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_STALE" };
  }

  if (!sourceQualityRecommendationsSemanticallyEqual(provided, canonical)) {
    // Fingerprint matched or was copied while execution fields were forged.
    return { ok: false, terminalCode: "SOURCE_QUALITY_RECOMMENDATION_INVALID" };
  }

  return { ok: true, recommendation: canonical };
}

/**
 * Apply a framing-only recommendation through existing media-framing write authority.
 * Requires a complete recommendation object. Fingerprint-only Apply is refused.
 * Stores applied provenance on the winning media object. Never mutates inputs.
 */
export function applySourceQualityAdjustmentRecommendation(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  /** Required complete recommendation — fingerprints alone never authorize Apply. */
  readonly recommendation: SourceQualitySafeAdjustmentRecommendation | null | undefined;
  /** Optional concurrency guard; never substitutes for the recommendation object. */
  readonly expectedRecommendationFingerprint?: string | null;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SourceQualityAdjustmentCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!input.sourceQualityIntelligenceEnabled) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_CAPABILITY_OFF");
  }

  if (input.recommendation == null) {
    return failure(
      input.scene,
      mediaItemId,
      "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE",
    );
  }

  const media = resolveTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(
      input.scene,
      mediaItemId,
      "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE",
    );
  }

  const framing = resolveTargetFraming(input.scene, media, mediaItemId);
  const resolved = resolveCanonicalRecommendationForApply({
    media,
    framing,
    mediaItemId,
    recommendation: input.recommendation,
    expectedRecommendationFingerprint: input.expectedRecommendationFingerprint,
  });
  if (!resolved.ok) {
    return failure(input.scene, mediaItemId, resolved.terminalCode);
  }

  // Apply only the canonical validated patch and provenance values.
  const recommendation = resolved.recommendation;
  const framingPatch = proposalToFramingPatch(recommendation.proposedFramingPatch);
  if (
    framingPatch.fitMode === undefined &&
    framingPatch.zoom === undefined
  ) {
    return failure(
      input.scene,
      mediaItemId,
      "SOURCE_QUALITY_RECOMMENDATION_UNAVAILABLE",
    );
  }

  const previousFraming = toFramingSnapshot(framing);
  const projectedFraming = toFramingSnapshot(
    mergeSceneMediaFraming(framing, framingPatch),
  );
  const provenance: SourceQualityAdjustmentProvenance = Object.freeze({
    version: 1 as const,
    recommendationFingerprint: recommendation.recommendationFingerprint,
    mediaFingerprint: recommendation.mediaFingerprint,
    recommendationCodes: recommendation.recommendationCodes,
    previousFraming,
    appliedFraming: projectedFraming,
    mediaItemId,
  });

  const nextScene = applyFramingAuthority(
    input.scene,
    mediaItemId,
    framingPatch,
    provenance,
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_FRAMING_UNAVAILABLE");
  }

  return success(nextScene, mediaItemId, provenance);
}

/**
 * Undo an applied recommendation when media + framing still match the recorded applied state.
 */
export function undoSourceQualityAdjustmentRecommendation(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SourceQualityAdjustmentCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!input.sourceQualityIntelligenceEnabled) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_CAPABILITY_OFF");
  }

  const media = resolveTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_UNDO_UNAVAILABLE");
  }

  const framing = resolveTargetFraming(input.scene, media, mediaItemId);
  const parsed = normalizeSourceQualityAdjustmentProvenance(
    media.sourceQualityAdjustmentProvenance,
  );
  if (!parsed) {
    return failure(
      input.scene,
      mediaItemId,
      media.sourceQualityAdjustmentProvenance != null
        ? "SOURCE_QUALITY_PROVENANCE_INVALID"
        : "SOURCE_QUALITY_UNDO_UNAVAILABLE",
    );
  }

  const staleness = evaluateSourceQualityAdjustmentStaleness({
    provenance: parsed,
    media,
    framing,
    mediaItemId,
  });
  if (!staleness.undoAllowed || !staleness.provenance) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_UNDO_UNAVAILABLE");
  }

  const restorePatch = snapshotToFramingPatch(staleness.provenance.previousFraming);
  const nextScene = applyFramingAuthority(
    input.scene,
    mediaItemId,
    restorePatch,
    undefined,
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_FRAMING_UNAVAILABLE");
  }

  // Ensure provenance is absent after restore (applyFramingAuthority already cleared).
  const restoredMedia = resolveTargetMedia(
    nextScene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (restoredMedia?.sourceQualityAdjustmentProvenance) {
    const cleared = withoutProvenance(restoredMedia);
    if (mediaItemId) {
      if (input.mixedMediaScenesEnabled) {
        const items = readMixedMediaSequenceItems(nextScene).map((item) =>
          item.id === mediaItemId ? { ...item, media: cleared } : { ...item },
        );
        return success(
          writeMixedMediaSequenceItems(nextScene, items, {
            mixedMediaScenesEnabled: true,
          }).scene,
          mediaItemId,
          undefined,
        );
      }
      return success(
        updateSceneMediaItemMedia(nextScene, mediaItemId, cleared).scene,
        mediaItemId,
        undefined,
      );
    }
    return success({ ...nextScene, media: cleared }, mediaItemId, undefined);
  }

  return success(nextScene, mediaItemId, undefined);
}

/**
 * Non-destructive dismiss: remove invalid/stale (or any) provenance without changing framing.
 */
export function dismissSourceQualityAdjustmentProvenance(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SourceQualityAdjustmentCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!input.sourceQualityIntelligenceEnabled) {
    return failure(input.scene, mediaItemId, "SOURCE_QUALITY_CAPABILITY_OFF");
  }

  const media = resolveRawTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(
      input.scene,
      mediaItemId,
      "SOURCE_QUALITY_PROVENANCE_INVALID",
    );
  }

  if (!("sourceQualityAdjustmentProvenance" in media) ||
    media.sourceQualityAdjustmentProvenance == null) {
    return failure(
      input.scene,
      mediaItemId,
      "SOURCE_QUALITY_PROVENANCE_INVALID",
    );
  }

  const cleared = withoutProvenance(media);
  if (mediaItemId) {
    if (input.mixedMediaScenesEnabled && input.scene.visualSequence?.items) {
      const sequenceItems = input.scene.visualSequence.items.map((item) =>
        item.id === mediaItemId ? { ...item, media: cleared } : { ...item },
      );
      if (!sequenceItems.some((item) => item.id === mediaItemId)) {
        return failure(
          input.scene,
          mediaItemId,
          "SOURCE_QUALITY_MEDIA_ITEM_MISMATCH",
        );
      }
      return success(
        writeMixedMediaSequenceItems(input.scene, sequenceItems, {
          mixedMediaScenesEnabled: true,
        }).scene,
        mediaItemId,
        undefined,
      );
    }
    return success(
      updateSceneMediaItemMedia(input.scene, mediaItemId, cleared).scene,
      mediaItemId,
      undefined,
    );
  }

  return success(
    {
      ...input.scene,
      media: cleared,
    },
    mediaItemId,
    undefined,
  );
}
