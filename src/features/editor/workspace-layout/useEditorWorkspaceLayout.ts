"use client";

import {
  useCallback,
  useEffect,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  DEFAULT_EDITOR_WORKSPACE_LAYOUT,
  EDITOR_INSPECTOR_MAX_WIDTH_PX,
  EDITOR_INSPECTOR_MIN_WIDTH_PX,
  EDITOR_TIMELINE_DENSITY_HEIGHTS,
  EDITOR_TIMELINE_MAX_HEIGHT_PX,
  EDITOR_TIMELINE_MIN_HEIGHT_PX,
  type EditorTimelineDensity,
  type EditorPreviewSize,
  type EditorWorkspaceLayoutState,
} from "./editor-workspace-layout.types";
import {
  normalizeEditorWorkspaceLayout,
  readEditorWorkspaceLayout,
  writeEditorWorkspaceLayout,
} from "./editor-workspace-layout.storage";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export interface EditorWorkspaceLayoutController extends EditorWorkspaceLayoutState {
  toggleSidebar: () => void;
  toggleInspector: () => void;
  setTimelineDensity: (density: EditorTimelineDensity) => void;
  setPreviewSize: (size: EditorPreviewSize) => void;
  toggleFocusMode: () => void;
  setExportDrawerOpen: (open: boolean) => void;
  beginInspectorResize: (event: ReactPointerEvent<HTMLElement>) => void;
  beginTimelineResize: (event: ReactPointerEvent<HTMLElement>) => void;
  resetLayout: () => void;
}

/**
 * Workspace chrome store.
 *
 * Hydration contract: {@link getServerEditorWorkspaceLayoutSnapshot} always
 * returns {@link DEFAULT_EDITOR_WORKSPACE_LAYOUT}. Browser-backed values are
 * adopted on the first client subscribe (after hydration), never during the
 * server/first-client hydration snapshot.
 */
let layoutSnapshot: EditorWorkspaceLayoutState = DEFAULT_EDITOR_WORKSPACE_LAYOUT;
let layoutAdopted = false;
const layoutListeners = new Set<() => void>();

function emitLayoutChange(): void {
  for (const listener of layoutListeners) {
    listener();
  }
}

function commitLayout(next: EditorWorkspaceLayoutState): void {
  const normalized = normalizeEditorWorkspaceLayout(next);
  layoutSnapshot = normalized;
  if (layoutAdopted) {
    writeEditorWorkspaceLayout(normalized);
  }
  emitLayoutChange();
}

export function subscribeEditorWorkspaceLayout(
  onStoreChange: () => void,
): () => void {
  layoutListeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    // Adopt (or refresh) browser-backed layout after hydration / on remount.
    layoutAdopted = true;
    layoutSnapshot = readEditorWorkspaceLayout();
  }
  return () => {
    layoutListeners.delete(onStoreChange);
  };
}

export function getEditorWorkspaceLayoutSnapshot(): EditorWorkspaceLayoutState {
  return layoutSnapshot;
}

export function getServerEditorWorkspaceLayoutSnapshot(): EditorWorkspaceLayoutState {
  return DEFAULT_EDITOR_WORKSPACE_LAYOUT;
}

export function useEditorWorkspaceLayout(): EditorWorkspaceLayoutController {
  const layout = useSyncExternalStore(
    subscribeEditorWorkspaceLayout,
    getEditorWorkspaceLayoutSnapshot,
    getServerEditorWorkspaceLayoutSnapshot,
  );

  const patchLayout = useCallback(
    (patch: Partial<EditorWorkspaceLayoutState>) => {
      commitLayout({ ...getEditorWorkspaceLayoutSnapshot(), ...patch });
    },
    [],
  );

  const toggleSidebar = useCallback(() => {
    const current = getEditorWorkspaceLayoutSnapshot();
    commitLayout({
      ...current,
      sidebarCollapsed: !current.sidebarCollapsed,
    });
  }, []);

  const toggleInspector = useCallback(() => {
    const current = getEditorWorkspaceLayoutSnapshot();
    commitLayout({
      ...current,
      inspectorCollapsed: !current.inspectorCollapsed,
    });
  }, []);

  const setTimelineDensity = useCallback(
    (density: EditorTimelineDensity) => {
      patchLayout({
        timelineDensity: density,
        timelineHeightPx: EDITOR_TIMELINE_DENSITY_HEIGHTS[density],
      });
    },
    [patchLayout],
  );

  const setPreviewSize = useCallback(
    (previewSize: EditorPreviewSize) => patchLayout({ previewSize }),
    [patchLayout],
  );

  const toggleFocusMode = useCallback(() => {
    const current = getEditorWorkspaceLayoutSnapshot();
    commitLayout({ ...current, focusMode: !current.focusMode });
  }, []);

  const setExportDrawerOpen = useCallback((open: boolean) => {
    const current = getEditorWorkspaceLayoutSnapshot();
    if (current.exportDrawerOpen === open) {
      return;
    }
    commitLayout({ ...current, exportDrawerOpen: open });
  }, []);

  const beginInspectorResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (layout.inspectorCollapsed) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = layout.inspectorWidthPx;

      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          EDITOR_INSPECTOR_MAX_WIDTH_PX,
          Math.max(
            EDITOR_INSPECTOR_MIN_WIDTH_PX,
            startWidth + startX - moveEvent.clientX,
          ),
        );
        patchLayout({ inspectorWidthPx: next });
      };
      const onEnd = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [layout.inspectorCollapsed, layout.inspectorWidthPx, patchLayout],
  );

  const beginTimelineResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (layout.timelineDensity === "compact") {
        return;
      }
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = layout.timelineHeightPx;

      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.min(
          EDITOR_TIMELINE_MAX_HEIGHT_PX,
          Math.max(
            EDITOR_TIMELINE_MIN_HEIGHT_PX,
            startHeight + startY - moveEvent.clientY,
          ),
        );
        patchLayout({
          timelineDensity:
            next >= 288 ? "expanded" : next <= 144 ? "compact" : "comfortable",
          timelineHeightPx: next,
        });
      };
      const onEnd = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [layout.timelineDensity, layout.timelineHeightPx, patchLayout],
  );

  const resetLayout = useCallback(() => {
    commitLayout(normalizeEditorWorkspaceLayout(null));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggleSidebar();
      } else if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        toggleInspector();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        const current = getEditorWorkspaceLayoutSnapshot();
        const next: EditorTimelineDensity =
          current.timelineDensity === "compact"
            ? "comfortable"
            : current.timelineDensity === "comfortable"
              ? "expanded"
              : "compact";
        commitLayout({
          ...current,
          timelineDensity: next,
          timelineHeightPx: EDITOR_TIMELINE_DENSITY_HEIGHTS[next],
        });
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFocusMode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFocusMode, toggleInspector, toggleSidebar]);

  return {
    ...layout,
    toggleSidebar,
    toggleInspector,
    setTimelineDensity,
    setPreviewSize,
    toggleFocusMode,
    setExportDrawerOpen,
    beginInspectorResize,
    beginTimelineResize,
    resetLayout,
  };
}
