import { isCaptionDragEnabled } from "@/features/caption-layout-drag";

export type PreviewInteractionMode =
  | "playback"
  | "image_edit"
  | "caption_edit"
  | "passive";

export interface PreviewInteractionLayerInput {
  canvasEditEnabled: boolean;
  sceneId?: string;
  selectedSceneId: string | null;
  playbackActive: boolean;
  imageEditActive: boolean;
}

export interface PreviewInteractionLayerState {
  allowCaptionPointerEvents: boolean;
  allowImagePointerEvents: boolean;
  allowCaptionDrag: boolean;
  allowImageEdit: boolean;
  interactionMode: PreviewInteractionMode;
}

/**
 * Resolves preview interaction priority:
 * 1. playback — disable editing
 * 2. image edit — image layer receives pointer events
 * 3. caption drag/edit — caption layer receives pointer events
 * 4. passive — overlays visible, no unnecessary pointer capture
 */
export function resolvePreviewInteractionLayer(
  input: PreviewInteractionLayerInput,
): PreviewInteractionLayerState {
  if (input.playbackActive) {
    return {
      allowCaptionPointerEvents: false,
      allowImagePointerEvents: false,
      allowCaptionDrag: false,
      allowImageEdit: false,
      interactionMode: "playback",
    };
  }

  if (input.imageEditActive) {
    return {
      allowCaptionPointerEvents: false,
      allowImagePointerEvents: true,
      allowCaptionDrag: false,
      allowImageEdit: true,
      interactionMode: "image_edit",
    };
  }

  const allowCaptionDrag = isCaptionDragEnabled({
    enabled: input.canvasEditEnabled,
    sceneId: input.sceneId,
    selectedSceneId: input.selectedSceneId,
    playbackActive: false,
    frameEditActive: false,
  });

  if (allowCaptionDrag) {
    return {
      allowCaptionPointerEvents: true,
      allowImagePointerEvents: input.canvasEditEnabled,
      allowCaptionDrag: true,
      allowImageEdit: input.canvasEditEnabled,
      interactionMode: "caption_edit",
    };
  }

  return {
    allowCaptionPointerEvents: false,
    allowImagePointerEvents: input.canvasEditEnabled,
    allowCaptionDrag: false,
    allowImageEdit: input.canvasEditEnabled,
    interactionMode: "passive",
  };
}

/** Tailwind classes for caption overlays when caption pointer events are disabled. */
export function resolvePreviewCaptionOverlayClassName(
  interaction: Pick<
    PreviewInteractionLayerState,
    "allowCaptionPointerEvents" | "interactionMode"
  >,
): string {
  if (interaction.interactionMode === "image_edit") {
    return "pointer-events-none opacity-55 transition-opacity duration-150";
  }

  if (interaction.interactionMode === "playback") {
    return "pointer-events-none transition-opacity duration-150";
  }

  if (!interaction.allowCaptionPointerEvents) {
    return "pointer-events-none";
  }

  return "";
}

/** Z-index class for the image edit layer — elevated above caption overlays during image edit. */
export function resolvePreviewImageEditLayerClassName(
  interaction: Pick<PreviewInteractionLayerState, "interactionMode">,
): string {
  return interaction.interactionMode === "image_edit"
    ? "absolute inset-0 z-[18]"
    : "absolute inset-0 z-[4]";
}
