/**
 * Immutable set/clear/apply/undo/keep commands for subject-aware framing.
 * Reuses media-framing write authority; metadata alone never changes framing.
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
import type {
  SceneMediaSubjectAwareFramingProvenance,
  SceneMediaSubjectFocus,
} from "@/features/story/types/subject-focus.types";
import {
  normalizeSceneMediaSubjectAwareFramingProvenance,
  normalizeSceneMediaSubjectFocus,
} from "@/features/story/types/subject-focus.types";
import { getSceneMedia } from "@/features/story/utils/scene.utils";

import { evaluateSubjectFramingStaleness } from "../domain/evaluate-subject-framing-staleness";
import {
  buildSubjectFocusFramingSuggestion,
  subjectFocusSuggestionsSemanticallyEqual,
  type SubjectFocusFramingSuggestion,
} from "../domain/subject-focus-framing-suggestion";
import { toStoryFramingSnapshot } from "../domain/subject-focus";

function isSubjectAwareCapabilityEnabled(value: unknown): boolean {
  return value === true;
}

export type SubjectAwareFramingTerminalCode =
  | "SUBJECT_AWARE_CAPABILITY_OFF"
  | "SUBJECT_AWARE_FOCUS_UNAVAILABLE"
  | "SUBJECT_AWARE_FOCUS_INVALID"
  | "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE"
  | "SUBJECT_AWARE_SUGGESTION_STALE"
  | "SUBJECT_AWARE_SUGGESTION_INVALID"
  | "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH"
  | "SUBJECT_AWARE_UNDO_UNAVAILABLE"
  | "SUBJECT_AWARE_PROVENANCE_INVALID"
  | "SUBJECT_AWARE_FRAMING_UNAVAILABLE";

export type SubjectAwareFramingCommandSuccess = {
  readonly ok: true;
  readonly scene: FootieScene;
  readonly mediaItemId: string | null;
  readonly provenance: SceneMediaSubjectAwareFramingProvenance | undefined;
  readonly subjectFocus: SceneMediaSubjectFocus | undefined;
};

export type SubjectAwareFramingCommandFailure = {
  readonly ok: false;
  readonly scene: FootieScene;
  readonly mediaItemId: string | null;
  readonly terminalCode: SubjectAwareFramingTerminalCode;
};

export type SubjectAwareFramingCommandResult =
  | SubjectAwareFramingCommandSuccess
  | SubjectAwareFramingCommandFailure;

function normalizeMediaItemId(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failure(
  scene: FootieScene,
  mediaItemId: string | null,
  terminalCode: SubjectAwareFramingTerminalCode,
): SubjectAwareFramingCommandFailure {
  return { ok: false, scene, mediaItemId, terminalCode };
}

function success(
  scene: FootieScene,
  mediaItemId: string | null,
  provenance: SceneMediaSubjectAwareFramingProvenance | undefined,
  subjectFocus: SceneMediaSubjectFocus | undefined,
): SubjectAwareFramingCommandSuccess {
  return { ok: true, scene, mediaItemId, provenance, subjectFocus };
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

function snapshotToFramingPatch(
  snapshot: SceneMediaSubjectAwareFramingProvenance["previousFraming"],
): SceneMediaFramingPatch {
  return {
    fitMode: snapshot.fitMode,
    positionX: snapshot.positionX,
    positionY: snapshot.positionY,
    zoom: snapshot.zoom,
    rotationDeg: snapshot.rotationDeg,
  };
}

function withSubjectMetadata(
  media: SceneMedia,
  options: {
    readonly subjectFocus?: SceneMediaSubjectFocus | undefined;
    readonly clearSubjectFocus?: boolean;
    readonly provenance?: SceneMediaSubjectAwareFramingProvenance | undefined;
    readonly clearProvenance?: boolean;
  },
): SceneMedia {
  const next: SceneMedia = { ...media };
  if (options.clearSubjectFocus) {
    delete next.subjectFocus;
  } else if (options.subjectFocus) {
    next.subjectFocus = options.subjectFocus;
  }
  if (options.clearProvenance) {
    delete next.subjectAwareFramingProvenance;
  } else if (options.provenance) {
    next.subjectAwareFramingProvenance = options.provenance;
  }
  return next;
}

function writeMediaAuthority(
  scene: FootieScene,
  mediaItemId: string | null,
  nextMedia: SceneMedia,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  if (mediaItemId) {
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

  // Single-media: preserve image/media dual-write seam for framing via patch helpers
  // when framing changes; for metadata-only, write media (and keep image when present).
  if (scene.image && nextMedia.type === "image") {
    return {
      ...scene,
      media: nextMedia,
      image: scene.image,
    };
  }
  return {
    ...scene,
    media: nextMedia,
  };
}

function applyFramingToSingleMediaScene(
  scene: FootieScene,
  framingPatch: SceneMediaFramingPatch,
  mediaUpdater: (media: SceneMedia) => SceneMedia,
): FootieScene | null {
  const result = buildMediaFramingPatch(scene, framingPatch);
  if (!result?.media) {
    return null;
  }
  const media = mediaUpdater(result.media);
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
  mediaUpdater: (media: SceneMedia) => SceneMedia,
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
  const nextMedia = mediaUpdater(framed.media);

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
  mediaUpdater: (media: SceneMedia) => SceneMedia,
  mixedMediaScenesEnabled: boolean,
): FootieScene | null {
  if (mediaItemId) {
    return applyFramingToTimelineItem(
      scene,
      mediaItemId,
      framingPatch,
      mediaUpdater,
      mixedMediaScenesEnabled,
    );
  }
  return applyFramingToSingleMediaScene(scene, framingPatch, mediaUpdater);
}

function isCompleteSuggestionShape(
  value: unknown,
): value is SubjectFocusFramingSuggestion {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.available === "boolean" &&
    typeof record.recommendationFingerprint === "string" &&
    record.recommendationFingerprint.trim().length > 0 &&
    typeof record.mediaFingerprint === "string" &&
    record.mediaFingerprint.trim().length > 0 &&
    typeof record.focusFingerprint === "string" &&
    record.focusFingerprint.trim().length > 0 &&
    typeof record.generatorVersion === "number" &&
    Number.isFinite(record.generatorVersion) &&
    record.proposedFramingPatch != null &&
    typeof record.proposedFramingPatch === "object" &&
    record.currentFraming != null &&
    typeof record.currentFraming === "object" &&
    record.projectedFraming != null &&
    typeof record.projectedFraming === "object" &&
    (record.mediaItemId === null ||
      (typeof record.mediaItemId === "string" &&
        record.mediaItemId.trim().length > 0))
  );
}

/**
 * Validate an untrusted supplied suggestion against the canonical recomputation.
 * Apply always executes the canonical patch/provenance — never caller-altered fields.
 */
