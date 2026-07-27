export type EditorTimelineDensity = "compact" | "comfortable" | "expanded";
export type EditorPreviewSize = "fit" | "100" | "125";

export interface EditorWorkspaceLayoutState {
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorWidthPx: number;
  timelineDensity: EditorTimelineDensity;
  timelineHeightPx: number;
  previewSize: EditorPreviewSize;
  focusMode: boolean;
}

export const EDITOR_INSPECTOR_MIN_WIDTH_PX = 336;
export const EDITOR_INSPECTOR_MAX_WIDTH_PX = 520;
export const EDITOR_TIMELINE_MIN_HEIGHT_PX = 112;
export const EDITOR_TIMELINE_MAX_HEIGHT_PX = 360;

export const DEFAULT_EDITOR_WORKSPACE_LAYOUT: EditorWorkspaceLayoutState = {
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  inspectorWidthPx: 420,
  timelineDensity: "comfortable",
  timelineHeightPx: 280,
  previewSize: "fit",
  focusMode: false,
};

export const EDITOR_TIMELINE_DENSITY_HEIGHTS: Record<
  EditorTimelineDensity,
  number
> = {
  compact: EDITOR_TIMELINE_MIN_HEIGHT_PX,
  comfortable: DEFAULT_EDITOR_WORKSPACE_LAYOUT.timelineHeightPx,
  expanded: EDITOR_TIMELINE_MAX_HEIGHT_PX,
};
