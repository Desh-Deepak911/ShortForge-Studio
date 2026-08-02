import {
  DEFAULT_EDITOR_WORKSPACE_LAYOUT,
  EDITOR_INSPECTOR_MAX_WIDTH_PX,
  EDITOR_INSPECTOR_MIN_WIDTH_PX,
  EDITOR_TIMELINE_MAX_HEIGHT_PX,
  EDITOR_TIMELINE_MIN_HEIGHT_PX,
  type EditorTimelineDensity,
  type EditorPreviewSize,
  type EditorWorkspaceLayoutState,
} from "./editor-workspace-layout.types";

export const EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY =
  "shortforge.editor.workspace-layout.v2";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isTimelineDensity(value: unknown): value is EditorTimelineDensity {
  return value === "compact" || value === "comfortable" || value === "expanded";
}

function isPreviewSize(value: unknown): value is EditorPreviewSize {
  return value === "fit" || value === "100" || value === "125";
}

export function normalizeEditorWorkspaceLayout(
  value: Partial<EditorWorkspaceLayoutState> | null | undefined,
): EditorWorkspaceLayoutState {
  return {
    sidebarCollapsed:
      typeof value?.sidebarCollapsed === "boolean"
        ? value.sidebarCollapsed
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.sidebarCollapsed,
    inspectorCollapsed:
      typeof value?.inspectorCollapsed === "boolean"
        ? value.inspectorCollapsed
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.inspectorCollapsed,
    inspectorWidthPx:
      typeof value?.inspectorWidthPx === "number" &&
      Number.isFinite(value.inspectorWidthPx)
        ? clamp(
            value.inspectorWidthPx,
            EDITOR_INSPECTOR_MIN_WIDTH_PX,
            EDITOR_INSPECTOR_MAX_WIDTH_PX,
          )
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.inspectorWidthPx,
    timelineDensity: isTimelineDensity(value?.timelineDensity)
      ? value.timelineDensity
      : DEFAULT_EDITOR_WORKSPACE_LAYOUT.timelineDensity,
    timelineHeightPx:
      typeof value?.timelineHeightPx === "number" &&
      Number.isFinite(value.timelineHeightPx)
        ? clamp(
            value.timelineHeightPx,
            EDITOR_TIMELINE_MIN_HEIGHT_PX,
            EDITOR_TIMELINE_MAX_HEIGHT_PX,
          )
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.timelineHeightPx,
    previewSize: isPreviewSize(value?.previewSize)
      ? value.previewSize
      : DEFAULT_EDITOR_WORKSPACE_LAYOUT.previewSize,
    focusMode:
      typeof value?.focusMode === "boolean"
        ? value.focusMode
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.focusMode,
    exportDrawerOpen:
      typeof value?.exportDrawerOpen === "boolean"
        ? value.exportDrawerOpen
        : DEFAULT_EDITOR_WORKSPACE_LAYOUT.exportDrawerOpen,
  };
}

export function readEditorWorkspaceLayout(): EditorWorkspaceLayoutState {
  if (typeof window === "undefined") {
    return DEFAULT_EDITOR_WORKSPACE_LAYOUT;
  }

  try {
    const raw = window.localStorage.getItem(
      EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
    );
    if (!raw) {
      return DEFAULT_EDITOR_WORKSPACE_LAYOUT;
    }
    return normalizeEditorWorkspaceLayout(
      JSON.parse(raw) as Partial<EditorWorkspaceLayoutState>,
    );
  } catch {
    return DEFAULT_EDITOR_WORKSPACE_LAYOUT;
  }
}

export function writeEditorWorkspaceLayout(
  layout: EditorWorkspaceLayoutState,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      EDITOR_WORKSPACE_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeEditorWorkspaceLayout(layout)),
    );
  } catch {
    // Layout persistence is optional and must never block editing.
  }
}
