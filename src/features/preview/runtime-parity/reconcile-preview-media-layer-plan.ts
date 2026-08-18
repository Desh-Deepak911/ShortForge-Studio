/**
 * Drops retired Preview layers after scene mutations.
 * Reuses planPreviewMediaLayers + scene-media windows. No second timing engine.
 */

import {
  resolveActiveSceneMediaRenderView,
  resolvePreviewSceneMediaWindows,
} from "@/features/scene-media-timeline";
import {
  buildPreviewMediaLayerStableKey,
  planPreviewMediaLayers,
  type PlanPreviewMediaLayersInput,
  type PreviewMediaLayerPlan,
} from "@/features/scene-media-transitions/preview";
import type { FootieScene } from "@/features/story/types";

import {
  resolvePreviewMediaLayerIdentity,
  resolvePreviewMediaSourceIdentity,
} from "./resolve-preview-media-layer-identity";

export function collectAuthoritativePreviewMediaIdentities(
  scene: FootieScene,
  options?: { readonly mixedMediaScenesEnabled?: boolean },
): {
  readonly itemIds: ReadonlySet<string>;
  readonly sources: ReadonlySet<string>;
} {
  const windows = resolvePreviewSceneMediaWindows(scene, {
    mixedMediaScenesEnabled: options?.mixedMediaScenesEnabled === true,
  });
  const itemIds = new Set<string>();
  const sources = new Set<string>();
  for (const window of windows) {
    itemIds.add(window.itemId);
    const source = resolvePreviewMediaSourceIdentity(window.media.url);
    if (source) {
      sources.add(source);
    }
  }
  return { itemIds, sources };
}

export function reconcilePreviewMediaLayerPlan(
  plan: PreviewMediaLayerPlan,
  scene: FootieScene,
  options: Pick<PlanPreviewMediaLayersInput, "sceneElapsedMs" | "isPlaying" | "mixedMediaScenesEnabled">,
): PreviewMediaLayerPlan {
  const { itemIds, sources } = collectAuthoritativePreviewMediaIdentities(scene, {
    mixedMediaScenesEnabled: options.mixedMediaScenesEnabled === true,
  });
  const primaryIdentity = resolvePreviewMediaLayerIdentity({
    sceneId: scene.id,
    role: "primary",
    view: plan.primary.view,
    authoritativeItemIds: itemIds,
    authoritativeSources: sources,
  });

  const outgoingIdentity = plan.outgoing
    ? resolvePreviewMediaLayerIdentity({
        sceneId: scene.id,
        role: "outgoing",
        view: plan.outgoing.view,
        authoritativeItemIds: itemIds,
        authoritativeSources: sources,
      })
    : null;

  const outgoingCurrent = outgoingIdentity?.authority === "current" ? plan.outgoing : null;

  if (primaryIdentity.authority === "current") {
    return {
      ...plan,
      outgoing: outgoingCurrent,
      intraScene: outgoingCurrent ? plan.intraScene : null,
    };
  }

  const fallback = resolveActiveSceneMediaRenderView(scene, options.sceneElapsedMs, {
    mixedMediaScenesEnabled: options.mixedMediaScenesEnabled === true,
  });
  return {
    primary: {
      role: "primary",
      view: fallback,
      stableKey: buildPreviewMediaLayerStableKey("primary", fallback.mediaItemId),
      style: undefined,
      isPlaying: options.isPlaying,
      isActive: true,
      allowFramingDrag: fallback.itemIndex === 0,
    },
    outgoing: null,
    intraScene: null,
  };
}

export function planReconciledPreviewMediaLayers(
  input: PlanPreviewMediaLayersInput,
): PreviewMediaLayerPlan {
  return reconcilePreviewMediaLayerPlan(
    planPreviewMediaLayers(input),
    input.scene,
    input,
  );
}
