/** Supported selection targets — Scene, Image, SceneMediaItem, SceneMediaTransition. */
export enum SelectionType {
  None = "none",
  Scene = "scene",
  Image = "image",
  SceneMediaItem = "scene_media_item",
  /** Intra-scene media-to-media transition boundary (Sprint 9A). */
  SceneMediaTransition = "scene_media_transition",
}

/** Editor focus lifecycle phases. */
export enum SelectionPhase {
  Idle = "idle",
  Hover = "hover",
  Selected = "selected",
  Editing = "editing",
  PlaybackLocked = "playbackLocked",
}

/** Scene selection lifecycle (derived from global phase + scene context). */
export enum SceneSelectionPhase {
  Idle = "idle",
  Selected = "selected",
  Editing = "editing",
  PlaybackLocked = "playbackLocked",
}

export interface SceneSelectionTarget {
  type: SelectionType.Scene;
  sceneId: string;
}

export interface ImageSelectionTarget {
  type: SelectionType.Image;
  sceneId: string;
}

/** Per-scene media timeline item — identified by stable media item id, never array index. */
export interface SceneMediaItemSelectionTarget {
  type: SelectionType.SceneMediaItem;
  sceneId: string;
  mediaItemId: string;
}

/** Adjacent media-item transition — identified by ordered from/to item ids. */
export interface SceneMediaTransitionSelectionTarget {
  type: SelectionType.SceneMediaTransition;
  sceneId: string;
  fromItemId: string;
  toItemId: string;
}

export type SelectionTarget =
  | SceneSelectionTarget
  | ImageSelectionTarget
  | SceneMediaItemSelectionTarget
  | SceneMediaTransitionSelectionTarget
  | null;

export interface SelectedMediaTransitionPair {
  fromItemId: string;
  toItemId: string;
}

export interface EditorSelectionState {
  phase: SelectionPhase;
  target: SelectionTarget;
  hoverSceneId: string | null;
  imageEditAvailable: boolean;
  /** Bridged from parent — not duplicated in provider state. */
  selectedSceneId: string | null;
  selectedSceneIndex: number;
  /** Stable media timeline item id when a SceneMediaItem is selected. */
  selectedMediaItemId: string | null;
  /** Adjacent pair when a SceneMediaTransition is selected. */
  selectedMediaTransition: SelectedMediaTransitionPair | null;
}
