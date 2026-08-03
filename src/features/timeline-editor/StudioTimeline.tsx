"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useEditorSelection } from "@/features/editor/selection";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import { buildPreviewMasterTimeline } from "@/features/preview/utils/preview-master-timeline.utils";
import {
  buildVideoTrimPreviewOverride,
  useVideoTrimPreviewOptional,
} from "@/features/preview/video-trim-preview";
import { SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE } from "@/features/scene-media-timeline/editor";
import { usePreviewMasterTimelineContext } from "@/features/timeline-intelligence/master-timeline";
import type { FootieScript } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";
import {
  applySceneUpdate,
  type StoryScriptChangeOptions,
} from "@/lib/utils/voiceover";

import SceneMediaTimelineLane from "./scene-media/SceneMediaTimelineLane";
import { useOptionalSceneMediaImageAppendContext } from "./scene-media/SceneMediaImageAppendContext";
import {
  isMediaBoundaryGlobalLockActive,
  isMediaBoundaryLaneLocked,
  releaseMediaBoundaryOwner,
  tryAcquireMediaBoundaryOwner,
} from "./scene-media/media-boundary-owner.lock";
import { sceneMediaLaneNotice } from "./scene-media/scene-media-timeline.ui";
import {
  releaseTimelineExclusiveInteraction,
  setTimelineExclusiveInteraction,
} from "./scene-media/timeline-exclusive-interaction.lock";
import {
  useSourceQualityIntelligenceEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";

import {
  SCENE_MEDIA_IMAGE_ACCEPT,
  useSceneMediaImageAppend,
} from "./scene-media/useSceneMediaImageAppend";

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
  timelineEditorSelectedMediaLane,
  timelineEditorRailTrimming,
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
import type {
  TimelineDragState,
  TimelineResizeState,
  TimelineVideoTrimState,
} from "./timeline-editor.types";
import { computeDragPreview } from "./timeline-reorder.utils";
import {
  applyResizePreviewToLayout,
  nudgeDurationSec,
  resolveResizedDurationSec,
} from "./timeline-resize.utils";
import {
  applyTimelineTrimHandleDrag,
  nudgeTrimHandle,
  resolveTimelineVideoTrimWindow,
  type TimelineVideoTrimHandle,
} from "./timeline-video-trim.utils";
import { releaseTimelineTrimPointerCapture } from "./timeline-trim-interaction.utils";

export interface StudioTimelineProps {
  script: FootieScript;
  onScriptChange: (
    script: FootieScript,
    options?: StoryScriptChangeOptions,
  ) => void;
  /**
   * Dedicated media-intent trim commit — must call buildVideoTrimPatch
   * and onScriptChange(..., { intent: "media" }).
   */
  onApplyVideoTrim?: (
    sceneId: string,
    trim: { trimStartMs: number; trimEndMs: number },
  ) => boolean;
  className?: string;
  id?: string;
  /** UI-only density mode: keep all scene commands, but expand media lane for selection only. */
  selectedSceneDetailOnly?: boolean;
  /** When false, selected-scene media detail is hidden in compact timeline mode. */
  showSelectedSceneMedia?: boolean;
}

function buildScriptFromSceneOrder(
  script: FootieScript,
  sceneIds: string[],
): FootieScript {
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
  onApplyVideoTrim,
  className = "",
  id,
  selectedSceneDetailOnly = false,
  showSelectedSceneMedia = true,
}: StudioTimelineProps) {
  const selection = useEditorSelection();
  const playback = useTimelinePlayback();
  const trimPreview = useVideoTrimPreviewOptional();
  const trimPreviewRef = useRef(trimPreview);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const segmentRowRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const wrapperRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [menu, setMenu] = useState<TimelineContextMenuState | null>(null);
  const [dragState, setDragState] = useState<TimelineDragState | null>(null);
  const [resizeState, setResizeState] = useState<TimelineResizeState | null>(
    null,
  );
  const [trimState, setTrimState] = useState<TimelineVideoTrimState | null>(
    null,
  );
  const [mediaBoundaryOwnerSceneId, setMediaBoundaryOwnerSceneId] = useState<
    string | null
  >(null);
  const [boundaryCancelEpoch, setBoundaryCancelEpoch] = useState(0);
  const [isFinePointer, setIsFinePointer] = useState(true);
  const sharedAppend = useOptionalSceneMediaImageAppendContext();
  const capabilitiesReady = useVisualRetentionCapabilitiesReady();
  const sourceQualityEnabled = useSourceQualityIntelligenceEnabled();
  const sourceQualityIntelligenceEnabled =
    capabilitiesReady && sourceQualityEnabled;
  const localAppend = useSceneMediaImageAppend({
    script,
    onScriptChange,
    onSelectMediaItem: selection.selectSceneMediaItem,
    enabled: sharedAppend == null,
    sourceQualityIntelligenceEnabled,
  });
  const appendApi = sharedAppend ?? {
    appendImageFile: localAppend.appendImageFile,
    revokeOwnedUrlIfPresent: localAppend.revokeOwnedUrlIfPresent,
    accept: localAppend.accept || SCENE_MEDIA_IMAGE_ACCEPT,
  };
  const dragStateRef = useRef<TimelineDragState | null>(null);
  const resizeStateRef = useRef<TimelineResizeState | null>(null);
  const trimStateRef = useRef<TimelineVideoTrimState | null>(null);
  const trimCaptureTargetRef = useRef<Element | null>(null);
  const trimSettledRef = useRef(false);
  const scriptRef = useRef(script);
  const mediaBoundaryOwnerRef = useRef<string | null>(null);
  const lastPlayheadScrollAtRef = useRef(0);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  useEffect(() => {
    trimPreviewRef.current = trimPreview;
  }, [trimPreview]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mediaQuery = window.matchMedia("(pointer: fine)");
    const sync = () => setIsFinePointer(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  const playbackLocked = selection.phase === SelectionPhase.PlaybackLocked;
  const mediaInteractionActive = isMediaBoundaryGlobalLockActive(
    mediaBoundaryOwnerSceneId,
  );
  const reorderDisabled =
    playbackLocked ||
    resizeState != null ||
    trimState != null ||
    mediaInteractionActive;
  const resizeDisabled =
    playbackLocked ||
    dragState != null ||
    trimState != null ||
    mediaInteractionActive;
  const trimDisabled =
    playbackLocked ||
    dragState != null ||
    resizeState != null ||
    mediaInteractionActive;
  const contextMenuDisabled = trimState != null || mediaInteractionActive;
  const sceneMediaLaneBaseLocked =
    playbackLocked ||
    dragState != null ||
    resizeState != null ||
    trimState != null;

  useEffect(() => {
    const owner =
      dragState != null
        ? ("reorder" as const)
        : resizeState != null
          ? ("scene-resize" as const)
          : trimState != null
            ? ("video-trim" as const)
            : mediaBoundaryOwnerSceneId != null
              ? ("media-boundary" as const)
              : null;
    if (owner == null) {
      return;
    }
    setTimelineExclusiveInteraction(owner);
    return () => {
      releaseTimelineExclusiveInteraction(owner);
    };
  }, [dragState, resizeState, trimState, mediaBoundaryOwnerSceneId]);

  const tryAcquireMediaBoundary = useCallback((sceneId: string) => {
    const result = tryAcquireMediaBoundaryOwner(
      mediaBoundaryOwnerRef.current,
      sceneId,
    );
    if (!result.ok) {
      return false;
    }
    mediaBoundaryOwnerRef.current = result.owner;
    setMediaBoundaryOwnerSceneId(result.owner);
    return true;
  }, []);

  const releaseMediaBoundary = useCallback((sceneId: string) => {
    const next = releaseMediaBoundaryOwner(
      mediaBoundaryOwnerRef.current,
      sceneId,
    );
    mediaBoundaryOwnerRef.current = next;
    setMediaBoundaryOwnerSceneId(next);
  }, []);

  // Selecting another scene cancels an active boundary interaction without commit.
  useEffect(() => {
    const owner = mediaBoundaryOwnerRef.current;
    if (!owner) {
      return;
    }
    if (selection.selectedSceneId !== owner) {
      setBoundaryCancelEpoch((epoch) => epoch + 1);
      const next = releaseMediaBoundaryOwner(
        mediaBoundaryOwnerRef.current,
        owner,
      );
      mediaBoundaryOwnerRef.current = next;
      setMediaBoundaryOwnerSceneId(next);
    }
  }, [selection.selectedSceneId]);

  // Playback start cancels boundary interaction.
  useEffect(() => {
    const owner = mediaBoundaryOwnerRef.current;
    if (!owner || !playbackLocked) {
      return;
    }
    setBoundaryCancelEpoch((epoch) => epoch + 1);
    const next = releaseMediaBoundaryOwner(
      mediaBoundaryOwnerRef.current,
      owner,
    );
    mediaBoundaryOwnerRef.current = next;
    setMediaBoundaryOwnerSceneId(next);
  }, [playbackLocked]);

  // Owning scene removed from the document cancels without commit.
  useEffect(() => {
    const owner = mediaBoundaryOwnerRef.current;
    if (!owner) {
      return;
    }
    if (!script.scenes.some((entry) => entry.id === owner)) {
      setBoundaryCancelEpoch((epoch) => epoch + 1);
      const next = releaseMediaBoundaryOwner(
        mediaBoundaryOwnerRef.current,
        owner,
      );
      mediaBoundaryOwnerRef.current = next;
      setMediaBoundaryOwnerSceneId(next);
    }
  }, [script.scenes]);

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
    () =>
      resizeState
        ? applyResizePreviewToLayout(baseLayout, resizeState)
        : baseLayout,
    [baseLayout, resizeState],
  );

  const sceneById = useMemo(() => {
    return new Map(script.scenes.map((scene) => [scene.id, scene]));
  }, [script.scenes]);
  const selectedScene =
    sceneById.get(selection.selectedSceneId ?? "") ??
    script.scenes[selection.selectedSceneIndex] ??
    null;

  const sceneIndexById = useMemo(() => {
    const orderIds =
      dragState?.previewSceneIds ?? script.scenes.map((scene) => scene.id);
    return new Map(orderIds.map((sceneId, index) => [sceneId, index]));
  }, [dragState?.previewSceneIds, script.scenes]);

  const draggedSceneId = dragState?.draggedSceneId ?? null;

  const playbackProgress = useMemo(
    () =>
      clampTimelinePlaybackProgress(
        playback.currentTimeMs,
        playback.renderDurationMs,
      ),
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
      if (playbackLocked || resizeStateRef.current || trimStateRef.current) {
        return;
      }

      event.preventDefault();
      setMenu(null);

      const sourceIndex = script.scenes.findIndex(
        (scene) => scene.id === sceneId,
      );
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
      if (
        playbackLocked ||
        dragStateRef.current ||
        resizeStateRef.current ||
        trimStateRef.current
      ) {
        return;
      }

      const scene = scriptRef.current.scenes.find(
        (entry) => entry.id === sceneId,
      );
      if (!scene) {
        return;
      }

      const currentDurationSec = Math.max(
        1,
        Math.round(
          scene.durationMs != null && scene.durationMs > 0
            ? scene.durationMs / 1000
            : scene.duration,
        ),
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
      if (playbackLocked || dragStateRef.current || trimStateRef.current) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setMenu(null);
      selection.selectScene(sceneId);

      const scene = scriptRef.current.scenes.find(
        (entry) => entry.id === sceneId,
      );
      if (!scene) {
        return;
      }

      const startDurationMs = Math.max(
        1000,
        Math.round((scene.durationMs ?? scene.duration * 1000) || 1000),
      );
      const railWidthPx = Math.max(
        1,
        segmentRowRef.current?.clientWidth ??
          scrollContainerRef.current?.clientWidth ??
          1,
      );
      const totalDurationMs = Math.max(1, baseLayout.totalDurationMs);
      const previewDurationSec = Math.max(
        1,
        Math.round(startDurationMs / 1000),
      );

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

  const publishTimelineTrimPreview = useCallback(
    (state: TimelineVideoTrimState) => {
      trimPreview?.setOverride(
        buildVideoTrimPreviewOverride({
          sceneId: state.sceneId,
          trimStartMs: state.previewTrimStartMs,
          trimEndMs: state.previewTrimEndMs,
          activeHandle: state.activeHandle,
          sourceDurationMs: state.sourceDurationMs,
          isActive: true,
          surface: "timeline",
        }),
      );
    },
    [trimPreview],
  );

  const clearTimelineTrimSession = useCallback(
    (options?: { clearOverride?: boolean }) => {
      const current = trimStateRef.current;
      releaseTimelineTrimPointerCapture(
        trimCaptureTargetRef.current,
        current?.pointerId,
      );
      trimCaptureTargetRef.current = null;
      trimStateRef.current = null;
      setTrimState(null);
      if (options?.clearOverride !== false) {
        trimPreview?.clearOverride();
      }
    },
    [trimPreview],
  );

  const cancelTimelineTrimSession = useCallback(() => {
    if (trimSettledRef.current) {
      return;
    }
    trimSettledRef.current = true;
    clearTimelineTrimSession({ clearOverride: true });
  }, [clearTimelineTrimSession]);

  const handleTrimHandlePointerDown = useCallback(
    (
      sceneId: string,
      handle: TimelineVideoTrimHandle,
      event: React.PointerEvent<HTMLButtonElement>,
      stripRect: DOMRect,
    ) => {
      if (
        playbackLocked ||
        dragStateRef.current ||
        resizeStateRef.current ||
        trimStateRef.current
      ) {
        return;
      }

      if (!onApplyVideoTrim) {
        return;
      }

      const scene = scriptRef.current.scenes.find(
        (entry) => entry.id === sceneId,
      );
      if (!scene) {
        return;
      }

      const window = resolveTimelineVideoTrimWindow(scene);
      const media = getSceneMedia(scene);
      if (!window || !media?.url?.trim()) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        trimCaptureTargetRef.current = event.currentTarget;
      } catch {
        trimCaptureTargetRef.current = event.currentTarget;
      }

      trimSettledRef.current = false;
      setMenu(null);
      selection.selectScene(sceneId);
      trimPreview?.clearOverride();

      const nextTrimState: TimelineVideoTrimState = {
        sceneId,
        activeHandle: handle,
        pointerId: event.pointerId,
        sourceDurationMs: window.sourceDurationMs,
        committedTrimStartMs: window.trimStartMs,
        committedTrimEndMs: window.trimEndMs,
        previewTrimStartMs: window.trimStartMs,
        previewTrimEndMs: window.trimEndMs,
        stripLeftPx: stripRect.left,
        stripWidthPx: Math.max(1, stripRect.width),
        pointerStartX: event.clientX,
        isActive: true,
        mediaUrl: media.url.trim(),
      };

      const drafted = applyTimelineTrimHandleDrag(
        handle,
        event.clientX,
        nextTrimState.stripLeftPx,
        nextTrimState.stripWidthPx,
        {
          trimStartMs: nextTrimState.previewTrimStartMs,
          trimEndMs: nextTrimState.previewTrimEndMs,
        },
        nextTrimState.sourceDurationMs,
      );

      const withDraft: TimelineVideoTrimState = {
        ...nextTrimState,
        previewTrimStartMs: drafted.trimStartMs,
        previewTrimEndMs: drafted.trimEndMs,
      };

      trimStateRef.current = withDraft;
      setTrimState(withDraft);
      publishTimelineTrimPreview(withDraft);
    },
    [
      onApplyVideoTrim,
      playbackLocked,
      publishTimelineTrimPreview,
      selection,
      trimPreview,
    ],
  );

  const handleTrimHandleKeyDown = useCallback(
    (
      sceneId: string,
      handle: TimelineVideoTrimHandle,
      event: React.KeyboardEvent<HTMLButtonElement>,
    ) => {
      if (
        playbackLocked ||
        dragStateRef.current ||
        resizeStateRef.current ||
        trimStateRef.current
      ) {
        return;
      }

      if (!onApplyVideoTrim) {
        return;
      }

      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      const scene = scriptRef.current.scenes.find(
        (entry) => entry.id === sceneId,
      );
      const window = resolveTimelineVideoTrimWindow(scene);
      if (!window) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      selection.selectScene(sceneId);

      const next = nudgeTrimHandle(
        handle,
        event.key,
        {
          trimStartMs: window.trimStartMs,
          trimEndMs: window.trimEndMs,
        },
        window.sourceDurationMs,
        event.shiftKey,
      );

      trimPreview?.setOverride(
        buildVideoTrimPreviewOverride({
          sceneId,
          trimStartMs: next.trimStartMs,
          trimEndMs: next.trimEndMs,
          activeHandle: handle,
          sourceDurationMs: window.sourceDurationMs,
          isActive: true,
          surface: "timeline",
        }),
      );

      onApplyVideoTrim(sceneId, next);
      trimPreview?.clearOverride();
    },
    [onApplyVideoTrim, playbackLocked, selection, trimPreview],
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

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
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

  const trimmingSceneId = trimState?.sceneId ?? null;

  useEffect(() => {
    if (!trimmingSceneId) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = trimStateRef.current;
      if (
        !current ||
        current.pointerId !== event.pointerId ||
        trimSettledRef.current
      ) {
        return;
      }

      event.preventDefault();

      const drafted = applyTimelineTrimHandleDrag(
        current.activeHandle,
        event.clientX,
        current.stripLeftPx,
        current.stripWidthPx,
        {
          trimStartMs: current.previewTrimStartMs,
          trimEndMs: current.previewTrimEndMs,
        },
        current.sourceDurationMs,
      );

      if (
        drafted.trimStartMs === current.previewTrimStartMs &&
        drafted.trimEndMs === current.previewTrimEndMs
      ) {
        return;
      }

      const nextTrimState: TimelineVideoTrimState = {
        ...current,
        previewTrimStartMs: drafted.trimStartMs,
        previewTrimEndMs: drafted.trimEndMs,
      };
      trimStateRef.current = nextTrimState;
      setTrimState(nextTrimState);
      publishTimelineTrimPreview(nextTrimState);
    };

    const cancelTrim = () => {
      cancelTimelineTrimSession();
    };

    const commitTrim = () => {
      if (trimSettledRef.current) {
        return;
      }
      trimSettledRef.current = true;

      const current = trimStateRef.current;
      if (!current) {
        clearTimelineTrimSession({ clearOverride: true });
        return;
      }

      const changed =
        current.previewTrimStartMs !== current.committedTrimStartMs ||
        current.previewTrimEndMs !== current.committedTrimEndMs;

      if (changed && onApplyVideoTrim) {
        onApplyVideoTrim(current.sceneId, {
          trimStartMs: current.previewTrimStartMs,
          trimEndMs: current.previewTrimEndMs,
        });
      }

      clearTimelineTrimSession({ clearOverride: true });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = trimStateRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }
      commitTrim();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const current = trimStateRef.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }
      cancelTrim();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTrim();
      }
    };

    const handleWindowBlur = () => {
      cancelTrim();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    cancelTimelineTrimSession,
    clearTimelineTrimSession,
    onApplyVideoTrim,
    publishTimelineTrimPreview,
    trimmingSceneId,
  ]);

  // Cancel trim when selection leaves the trimmed scene (no silent commit).
  useEffect(() => {
    if (!trimmingSceneId) {
      return;
    }
    if (selection.selectedSceneId !== trimmingSceneId) {
      cancelTimelineTrimSession();
    }
  }, [cancelTimelineTrimSession, selection.selectedSceneId, trimmingSceneId]);

  // Cancel trim when playback starts or the timeline becomes playback-locked.
  useEffect(() => {
    if (!trimmingSceneId) {
      return;
    }
    if (playback.isPlaying || playbackLocked) {
      cancelTimelineTrimSession();
    }
  }, [
    cancelTimelineTrimSession,
    playback.isPlaying,
    playbackLocked,
    trimmingSceneId,
  ]);

  // Cancel when media is replaced, removed, or the block becomes ineligible.
  useEffect(() => {
    if (!trimmingSceneId) {
      return;
    }

    const current = trimStateRef.current;
    if (!current) {
      return;
    }

    const scene = script.scenes.find((entry) => entry.id === trimmingSceneId);
    if (!scene) {
      cancelTimelineTrimSession();
      return;
    }

    const media = getSceneMedia(scene);
    const window = resolveTimelineVideoTrimWindow(scene);
    const mediaUrl = media?.url?.trim() ?? "";
    const ineligible =
      !media ||
      media.type !== "video" ||
      !mediaUrl ||
      mediaUrl !== current.mediaUrl ||
      !window;

    if (ineligible) {
      cancelTimelineTrimSession();
    }
  }, [cancelTimelineTrimSession, script.scenes, trimmingSceneId]);

  // Release capture + clear override if the timeline unmounts mid-session.
  useEffect(() => {
    return () => {
      if (!trimStateRef.current) {
        return;
      }
      trimSettledRef.current = true;
      releaseTimelineTrimPointerCapture(
        trimCaptureTargetRef.current,
        trimStateRef.current.pointerId,
      );
      trimCaptureTargetRef.current = null;
      trimStateRef.current = null;
      trimPreviewRef.current?.clearOverride();
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "development" && layout.devWarning) {
      console.warn(`[StudioTimeline] ${layout.devWarning}`);
    }
  }, [layout.devWarning]);

  useEffect(() => {
    if (dragState || resizeState || trimState || playback.isPlaying) {
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
  }, [
    dragState,
    playback.isPlaying,
    resizeState,
    selection.selectedSceneId,
    trimState,
  ]);

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

    if (
      playheadX >= viewLeft + edgeMargin &&
      playheadX <= viewRight - edgeMargin
    ) {
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
  }, [
    playback.isPlaying,
    playbackProgress,
    playback.currentTimeMs,
    showPlaybackHead,
  ]);

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
        data-timeline-trimming={trimState ? "true" : "false"}
        data-timeline-playback={playback.isPlaying ? "active" : "idle"}
        data-timeline-playback-locked={playbackLocked ? "true" : "false"}
      >
        {layout.layoutSource === "equal-fallback" && layout.devWarning ? (
          <p className={timelineEditorFallbackNotice} role="status">
            {layout.devWarning}
          </p>
        ) : null}

        {!selectedSceneDetailOnly ? (
          <>
            <p className={timelineEditorCoarsePointerHint}>
              Tap the ⋮ menu on any scene for insert, duplicate, and delete
              actions. Trim video clips in the Video Inspector.
            </p>

            <p
              className={timelineEditorDurationHint}
              data-timeline-duration-hint
            >
              Drag a scene edge to adjust duration. Inner handles trim the video
              clip without changing scene length.
            </p>
          </>
        ) : null}

        {!selectedSceneDetailOnly && script.scenes.length > 0 ? (
          <p
            className={sceneMediaLaneNotice}
            role="status"
            data-scene-media-experimental-notice="true"
          >
            {SCENE_MEDIA_TIMELINE_EXPERIMENTAL_NOTICE}
          </p>
        ) : null}

        <div
          ref={scrollContainerRef}
          className={`${timelineEditorRailScroll} ${playbackLocked ? `cursor-not-allowed ${timelineEditorPlaybackLocked}` : ""} ${resizeState ? timelineEditorRailResizing : ""} ${trimState ? timelineEditorRailTrimming : ""}`.trim()}
        >
          <div className={timelineEditorTrackSurface}>
            <div ref={segmentRowRef} className={timelineEditorSegmentRow}>
              {layout.segments.map((segment) => {
                if (segment.type === "transition") {
                  return (
                    <TimelineTransitionMarker
                      key={segment.marker.id}
                      marker={segment.marker}
                    />
                  );
                }

                const scene = sceneById.get(segment.block.sceneId);
                if (!scene) {
                  return null;
                }

                const sceneIndex =
                  sceneIndexById.get(segment.block.sceneId) ??
                  segment.block.sceneIndex;
                const isSelected =
                  selection.selectedSceneId === segment.block.sceneId;
                const isDragging =
                  dragState?.draggedSceneId === segment.block.sceneId;
                const isResizing =
                  resizeState?.sceneId === segment.block.sceneId;
                const isTrimming = trimState?.sceneId === segment.block.sceneId;
                const showInsertBefore =
                  dragState != null &&
                  dragState.hoverTargetIndex === sceneIndex;

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
                    isTrimming={isTrimming}
                    trimState={isTrimming ? trimState : null}
                    reorderDisabled={reorderDisabled}
                    resizeDisabled={resizeDisabled}
                    trimDisabled={trimDisabled}
                    contextMenuDisabled={contextMenuDisabled}
                    isFinePointer={isFinePointer}
                    showInsertBefore={showInsertBefore}
                    onSelect={() =>
                      selection.selectScene(segment.block.sceneId)
                    }
                    onMenuOpen={({ x, y }) => {
                      if (
                        trimStateRef.current ||
                        mediaBoundaryOwnerRef.current
                      ) {
                        return;
                      }
                      setMenu({
                        sceneId: segment.block.sceneId,
                        sceneNumber: sceneIndex + 1,
                        x,
                        y,
                      });
                    }}
                    onDragHandlePointerDown={(event) =>
                      handleDragHandlePointerDown(segment.block.sceneId, event)
                    }
                    onResizeHandlePointerDown={(event) =>
                      handleResizeHandlePointerDown(
                        segment.block.sceneId,
                        event,
                      )
                    }
                    onDurationNudge={(deltaSec) =>
                      handleDurationNudge(segment.block.sceneId, deltaSec)
                    }
                    onTrimHandlePointerDown={(handle, event, stripRect) =>
                      handleTrimHandlePointerDown(
                        segment.block.sceneId,
                        handle,
                        event,
                        stripRect,
                      )
                    }
                    onTrimHandleKeyDown={(handle, event) =>
                      handleTrimHandleKeyDown(
                        segment.block.sceneId,
                        handle,
                        event,
                      )
                    }
                    blockRef={(element) => {
                      blockRefs.current.set(segment.block.sceneId, element);
                    }}
                    wrapperRef={(element) => {
                      wrapperRefs.current.set(segment.block.sceneId, element);
                    }}
                    mediaLane={
                      !selectedSceneDetailOnly && showSelectedSceneMedia ? (
                        <SceneMediaTimelineLane
                          scene={scene}
                          script={script}
                          onScriptChange={onScriptChange}
                          selectedMediaItemId={
                            selection.selectedSceneId === segment.block.sceneId
                              ? selection.selectedMediaItemId
                              : null
                          }
                          onSelectMediaItem={selection.selectSceneMediaItem}
                          selectedMediaTransition={
                            selection.selectedSceneId === segment.block.sceneId
                              ? selection.selectedMediaTransition
                              : null
                          }
                          onSelectMediaTransition={
                            selection.selectSceneMediaTransition
                          }
                          appendApi={appendApi}
                          playbackLocked={playbackLocked}
                          interactionLocked={
                            sceneMediaLaneBaseLocked ||
                            isMediaBoundaryLaneLocked(
                              mediaBoundaryOwnerSceneId,
                              segment.block.sceneId,
                            )
                          }
                          boundaryOwnerSceneId={mediaBoundaryOwnerSceneId}
                          onTryAcquireBoundary={tryAcquireMediaBoundary}
                          onReleaseBoundary={releaseMediaBoundary}
                          boundaryCancelEpoch={boundaryCancelEpoch}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </div>
            {selectedSceneDetailOnly &&
            showSelectedSceneMedia &&
            selectedScene ? (
              <section
                className={timelineEditorSelectedMediaLane}
                data-selected-scene-media-editor={selectedScene.id}
                aria-label={`Selected scene ${selection.selectedSceneIndex + 1} media`}
              >
                <div className="mb-2 flex min-w-0 items-center justify-between gap-3 px-1">
                  <p className="truncate text-[11px] font-semibold text-foreground/90">
                    Scene {selection.selectedSceneIndex + 1} media
                  </p>
                  <p className="shrink-0 text-[10px] text-muted">
                    Detailed controls
                  </p>
                </div>
                <SceneMediaTimelineLane
                  scene={selectedScene}
                  script={script}
                  onScriptChange={onScriptChange}
                  selectedMediaItemId={selection.selectedMediaItemId}
                  onSelectMediaItem={selection.selectSceneMediaItem}
                  selectedMediaTransition={selection.selectedMediaTransition}
                  onSelectMediaTransition={
                    selection.selectSceneMediaTransition
                  }
                  appendApi={appendApi}
                  playbackLocked={playbackLocked}
                  interactionLocked={
                    sceneMediaLaneBaseLocked ||
                    isMediaBoundaryLaneLocked(
                      mediaBoundaryOwnerSceneId,
                      selectedScene.id,
                    )
                  }
                  boundaryOwnerSceneId={mediaBoundaryOwnerSceneId}
                  onTryAcquireBoundary={tryAcquireMediaBoundary}
                  onReleaseBoundary={releaseMediaBoundary}
                  boundaryCancelEpoch={boundaryCancelEpoch}
                />
              </section>
            ) : null}
            {showPlaybackHead ? (
              <TimelinePlaybackHead
                progress={playbackProgress}
                isActive={playback.isPlaying}
              />
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
