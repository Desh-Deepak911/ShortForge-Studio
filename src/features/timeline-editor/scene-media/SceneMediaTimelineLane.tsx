"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  projectSceneMediaTimeline,
  resolveProjectedSceneMediaWindows,
} from "@/features/scene-media-timeline";
import {
  canMoveSceneMediaItemLeft,
  canMoveSceneMediaItemRight,
  canRemoveSceneMediaItem,
  moveSceneMediaItemLeft,
  moveSceneMediaItemRight,
  removeSceneMediaItem,
  resizeAdjacentSceneMediaBoundary,
  SCENE_MEDIA_MIN_ITEM_DURATION_MS,
} from "@/features/scene-media-timeline/editor";
import {
  INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE,
  INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE,
} from "@/features/scene-media-transitions";
import type { FootieScene, FootieScript } from "@/features/story/types";

import {
  beginBoundaryInteraction,
  cancelBoundaryInteraction,
  createIdleBoundaryInteraction,
  pointerUpBoundaryInteraction,
  previewBoundaryInteraction,
  type BoundaryInteractionState,
} from "./media-boundary-interaction.machine";
import SceneMediaBoundaryHandle from "./SceneMediaBoundaryHandle";
import SceneMediaTimelineSegment from "./SceneMediaTimelineSegment";
import SceneMediaTransitionRow from "./SceneMediaTransitionRow";
import {
  resolveSceneMediaLaneErrorCode,
  SCENE_MEDIA_LANE_ERROR_MESSAGES,
  type SceneMediaLaneErrorCode,
} from "./scene-media-lane-errors";
import {
  sceneMediaActionButton,
  sceneMediaAddButton,
  sceneMediaLaneActions,
  sceneMediaLaneError,
  sceneMediaLaneNotice,
  sceneMediaLaneRoot,
  sceneMediaLaneTrack,
} from "./scene-media-timeline.ui";
import {
  formatSceneMediaItemOrdinal,
  SceneMediaAddAnotherImageButton,
} from "./scene-media-append-affordance";
import type { SceneMediaImageAppendApi } from "./SceneMediaImageAppendContext";

export interface SceneMediaTimelineLaneProps {
  scene: FootieScene;
  script: FootieScript;
  onScriptChange: (
    next: FootieScript,
    options?: { intent?: "media" | "story" | "presentation" | "narration_rebuild" },
  ) => void;
  selectedMediaItemId: string | null;
  onSelectMediaItem: (sceneId: string, mediaItemId: string) => void;
  selectedMediaTransition?: { fromItemId: string; toItemId: string } | null;
  onSelectMediaTransition?: (
    sceneId: string,
    fromItemId: string,
    toItemId: string,
  ) => void;
  /** Shared append authority (Inspector + lane). */
  appendApi: SceneMediaImageAppendApi;
  playbackLocked?: boolean;
  /** Locked by other timeline ops or another lane's boundary ownership. */
  interactionLocked?: boolean;
  /** Global boundary owner scene id (null when idle). */
  boundaryOwnerSceneId: string | null;
  onTryAcquireBoundary: (sceneId: string) => boolean;
  onReleaseBoundary: (sceneId: string) => void;
  /** Increments when parent forces cancel (scene change, etc.). */
  boundaryCancelEpoch: number;
}

function commitScenePatch(
  script: FootieScript,
  sceneId: string,
  scene: FootieScene,
  onScriptChange: SceneMediaTimelineLaneProps["onScriptChange"],
) {
  // Replace the scene so reconciled mediaTransitions (including cleared tracks) persist.
  const next: FootieScript = {
    ...script,
    scenes: script.scenes.map((entry) => (entry.id === sceneId ? scene : entry)),
  };
  onScriptChange(next, { intent: "media" });
}

