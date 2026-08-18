/**
 * Resolves idle selected-media inspection for Studio Preview.
 * Uses the existing scene-media window authority. Does not invent a clock.
 * Inspection time is never persisted to the story.
 */

import {
  resolvePreviewSceneMediaWindows,
  resolveSceneMediaItemRenderView,
  type ActiveSceneMediaRenderView,
} from "@/features/scene-media-timeline";
import {
  buildPreviewMediaLayerStableKey,
  type PreviewMediaLayerPlan,
} from "@/features/scene-media-transitions/preview";
import type { FootieScene } from "@/features/story/types";

import type { PreviewPlaybackAuthorityKind } from "./preview-runtime-parity-states";

export const PREVIEW_SELECTED_MEDIA_INSPECTION_INACTIVE_REASONS = [
  "no-scene",
  "no-selected-item",
  "item-not-in-selected-scene",
  "transition-selection",
  "playback-active",
  "trim-scrub-active",
  "brand-sting-active",
  "inter-scene-transition-active",
  "empty-or-invalid-item",
] as const;

export type PreviewSelectedMediaInspectionInactiveReason =
  (typeof PREVIEW_SELECTED_MEDIA_INSPECTION_INACTIVE_REASONS)[number];

export type PreviewSelectedMediaInspectionActiveReason = "selected-media-item";

export type PreviewSelectedMediaInspectionReason =
  | PreviewSelectedMediaInspectionActiveReason
  | PreviewSelectedMediaInspectionInactiveReason;

export interface ResolvePreviewSelectedMediaInspectionInput {
  readonly scene?: FootieScene | null;
  readonly selectedSceneId?: string | null;
  readonly selectedMediaItemId?: string | null;
  /** False when a transition (or the scene itself) is the selection focus. */
  readonly mediaItemSelectionActive?: boolean;
  readonly sceneElapsedMs?: number;
  readonly isPlaying?: boolean;
  readonly isSpeaking?: boolean;
  readonly trimScrubActive?: boolean;
  readonly brandStingActive?: boolean;
  readonly interSceneTransitionActive?: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
  /** Optional item-local offset; clamped inside the selected window. Never persisted. */
  readonly inspectionOffsetMs?: number | null;
}

export interface PreviewSelectedMediaInspection {
  readonly active: boolean;
  readonly reason: PreviewSelectedMediaInspectionReason;
  readonly selectedSceneId: string | null;
  readonly selectedMediaItemId: string | null;
  readonly itemIndex: number;
  readonly itemCount: number;
  readonly windowStartMs: number | null;
  readonly windowEndMs: number | null;
  readonly windowDurationMs: number | null;
  readonly inspectionSceneElapsedMs: number;
  readonly inspectionItemElapsedMs: number;
  readonly view: ActiveSceneMediaRenderView | null;
  readonly layerPlan: PreviewMediaLayerPlan | null;
  readonly presentationAuthority: PreviewPlaybackAuthorityKind;
}

function trimId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function inactive(
  reason: PreviewSelectedMediaInspectionInactiveReason,
  extras: Partial<PreviewSelectedMediaInspection> = {},
): PreviewSelectedMediaInspection {
  return {
    active: false,
    reason,
    selectedSceneId: extras.selectedSceneId ?? null,
    selectedMediaItemId: extras.selectedMediaItemId ?? null,
    itemIndex: extras.itemIndex ?? -1,
    itemCount: extras.itemCount ?? 0,
    windowStartMs: extras.windowStartMs ?? null,
    windowEndMs: extras.windowEndMs ?? null,
    windowDurationMs: extras.windowDurationMs ?? null,
    inspectionSceneElapsedMs: extras.inspectionSceneElapsedMs ?? 0,
    inspectionItemElapsedMs: extras.inspectionItemElapsedMs ?? 0,
    view: extras.view ?? null,
    layerPlan: extras.layerPlan ?? null,
    presentationAuthority:
      extras.presentationAuthority ??
      (reason === "trim-scrub-active" ? "trim-scrub" : "canonical-timeline"),
  };
}