function resolveCanonicalSuggestionForApply(input: {
  readonly media: SceneMedia;
  readonly framing: ReturnType<typeof resolveSceneMediaFraming>;
  readonly mediaItemId: string | null;
  readonly suggestion: unknown;
  readonly expectedRecommendationFingerprint?: string | null;
}):
  | { readonly ok: true; readonly suggestion: SubjectFocusFramingSuggestion }
  | { readonly ok: false; readonly terminalCode: SubjectAwareFramingTerminalCode } {
  if (input.suggestion == null) {
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE" };
  }
  if (!isCompleteSuggestionShape(input.suggestion)) {
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_INVALID" };
  }

  const provided = input.suggestion;
  const canonical = buildSubjectFocusFramingSuggestion({
    media: input.media,
    mediaItemId: input.mediaItemId,
    sourceWidth: input.media.width,
    sourceHeight: input.media.height,
    currentFraming: input.framing,
    subjectFocus: input.media.subjectFocus,
  });

  if (normalizeMediaItemId(provided.mediaItemId) !== input.mediaItemId) {
    return { ok: false, terminalCode: "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH" };
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
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_STALE" };
  }

  if (!canonical.available) {
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE" };
  }

  if (
    provided.recommendationFingerprint !== canonical.recommendationFingerprint
  ) {
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_STALE" };
  }

  if (!subjectFocusSuggestionsSemanticallyEqual(provided, canonical)) {
    // Fingerprint matched or was copied while execution fields were forged.
    return { ok: false, terminalCode: "SUBJECT_AWARE_SUGGESTION_INVALID" };
  }

  return { ok: true, suggestion: canonical };
}

