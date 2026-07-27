import type {
  InspectorTabId,
  SceneInspectorGroupId,
  SceneInspectorWorkspaceId,
} from "./inspector-tab-shell.types";
import { SCENE_INSPECTOR_GROUP_DEFAULT_OPEN } from "./inspector-tab-shell.types";

const sceneGroupOpenState: Record<SceneInspectorGroupId, boolean> = {
  ...SCENE_INSPECTOR_GROUP_DEFAULT_OPEN,
};

let activeInspectorTab: InspectorTabId = "scene";
let activeSceneInspectorWorkspace: SceneInspectorWorkspaceId = "media";

let focusAudioTabHandler: (() => void) | null = null;

export function readSceneGroupOpenState(
  groupId: SceneInspectorGroupId,
): boolean {
  return sceneGroupOpenState[groupId];
}

export function writeSceneGroupOpenState(
  groupId: SceneInspectorGroupId,
  open: boolean,
): void {
  sceneGroupOpenState[groupId] = open;
}

export function readActiveInspectorTab(): InspectorTabId {
  return activeInspectorTab;
}

export function writeActiveInspectorTab(tabId: InspectorTabId): void {
  activeInspectorTab = tabId;
}

export function readActiveSceneInspectorWorkspace(): SceneInspectorWorkspaceId {
  return activeSceneInspectorWorkspace;
}

export function writeActiveSceneInspectorWorkspace(
  workspaceId: SceneInspectorWorkspaceId,
): void {
  activeSceneInspectorWorkspace = workspaceId;
}

export function registerInspectorProjectTabFocus(
  handler: () => void,
): () => void {
  focusAudioTabHandler = handler;
  return () => {
    if (focusAudioTabHandler === handler) {
      focusAudioTabHandler = null;
    }
  };
}

export function focusInspectorProjectTab(): void {
  focusAudioTabHandler?.();
}
