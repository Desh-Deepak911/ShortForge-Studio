"use client";

import { useCallback, useState } from "react";

import type { SceneInspectorGroupId } from "./inspector-tab-shell.types";
import { SCENE_INSPECTOR_GROUP_DEFAULT_OPEN } from "./inspector-tab-shell.types";
import {
  readSceneGroupOpenState,
  writeSceneGroupOpenState,
} from "./inspector-tab-shell.session";

export function useSceneInspectorGroupAccordion(groupId: SceneInspectorGroupId) {
  const [open, setOpen] = useState(() => readSceneGroupOpenState(groupId));

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      writeSceneGroupOpenState(groupId, nextOpen);
      setOpen(nextOpen);
    },
    [groupId],
  );

  const resetToDefault = useCallback(() => {
    const defaultOpen = SCENE_INSPECTOR_GROUP_DEFAULT_OPEN[groupId];
    writeSceneGroupOpenState(groupId, defaultOpen);
    setOpen(defaultOpen);
  }, [groupId]);

  return { open, onOpenChange, resetToDefault, setOpen };
}
