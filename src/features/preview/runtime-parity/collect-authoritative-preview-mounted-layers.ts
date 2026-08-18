/**
 * Authoritative Preview mounted-layer inventory.
 * Derived from the existing media-layer plan plus the presentation model.
 * A removed id or URL must never appear.
 */

import { planPreviewMediaLayers } from "@/features/scene-media-transitions/preview";
import { planReconciledPreviewMediaLayers } from "@/features/preview/runtime-parity/reconcile-preview-media-layer-plan";
import type { FootieScene } from "@/features/story/types";

import type { PreviewRuntimeParityMediaIdentity } from "./preview-runtime-parity-states";
import { previewMediaIdentityFromView } from "./resolve-preview-media-identity";
import {
  resolvePreviewPresentationAuthority,
  type ResolvePreviewPresentationAuthorityInput,
} from "./resolve-preview-presentation-authority";

export interface AuthoritativePreviewMountedLayer {
  readonly role: "primary" | "outgoing" | "inspection";
  readonly identity: PreviewRuntimeParityMediaIdentity;
  readonly stableKey: string;
}

export interface AuthoritativePreviewMountedLayerInventory {
  readonly layers: readonly AuthoritativePreviewMountedLayer[];
  readonly mediaItemIds: readonly string[];
  readonly mediaUrls: readonly string[];
}

function layerKey(role: AuthoritativePreviewMountedLayer["role"], id: string | null): string {
  return `${role}:${JSON.stringify(id ?? "")}`;
}

function pushLayer(
  layers: AuthoritativePreviewMountedLayer[],
  role: AuthoritativePreviewMountedLayer["role"],
  identity: PreviewRuntimeParityMediaIdentity,
  removedIds: ReadonlySet<string>,
  removedUrls: ReadonlySet<string>,
): void {
  if (!identity.mediaItemId && !identity.mediaUrl) {
    return;
  }
  if (identity.mediaItemId && removedIds.has(identity.mediaItemId)) {
    return;
  }
  if (identity.mediaUrl && removedUrls.has(identity.mediaUrl)) {
    return;
  }
  layers.push({
    role,
    identity,
    stableKey: layerKey(role, identity.mediaItemId),
  });
}

export function collectAuthoritativePreviewMountedLayers(
  input: ResolvePreviewPresentationAuthorityInput,
): AuthoritativePreviewMountedLayerInventory {
  const presentation = resolvePreviewPresentationAuthority(input);
  const removedIds = new Set(presentation.removedMediaIds);
  const removedUrls = new Set(presentation.removedMediaUrls);
  const layers: AuthoritativePreviewMountedLayer[] = [];

  if (presentation.playbackAuthority === "inspection") {
    pushLayer(layers, "inspection", presentation.inspectionMedia, removedIds, removedUrls);
  } else {
    const plan = planPreviewMediaLayers({
      scene: input.scene,
      sceneElapsedMs: presentation.clock.sceneElapsedMs,
      isPlaying: input.isPlaying,
      mixedMediaScenesEnabled: input.mixedMediaScenesEnabled === true,
    });
    pushLayer(
      layers,
      "primary",
      previewMediaIdentityFromView(plan.primary.view),
      removedIds,
      removedUrls,
    );
    if (plan.outgoing) {
      pushLayer(
        layers,
        "outgoing",
        previewMediaIdentityFromView(plan.outgoing.view),
        removedIds,
        removedUrls,
      );
    }
  }

  return {
    layers,
    mediaItemIds: layers
      .map((layer) => layer.identity.mediaItemId)
      .filter((id): id is string => Boolean(id)),
    mediaUrls: layers
      .map((layer) => layer.identity.mediaUrl)
      .filter((url): url is string => Boolean(url)),
  };
}

export function collectCurrentPreviewPlanMountedLayers(input: {
  readonly scene: FootieScene;
  readonly sceneElapsedMs: number;
  readonly isPlaying: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
}): AuthoritativePreviewMountedLayerInventory {
  const plan = planPreviewMediaLayers({
    scene: input.scene,
    sceneElapsedMs: input.sceneElapsedMs,
    isPlaying: input.isPlaying,
    mixedMediaScenesEnabled: input.mixedMediaScenesEnabled === true,
  });
  const layers: AuthoritativePreviewMountedLayer[] = [
    {
      role: "primary",
      identity: previewMediaIdentityFromView(plan.primary.view),
      stableKey: plan.primary.stableKey,
    },
  ];
  if (plan.outgoing) {
    layers.push({
      role: "outgoing",
      identity: previewMediaIdentityFromView(plan.outgoing.view),
      stableKey: plan.outgoing.stableKey,
    });
  }
  return {
    layers,
    mediaItemIds: layers
      .map((layer) => layer.identity.mediaItemId)
      .filter((id): id is string => Boolean(id)),
    mediaUrls: layers
      .map((layer) => layer.identity.mediaUrl)
      .filter((url): url is string => Boolean(url)),
  };
}

export function collectReconciledPreviewMountedLayers(input: {
  readonly scene: FootieScene;
  readonly sceneElapsedMs: number;
  readonly isPlaying: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
}): AuthoritativePreviewMountedLayerInventory {
  const plan = planReconciledPreviewMediaLayers({
    scene: input.scene,
    sceneElapsedMs: input.sceneElapsedMs,
    isPlaying: input.isPlaying,
    mixedMediaScenesEnabled: input.mixedMediaScenesEnabled === true,
  });
  const layers: AuthoritativePreviewMountedLayer[] = [];
  if (plan.primary.view.mediaItemId || plan.primary.view.media?.url) {
    layers.push({
      role: "primary",
      identity: previewMediaIdentityFromView(plan.primary.view),
      stableKey: plan.primary.stableKey,
    });
  }
  if (plan.outgoing) {
    layers.push({
      role: "outgoing",
      identity: previewMediaIdentityFromView(plan.outgoing.view),
      stableKey: plan.outgoing.stableKey,
    });
  }
  return {
    layers,
    mediaItemIds: layers
      .map((layer) => layer.identity.mediaItemId)
      .filter((id): id is string => Boolean(id)),
    mediaUrls: layers
      .map((layer) => layer.identity.mediaUrl)
      .filter((url): url is string => Boolean(url)),
  };
}

export function inventoryContainsMedia(
  inventory: AuthoritativePreviewMountedLayerInventory,
  input: { readonly mediaItemId?: string | null; readonly mediaUrl?: string | null },
): boolean {
  const id = input.mediaItemId?.trim();
  const url = input.mediaUrl?.trim();
  if (id && inventory.mediaItemIds.includes(id)) {
    return true;
  }
  if (url && inventory.mediaUrls.includes(url)) {
    return true;
  }
  return false;
}
