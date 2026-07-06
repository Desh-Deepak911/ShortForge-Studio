import {
  resolvePreviewCaptionOverlayClassName,
  resolvePreviewInteractionLayer,
  type PreviewInteractionLayerInput,
  type PreviewInteractionLayerState,
  type PreviewInteractionMode,
} from "./preview-interaction-layer.utils";

export type {
  PreviewInteractionLayerInput,
  PreviewInteractionLayerState,
  PreviewInteractionMode,
};

export { resolvePreviewCaptionOverlayClassName, resolvePreviewInteractionLayer };

/** @deprecated Use PreviewInteractionLayerInput — kept for transitional callers. */
export type PreviewInteractionInput = PreviewInteractionLayerInput;

/** @deprecated Use PreviewInteractionLayerState — kept for transitional callers. */
export interface PreviewInteractionState {
  captionDragEnabled: boolean;
  captionInteractionLocked: boolean;
  captionLayerPointerEvents: "none" | "auto";
}

/** Maps the interaction layer resolver to the legacy preview interaction shape. */
export function resolvePreviewInteractionState(
  input: PreviewInteractionInput,
): PreviewInteractionState {
  const layer = resolvePreviewInteractionLayer(input);

  return {
    captionDragEnabled: layer.allowCaptionDrag,
    captionInteractionLocked: !layer.allowCaptionPointerEvents,
    captionLayerPointerEvents: layer.allowCaptionPointerEvents ? "auto" : "none",
  };
}
