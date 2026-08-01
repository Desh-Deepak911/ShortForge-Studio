"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { isInspectorSelectableMediaItemId } from "@/features/mixed-media-scenes/adapters/inspector-scene-media-projection";
import { useMixedMediaScenesEnabled } from "@/features/mixed-media-scenes/client/MixedMediaScenesCapabilityContext";
import { isSelectableSceneMediaItemId } from "@/features/scene-media-timeline/editor";
import { isSelectableSceneMediaTransitionPair } from "@/features/scene-media-transitions";
import type { FootieScene, FootieScript } from "@/features/story/types";

import { SelectionContext, type EditorSelectionContextValue } from "./SelectionContext";
import {
  selectActiveSelectionType,
  selectCanvasEditMode,
  selectImageSceneId,
  selectInspectorImageEditAvailable,
  selectInspectorImageEditing,
  selectIsImageEditing,
  selectIsImageSelected,
  selectIsSceneMediaItemSelected,
  selectIsSceneMediaTransitionSelected,
  selectIsSceneSelected,
  selectRibbonContextId,
  selectRibbonVisible,
  selectSceneSelectionPhase,
  selectSelectedImageSceneId,
} from "./selection.selectors";
import {
  SelectionPhase,
  SelectionType,
  type EditorSelectionState,
  type SelectedMediaTransitionPair,
  type SelectionTarget,
} from "./selection.types";
import {
  reconcileMediaItemSelectionAuthority,
  reconcileMediaTransitionSelectionAuthority,
  resolveSafeSceneIndex,
  resolveSceneIndexById,
  resolveSelectedScene,
} from "./selection.utils";

export interface EditorSelectionProviderProps {
  script: FootieScript;
  selectedSceneIndex: number;
  onSelectedSceneChange: (index: number) => void;
  children: ReactNode;
}

function deriveSelectionPhase(input: {
  playbackLocked: boolean;
  selectedScene: FootieScript["scenes"][number] | null;
  selectedSceneId: string | null;
  editingSceneId: string | null;
  hoverSceneId: string | null;
  imageEditAvailable: boolean;
}): SelectionPhase {
  const {
    playbackLocked,
    selectedScene,
    selectedSceneId,
    editingSceneId,
    hoverSceneId,
    imageEditAvailable,
  } = input;

  if (playbackLocked) {
    return SelectionPhase.PlaybackLocked;
  }

  if (!selectedScene || !selectedSceneId) {
    return SelectionPhase.Idle;
  }

  if (editingSceneId && editingSceneId === selectedSceneId && imageEditAvailable) {
    return SelectionPhase.Editing;
  }

  if (hoverSceneId && hoverSceneId === selectedSceneId) {
    return SelectionPhase.Hover;
  }

  return SelectionPhase.Selected;
}

type SelectionFocus =
  | SelectionType.Scene
  | SelectionType.Image
  | SelectionType.SceneMediaItem
  | SelectionType.SceneMediaTransition;

function resolveSelectionTarget(input: {
  selectedScene: FootieScript["scenes"][number] | null;
  selectionFocus: SelectionFocus;
  phase: SelectionPhase;
  editingSceneId: string | null;
  hoverSceneId: string | null;
  selectedMediaItemId: string | null;
  selectedMediaTransition: SelectedMediaTransitionPair | null;
}): SelectionTarget {
  const {
    selectedScene,
    selectionFocus,
    phase,
    editingSceneId,
    hoverSceneId,
    selectedMediaItemId,
    selectedMediaTransition,
  } = input;

  if (!selectedScene) {
    return null;
  }

  if (selectionFocus === SelectionType.Image) {
    if (phase === SelectionPhase.Editing && editingSceneId) {
      return { type: SelectionType.Image, sceneId: editingSceneId };
    }

    if (phase === SelectionPhase.Hover && hoverSceneId) {
      return { type: SelectionType.Image, sceneId: hoverSceneId };
    }
  }

  if (
    selectionFocus === SelectionType.SceneMediaTransition &&
    selectedMediaTransition &&
    (phase === SelectionPhase.Selected || phase === SelectionPhase.Hover)
  ) {
    return {
      type: SelectionType.SceneMediaTransition,
      sceneId: selectedScene.id,
      fromItemId: selectedMediaTransition.fromItemId,
      toItemId: selectedMediaTransition.toItemId,
    };
  }

  if (
    selectionFocus === SelectionType.SceneMediaItem &&
    selectedMediaItemId &&
    (phase === SelectionPhase.Selected || phase === SelectionPhase.Hover)
  ) {
    return {
      type: SelectionType.SceneMediaItem,
      sceneId: selectedScene.id,
      mediaItemId: selectedMediaItemId,
    };
  }

  return { type: SelectionType.Scene, sceneId: selectedScene.id };
}

