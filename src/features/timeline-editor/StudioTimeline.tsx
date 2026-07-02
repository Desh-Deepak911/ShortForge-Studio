"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEditorSelection } from "@/features/editor/selection";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import type { FootieScript } from "@/features/story/types";

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
  timelineEditorFallbackNotice,
  timelineEditorPlaybackLocked,
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
import type { TimelineDragState } from "./timeline-editor.types";
import { computeDragPreview } from "./timeline-reorder.utils";

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
  const blockRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const wrapperRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [menu, setMenu] = useState<TimelineContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TimelineDragState | null>(null);
  const dragStateRef = useRef<TimelineDragState | null>(null);
  const scriptRef = useRef(script);
  const lastPlayheadScrollAtRef = useRef(0);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  const reorderDisabled = selection.phase === SelectionPhase.PlaybackLocked;

  const layoutScript = useMemo(() => {
    if (!dragState) {
      return script;
    }

    return buildScriptFromSceneOrder(script, dragState.previewSceneIds);
  }, [dragState, script]);

  const masterTimeline = useMemo(() => buildPreviewMasterTimeline(layoutScript), [layoutScript]);
  const layout = useMemo(
    () => deriveTimelineLayout(layoutScript, masterTimeline),
    [layoutScript, masterTimeline],
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
      if (reorderDisabled) {
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
    [reorderDisabled, script.scenes],
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

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && layout.devWarning) {
      console.warn(`[StudioTimeline] ${layout.devWarning}`);
    }
  }, [layout.devWarning]);

  useEffect(() => {
    if (dragState || playback.isPlaying) {
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
  }, [dragState, playback.isPlaying, selection.selectedSceneId]);

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
        data-timeline-playback={playback.isPlaying ? "active" : "idle"}
        data-timeline-playback-locked={reorderDisabled ? "true" : "false"}
      >
        {layout.layoutSource === "equal-fallback" && layout.devWarning ? (
          <p className={timelineEditorFallbackNotice} role="status">
            {layout.devWarning}
          </p>
        ) : null}

        <p className={timelineEditorCoarsePointerHint}>
          Tap the ⋮ menu on any scene for insert, duplicate, and delete actions.
        </p>

        <div
          ref={scrollContainerRef}
          className={`${timelineEditorRailScroll} ${reorderDisabled ? `cursor-not-allowed ${timelineEditorPlaybackLocked}` : ""}`.trim()}
        >
          <div className={timelineEditorTrackSurface}>
            <div className={timelineEditorSegmentRow}>
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
                  reorderDisabled={reorderDisabled}
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