function proposalToFramingPatch(
  proposal: SubjectFocusFramingSuggestion["proposedFramingPatch"],
): SceneMediaFramingPatch {
  return {
    ...(proposal.fitMode === "fit" || proposal.fitMode === "fill"
      ? { fitMode: proposal.fitMode }
      : {}),
    ...(typeof proposal.positionX === "number" &&
    Number.isFinite(proposal.positionX)
      ? { positionX: proposal.positionX }
      : {}),
    ...(typeof proposal.positionY === "number" &&
    Number.isFinite(proposal.positionY)
      ? { positionY: proposal.positionY }
      : {}),
    ...(typeof proposal.zoom === "number" && Number.isFinite(proposal.zoom)
      ? { zoom: proposal.zoom }
      : {}),
  };
}

/** Write manual/metadata subject focus without changing framing. */
export function setSubjectFocus(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly subjectFocus: unknown;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SubjectAwareFramingCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!isSubjectAwareCapabilityEnabled(input.subjectAwareReframingEnabled)) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_CAPABILITY_OFF");
  }

  const focus = normalizeSceneMediaSubjectFocus(input.subjectFocus);
  if (!focus) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FOCUS_INVALID");
  }

  const media = resolveRawTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FOCUS_UNAVAILABLE");
  }

  const nextMedia = withSubjectMetadata(media, {
    subjectFocus: focus,
    clearProvenance: true,
  });
  const nextScene = writeMediaAuthority(
    input.scene,
    mediaItemId,
    nextMedia,
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH");
  }
  return success(nextScene, mediaItemId, undefined, focus);
}

/** Clear subject focus (+ pending provenance) without changing framing. */
export function clearSubjectFocus(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SubjectAwareFramingCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!isSubjectAwareCapabilityEnabled(input.subjectAwareReframingEnabled)) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_CAPABILITY_OFF");
  }

  const media = resolveRawTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FOCUS_UNAVAILABLE");
  }

  if (media.subjectFocus == null && media.subjectAwareFramingProvenance == null) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FOCUS_UNAVAILABLE");
  }

  const nextMedia = withSubjectMetadata(media, {
    clearSubjectFocus: true,
    clearProvenance: true,
  });
  const nextScene = writeMediaAuthority(
    input.scene,
    mediaItemId,
    nextMedia,
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH");
  }
  return success(nextScene, mediaItemId, undefined, undefined);
}

/**
 * Apply a subject-aware suggestion through ordinary framing + write provenance.
 * Requires a complete suggestion object. Fingerprint-only Apply is refused.
 * Always executes the canonical recomputed patch/provenance — never forged fields.
 */
export function applySubjectAwareFramingSuggestion(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly suggestion: SubjectFocusFramingSuggestion | null | undefined;
  readonly expectedRecommendationFingerprint?: string | null;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SubjectAwareFramingCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!isSubjectAwareCapabilityEnabled(input.subjectAwareReframingEnabled)) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_CAPABILITY_OFF");
  }
  if (input.suggestion == null) {
    return failure(
      input.scene,
      mediaItemId,
      "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE",
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
      "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE",
    );
  }

  const framing = resolveTargetFraming(input.scene, media, mediaItemId);
  const resolved = resolveCanonicalSuggestionForApply({
    media,
    framing,
    mediaItemId,
    suggestion: input.suggestion,
    expectedRecommendationFingerprint: input.expectedRecommendationFingerprint,
  });
  if (!resolved.ok) {
    return failure(input.scene, mediaItemId, resolved.terminalCode);
  }

  const canonical = resolved.suggestion;
  const framingPatch = proposalToFramingPatch(canonical.proposedFramingPatch);
  if (
    framingPatch.fitMode === undefined &&
    framingPatch.positionX === undefined &&
    framingPatch.positionY === undefined &&
    framingPatch.zoom === undefined
  ) {
    return failure(
      input.scene,
      mediaItemId,
      "SUBJECT_AWARE_SUGGESTION_UNAVAILABLE",
    );
  }

  const previousFraming = toStoryFramingSnapshot(framing);
  const projectedFraming = toStoryFramingSnapshot(
    mergeSceneMediaFraming(framing, framingPatch),
  );
  const focus = normalizeSceneMediaSubjectFocus(media.subjectFocus);
  if (!focus) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FOCUS_INVALID");
  }

  const provenance: SceneMediaSubjectAwareFramingProvenance = Object.freeze({
    version: 1 as const,
    mediaFingerprint: canonical.mediaFingerprint,
    mediaItemId,
    focusFingerprint: canonical.focusFingerprint,
    recommendationFingerprint: canonical.recommendationFingerprint,
    generatorVersion: canonical.generatorVersion,
    previousFraming,
    appliedFraming: projectedFraming,
    subjectFocus: focus,
  });

  const nextScene = applyFramingAuthority(
    input.scene,
    mediaItemId,
    framingPatch,
    (framedMedia) =>
      withSubjectMetadata(framedMedia, {
        subjectFocus: focus,
        provenance,
      }),
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FRAMING_UNAVAILABLE");
  }

  return success(nextScene, mediaItemId, provenance, focus);
}

