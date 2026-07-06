import type { CaptionWorkspaceTabId } from "./caption-workspace.types";
import { DEFAULT_CAPTION_WORKSPACE_TAB } from "./caption-workspace.types";

let activeCaptionWorkspaceTab: CaptionWorkspaceTabId = DEFAULT_CAPTION_WORKSPACE_TAB;

export function readCaptionWorkspaceTab(): CaptionWorkspaceTabId {
  return activeCaptionWorkspaceTab;
}

export function writeCaptionWorkspaceTab(tabId: CaptionWorkspaceTabId): void {
  activeCaptionWorkspaceTab = tabId;
}
