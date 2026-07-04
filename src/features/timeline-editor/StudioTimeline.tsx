"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEditorSelection } from "@/features/editor/selection";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import { usePreviewMasterTimelineContext } from "@/features/timeline-intelligence/master-timeline";
import type { FootieScript } from "@/features/story/types";
import { applySceneUpdate } from "@/lib/utils/voiceover";

import { deriveTimelineLayout } from "./derive-timeline-layout.utils";
import TimelineContextMenu, {
  type TimelineContextMenuAction,
  type TimelineContextMenuState,
} from "./TimelineContextMenu";
import TimelineEmptyState from "./TimelineEmptyState";
import TimelinePlaybackHead from "./TimelinePlaybackHead";
import { useTimelinePlayback } from "./TimelinePlaybackPort";
import { clampTimelinePlaybackProgress } from "./timeline-playback-port.types";
import {
  timelineEditorCoarsePointerHint,
  timelineEditorDurationHint,
  timelineEditorFallbackNotice,
  timelineEditorPlaybackLocked,
  timelineEditorRailResizing,
  timelineEditorRailScroll,
  timelineEditorSegmentRow,
  timelineEditorTrackSurface,
} from "./timeline-editor.ui";
import TimelineSceneBlock from "./TimelineSceneBlock";
import TimelineTransitionMarker from "./TimelineTransitionMarker";
import {
  deleteTimelineScene,
  duplicateTimelineScene,
  insertTimelineSceneAfter,
  insertTimelineSceneBefore,
  reorderTimelineScene,
} from "./timeline-editor.commands";
import type { TimelineDragState, TimelineResizeState } from "./timeline-editor.types";
import { computeDragPreview } from "./timeline-reorder.utils";
import {
  applyResizePreviewToLayout,
  nudgeDurationSec,
  resolveResizedDurationSec,
} from "./timeline-resize.utils";

export interface StudioTimelineProps {
  script: FootieScript;
  onScriptChange: (script: FootieScript) => void;
  className?: string;
  id?: string;
}

function buildScriptFromSceneOrder(script: FootieScript, sceneIds: string[]): FootieScript {
  const sceneById = new Map(script.scenes.map((scene) => [scene.id, scene]));
  const scenes = sceneIds
    .map((sceneId) => sceneById.get(sceneId))
    .filter((scene): scene is FootieScript["scenes"][number] => scene != null);

  if (scenes.length !== script.scenes.length) {
    return script;
  }

  return {
    ...script,
    scenes,
  };
}

/**
 * Duration-aware studio timeline — layout from preview MasterTimeline, selection via Selection Engine.
 *
 * Scene reorder may recalculate subtitles-mode narration excerpts via existing applyStoryUpdate/sync
 * behavior when the document commits — not altered here.
 */
