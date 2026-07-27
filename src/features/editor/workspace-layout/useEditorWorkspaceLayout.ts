"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
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
  beginInspectorResize: (event: ReactPointerEvent<HTMLElement>) => void;
  beginTimelineResize: (event: ReactPointerEvent<HTMLElement>) => void;
  resetLayout: () => void;
}

export function useEditorWorkspaceLayout(): EditorWorkspaceLayoutController {
  const [layout, setLayout] = useState<EditorWorkspaceLayoutState>(() =>
    readEditorWorkspaceLayout(),
  );
  const hydratedRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLayout(readEditorWorkspaceLayout());
      hydratedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (hydratedRef.current) {
      writeEditorWorkspaceLayout(layout);
    }
  }, [layout]);

  const patchLayout = useCallback(
    (patch: Partial<EditorWorkspaceLayoutState>) => {
      setLayout((current) =>
        normalizeEditorWorkspaceLayout({ ...current, ...patch }),
      );
    },
    [],
  );

  const toggleSidebar = useCallback(() => {
    setLayout((current) => ({
      ...current,
      sidebarCollapsed: !current.sidebarCollapsed,
    }));
  }, []);

  const toggleInspector = useCallback(() => {
    setLayout((current) => ({
      ...current,
      inspectorCollapsed: !current.inspectorCollapsed,
    }));
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
    setLayout((current) => ({ ...current, focusMode: !current.focusMode }));
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
    setLayout(normalizeEditorWorkspaceLayout(null));
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
        setLayout((current) => {
          const next: EditorTimelineDensity =
            current.timelineDensity === "compact"
              ? "comfortable"
              : current.timelineDensity === "comfortable"
                ? "expanded"
                : "compact";
          return {
            ...current,
            timelineDensity: next,
            timelineHeightPx: EDITOR_TIMELINE_DENSITY_HEIGHTS[next],
          };
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
    beginInspectorResize,
    beginTimelineResize,
    resetLayout,
  };
}
