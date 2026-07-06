export type CaptionWorkspaceTabId = "content" | "layout" | "style" | "animation";

export const CAPTION_WORKSPACE_TAB_LABELS: Record<CaptionWorkspaceTabId, string> = {
  content: "Content",
  layout: "Layout",
  style: "Style",
  animation: "Animation",
};

export const CAPTION_WORKSPACE_TABS: CaptionWorkspaceTabId[] = [
  "content",
  "layout",
  "style",
  "animation",
];

export const DEFAULT_CAPTION_WORKSPACE_TAB: CaptionWorkspaceTabId = "content";
