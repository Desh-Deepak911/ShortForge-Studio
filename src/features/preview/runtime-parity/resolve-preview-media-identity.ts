/**
 * Maps an existing scene-media render view onto the parity identity record.
 * Reuses resolveActiveSceneMediaRenderView — does not invent timing.
 */

import type { ActiveSceneMediaRenderView } from "@/features/scene-media-timeline";

import type { PreviewRuntimeParityMediaIdentity } from "./preview-runtime-parity-states";

export function emptyPreviewMediaIdentity(): PreviewRuntimeParityMediaIdentity {
  return {
    mediaItemId: null,
    mediaType: "none",
    mediaUrl: null,
    itemIndex: -1,
  };
}

export function previewMediaIdentityFromView(
  view: ActiveSceneMediaRenderView | null | undefined,
): PreviewRuntimeParityMediaIdentity {
  if (!view || !view.media) {
    return emptyPreviewMediaIdentity();
  }
  const url =
    typeof view.media.url === "string" && view.media.url.trim().length > 0
      ? view.media.url.trim()
      : null;
  const mediaType =
    view.media.type === "video" || view.media.type === "image"
      ? view.media.type
      : "placeholder";
  return {
    mediaItemId: view.mediaItemId,
    mediaType,
    mediaUrl: url,
    itemIndex: view.itemIndex,
  };
}
