"use client";

import { createContext } from "react";

import type { RibbonContextId } from "@/components/studio-shell/ribbonContext.types";
import type { CanvasEditMode } from "@/features/editor/types/canvasEditMode";

import type { EditorSelectionState, SceneSelectionPhase, SelectionType } from "./selection.types";

export interface EditorSelectionContextValue extends EditorSelectionState {
  selectedImageSceneId: string | null;
  scenePhase: SceneSelectionPhase;
  activeSelectionType: SelectionType;
  canvasEditMode: CanvasEditMode;
  isImageEditing: boolean;
  isImageSelected: boolean;
  isSceneSelected: boolean;
  isSceneMediaItemSelected: boolean;
  isSceneMediaTransitionSelected: boolean;
  imageSceneId: string | null;
  ribbonVisible: boolean;
  ribbonContextId: RibbonContextId | null;
  inspectorImageEditing: boolean;
  inspectorImageEditAvailable: boolean;
  selectScene: (sceneId: string) => void;
  selectImage: (sceneId: string) => void;
  selectSceneMediaItem: (sceneId: string, mediaItemId: string) => void;
  selectSceneMediaTransition: (
    sceneId: string,
    fromItemId: string,
    toItemId: string,
  ) => void;
  clearSceneMediaItemSelection: () => void;
  clearSceneMediaTransitionSelection: () => void;
  /** Sole authority for persisted scene index changes (including playback). */
  syncSceneIndex: (index: number) => void;
  clearSelection: () => void;
  /** @deprecated Prefer selectImage — kept for canvas edit wiring. */
  enterImageEdit: (sceneId: string) => void;
  /** @deprecated Prefer clearSelection — kept for canvas edit wiring. */
  exitImageEdit: () => void;
  setImageHover: (sceneId: string | null) => void;
  setImageEditAvailable: (available: boolean) => void;
  setPlaybackLocked: (locked: boolean) => void;
}

export const SelectionContext = createContext<EditorSelectionContextValue | null>(null);
