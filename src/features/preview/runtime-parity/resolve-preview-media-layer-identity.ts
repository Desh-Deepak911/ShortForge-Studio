/**
 * Preview media-layer identity — not a second timing engine.
 * Distinguishes item id, source, role, scene, and current vs retired authority.
 */

import type { ActiveSceneMediaRenderView } from "@/features/scene-media-timeline";
import type { PreviewMediaLayerRole } from "@/features/scene-media-transitions/preview";

export type PreviewMediaLayerAuthority = "current" | "retired";

export interface PreviewMediaLayerIdentity {
  readonly sceneId: string;
  readonly mediaItemId: string | null;
  readonly sourceIdentity: string | null;
  readonly role: PreviewMediaLayerRole;
  readonly authority: PreviewMediaLayerAuthority;
  readonly lifecycleKey: string;
}

export function resolvePreviewMediaSourceIdentity(
  url: string | null | undefined,
): string | null {
  if (typeof url !== "string") {
    return null;
  }
  const trimmed = url.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPreviewMediaLayerLifecycleKey(input: {
  readonly role: PreviewMediaLayerRole;
  readonly sceneId: string;
  readonly mediaItemId: string | null;
  readonly sourceIdentity: string | null;
}): string {
  return JSON.stringify([
    input.role,
    input.sceneId,
    input.mediaItemId ?? "",
    input.sourceIdentity ?? "",
  ]);
}

export function resolvePreviewMediaLayerIdentity(input: {
  readonly sceneId: string;
  readonly role: PreviewMediaLayerRole;
  readonly view: ActiveSceneMediaRenderView;
  readonly authoritativeItemIds: ReadonlySet<string>;
  readonly authoritativeSources: ReadonlySet<string>;
}): PreviewMediaLayerIdentity {
  const mediaItemId = input.view.mediaItemId;
  const sourceIdentity = resolvePreviewMediaSourceIdentity(input.view.media?.url);
  const itemMissing = Boolean(mediaItemId && !input.authoritativeItemIds.has(mediaItemId));
  const sourceMissing = Boolean(
    sourceIdentity && !input.authoritativeSources.has(sourceIdentity),
  );
  const authority: PreviewMediaLayerAuthority =
    itemMissing || sourceMissing || (!mediaItemId && !sourceIdentity)
      ? "retired"
      : "current";

  return {
    sceneId: input.sceneId,
    mediaItemId,
    sourceIdentity,
    role: input.role,
    authority,
    lifecycleKey: buildPreviewMediaLayerLifecycleKey({
      role: input.role,
      sceneId: input.sceneId,
      mediaItemId,
      sourceIdentity,
    }),
  };
}
