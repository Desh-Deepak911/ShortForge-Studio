export type EditorTimelineDensity = "compact" | "comfortable" | "expanded";

export interface EditorWorkspaceLayoutState {
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  inspectorWidthPx: number;
  timelineDensity: EditorTimelineDensity;
  timelineHeightPx: number;
}

export const EDITOR_INSPECTOR_MIN_WIDTH_PX = 336;
export const EDITOR_INSPECTOR_MAX_WIDTH_PX = 520;
export const EDITOR_TIMELINE_MIN_HEIGHT_PX = 112;
export const EDITOR_TIMELINE_MAX_HEIGHT_PX = 360;

export const DEFAULT_EDITOR_WORKSPACE_LAYOUT: EditorWorkspaceLayoutState = {
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  inspectorWidthPx: 384,
  timelineDensity: "comfortable",
  timelineHeightPx: 224,
};

export const EDITOR_TIMELINE_DENSITY_HEIGHTS: Record<
  EditorTimelineDensity,
  number
> = {
  compact: EDITOR_TIMELINE_MIN_HEIGHT_PX,
  comfortable: DEFAULT_EDITOR_WORKSPACE_LAYOUT.timelineHeightPx,
  expanded: 320,
};
