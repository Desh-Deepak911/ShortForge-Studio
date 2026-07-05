import { isCaptionDragEnabled } from "@/features/caption-layout-drag";

export interface PreviewInteractionInput {
  canvasEditEnabled: boolean;
  sceneId?: string;
  selectedSceneId: string | null;
  playbackActive: boolean;
  imageEditActive: boolean;
}

export interface PreviewInteractionState {
  /** Caption drag handles are active for the selected scene. */
  captionDragEnabled: boolean;
  /** Caption layer must not intercept pointer events (image edit or playback). */
  captionInteractionLocked: boolean;
  /** Pointer events policy for the caption overlay root. */
  captionLayerPointerEvents: "none" | "auto";
}

/**
 * Resolves preview interaction priority:
 * playback > image edit > caption drag.
 */
export function resolvePreviewInteractionState(
  input: PreviewInteractionInput,
): PreviewInteractionState {
  const captionDragEnabled = isCaptionDragEnabled({
    enabled: input.canvasEditEnabled,
    sceneId: input.sceneId,
    selectedSceneId: input.selectedSceneId,
    playbackActive: input.playbackActive,
    frameEditActive: input.imageEditActive,
  });

  const captionInteractionLocked = input.playbackActive || input.imageEditActive;

  return {
    captionDragEnabled,
    captionInteractionLocked,
    captionLayerPointerEvents: captionDragEnabled ? "auto" : "none",
  };
}

/** Tailwind classes for caption overlays under image edit mode. */
export function resolvePreviewCaptionOverlayClassName(
  interaction: PreviewInteractionState,
): string {
  if (interaction.captionInteractionLocked) {
    return "pointer-events-none opacity-55 transition-opacity duration-150";
  }

  if (!interaction.captionDragEnabled) {
    return "pointer-events-none";
  }

  return "";
}
