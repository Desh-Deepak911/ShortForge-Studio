import type { InspectorTabId, SceneInspectorGroupId } from "./inspector-tab-shell.types";
import { SCENE_INSPECTOR_GROUP_DEFAULT_OPEN } from "./inspector-tab-shell.types";

const sceneGroupOpenState: Record<SceneInspectorGroupId, boolean> = {
  ...SCENE_INSPECTOR_GROUP_DEFAULT_OPEN,
};

let activeInspectorTab: InspectorTabId = "scene";

let focusProjectTabHandler: (() => void) | null = null;

export function readSceneGroupOpenState(groupId: SceneInspectorGroupId): boolean {
  return sceneGroupOpenState[groupId];
}

export function writeSceneGroupOpenState(groupId: SceneInspectorGroupId, open: boolean): void {
  sceneGroupOpenState[groupId] = open;
}

export function readActiveInspectorTab(): InspectorTabId {
  return activeInspectorTab;
}

export function writeActiveInspectorTab(tabId: InspectorTabId): void {
  activeInspectorTab = tabId;
}

export function registerInspectorProjectTabFocus(handler: () => void): () => void {
  focusProjectTabHandler = handler;
  return () => {
    if (focusProjectTabHandler === handler) {
      focusProjectTabHandler = null;
    }
  };
}

export function focusInspectorProjectTab(): void {
  focusProjectTabHandler?.();
}