/** Undo applied subject-aware framing to the exact previous framing snapshot. */
export function undoSubjectAwareFraming(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SubjectAwareFramingCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!isSubjectAwareCapabilityEnabled(input.subjectAwareReframingEnabled)) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_CAPABILITY_OFF");
  }

  const media = resolveTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_UNDO_UNAVAILABLE");
  }

  const framing = resolveTargetFraming(input.scene, media, mediaItemId);
  const parsed = normalizeSceneMediaSubjectAwareFramingProvenance(
    media.subjectAwareFramingProvenance,
  );
  if (!parsed) {
    return failure(
      input.scene,
      mediaItemId,
      media.subjectAwareFramingProvenance != null
        ? "SUBJECT_AWARE_PROVENANCE_INVALID"
        : "SUBJECT_AWARE_UNDO_UNAVAILABLE",
    );
  }

  const staleness = evaluateSubjectFramingStaleness({
    provenance: parsed,
    media,
    framing,
    mediaItemId,
  });
  if (!staleness.undoAllowed || !staleness.provenance) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_UNDO_UNAVAILABLE");
  }

  const restorePatch = snapshotToFramingPatch(
    staleness.provenance.previousFraming,
  );
  const focus = media.subjectFocus;
  const nextScene = applyFramingAuthority(
    input.scene,
    mediaItemId,
    restorePatch,
    (framedMedia) =>
      withSubjectMetadata(framedMedia, {
        subjectFocus: focus,
        clearProvenance: true,
      }),
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_FRAMING_UNAVAILABLE");
  }

  return success(
    nextScene,
    mediaItemId,
    undefined,
    normalizeSceneMediaSubjectFocus(focus),
  );
}

/** Strip recommendation/provenance only — framing and focus stay. */
export function keepOrDismissSubjectAwareFraming(input: {
  readonly scene: FootieScene;
  readonly mediaItemId?: string | null;
  readonly subjectAwareReframingEnabled: boolean;
  readonly mixedMediaScenesEnabled: boolean;
}): SubjectAwareFramingCommandResult {
  const mediaItemId = normalizeMediaItemId(input.mediaItemId);
  if (!isSubjectAwareCapabilityEnabled(input.subjectAwareReframingEnabled)) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_CAPABILITY_OFF");
  }

  const media = resolveRawTargetMedia(
    input.scene,
    mediaItemId,
    input.mixedMediaScenesEnabled,
  );
  if (!media) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_PROVENANCE_INVALID");
  }

  if (media.subjectAwareFramingProvenance == null) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_PROVENANCE_INVALID");
  }

  // Keep/Dismiss strips subject recommendation provenance only — never SQ provenance.
  const nextMedia = withSubjectMetadata(media, {
    subjectFocus: media.subjectFocus,
    clearProvenance: true,
  });
  const nextScene = writeMediaAuthority(
    input.scene,
    mediaItemId,
    nextMedia,
    input.mixedMediaScenesEnabled,
  );
  if (!nextScene) {
    return failure(input.scene, mediaItemId, "SUBJECT_AWARE_MEDIA_ITEM_MISMATCH");
  }

  return success(
    nextScene,
    mediaItemId,
    undefined,
    normalizeSceneMediaSubjectFocus(media.subjectFocus),
  );
}