export default function SceneMediaTimelineLane({
  scene,
  script,
  onScriptChange,
  selectedMediaItemId,
  onSelectMediaItem,
  selectedMediaTransition = null,
  onSelectMediaTransition,
  appendApi,
  playbackLocked = false,
  interactionLocked = false,
  boundaryOwnerSceneId,
  onTryAcquireBoundary,
  onReleaseBoundary,
  boundaryCancelEpoch,
}: SceneMediaTimelineLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<BoundaryInteractionState>(() =>
    createIdleBoundaryInteraction(),
  );
  const [previewScene, setPreviewScene] = useState<FootieScene | null>(null);
  const [laneError, setLaneError] = useState<{
    sceneId: string;
    code: SceneMediaLaneErrorCode;
  } | null>(null);
  const sessionRef = useRef(session);
  const scriptRef = useRef(script);
  const sceneRef = useRef(scene);
  const boundaryOwnerRef = useRef(boundaryOwnerSceneId);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  useEffect(() => {
    sceneRef.current = scene;
    if (sessionRef.current.status !== "dragging") {
      setPreviewScene(null);
    }
  }, [scene]);

  useEffect(() => {
    boundaryOwnerRef.current = boundaryOwnerSceneId;
  }, [boundaryOwnerSceneId]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const visibleLaneError =
    laneError && laneError.sceneId === scene.id ? laneError.code : null;

  const setLaneErrorCode = useCallback(
    (code: SceneMediaLaneErrorCode | null) => {
      if (!code) {
        setLaneError(null);
        return;
      }
      setLaneError({ sceneId: scene.id, code });
    },
    [scene.id],
  );

  const { revokeOwnedUrlIfPresent } = appendApi;

  const activeScene = previewScene ?? scene;
  const windows = useMemo(
    () => resolveProjectedSceneMediaWindows(activeScene),
    [activeScene],
  );
  const projected = useMemo(() => projectSceneMediaTimeline(activeScene), [activeScene]);

  const isDragging = session.status === "dragging";
  const controlsDisabled = playbackLocked || interactionLocked || isDragging;
  const canRemove = canRemoveSceneMediaItem(scene) && !controlsDisabled;
  const selectedId = selectedMediaItemId;
  const selectedOrdinalIndex = windows.findIndex((window) => window.itemId === selectedId);
  const mediaOrdinalLabel = formatSceneMediaItemOrdinal(
    selectedOrdinalIndex >= 0 ? selectedOrdinalIndex : Math.max(0, windows.length - 1),
    windows.length,
  );

  const cancelBoundaryDrag = useCallback(() => {
    const current = sessionRef.current;
    const cancelled = cancelBoundaryInteraction(current, boundaryOwnerRef.current);
    sessionRef.current = cancelled.state;
    setSession(cancelled.state);
    setPreviewScene(null);
    if (current.ownerSceneId) {
      onReleaseBoundary(current.ownerSceneId);
    }
  }, [onReleaseBoundary]);

  const commitBoundaryDrag = useCallback(
    (leftIndex: number, deltaMs: number) => {
      try {
        const result = resizeAdjacentSceneMediaBoundary(sceneRef.current, leftIndex, deltaMs);
        commitScenePatch(scriptRef.current, scene.id, result.scene, onScriptChange);
        if (result.selectedMediaItemId) {
          onSelectMediaItem(scene.id, result.selectedMediaItemId);
        }
        setLaneErrorCode(null);
      } catch (error) {
        setLaneErrorCode(resolveSceneMediaLaneErrorCode(error));
      } finally {
        cancelBoundaryDrag();
      }
    },
    [cancelBoundaryDrag, onScriptChange, onSelectMediaItem, scene.id, setLaneErrorCode],
  );

  // Parent-forced cancel (scene selection change, etc.) — skip initial mount.
  const cancelEpochSeenRef = useRef(boundaryCancelEpoch);
  useEffect(() => {
    if (cancelEpochSeenRef.current === boundaryCancelEpoch) {
      return;
    }
    cancelEpochSeenRef.current = boundaryCancelEpoch;
    if (sessionRef.current.status === "dragging") {
      cancelBoundaryDrag();
    }
  }, [boundaryCancelEpoch, cancelBoundaryDrag]);

  useEffect(() => {
    if (session.status !== "dragging") {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = sessionRef.current;
      if (current.status !== "dragging") {
        return;
      }
      const next = previewBoundaryInteraction(current, event.clientX);
      sessionRef.current = next;
      setSession(next);
      const deltaMs = next.previewDeltaMs ?? 0;
      try {
        const preview = resizeAdjacentSceneMediaBoundary(
          sceneRef.current,
          next.leftIndex,
          deltaMs,
        );
        setPreviewScene(preview.scene);
      } catch {
        setPreviewScene(null);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = sessionRef.current;
      const result = pointerUpBoundaryInteraction(
        current,
        boundaryOwnerRef.current,
        event.clientX,
      );
      sessionRef.current = result.state;
      setSession(result.state);
      setPreviewScene(null);
      if (current.ownerSceneId) {
        onReleaseBoundary(current.ownerSceneId);
      }
      if (!result.shouldCommit || !result.ownerSceneId) {
        return;
      }
      try {
        const resized = resizeAdjacentSceneMediaBoundary(
          sceneRef.current,
          result.leftIndex,
          result.deltaMs,
        );
        commitScenePatch(scriptRef.current, scene.id, resized.scene, onScriptChange);
        if (resized.selectedMediaItemId) {
          onSelectMediaItem(scene.id, resized.selectedMediaItemId);
        }
        setLaneErrorCode(null);
      } catch (error) {
        setLaneErrorCode(resolveSceneMediaLaneErrorCode(error));
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelBoundaryDrag();
      }
    };

    const handleBlur = () => cancelBoundaryDrag();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", cancelBoundaryDrag);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", cancelBoundaryDrag);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    cancelBoundaryDrag,
    onReleaseBoundary,
    onScriptChange,
    onSelectMediaItem,
    scene.id,
    session.status,
    setLaneErrorCode,
  ]);

  useEffect(() => {
    if (playbackLocked && sessionRef.current.status === "dragging") {
      cancelBoundaryDrag();
    }
  }, [cancelBoundaryDrag, playbackLocked]);

  useEffect(() => {
    return () => {
      if (sessionRef.current.status === "dragging" && sessionRef.current.ownerSceneId) {
        onReleaseBoundary(sessionRef.current.ownerSceneId);
      }
    };
  }, [onReleaseBoundary]);

  const handleBoundaryPointerDown = useCallback(
    (leftIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (playbackLocked || interactionLocked) {
        return;
      }
      if (!onTryAcquireBoundary(scene.id)) {
        return;
      }
      const trackWidthPx = trackRef.current?.getBoundingClientRect().width ?? 0;
      // Parent lock acquired — treat this scene as the current global owner.
      const started = beginBoundaryInteraction(sessionRef.current, scene.id, {
        sceneId: scene.id,
        leftIndex,
        startClientX: event.clientX,
        trackWidthPx,
        sceneDurationMs: projected.sceneDurationMs,
      });
      if (!started.acquired) {
        onReleaseBoundary(scene.id);
        return;
      }

      const leftItemId = windows[leftIndex]?.itemId;
      if (leftItemId) {
        onSelectMediaItem(scene.id, leftItemId);
      }

      sessionRef.current = started.state;
      setSession(started.state);
      setPreviewScene(null);
      setLaneErrorCode(null);
    },
    [
      interactionLocked,
      onReleaseBoundary,
      onSelectMediaItem,
      onTryAcquireBoundary,
      playbackLocked,
      projected.sceneDurationMs,
      scene.id,
      setLaneErrorCode,
      windows,
    ],
  );

  const handleBoundaryKeyDown = useCallback(
    (leftIndex: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (playbackLocked || interactionLocked) {
        return;
      }
      const step = event.shiftKey ? 100 : 50;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commitBoundaryDrag(leftIndex, -step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commitBoundaryDrag(leftIndex, step);
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelBoundaryDrag();
      }
    },
    [cancelBoundaryDrag, commitBoundaryDrag, interactionLocked, playbackLocked],
  );

  const runMove = useCallback(
    (direction: "left" | "right") => {
      if (!selectedId || controlsDisabled) {
        return;
      }
      try {
        const result =
          direction === "left"
            ? moveSceneMediaItemLeft(scene, selectedId)
            : moveSceneMediaItemRight(scene, selectedId);
        commitScenePatch(script, scene.id, result.scene, onScriptChange);
        if (result.selectedMediaItemId) {
          onSelectMediaItem(scene.id, result.selectedMediaItemId);
        }
        setLaneErrorCode(null);
      } catch (error) {
        setLaneErrorCode(resolveSceneMediaLaneErrorCode(error));
      }
    },
    [
      controlsDisabled,
      onScriptChange,
      onSelectMediaItem,
      scene,
      script,
      selectedId,
      setLaneErrorCode,
    ],
  );

  const runRemove = useCallback(() => {
    if (!selectedId || !canRemove) {
      return;
    }
    try {
      const removedUrl = projectSceneMediaTimeline(scene).items.find(
        (item) => item.id === selectedId,
      )?.media.url;
      const result = removeSceneMediaItem(scene, selectedId);
      commitScenePatch(script, scene.id, result.scene, onScriptChange);
      if (result.selectedMediaItemId) {
        onSelectMediaItem(scene.id, result.selectedMediaItemId);
      }
      revokeOwnedUrlIfPresent(removedUrl);
      setLaneErrorCode(null);
    } catch (error) {
      setLaneErrorCode(resolveSceneMediaLaneErrorCode(error));
    }
  }, [
    canRemove,
    onScriptChange,
    onSelectMediaItem,
    revokeOwnedUrlIfPresent,
    scene,
    script,
    selectedId,
    setLaneErrorCode,
  ]);

  return (
    <div
      className={sceneMediaLaneRoot}
      data-scene-media-lane={scene.id}
      data-scene-media-item-count={windows.length}
      data-scene-media-boundary-owner={boundaryOwnerSceneId === scene.id ? "true" : "false"}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {visibleLaneError ? (
        <p
          className={sceneMediaLaneError}
          role="alert"
          data-scene-media-lane-error={visibleLaneError}
        >
          {SCENE_MEDIA_LANE_ERROR_MESSAGES[visibleLaneError]}
        </p>
      ) : null}

      <p
        className={sceneMediaLaneNotice}
        data-scene-media-transition-guidance={
          windows.length < 2 ? "single-item" : "multi-item"
        }
        role="status"
      >
        {windows.length < 2
          ? INTRA_SCENE_TRANSITION_SINGLE_ITEM_GUIDANCE
          : INTRA_SCENE_TRANSITION_MULTI_ITEM_GUIDANCE}
      </p>

      {/* Transition chips live in a reserved row outside overflow-hidden. */}
      <SceneMediaTransitionRow
        scene={activeScene}
        windows={windows}
        selectedMediaTransition={selectedMediaTransition}
        disabled={controlsDisabled}
        onSelect={(fromItemId, toItemId) => {
          onSelectMediaTransition?.(scene.id, fromItemId, toItemId);
        }}
      />

      <div ref={trackRef} className={sceneMediaLaneTrack} data-scene-media-track>
        {windows.map((window, index) => (
          <SceneMediaTimelineSegment
            key={window.itemId}
            window={window}
            isSelected={selectedId === window.itemId}
            disabled={playbackLocked}
            onSelect={(mediaItemId) => onSelectMediaItem(scene.id, mediaItemId)}
            boundaryHandle={
              index < windows.length - 1 ? (
                <SceneMediaBoundaryHandle
                  leftIndex={index}
                  leftItemId={window.itemId}
                  rightItemId={windows[index + 1]!.itemId}
                  leftDurationMs={window.durationMs}
                  rightDurationMs={windows[index + 1]!.durationMs}
                  disabled={controlsDisabled}
                  onPointerDown={handleBoundaryPointerDown}
                  onKeyDown={handleBoundaryKeyDown}
                />
              ) : null
            }
          />
        ))}
      </div>

      <div className={sceneMediaLaneActions}>
        <span
          className="text-[9px] font-medium text-foreground/80"
          data-scene-media-ordinal
        >
          {mediaOrdinalLabel}
        </span>
        <SceneMediaAddAnotherImageButton
          scene={scene}
          appendApi={appendApi}
          disabled={controlsDisabled}
          className={sceneMediaAddButton}
          label="Add another image"
          onAppended={(mediaItemId) => {
            onSelectMediaItem(scene.id, mediaItemId);
            setLaneErrorCode(null);
          }}
        />
        <button
          type="button"
          className={sceneMediaActionButton}
          disabled={!selectedId || !canMoveSceneMediaItemLeft(scene, selectedId) || controlsDisabled}
          onClick={() => runMove("left")}
        >
          Move left
        </button>
        <button
          type="button"
          className={sceneMediaActionButton}
          disabled={
            !selectedId || !canMoveSceneMediaItemRight(scene, selectedId) || controlsDisabled
          }
          onClick={() => runMove("right")}
        >
          Move right
        </button>
        <button
          type="button"
          className={sceneMediaActionButton}
          disabled={!selectedId || !canRemove}
          onClick={runRemove}
          aria-label="Remove selected media item"
        >
          Remove
        </button>
        <span className="text-[9px] text-muted/70">
          Min {SCENE_MEDIA_MIN_ITEM_DURATION_MS}ms / item
        </span>
      </div>
    </div>
  );
}
