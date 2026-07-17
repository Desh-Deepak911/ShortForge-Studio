/**
 * Preview composition adapter for intra-scene media transitions (Sprint 9B).
 * Head-of-incoming timing + shared effect mathematics.
 * Does not recalculate media windows, own effect math, or import Export.
 */

import {
  resolveSceneMediaItemRenderView,
  type ActiveSceneMediaRenderView,
  type ResolveActiveSceneMediaRenderViewOptions,
} from "@/features/scene-media-timeline";
import type { FootieScene, TransitionEffect } from "@/features/story/types";
import {
  resolveTransitionEffectLayers,
  transitionStateToPreviewLayerStyles,
  type TransitionPreviewLayerStyles,
} from "@/features/timeline-intelligence/resolve-transition-state.utils";

import { isSupportedIntraSceneTransitionEffect } from "../domain/effect-support";
import { resolveIntraSceneTransitionAtElapsed } from "../resolution/resolve-intra-scene-transition";

export interface IntraSceneTransitionPreviewComposition {
  readonly sceneId: string;
  readonly fromMediaItemId: string;
  readonly toMediaItemId: string;
  readonly effect: TransitionEffect;
  readonly progress: number;
  readonly overlayStartMs: number;
  readonly overlayEndMs: number;
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
  readonly fromView: ActiveSceneMediaRenderView;
  readonly toView: ActiveSceneMediaRenderView;
  readonly layerStyles: TransitionPreviewLayerStyles;
}

function isDrawableView(view: ActiveSceneMediaRenderView): boolean {
  const media = view.media;
  if (!media || media.type === "placeholder") {
    return false;
  }
  return typeof media.url === "string" && Boolean(media.url.trim());
}

/**
 * Pure Preview composition for an active intra-scene transition.
 * Returns null for Cut/absence, invalid peers, zero effective duration, or first-item-only mode.
 * Never remaps unknown effects to Fade — inactive/null instead.
 */
export function composeIntraSceneTransitionPreview(
  scene: FootieScene,
  sceneElapsedMs: number,
  options: ResolveActiveSceneMediaRenderViewOptions = {},
): IntraSceneTransitionPreviewComposition | null {
  if (options.multiImageScenesEnabled === false) {
    return null;
  }

  const resolved = resolveIntraSceneTransitionAtElapsed(scene, sceneElapsedMs);
  if (
    !resolved.active ||
    resolved.effect === "cut" ||
    resolved.effectiveDurationMs <= 0 ||
    !isSupportedIntraSceneTransitionEffect(resolved.effect)
  ) {
    return null;
  }

  const fromView = resolveSceneMediaItemRenderView(
    scene,
    resolved.fromItemId,
    resolved.outgoingItemLocalMs,
    options,
  );
  const toView = resolveSceneMediaItemRenderView(
    scene,
    resolved.toItemId,
    resolved.incomingItemLocalMs,
    options,
  );

  if (
    !fromView ||
    !toView ||
    fromView.mediaItemId !== resolved.fromItemId ||
    toView.mediaItemId !== resolved.toItemId ||
    !isDrawableView(fromView) ||
    !isDrawableView(toView)
  ) {
    return null;
  }

  // Shared scene-to-scene effect mathematics — vocabulary already validated above.
  const layers = resolveTransitionEffectLayers(resolved.effect, resolved.progress);
  const layerStyles = transitionStateToPreviewLayerStyles(resolved.effect, {
    opacityFrom: layers.opacityFrom,
    opacityTo: layers.opacityTo,
    transformFrom: layers.transformFrom,
    transformTo: layers.transformTo,
    progress: resolved.progress,
  });

  return {
    sceneId: resolved.sceneId,
    fromMediaItemId: resolved.fromItemId,
    toMediaItemId: resolved.toItemId,
    effect: resolved.effect,
    progress: resolved.progress,
    overlayStartMs: resolved.overlayStartMs,
    overlayEndMs: resolved.overlayEndMs,
    requestedDurationMs: resolved.requestedDurationMs,
    effectiveDurationMs: resolved.effectiveDurationMs,
    fromView,
    toView,
    layerStyles,
  };
}

/** Progress checkpoint for QA diagnostics (no URLs / private content). */
export function resolveIntraSceneTransitionProgressCheckpoint(
  progress: number,
): "start" | "mid" | "late" {
  if (progress <= 0) {
    return "start";
  }
  if (progress < 0.5) {
    return "mid";
  }
  return "late";
}
