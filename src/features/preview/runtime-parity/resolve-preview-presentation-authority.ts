/**
 * Models Preview presentation authority.
 * Playback follows the shared timeline. Idle inspection may name a different
 * valid item without changing persisted timing.
 */

import { resolveActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import { planPreviewMediaLayers } from "@/features/scene-media-transitions/preview";
import type { FootieScene } from "@/features/story/types";
import { getSceneDurationMs } from "@/features/story/utils/scene.utils";

import type {
  PreviewPlaybackAuthorityKind,
  PreviewRuntimeParityPresentationState,
} from "./preview-runtime-parity-states";
import {
  emptyPreviewMediaIdentity,
  previewMediaIdentityFromView,
} from "./resolve-preview-media-identity";
import { resolvePreviewSelectedMediaInspection } from "./resolve-preview-selected-media-inspection";

export interface ResolvePreviewPresentationAuthorityInput {
  readonly scene: FootieScene;
  readonly sceneElapsedMs: number;
  readonly isPlaying: boolean;
  readonly selectedMediaItemId?: string | null;
  readonly selectedSceneId?: string | null;
  readonly mediaItemSelectionActive?: boolean;
  readonly removedMediaIds?: readonly string[];
  readonly removedMediaUrls?: readonly string[];
  readonly trimScrubActive?: boolean;
  readonly brandStingActive?: boolean;
  readonly interSceneTransitionActive?: boolean;
  readonly captionEditMode?: boolean;
  readonly framingEditMode?: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
  readonly inspectionOffsetMs?: number | null;
  readonly clockKind?: PreviewRuntimeParityPresentationState["clock"]["kind"];
  readonly timelineMs?: number;
}

export function resolvePreviewPresentationAuthority(
  input: ResolvePreviewPresentationAuthorityInput,
): PreviewRuntimeParityPresentationState {
  const mixedMediaScenesEnabled = input.mixedMediaScenesEnabled === true;
  const sceneDurationMs = getSceneDurationMs(input.scene);
  const sceneElapsedMs =
    typeof input.sceneElapsedMs === "number" && Number.isFinite(input.sceneElapsedMs)
      ? Math.max(0, input.sceneElapsedMs)
      : 0;
  const plan = planPreviewMediaLayers({
    scene: input.scene,
    sceneElapsedMs,
    isPlaying: input.isPlaying,
    mixedMediaScenesEnabled,
  });
  const timelineView = resolveActiveSceneMediaRenderView(input.scene, sceneElapsedMs, {
    mixedMediaScenesEnabled,
  });
  const inspection = resolvePreviewSelectedMediaInspection({
    scene: input.scene,
    selectedSceneId: input.selectedSceneId,
    selectedMediaItemId: input.selectedMediaItemId,
    mediaItemSelectionActive: input.mediaItemSelectionActive,
    sceneElapsedMs,
    isPlaying: input.isPlaying,
    trimScrubActive: input.trimScrubActive,
    brandStingActive: input.brandStingActive,
    interSceneTransitionActive: input.interSceneTransitionActive,
    mixedMediaScenesEnabled,
    inspectionOffsetMs: input.inspectionOffsetMs,
  });
  const inspectionMedia = inspection.selectedMediaItemId
    ? previewMediaIdentityFromView(inspection.view)
    : emptyPreviewMediaIdentity();
  const playbackMedia = previewMediaIdentityFromView(plan.primary.view);
  const outgoingTransitionMedia = plan.outgoing
    ? previewMediaIdentityFromView(plan.outgoing.view)
    : null;

  const trimScrubActive = input.trimScrubActive === true;
  const isPlaying = input.isPlaying === true;

  let playbackAuthority: PreviewPlaybackAuthorityKind = "canonical-timeline";
  if (trimScrubActive) {
    playbackAuthority = "trim-scrub";
  } else if (inspection.active) {
    playbackAuthority = "inspection";
  } else if (!timelineView.media && !plan.primary.view.media) {
    playbackAuthority = "none";
  } else if (isPlaying) {
    playbackAuthority = "canonical-timeline";
  }

  const clockKind =
    input.clockKind ??
    (trimScrubActive
      ? "trim-scrub"
      : isPlaying
        ? "playing"
        : sceneDurationMs > 0 && sceneElapsedMs >= sceneDurationMs
          ? "completed-scene"
          : "idle");

  return {
    playbackAuthority,
    clock: {
      kind: clockKind,
      timelineMs: input.timelineMs ?? sceneElapsedMs,
      sceneElapsedMs,
      sceneId: input.scene.id,
      holdingFinalFrame: timelineView.holdingFinalFrame,
    },
    playbackMedia,
    inspectionMedia,
    outgoingTransitionMedia,
    removedMediaIds: input.removedMediaIds ?? [],
    removedMediaUrls: input.removedMediaUrls ?? [],
    captionEditMode: input.captionEditMode === true,
    framingEditMode: input.framingEditMode === true,
    trimScrubActive,
  };
}

/**
 * Production Preview presentation: idle inspection becomes the presented media.
 * Playback and trim-scrub stay on the canonical timeline.
 */
export function resolveCurrentPreviewPlaybackPresentation(
  input: ResolvePreviewPresentationAuthorityInput,
): PreviewRuntimeParityPresentationState {
  const desired = resolvePreviewPresentationAuthority(input);
  if (desired.playbackAuthority === "inspection" && desired.inspectionMedia.mediaItemId) {
    return {
      ...desired,
      playbackMedia: desired.inspectionMedia,
    };
  }
  return {
    ...desired,
    playbackAuthority: input.trimScrubActive
      ? "trim-scrub"
      : "canonical-timeline",
  };
}