export default function EditorSelectionProvider({
  script,
  selectedSceneIndex,
  onSelectedSceneChange,
  children,
}: EditorSelectionProviderProps) {
  const mixedMediaScenesEnabled = useMixedMediaScenesEnabled();
  const isItemSelectable = useCallback(
    (scene: FootieScene, mediaItemId: string) =>
      mixedMediaScenesEnabled
        ? isInspectorSelectableMediaItemId(scene, mediaItemId, {
            mixedMediaScenesEnabled: true,
          })
        : isSelectableSceneMediaItemId(scene, mediaItemId),
    [mixedMediaScenesEnabled],
  );
  const safeSceneIndex = resolveSafeSceneIndex(script.scenes, selectedSceneIndex);
  const selectedScene = resolveSelectedScene(script, selectedSceneIndex);
  const selectedSceneId = selectedScene?.id ?? null;

  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [hoverSceneId, setHoverSceneId] = useState<string | null>(null);
  const [imageEditAvailable, setImageEditAvailable] = useState(false);
  const [playbackLocked, setPlaybackLocked] = useState(false);
  const [selectedMediaItemId, setSelectedMediaItemId] = useState<string | null>(null);
  const [selectedMediaTransition, setSelectedMediaTransition] =
    useState<SelectedMediaTransitionPair | null>(null);
  const [selectionFocus, setSelectionFocus] = useState<SelectionFocus>(SelectionType.Scene);
  const selectedMediaItemIdRef = useRef(selectedMediaItemId);
  const selectedMediaTransitionRef = useRef(selectedMediaTransition);
  useEffect(() => {
    selectedMediaItemIdRef.current = selectedMediaItemId;
  }, [selectedMediaItemId]);
  useEffect(() => {
    selectedMediaTransitionRef.current = selectedMediaTransition;
  }, [selectedMediaTransition]);

  const effectiveEditingSceneId = useMemo(() => {
    if (!selectedSceneId || !editingSceneId || editingSceneId !== selectedSceneId) {
      return null;
    }

    return editingSceneId;
  }, [editingSceneId, selectedSceneId]);

  const effectiveHoverSceneId = useMemo(() => {
    if (!selectedSceneId || !hoverSceneId || hoverSceneId !== selectedSceneId) {
      return null;
    }

    return hoverSceneId;
  }, [hoverSceneId, selectedSceneId]);

  // Invalidate stale media-item ids when the script no longer contains them.
  const validatedMediaItemId = useMemo(() => {
    if (!selectedMediaItemId || !selectedScene) {
      return null;
    }
    return isItemSelectable(selectedScene, selectedMediaItemId)
      ? selectedMediaItemId
      : null;
  }, [isItemSelectable, selectedMediaItemId, selectedScene]);

  const validatedMediaTransition = useMemo(() => {
    if (!selectedMediaTransition || !selectedScene) {
      return null;
    }
    return isSelectableSceneMediaTransitionPair(
      selectedScene,
      selectedMediaTransition.fromItemId,
      selectedMediaTransition.toItemId,
    )
      ? selectedMediaTransition
      : null;
  }, [selectedMediaTransition, selectedScene]);

  const effectiveSelectionFocus = useMemo((): SelectionFocus => {
    if (!selectedSceneId) {
      return SelectionType.Scene;
    }

    if (selectionFocus === SelectionType.Image) {
      if (effectiveEditingSceneId || effectiveHoverSceneId) {
        return SelectionType.Image;
      }

      return SelectionType.Scene;
    }

    if (
      selectionFocus === SelectionType.SceneMediaTransition &&
      validatedMediaTransition
    ) {
      return SelectionType.SceneMediaTransition;
    }

    if (selectionFocus === SelectionType.SceneMediaItem && validatedMediaItemId) {
      return SelectionType.SceneMediaItem;
    }

    return SelectionType.Scene;
  }, [
    effectiveEditingSceneId,
    effectiveHoverSceneId,
    selectedSceneId,
    selectionFocus,
    validatedMediaItemId,
    validatedMediaTransition,
  ]);

  const phase = useMemo(
    () =>
      deriveSelectionPhase({
        playbackLocked,
        selectedScene,
        selectedSceneId,
        editingSceneId: effectiveEditingSceneId,
        hoverSceneId: effectiveHoverSceneId,
        imageEditAvailable,
      }),
    [
      effectiveEditingSceneId,
      effectiveHoverSceneId,
      imageEditAvailable,
      playbackLocked,
      selectedScene,
      selectedSceneId,
    ],
  );

  const target = useMemo(
    (): SelectionTarget =>
      resolveSelectionTarget({
        selectedScene,
        selectionFocus: effectiveSelectionFocus,
        phase,
        editingSceneId: effectiveEditingSceneId,
        hoverSceneId: effectiveHoverSceneId,
        selectedMediaItemId: validatedMediaItemId,
        selectedMediaTransition: validatedMediaTransition,
      }),
    [
      effectiveEditingSceneId,
      effectiveHoverSceneId,
      effectiveSelectionFocus,
      phase,
      selectedScene,
      validatedMediaItemId,
      validatedMediaTransition,
    ],
  );

  const syncSceneIndex = useCallback(
    (index: number) => {
      const safeIndex = resolveSafeSceneIndex(script.scenes, index);
      if (safeIndex < 0) {
        return;
      }

      const nextScene = script.scenes[safeIndex];
      if (!nextScene) {
        return;
      }

      const nextSceneId = nextScene.id;
      const sceneChanging = nextSceneId !== selectedSceneId;

      if (safeIndex !== selectedSceneIndex) {
        onSelectedSceneChange(safeIndex);
      }

      if (playbackLocked) {
        if (sceneChanging) {
          setHoverSceneId(null);
          setSelectedMediaItemId(null);
          setSelectedMediaTransition(null);
          if (editingSceneId && editingSceneId !== nextSceneId) {
            setEditingSceneId(null);
            setSelectionFocus(SelectionType.Scene);
          }
        }
        return;
      }

      if (sceneChanging) {
        setEditingSceneId(null);
        setHoverSceneId(null);
        setSelectedMediaItemId(null);
        setSelectedMediaTransition(null);
        setSelectionFocus(SelectionType.Scene);
      }
    },
    [
      editingSceneId,
      onSelectedSceneChange,
      playbackLocked,
      script.scenes,
      selectedSceneId,
      selectedSceneIndex,
    ],
  );

  const selectScene = useCallback(
    (sceneId: string) => {
      if (playbackLocked) {
        return;
      }

      const index = resolveSceneIndexById(script, sceneId);
      if (index < 0) {
        return;
      }

      syncSceneIndex(index);
      setEditingSceneId(null);
      setHoverSceneId(null);
      setSelectedMediaItemId(null);
      setSelectedMediaTransition(null);
      setSelectionFocus(SelectionType.Scene);
    },
    [playbackLocked, script, syncSceneIndex],
  );

  const clearImageFocus = useCallback(() => {
    setEditingSceneId(null);
    setHoverSceneId(null);
    setSelectionFocus(SelectionType.Scene);
  }, []);

  const clearSceneMediaItemSelection = useCallback(() => {
    setSelectedMediaItemId(null);
    if (selectionFocus === SelectionType.SceneMediaItem) {
      setSelectionFocus(SelectionType.Scene);
    }
  }, [selectionFocus]);

  const clearSceneMediaTransitionSelection = useCallback(() => {
    setSelectedMediaTransition(null);
    if (selectionFocus === SelectionType.SceneMediaTransition) {
      setSelectionFocus(SelectionType.Scene);
    }
  }, [selectionFocus]);

  const selectSceneMediaItem = useCallback(
    (sceneId: string, mediaItemId: string) => {
      if (playbackLocked) {
        return;
      }

      const trimmedId = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
      if (!trimmedId) {
        return;
      }

      const index = resolveSceneIndexById(script, sceneId);
      if (index < 0) {
        return;
      }

      const scene = script.scenes[index];
      if (!scene || !isItemSelectable(scene, trimmedId)) {
        return;
      }

      if (sceneId !== selectedSceneId) {
        syncSceneIndex(index);
      }

      setEditingSceneId(null);
      setHoverSceneId(null);
      setSelectedMediaTransition(null);
      setSelectedMediaItemId(trimmedId);
      setSelectionFocus(SelectionType.SceneMediaItem);
    },
    [isItemSelectable, playbackLocked, script, selectedSceneId, syncSceneIndex],
  );

  const selectSceneMediaTransition = useCallback(
    (sceneId: string, fromItemId: string, toItemId: string) => {
      if (playbackLocked) {
        return;
      }

      const from = typeof fromItemId === "string" ? fromItemId.trim() : "";
      const to = typeof toItemId === "string" ? toItemId.trim() : "";
      if (!from || !to) {
        return;
      }

      const index = resolveSceneIndexById(script, sceneId);
      if (index < 0) {
        return;
      }

      const scene = script.scenes[index];
      if (!scene || !isSelectableSceneMediaTransitionPair(scene, from, to)) {
        return;
      }

      if (sceneId !== selectedSceneId) {
        syncSceneIndex(index);
      }

      setEditingSceneId(null);
      setHoverSceneId(null);
      setSelectedMediaItemId(null);
      setSelectedMediaTransition({ fromItemId: from, toItemId: to });
      setSelectionFocus(SelectionType.SceneMediaTransition);
    },
    [playbackLocked, script, selectedSceneId, syncSceneIndex],
  );

  const selectImage = useCallback(
    (sceneId: string) => {
      if (playbackLocked) {
        return;
      }

      const index = resolveSceneIndexById(script, sceneId);
      if (index < 0) {
        return;
      }

      if (sceneId !== selectedSceneId) {
        syncSceneIndex(index);
      }

      setSelectedMediaItemId(null);
      setSelectedMediaTransition(null);
      setSelectionFocus(SelectionType.Image);
      if (imageEditAvailable) {
        setEditingSceneId(sceneId);
      }
    },
    [imageEditAvailable, playbackLocked, script, selectedSceneId, syncSceneIndex],
  );

  const clearSelection = useCallback(() => {
    setSelectedMediaItemId(null);
    setSelectedMediaTransition(null);
    clearImageFocus();
  }, [clearImageFocus]);

  const enterImageEdit = useCallback(
    (sceneId: string) => {
      selectImage(sceneId);
    },
    [selectImage],
  );

  const exitImageEdit = useCallback(() => {
    clearImageFocus();
  }, [clearImageFocus]);

  const setImageHover = useCallback((sceneId: string | null) => {
    setHoverSceneId(sceneId);
  }, []);

  useEffect(() => {
    if (
      phase !== SelectionPhase.Editing &&
      selectionFocus !== SelectionType.SceneMediaItem &&
      selectionFocus !== SelectionType.SceneMediaTransition
    ) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (selectionFocus === SelectionType.SceneMediaTransition) {
        clearSceneMediaTransitionSelection();
        return;
      }
      if (selectionFocus === SelectionType.SceneMediaItem) {
        clearSceneMediaItemSelection();
        return;
      }
      exitImageEdit();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    clearSceneMediaItemSelection,
    clearSceneMediaTransitionSelection,
    exitImageEdit,
    phase,
    selectionFocus,
  ]);

  // Clear stored stale media-item IDs after external script updates remove them.
  // Microtask + ref check preserves a concurrent command selection of a nearest survivor.
  useEffect(() => {
    const reconciled = reconcileMediaItemSelectionAuthority({
      storedMediaItemId: selectedMediaItemId,
      selectionFocus,
      scene: selectedScene,
      isItemSelectable,
    });
    if (!reconciled.didClear || !selectedMediaItemId) {
      return;
    }
    const staleId = selectedMediaItemId;
    queueMicrotask(() => {
      if (selectedMediaItemIdRef.current !== staleId) {
        return;
      }
      setSelectedMediaItemId(null);
      setSelectionFocus((focus) =>
        focus === SelectionType.SceneMediaItem ? SelectionType.Scene : focus,
      );
    });
  }, [isItemSelectable, selectedMediaItemId, selectedScene, selectionFocus]);

  useEffect(() => {
    const reconciled = reconcileMediaTransitionSelectionAuthority({
      storedTransition: selectedMediaTransition,
      selectionFocus,
      scene: selectedScene,
    });
    if (!reconciled.didClear || !selectedMediaTransition) {
      return;
    }
    const stale = selectedMediaTransition;
    queueMicrotask(() => {
      const current = selectedMediaTransitionRef.current;
      if (
        !current ||
        current.fromItemId !== stale.fromItemId ||
        current.toItemId !== stale.toItemId
      ) {
        return;
      }
      setSelectedMediaTransition(null);
      setSelectionFocus((focus) =>
        focus === SelectionType.SceneMediaTransition ? SelectionType.Scene : focus,
      );
    });
  }, [selectedMediaTransition, selectedScene, selectionFocus]);

  const state: EditorSelectionState = {
    phase,
    target,
    hoverSceneId: effectiveHoverSceneId,
    imageEditAvailable,
    selectedSceneId,
    selectedSceneIndex: safeSceneIndex,
    selectedMediaItemId: validatedMediaItemId,
    selectedMediaTransition: validatedMediaTransition,
  };

  const value: EditorSelectionContextValue = {
    ...state,
    selectedImageSceneId: selectSelectedImageSceneId(state),
    scenePhase: selectSceneSelectionPhase(state),
    activeSelectionType: selectActiveSelectionType(state),
    canvasEditMode: selectCanvasEditMode(state),
    isImageEditing: selectIsImageEditing(state),
    isImageSelected: selectIsImageSelected(state),
    isSceneSelected: selectIsSceneSelected(state),
    isSceneMediaItemSelected: selectIsSceneMediaItemSelected(state),
    isSceneMediaTransitionSelected: selectIsSceneMediaTransitionSelected(state),
    imageSceneId: selectImageSceneId(state),
    ribbonVisible: selectRibbonVisible(state),
    ribbonContextId: selectRibbonContextId(state),
    inspectorImageEditing: selectInspectorImageEditing(state),
    inspectorImageEditAvailable: selectInspectorImageEditAvailable(state),
    selectScene,
    selectImage,
    selectSceneMediaItem,
    selectSceneMediaTransition,
    clearSceneMediaItemSelection,
    clearSceneMediaTransitionSelection,
    syncSceneIndex,
    clearSelection,
    enterImageEdit,
    exitImageEdit,
    setImageHover,
    setImageEditAvailable,
    setPlaybackLocked,
  };

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
