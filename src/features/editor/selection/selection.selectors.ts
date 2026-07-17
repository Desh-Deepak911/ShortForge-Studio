import type { RibbonContextId } from "@/components/studio-shell/ribbonContext.types";
import type { CanvasEditMode } from "@/features/editor/types/canvasEditMode";

import {
  SceneSelectionPhase,
  SelectionPhase,
  SelectionType,
  type EditorSelectionState,
} from "./selection.types";

export function selectIsImageEditing(state: EditorSelectionState): boolean {
  return (
    state.imageEditAvailable &&
    state.phase === SelectionPhase.Editing &&
    state.target?.type === SelectionType.Image
  );
}

export function selectIsImageSelected(state: EditorSelectionState): boolean {
  return (
    state.target?.type === SelectionType.Image &&
    (state.phase === SelectionPhase.Selected ||
      state.phase === SelectionPhase.Hover ||
      state.phase === SelectionPhase.Editing)
  );
}

export function selectIsSceneSelected(state: EditorSelectionState): boolean {
  return (
    (state.target?.type === SelectionType.Scene ||
      state.target?.type === SelectionType.SceneMediaItem ||
      state.target?.type === SelectionType.SceneMediaTransition) &&
    (state.phase === SelectionPhase.Selected || state.phase === SelectionPhase.Hover)
  );
}

export function selectIsSceneMediaItemSelected(state: EditorSelectionState): boolean {
  return (
    state.target?.type === SelectionType.SceneMediaItem &&
    (state.phase === SelectionPhase.Selected || state.phase === SelectionPhase.Hover) &&
    Boolean(state.selectedMediaItemId)
  );
}

export function selectIsSceneMediaTransitionSelected(state: EditorSelectionState): boolean {
  return (
    state.target?.type === SelectionType.SceneMediaTransition &&
    (state.phase === SelectionPhase.Selected || state.phase === SelectionPhase.Hover) &&
    Boolean(state.selectedMediaTransition)
  );
}

export function selectActiveSelectionType(state: EditorSelectionState): SelectionType {
  return state.target?.type ?? SelectionType.None;
}

export function selectImageSceneId(state: EditorSelectionState): string | null {
  if (state.target?.type === SelectionType.Image) {
    return state.target.sceneId;
  }

  if (state.phase === SelectionPhase.Hover && state.hoverSceneId) {
    return state.hoverSceneId;
  }

  return null;
}

export function selectSelectedImageSceneId(state: EditorSelectionState): string | null {
  if (state.phase === SelectionPhase.Editing && state.target?.type === SelectionType.Image) {
    return state.target.sceneId;
  }

  return selectImageSceneId(state);
}

export function selectSceneSelectionPhase(state: EditorSelectionState): SceneSelectionPhase {
  if (state.phase === SelectionPhase.PlaybackLocked) {
    return SceneSelectionPhase.PlaybackLocked;
  }

  if (!state.selectedSceneId) {
    return SceneSelectionPhase.Idle;
  }

  if (selectIsImageEditing(state)) {
    return SceneSelectionPhase.Editing;
  }

  return SceneSelectionPhase.Selected;
}

export function selectCanvasEditMode(state: EditorSelectionState): CanvasEditMode {
  if (state.phase === SelectionPhase.PlaybackLocked) {
    return "playback";
  }

  if (state.phase === SelectionPhase.Editing && state.imageEditAvailable) {
    return "frameEdit";
  }

  return "preview";
}

/** Maps the active selection target to a ribbon context id. */
export function selectRibbonContextId(state: EditorSelectionState): RibbonContextId | null {
  if (!selectRibbonVisible(state)) {
    return null;
  }

  switch (state.target?.type) {
    case SelectionType.Image:
      return "image";
    case SelectionType.Scene:
    case SelectionType.SceneMediaItem:
    case SelectionType.SceneMediaTransition:
      return "scene";
    default:
      return "unknown";
  }
}

/**
 * True when the context ribbon should render for the current selection.
 * Extend with scene/caption/transition cases as those contexts ship.
 */
export function selectRibbonVisible(state: EditorSelectionState): boolean {
  return selectIsImageEditing(state);
}

export function selectImageEditAvailable(state: EditorSelectionState): boolean {
  return state.imageEditAvailable && state.selectedSceneId != null;
}

export function selectInspectorImageEditing(state: EditorSelectionState): boolean {
  return selectIsImageEditing(state);
}

export function selectInspectorImageEditAvailable(state: EditorSelectionState): boolean {
  return (
    selectImageEditAvailable(state) &&
    (state.phase === SelectionPhase.Selected ||
      state.phase === SelectionPhase.Hover ||
      state.phase === SelectionPhase.Editing)
  );
}