export function planInspectedPreviewMediaLayer(
  view: ActiveSceneMediaRenderView,
): PreviewMediaLayerPlan {
  return {
    primary: {
      role: "primary",
      view,
      stableKey: buildPreviewMediaLayerStableKey("primary", view.mediaItemId),
      style: undefined,
      isPlaying: false,
      isActive: true,
      allowFramingDrag: false,
    },
    outgoing: null,
    intraScene: null,
  };
}

/**
 * One adapter for selected-scene/item identity, canonical window, inspection
 * times, presentation authority, and the reason inspection is active or not.
 */
export function resolvePreviewSelectedMediaInspection(
  input: ResolvePreviewSelectedMediaInspectionInput,
): PreviewSelectedMediaInspection {
  const scene = input.scene ?? null;
  const selectedSceneId = trimId(input.selectedSceneId) ?? scene?.id ?? null;
  const selectedMediaItemId = trimId(input.selectedMediaItemId);
  const mixedMediaScenesEnabled = input.mixedMediaScenesEnabled === true;
  const sceneElapsedMs =
    typeof input.sceneElapsedMs === "number" && Number.isFinite(input.sceneElapsedMs)
      ? Math.max(0, input.sceneElapsedMs)
      : 0;

  if (!scene) {
    return inactive("no-scene", { selectedSceneId, selectedMediaItemId });
  }

  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled,
  });
  const itemCount = windows.length;

  if (input.mediaItemSelectionActive === false) {
    return inactive(
      selectedMediaItemId ? "transition-selection" : "no-selected-item",
      { selectedSceneId, selectedMediaItemId, itemCount },
    );
  }

  if (!selectedMediaItemId) {
    return inactive("no-selected-item", { selectedSceneId, itemCount });
  }

  if (selectedSceneId && scene.id !== selectedSceneId) {
    return inactive("item-not-in-selected-scene", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
    });
  }

  if (input.isPlaying === true || input.isSpeaking === true) {
    return inactive("playback-active", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
      inspectionSceneElapsedMs: sceneElapsedMs,
    });
  }

  if (input.trimScrubActive === true) {
    return inactive("trim-scrub-active", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
      inspectionSceneElapsedMs: sceneElapsedMs,
    });
  }

  if (input.brandStingActive === true) {
    return inactive("brand-sting-active", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
    });
  }

  if (input.interSceneTransitionActive === true) {
    return inactive("inter-scene-transition-active", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
    });
  }

  const window = windows.find((entry) => entry.itemId === selectedMediaItemId);
  if (!window || window.durationMs <= 0) {
    return inactive("empty-or-invalid-item", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
      presentationAuthority: itemCount === 0 ? "none" : "canonical-timeline",
    });
  }

  const rawOffset = input.inspectionOffsetMs;
  const safeOffset =
    typeof rawOffset === "number" && Number.isFinite(rawOffset) ? rawOffset : 0;
  const inspectionItemElapsedMs = Math.min(
    Math.max(0, safeOffset),
    Math.max(0, window.durationMs),
  );
  const view = resolveSceneMediaItemRenderView(
    scene,
    selectedMediaItemId,
    inspectionItemElapsedMs,
    { mixedMediaScenesEnabled },
  );
  if (!view || view.mediaItemId !== selectedMediaItemId) {
    return inactive("empty-or-invalid-item", {
      selectedSceneId,
      selectedMediaItemId,
      itemCount,
      windowStartMs: window.startMs,
      windowEndMs: window.endMs,
      windowDurationMs: window.durationMs,
    });
  }

  return {
    active: true,
    reason: "selected-media-item",
    selectedSceneId: scene.id,
    selectedMediaItemId,
    itemIndex: view.itemIndex,
    itemCount,
    windowStartMs: window.startMs,
    windowEndMs: window.endMs,
    windowDurationMs: window.durationMs,
    inspectionSceneElapsedMs: window.startMs + inspectionItemElapsedMs,
    inspectionItemElapsedMs,
    view,
    layerPlan: planInspectedPreviewMediaLayer(view),
    presentationAuthority: "inspection",
  };
}
