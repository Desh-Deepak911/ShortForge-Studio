"use client";

import { useEffect, useId, useRef, useState } from "react";

import StudioNumberStepper from "@/components/ui/StudioNumberStepper";
import {
  MEDIA_MOTION_EASING_OPTIONS,
  MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
  MEDIA_MOTION_KEYFRAME_MAX_OPACITY,
  MEDIA_MOTION_KEYFRAME_MAX_SCALE,
  MEDIA_MOTION_KEYFRAME_MIN_OPACITY,
  MEDIA_MOTION_KEYFRAME_MIN_SCALE,
  MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE,
  type MediaMotionEasing,
  type MediaMotionKeyframe,
  type SceneMediaMotion,
} from "@/features/media-motion";
import {
  studioFieldLabel,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import {
  addMediaMotionKeyframe,
  clearMediaMotionKeyframes,
  deleteMediaMotionKeyframe,
  initializeMediaMotionKeyframes,
  updateMediaMotionKeyframe,
  type MediaMotionKeyframeCommandOptions,
  type MediaMotionKeyframeCommandResult,
} from "./media-motion-keyframe.commands";
import MediaMotionKeyframeStrip from "./MediaMotionKeyframeStrip";
import { useMediaMotionKeyframeSelection } from "./useMediaMotionKeyframeSelection";

const EMPTY_KEYFRAMES: readonly MediaMotionKeyframe[] = [];

export interface MediaMotionKeyframeEditorProps {
  controlId: string;
  motion: SceneMediaMotion;
  /** Item-local media window duration in ms. */
  mediaWindowDurationMs: number;
  /** Stable media-item id when editing a projected item; null for scene media. */
  mediaItemId?: string | null;
  /** Must be true for any keyframe command to mutate. */
  keyframedVisualEffectsEnabled?: boolean;
  disabled?: boolean;
  /**
   * When true, refuse keyframe writes that would target ignored scene.media.
   * The parent panel usually blocks the whole motion area before mounting this.
   */
  requiresMediaItemSelection?: boolean;
  onMotionCommit: (result: MediaMotionKeyframeCommandResult) => void;
}

function msToSeconds(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}

function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

/**
 * Capability-gated keyframe authoring UI nested inside Media motion / Adjust.
 */
export default function MediaMotionKeyframeEditor({
  controlId,
  motion,
  mediaWindowDurationMs,
  mediaItemId = null,
  keyframedVisualEffectsEnabled = false,
  disabled = false,
  requiresMediaItemSelection = false,
  onMotionCommit,
}: MediaMotionKeyframeEditorProps) {
  const statusId = useId();
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<"strip" | "create" | "add" | "delete" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsAlert, setStatusIsAlert] = useState(false);
  const [addTimeSeconds, setAddTimeSeconds] = useState(0);

  const commandOptions: MediaMotionKeyframeCommandOptions = {
    keyframedVisualEffectsEnabled,
    requiresMediaItemSelection,
  };

  const keyframes = motion.keyframes ?? EMPTY_KEYFRAMES;
  const keyframeCount = keyframes.length;
  const {
    selectedIndex,
    selectIndex,
    selectByOffsetMs,
  } = useMediaMotionKeyframeSelection(keyframes);

  const durationSeconds = msToSeconds(
    Number.isFinite(mediaWindowDurationMs) && mediaWindowDurationMs > 0
      ? mediaWindowDurationMs
      : 0,
  );
  const selected =
    selectedIndex != null && keyframes[selectedIndex]
      ? keyframes[selectedIndex]!
      : null;

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    if (target === "strip") {
      stripRef.current?.focus();
      return;
    }
    if (target === "create") {
      createButtonRef.current?.focus();
      return;
    }
    if (target === "add") {
      addButtonRef.current?.focus();
      return;
    }
    if (target === "delete") {
      deleteButtonRef.current?.focus();
    }
  }, [keyframeCount, selectedIndex, statusMessage]);

  const commit = (
    result: MediaMotionKeyframeCommandResult,
    focus: "strip" | "create" | "add" | "delete" | null,
    retainFocusOnFailure: "create" | "add" | "delete" | null = null,
  ) => {
    if (result.status === "terminal") {
      setStatusMessage(result.message ?? "That keyframe change could not be applied.");
      setStatusIsAlert(true);
      pendingFocusRef.current = retainFocusOnFailure;
      return;
    }
    onMotionCommit(result);
    if (result.selectedKeyframeIndex != null && result.motion.keyframes) {
      const frame = result.motion.keyframes[result.selectedKeyframeIndex];
      if (frame) {
        selectByOffsetMs(frame.offsetMs, result.motion.keyframes);
      }
    } else {
      selectIndex(null);
    }
    const warningText = result.warnings[0] ?? result.message ?? null;
    setStatusMessage(warningText);
    setStatusIsAlert(false);
    pendingFocusRef.current = focus;
  };

  const commitSelectedPatch = (patch: Partial<MediaMotionKeyframe>) => {
    if (selectedIndex == null) return;
    commit(
      updateMediaMotionKeyframe(
        motion,
        selectedIndex,
        patch,
        mediaWindowDurationMs,
        commandOptions,
      ),
      "strip",
    );
  };

  if (requiresMediaItemSelection) {
    return (
      <div
        className="space-y-2"
        data-media-motion-keyframe-editor="blocked"
        data-media-motion-target-item=""
        data-media-motion-target-duration={String(
          Number.isFinite(mediaWindowDurationMs) ? mediaWindowDurationMs : 0,
        )}
      >
        <p className={studioSubtleText} role="status">
          {MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE}
        </p>
      </div>
    );
  }

  const targetItemAttr =
    mediaItemId && mediaItemId.length > 0 ? mediaItemId : "scene";

  if (!keyframes.length) {
    return (
      <div
        className="space-y-2"
        data-media-motion-keyframe-editor="empty"
        data-media-motion-target-item={targetItemAttr}
        data-media-motion-target-duration={String(
          Number.isFinite(mediaWindowDurationMs) ? mediaWindowDurationMs : 0,
        )}
      >
        <p className={studioSubtleText}>
          Keyframes let this visual move over its own duration — not the whole project.
          Create keyframes turns on custom motion and starts from the current start and
          end movement.
        </p>
        <button
          ref={createButtonRef}
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          title="Create keyframes and turn on custom motion"
          aria-label="Create keyframes"
          data-media-motion-keyframe-create="true"
          onClick={() => {
            const result = initializeMediaMotionKeyframes(
              motion,
              mediaWindowDurationMs,
              commandOptions,
            );
            commit(result, result.status === "terminal" ? "create" : "strip", "create");
          }}
        >
          Create keyframes
        </button>
        <p
          id={statusId}
          className={studioSubtleText}
          role={statusIsAlert ? "alert" : "status"}
          aria-live={statusIsAlert ? "assertive" : "polite"}
        >
          {statusMessage}
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      data-media-motion-keyframe-editor="true"
      data-media-motion-target-item={targetItemAttr}
      data-media-motion-target-duration={String(
        Number.isFinite(mediaWindowDurationMs) ? mediaWindowDurationMs : 0,
      )}
    >
      <div className="space-y-1">
        <p className={studioFieldLabel}>Keyframes</p>
        <p className={studioSubtleText}>
          Timing is relative to the selected visual, not the whole project.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={studioSecondaryButton}
          disabled={disabled || selectedIndex == null || selectedIndex <= 0}
          title="Previous keyframe"
          aria-label="Previous keyframe"
          data-media-motion-keyframe-prev="true"
          onClick={() => {
            if (selectedIndex == null) return;
            selectIndex(selectedIndex - 1);
            pendingFocusRef.current = "strip";
          }}
        >
          Prev
        </button>
        <button
          type="button"
          className={studioSecondaryButton}
          disabled={
            disabled ||
            selectedIndex == null ||
            selectedIndex >= keyframes.length - 1
          }
          title="Next keyframe"
          aria-label="Next keyframe"
          data-media-motion-keyframe-next="true"
          onClick={() => {
            if (selectedIndex == null) return;
            selectIndex(selectedIndex + 1);
            pendingFocusRef.current = "strip";
          }}
        >
          Next
        </button>
      </div>

      <MediaMotionKeyframeStrip
        controlId={controlId}
        keyframes={keyframes}
        selectedIndex={selectedIndex}
        disabled={disabled}
        listRef={stripRef}
        onSelectIndex={(index) => {
          selectIndex(index);
        }}
        onMoveSelection={(delta) => {
          if (selectedIndex == null) {
            selectIndex(delta > 0 ? 0 : keyframes.length - 1);
            return;
          }
          selectIndex(selectedIndex + delta);
        }}
        onSelectFirst={() => selectIndex(0)}
        onSelectLast={() => selectIndex(keyframes.length - 1)}
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[7rem] space-y-1">
          <label htmlFor={`${controlId}-add-time`} className={studioFieldLabel}>
            Add at time
          </label>
          <StudioNumberStepper
            id={`${controlId}-add-time`}
            compact
            suffix="s"
            min={0}
            max={durationSeconds}
            step={0.1}
            value={addTimeSeconds}
            disabled={disabled}
            inputMode="decimal"
            aria-label="Add keyframe time in seconds"
            onStepValue={setAddTimeSeconds}
            onValueCommit={setAddTimeSeconds}
          />
        </div>
        <button
          ref={addButtonRef}
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          title="Add keyframe at the chosen time"
          aria-label="Add keyframe"
          data-media-motion-keyframe-add="true"
          onClick={() => {
            const result = addMediaMotionKeyframe(
              motion,
              { offsetMs: secondsToMs(addTimeSeconds) },
              mediaWindowDurationMs,
              commandOptions,
            );
            commit(result, result.status === "terminal" ? "add" : "strip", "add");
          }}
        >
          Add
        </button>
        <button
          ref={deleteButtonRef}
          type="button"
          className={studioSecondaryButton}
          disabled={disabled || selectedIndex == null}
          title="Delete selected keyframe"
          aria-label="Delete keyframe"
          data-media-motion-keyframe-delete="true"
          onClick={() => {
            if (selectedIndex == null) return;
            const result = deleteMediaMotionKeyframe(
              motion,
              selectedIndex,
              mediaWindowDurationMs,
              commandOptions,
            );
            const focus =
              result.motion.keyframes && result.motion.keyframes.length > 0
                ? "strip"
                : "create";
            commit(
              result,
              result.status === "terminal" ? "delete" : focus,
              "delete",
            );
          }}
        >
          Delete
        </button>
        <button
          type="button"
          className={studioSecondaryButton}
          disabled={disabled}
          title="Clear keyframes and keep the usual motion preset"
          aria-label="Clear keyframes"
          data-media-motion-keyframe-clear="true"
          onClick={() => {
            const result = clearMediaMotionKeyframes(motion, commandOptions);
            commit(result, "create");
          }}
        >
          Clear
        </button>
      </div>

      {selected ? (
        <div className="space-y-2" data-media-motion-keyframe-selected-editor="true">
          <p className={studioFieldLabel}>Selected keyframe</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-time`} className={studioFieldLabel}>
                Time
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-time`}
                compact
                suffix="s"
                min={0}
                max={durationSeconds}
                step={0.1}
                value={msToSeconds(selected.offsetMs)}
                disabled={disabled}
                inputMode="decimal"
                aria-label="Keyframe time in seconds"
                onStepValue={(value) => {
                  commitSelectedPatch({ offsetMs: secondsToMs(value) });
                }}
                onValueCommit={(value) => {
                  commitSelectedPatch({ offsetMs: secondsToMs(value) });
                }}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-x`} className={studioFieldLabel}>
                Horizontal movement
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-x`}
                compact
                min={-MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X}
                max={MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X}
                step={1}
                value={selected.x}
                disabled={disabled}
                aria-label="Horizontal movement"
                onStepValue={(value) => commitSelectedPatch({ x: value })}
                onValueCommit={(value) => commitSelectedPatch({ x: value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-y`} className={studioFieldLabel}>
                Vertical movement
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-y`}
                compact
                min={-MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y}
                max={MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y}
                step={1}
                value={selected.y}
                disabled={disabled}
                aria-label="Vertical movement"
                onStepValue={(value) => commitSelectedPatch({ y: value })}
                onValueCommit={(value) => commitSelectedPatch({ y: value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-zoom`} className={studioFieldLabel}>
                Zoom
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-zoom`}
                compact
                min={MEDIA_MOTION_KEYFRAME_MIN_SCALE}
                max={MEDIA_MOTION_KEYFRAME_MAX_SCALE}
                step={0.05}
                value={selected.scale}
                disabled={disabled}
                inputMode="decimal"
                aria-label="Zoom"
                onStepValue={(value) => commitSelectedPatch({ scale: value })}
                onValueCommit={(value) => commitSelectedPatch({ scale: value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-rotation`} className={studioFieldLabel}>
                Rotation
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-rotation`}
                compact
                suffix="°"
                min={-MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG}
                max={MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG}
                step={1}
                value={selected.rotation}
                disabled={disabled}
                aria-label="Rotation"
                onStepValue={(value) => commitSelectedPatch({ rotation: value })}
                onValueCommit={(value) => commitSelectedPatch({ rotation: value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${controlId}-kf-opacity`} className={studioFieldLabel}>
                Opacity
              </label>
              <StudioNumberStepper
                id={`${controlId}-kf-opacity`}
                compact
                min={MEDIA_MOTION_KEYFRAME_MIN_OPACITY}
                max={MEDIA_MOTION_KEYFRAME_MAX_OPACITY}
                step={0.05}
                value={selected.opacity}
                disabled={disabled}
                inputMode="decimal"
                aria-label="Opacity"
                onStepValue={(value) => commitSelectedPatch({ opacity: value })}
                onValueCommit={(value) => commitSelectedPatch({ opacity: value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p id={`${controlId}-kf-easing-label`} className={studioFieldLabel}>
              Transition
            </p>
            <div
              role="listbox"
              aria-labelledby={`${controlId}-kf-easing-label`}
              aria-label="Transition"
              data-media-motion-keyframe-easing="true"
              className="flex flex-wrap gap-1.5"
            >
              {MEDIA_MOTION_EASING_OPTIONS.map((option) => {
                const active = selected.easing === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={disabled}
                    title={option.label}
                    aria-label={`Transition ${option.label}`}
                    className={`${studioSecondaryButton} !min-h-0 !px-2 !py-1 text-[11px] ${
                      active ? "ring-1 ring-accent/40" : ""
                    }`}
                    onClick={() => {
                      commitSelectedPatch({
                        easing: option.value as MediaMotionEasing,
                      });
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <p
        id={statusId}
        className={studioSubtleText}
        role={statusIsAlert ? "alert" : "status"}
        aria-live={statusIsAlert ? "assertive" : "polite"}
      >
        {statusMessage ??
          (keyframes.length < 2 ? MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING : null)}
      </p>
    </div>
  );
}