export default function StudioTimeline({
  script,
  onScriptChange,
  className = "",
  id,
}: StudioTimelineProps) {
  const selection = useEditorSelection();
  const playback = useTimelinePlayback();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const segmentRowRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const wrapperRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [menu, setMenu] = useState<TimelineContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TimelineDragState | null>(null);
  const [resizeState, setResizeState] = useState<TimelineResizeState | null>(null);
  const dragStateRef = useRef<TimelineDragState | null>(null);
  const resizeStateRef = useRef<TimelineResizeState | null>(null);
  const scriptRef = useRef(script);
  const lastPlayheadScrollAtRef = useRef(0);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  const playbackLocked = selection.phase === SelectionPhase.PlaybackLocked;
  const reorderDisabled = playbackLocked || resizeState != null;
  const resizeDisabled = playbackLocked || dragState != null;

  const layoutScript = useMemo(() => {
    if (!dragState) {
      return script;
    }

    return buildScriptFromSceneOrder(script, dragState.previewSceneIds);
  }, [dragState, script]);

  const sharedPreviewTimeline = usePreviewMasterTimelineContext();
  const fallbackMasterTimeline = useMemo(() => {
    if (sharedPreviewTimeline || dragState) {
      return null;
    }
    return buildPreviewMasterTimeline(script);
  }, [dragState, script, sharedPreviewTimeline]);
  // Drag preview may reorder scenes before commit — build a temporary layout timeline only then.
  const dragMasterTimeline = useMemo(() => {
    if (!dragState) {
      return null;
    }
    return buildPreviewMasterTimeline(layoutScript);
  }, [dragState, layoutScript]);
  const masterTimeline = dragState
    ? dragMasterTimeline
    : (sharedPreviewTimeline?.previewMasterTimeline ?? fallbackMasterTimeline);
  const baseLayout = useMemo(
    () => deriveTimelineLayout(layoutScript, masterTimeline),
    [layoutScript, masterTimeline],
  );
  const layout = useMemo(
    () => (resizeState ? applyResizePreviewToLayout(baseLayout, resizeState) : baseLayout),
    [baseLayout, resizeState],
  );

  const sceneById = useMemo(() => {
    return new Map(script.scenes.map((scene) => [scene.id, scene]));
  }, [script.scenes]);

  const sceneIndexById = useMemo(() => {
    const orderIds = dragState?.previewSceneIds ?? script.scenes.map((scene) => scene.id);
    return new Map(orderIds.map((sceneId, index) => [sceneId, index]));
  }, [dragState?.previewSceneIds, script.scenes]);

  const draggedSceneId = dragState?.draggedSceneId ?? null;

  const playbackProgress = useMemo(
    () => clampTimelinePlaybackProgress(playback.currentTimeMs, playback.renderDurationMs),
    [playback.currentTimeMs, playback.renderDurationMs],
  );

  const showPlaybackHead =
    playback.renderDurationMs > 0 &&
    (playback.isPlaying || playback.currentTimeMs > 0);

  const applyCommand = useCallback(
    (result: ReturnType<typeof duplicateTimelineScene>) => {
      if (!result) {
        return;
      }

      onScriptChange(result.script);
      selection.selectScene(result.selectSceneId);
      setMenu(null);
    },
    [onScriptChange, selection],
  );

  const handleMenuAction = useCallback(
    (action: TimelineContextMenuAction) => {
      if (!menu) {
        return;
      }

      switch (action) {
        case "duplicate":
          applyCommand(duplicateTimelineScene(script, menu.sceneId));
          break;
        case "delete":
          applyCommand(deleteTimelineScene(script, menu.sceneId));
          break;
        case "insert-before":
          applyCommand(insertTimelineSceneBefore(script, menu.sceneId));
          break;
        case "insert-after":
          applyCommand(insertTimelineSceneAfter(script, menu.sceneId));
          break;
        default:
          break;
      }
    },
    [applyCommand, menu, script],
  );

  const readBlockBounds = useCallback(() => {
    const bounds = new Map<string, DOMRect>();
    for (const [sceneId, element] of wrapperRefs.current.entries()) {
      if (element) {
        bounds.set(sceneId, element.getBoundingClientRect());
      }
    }
    return bounds;
  }, []);

  const handleDragHandlePointerDown = useCallback(
    (sceneId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (playbackLocked || resizeStateRef.current) {
        return;
      }

      event.preventDefault();
      setMenu(null);

      const sourceIndex = script.scenes.findIndex((scene) => scene.id === sceneId);
      if (sourceIndex < 0) {
        return;
      }

      const sceneIds = script.scenes.map((scene) => scene.id);
      const nextDragState: TimelineDragState = {
        draggedSceneId: sceneId,
        sourceIndex,
        hoverTargetIndex: sourceIndex,
        previewSceneIds: sceneIds,
      };
      dragStateRef.current = nextDragState;
      setDragState(nextDragState);
    },
    [playbackLocked, script.scenes],
  );

  const handleDurationNudge = useCallback(
    (sceneId: string, deltaSec: number) => {
      if (playbackLocked || dragStateRef.current || resizeStateRef.current) {
        return;
      }

      const scene = scriptRef.current.scenes.find((entry) => entry.id === sceneId);
      if (!scene) {
        return;
      }

      const currentDurationSec = Math.max(
        1,
        Math.round(scene.durationMs != null && scene.durationMs > 0
          ? scene.durationMs / 1000
          : scene.duration),
      );
      const nextDurationSec = nudgeDurationSec(currentDurationSec, deltaSec);
      if (nextDurationSec === currentDurationSec) {
        return;
      }

      onScriptChange(
        applySceneUpdate(scriptRef.current, sceneId, {
          duration: nextDurationSec,
        }),
      );
    },
    [onScriptChange, playbackLocked],
  );

  const handleResizeHandlePointerDown = useCallback(
    (sceneId: string, event: React.PointerEvent<HTMLButtonElement>) => {
      if (playbackLocked || dragStateRef.current) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setMenu(null);
      selection.selectScene(sceneId);

      const scene = scriptRef.current.scenes.find((entry) => entry.id === sceneId);
      if (!scene) {
        return;
      }

      const startDurationMs = Math.max(
        1000,
        Math.round((scene.durationMs ?? scene.duration * 1000) || 1000),
      );
      const railWidthPx = Math.max(
        1,
        segmentRowRef.current?.clientWidth ?? scrollContainerRef.current?.clientWidth ?? 1,
      );
      const totalDurationMs = Math.max(1, baseLayout.totalDurationMs);
      const previewDurationSec = Math.max(1, Math.round(startDurationMs / 1000));

      const nextResizeState: TimelineResizeState = {
        sceneId,
        startDurationMs,
        startClientX: event.clientX,
        railWidthPx,
        totalDurationMs,
        previewDurationSec,
      };
      resizeStateRef.current = nextResizeState;
      setResizeState(nextResizeState);
    },
    [baseLayout.totalDurationMs, playbackLocked, selection],
  );

  useEffect(() => {
    if (!draggedSceneId) {
      return;
    }

    const originalSceneIds = scriptRef.current.scenes.map((scene) => scene.id);

    const handlePointerMove = (event: PointerEvent) => {
      const nextPreview = computeDragPreview(
        originalSceneIds,
        draggedSceneId,
        event.clientX,
        readBlockBounds(),
      );

      setDragState((current) => {
        if (!current) {
          return current;
        }

        const nextDragState: TimelineDragState = {
          ...current,
          hoverTargetIndex: nextPreview.targetIndex,
          previewSceneIds: nextPreview.previewSceneIds,
        };
        dragStateRef.current = nextDragState;
        return nextDragState;
      });
    };

    const handlePointerUp = () => {
      const current = dragStateRef.current;
      if (!current) {
        return;
      }

      const result = reorderTimelineScene(
        scriptRef.current,
        current.draggedSceneId,
        current.hoverTargetIndex,
      );

      if (result && result.script !== scriptRef.current) {
        onScriptChange(result.script);
        selection.selectScene(result.selectSceneId);
      }

      setDragState(null);
      dragStateRef.current = null;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDragState(null);
        dragStateRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [draggedSceneId, onScriptChange, readBlockBounds, selection]);

  const resizingSceneId = resizeState?.sceneId ?? null;

  useEffect(() => {
    if (!resizingSceneId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = resizeStateRef.current;
      if (!current) {
        return;
      }

      // Prevent page/rail scroll while resizing on touch devices.
      event.preventDefault();

      const previewDurationSec = resolveResizedDurationSec({
        startDurationMs: current.startDurationMs,
        pointerDeltaX: event.clientX - current.startClientX,
        railWidthPx: current.railWidthPx,
        totalDurationMs: current.totalDurationMs,
      });

      if (previewDurationSec === current.previewDurationSec) {
        return;
      }

      const nextResizeState: TimelineResizeState = {
        ...current,
        previewDurationSec,
      };
      resizeStateRef.current = nextResizeState;
      setResizeState(nextResizeState);
    };

    const commitResize = () => {
      const current = resizeStateRef.current;
      if (!current) {
        return;
      }

      // Live preview duration is already snapped/clamped during move.
      const durationSec = current.previewDurationSec;
      const startDurationSec = Math.round(current.startDurationMs / 1000);

      if (durationSec !== startDurationSec) {
        onScriptChange(
          applySceneUpdate(scriptRef.current, current.sceneId, {
            duration: durationSec,
          }),
        );
      }

      resizeStateRef.current = null;
      setResizeState(null);
    };

    const handlePointerUp = () => {
      commitResize();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        resizeStateRef.current = null;
        setResizeState(null);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onScriptChange, resizingSceneId]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && layout.devWarning) {
      console.warn(`[StudioTimeline] ${layout.devWarning}`);
    }
  }, [layout.devWarning]);

  useEffect(() => {
    if (dragState || resizeState || playback.isPlaying) {
      return;
    }

    const selectedId = selection.selectedSceneId;
    if (!selectedId) {
      return;
    }

    blockRefs.current.get(selectedId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [dragState, playback.isPlaying, resizeState, selection.selectedSceneId]);

  useEffect(() => {
    if (!playback.isPlaying || !showPlaybackHead) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const playheadX = playbackProgress * container.scrollWidth;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;
    const edgeMargin = 72;

    if (playheadX >= viewLeft + edgeMargin && playheadX <= viewRight - edgeMargin) {
      return;
    }

    const now = Date.now();
    if (now - lastPlayheadScrollAtRef.current < 500) {
      return;
    }
    lastPlayheadScrollAtRef.current = now;

    const targetLeft =
      playheadX < viewLeft + edgeMargin
        ? Math.max(0, playheadX - edgeMargin)
        : playheadX - container.clientWidth + edgeMargin;

    container.scrollTo({
      left: targetLeft,
      behavior: "smooth",
    });
  }, [playback.isPlaying, playbackProgress, playback.currentTimeMs, showPlaybackHead]);

  if (script.scenes.length === 0) {
    return (
      <nav
        id={id}
        aria-label="Scene timeline"
        className={`flex min-h-0 flex-1 flex-col ${className}`.trim()}
        data-timeline-layout="empty"
      >
        <TimelineEmptyState variant="no-scenes" />
      </nav>
    );
  }

  if (layout.segments.length === 0) {
    return (
      <nav
        id={id}
        aria-label="Scene timeline"
        className={`flex min-h-0 flex-1 flex-col ${className}`.trim()}
        data-timeline-layout="unavailable"
      >
        <TimelineEmptyState variant="unavailable" />
      </nav>
    );
  }

  return (
    <>
      <nav
        id={id}
        aria-label="Scene timeline"
        className={`flex min-h-0 flex-1 flex-col ${className}`.trim()}
        data-timeline-layout={layout.layoutSource}
        data-timeline-dragging={dragState ? "true" : "false"}
        data-timeline-resizing={resizeState ? "true" : "false"}
        data-timeline-playback={playback.isPlaying ? "active" : "idle"}
        data-timeline-playback-locked={playbackLocked ? "true" : "false"}
      >
        {layout.layoutSource === "equal-fallback" && layout.devWarning ? (
          <p className={timelineEditorFallbackNotice} role="status">
            {layout.devWarning}
          </p>
        ) : null}

        <p className={timelineEditorCoarsePointerHint}>
          Tap the ⋮ menu on any scene for insert, duplicate, and delete actions.
        </p>

        <p className={timelineEditorDurationHint} data-timeline-duration-hint>
          Drag a scene edge to adjust duration.
        </p>

        <div
          ref={scrollContainerRef}
          className={`${timelineEditorRailScroll} ${playbackLocked ? `cursor-not-allowed ${timelineEditorPlaybackLocked}` : ""} ${resizeState ? timelineEditorRailResizing : ""}`.trim()}
        >
          <div className={timelineEditorTrackSurface}>
            <div ref={segmentRowRef} className={timelineEditorSegmentRow}>
            {layout.segments.map((segment) => {
              if (segment.type === "transition") {
                return <TimelineTransitionMarker key={segment.marker.id} marker={segment.marker} />;
              }

              const scene = sceneById.get(segment.block.sceneId);
              if (!scene) {
                return null;
              }

              const sceneIndex = sceneIndexById.get(segment.block.sceneId) ?? segment.block.sceneIndex;
              const isSelected = selection.selectedSceneId === segment.block.sceneId;
              const isDragging = dragState?.draggedSceneId === segment.block.sceneId;
              const isResizing = resizeState?.sceneId === segment.block.sceneId;
              const showInsertBefore =
                dragState != null && dragState.hoverTargetIndex === sceneIndex;

              return (
                <TimelineSceneBlock
                  key={segment.block.sceneId}
                  block={{
                    ...segment.block,
                    sceneIndex,
                    sceneNumber: sceneIndex + 1,
                  }}
                  scene={scene}
                  isSelected={isSelected}
                  isDragging={isDragging}
                  isResizing={isResizing}
                  reorderDisabled={reorderDisabled}
                  resizeDisabled={resizeDisabled}
                  showInsertBefore={showInsertBefore}
                  onSelect={() => selection.selectScene(segment.block.sceneId)}
                  onMenuOpen={({ x, y }) =>
                    setMenu({
                      sceneId: segment.block.sceneId,
                      sceneNumber: sceneIndex + 1,
                      x,
                      y,
                    })
                  }
                  onDragHandlePointerDown={(event) =>
                    handleDragHandlePointerDown(segment.block.sceneId, event)
                  }
                  onResizeHandlePointerDown={(event) =>
                    handleResizeHandlePointerDown(segment.block.sceneId, event)
                  }
                  onDurationNudge={(deltaSec) =>
                    handleDurationNudge(segment.block.sceneId, deltaSec)
                  }
                  blockRef={(element) => {
                    blockRefs.current.set(segment.block.sceneId, element);
                  }}
                  wrapperRef={(element) => {
                    wrapperRefs.current.set(segment.block.sceneId, element);
                  }}
                />
              );
            })}
            </div>
            {showPlaybackHead ? (
              <TimelinePlaybackHead progress={playbackProgress} isActive={playback.isPlaying} />
            ) : null}
          </div>
        </div>
      </nav>

      {menu ? (
        <TimelineContextMenu
          menu={menu}
          canDelete={script.scenes.length > 1}
          onAction={handleMenuAction}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
