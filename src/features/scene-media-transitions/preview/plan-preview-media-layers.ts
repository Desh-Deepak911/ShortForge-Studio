/**
 * Pure Preview media layer plan (Sprint 9B.1).
 * Stable primary (active/incoming) + optional outgoing overlay during intra-scene transitions.
 * Does not import Export or read environment variables.
 */

import {
  resolveActiveSceneMediaRenderView,
  type ActiveSceneMediaRenderView,
  type ResolveActiveSceneMediaRenderViewOptions,
} from "@/features/scene-media-timeline";
import type { FootieScene, TransitionEffect } from "@/features/story/types";
import type { TransitionPreviewLayerStyle } from "@/features/timeline-intelligence/resolve-transition-state.utils";

import {
  composeIntraSceneTransitionPreview,
  resolveIntraSceneTransitionProgressCheckpoint,
  type IntraSceneTransitionPreviewComposition,
} from "./compose-intra-scene-transition-preview";

export type PreviewMediaLayerRole = "primary" | "outgoing";

export interface PreviewMediaLayerDescriptor {
  readonly role: PreviewMediaLayerRole;
  readonly view: ActiveSceneMediaRenderView;
  /** Collision-safe React key — role-prefixed JSON serialization of item id. */
  readonly stableKey: string;
  readonly style: TransitionPreviewLayerStyle | undefined;
  readonly isPlaying: boolean;
  readonly isActive: boolean;
  readonly allowFramingDrag: boolean;
}

export interface IntraSceneTransitionLayerDiagnostics {
  readonly active: true;
  readonly fromMediaItemId: string;
  readonly toMediaItemId: string;
  readonly effect: TransitionEffect;
  readonly progress: number;
  readonly checkpoint: "start" | "mid" | "late";
  readonly overlayStartMs: number;
  readonly overlayEndMs: number;
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
}

export interface PreviewMediaLayerPlan {
  readonly primary: PreviewMediaLayerDescriptor;
  /** Present only while an intra-scene transition overlay is active. */
  readonly outgoing: PreviewMediaLayerDescriptor | null;
  readonly intraScene: IntraSceneTransitionLayerDiagnostics | null;
}

/**
 * Collision-safe layer key. Role prefix + JSON string of item id
 * (safe for punctuation, NUL, pipes, colons, Unicode).
 */
export function buildPreviewMediaLayerStableKey(
  role: PreviewMediaLayerRole,
  mediaItemId: string | null | undefined,
): string {
  const id =
    typeof mediaItemId === "string" && mediaItemId.length > 0 ? mediaItemId : "";
  return `${role}:${JSON.stringify(id)}`;
}

export interface PlanPreviewMediaLayersInput {
  readonly scene: FootieScene;
  readonly sceneElapsedMs: number;
  readonly isPlaying: boolean;
  readonly multiImageScenesEnabled?: boolean;
  /** Explicit mixed-media scenes capability. Default false (fail-closed). */
  readonly mixedMediaScenesEnabled?: boolean;
}

/**
 * Plans ordinary + intra-scene Preview layers with key continuity:
 * - Before boundary: primary = active (outgoing) item
 * - During overlay: primary = incoming; outgoing overlay = final-frame peer
 * - After overlay: primary remains the same incoming item id/key
 */
export function planPreviewMediaLayers(
  input: PlanPreviewMediaLayersInput,
): PreviewMediaLayerPlan {
  const options: ResolveActiveSceneMediaRenderViewOptions = {
    multiImageScenesEnabled: input.multiImageScenesEnabled !== false,
    mixedMediaScenesEnabled: input.mixedMediaScenesEnabled === true,
  };

  const ordinaryView = resolveActiveSceneMediaRenderView(
    input.scene,
    input.sceneElapsedMs,
    options,
  );

  const composition = composeIntraSceneTransitionPreview(
    input.scene,
    input.sceneElapsedMs,
    options,
  );

  if (composition) {
    return planDuringIntraSceneTransition(composition, input.isPlaying);
  }

  const multiEnabled = options.multiImageScenesEnabled !== false;
  return {
    primary: {
      role: "primary",
      view: ordinaryView,
      stableKey: buildPreviewMediaLayerStableKey("primary", ordinaryView.mediaItemId),
      style: undefined,
      isPlaying: input.isPlaying,
      isActive: true,
      allowFramingDrag: !multiEnabled || ordinaryView.itemIndex === 0,
    },
    outgoing: null,
    intraScene: null,
  };
}

function planDuringIntraSceneTransition(
  composition: IntraSceneTransitionPreviewComposition,
  isPlaying: boolean,
): PreviewMediaLayerPlan {
  return {
    primary: {
      role: "primary",
      view: composition.toView,
      stableKey: buildPreviewMediaLayerStableKey(
        "primary",
        composition.toMediaItemId,
      ),
      style: composition.layerStyles.to,
      isPlaying,
      isActive: true,
      allowFramingDrag: false,
    },
    outgoing: {
      role: "outgoing",
      view: composition.fromView,
      stableKey: buildPreviewMediaLayerStableKey(
        "outgoing",
        composition.fromMediaItemId,
      ),
      style: composition.layerStyles.from,
      isPlaying,
      isActive: true,
      allowFramingDrag: false,
    },
    intraScene: {
      active: true,
      fromMediaItemId: composition.fromMediaItemId,
      toMediaItemId: composition.toMediaItemId,
      effect: composition.effect,
      progress: composition.progress,
      checkpoint: resolveIntraSceneTransitionProgressCheckpoint(composition.progress),
      overlayStartMs: composition.overlayStartMs,
      overlayEndMs: composition.overlayEndMs,
      requestedDurationMs: composition.requestedDurationMs,
      effectiveDurationMs: composition.effectiveDurationMs,
    },
  };
}
