"use client";

/**
 * Inspector for an adjacent media-item transition (Sprint 9A / 9D.2).
 * Does not reuse the scene-to-scene transition card component.
 * Intra-scene transitions play in Preview and Export (v3 / "9C").
 */

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  formatMediaTransitionPairLabel,
  INTRA_SCENE_TRANSITION_EDITOR_NOTICE,
  resetSceneMediaTransitionBoundary,
  resolveEffectiveIntraSceneTransitionDurationMs,
  resolveStoredBoundaryEffect,
  setSceneMediaTransitionBoundary,
} from "@/features/scene-media-transitions";
import { resolveProjectedSceneMediaWindows } from "@/features/scene-media-timeline";
import { useEditorSelection } from "@/features/editor/selection";
import { SelectionPhase } from "@/features/editor/selection/selection.types";
import {
  isTimelineExclusiveInteractionActive,
  useTimelineExclusiveInteractionLocked,
} from "@/features/timeline-editor/scene-media/useTimelineExclusiveInteraction";
import type { FootieScene, FootieScript, TransitionEffect } from "@/features/story/types";
import {
  getTransitionDurationLabel,
  getTransitionEffectLabel,
  normalizeTransitionDurationMs,
  TRANSITION_DURATION_OPTIONS,
  TRANSITION_EFFECT_OPTIONS,
} from "@/features/story/utils/transition-vocabulary";
import {
  studioDestructiveButton,
  studioFieldLabel,
  studioSelectChevronCompact,
  studioSelectCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";

export interface SceneMediaTransitionInspectorProps {
  script: FootieScript;
  scene: FootieScene;
  fromItemId: string;
  toItemId: string;
  onScriptChange: (script: FootieScript, options?: StoryScriptChangeOptions) => void;
}

export default function SceneMediaTransitionInspector({
  script,
  scene,
  fromItemId,
  toItemId,
  onScriptChange,
}: SceneMediaTransitionInspectorProps) {
  const selection = useEditorSelection();
  const playbackLocked = selection.phase === SelectionPhase.PlaybackLocked;
  const interactionLocked = useTimelineExclusiveInteractionLocked();
  const controlsDisabled = playbackLocked || interactionLocked;
  const [error, setError] = useState<string | null>(null);

  const windows = resolveProjectedSceneMediaWindows(scene);
  const fromIndex = windows.findIndex((w) => w.itemId === fromItemId);
  const toIndex = windows.findIndex((w) => w.itemId === toItemId);
  const fromWindow = fromIndex >= 0 ? windows[fromIndex] : null;
  const toWindow = toIndex >= 0 ? windows[toIndex] : null;

  const stored = resolveStoredBoundaryEffect(scene, fromItemId, toItemId);
  const effect = stored.effect;
  const requestedDurationMs = stored.durationMs ?? 500;
  const effectiveDurationMs =
    effect === "cut" || !fromWindow || !toWindow
      ? 0
      : resolveEffectiveIntraSceneTransitionDurationMs({
          requestedDurationMs,
          fromWindowDurationMs: fromWindow.durationMs,
          toWindowDurationMs: toWindow.durationMs,
        });

  const pairLabel =
    fromIndex >= 0 && toIndex >= 0
      ? formatMediaTransitionPairLabel(fromIndex, toIndex)
      : "Media transition";

  const commit = (nextScene: FootieScene) => {
    // Replace the scene object so Cut correctly clears mediaTransitions (undefined omit).
    const nextScript: FootieScript = {
      ...script,
      scenes: script.scenes.map((entry) => (entry.id === scene.id ? nextScene : entry)),
    };
    onScriptChange(nextScript, { intent: "media" });
  };

  const handleEffectChange = (nextEffect: TransitionEffect) => {
    // Event-time guard — do not trust a stale unlocked render snapshot.
    if (playbackLocked || isTimelineExclusiveInteractionActive()) {
      setError(
        playbackLocked
          ? "Pause playback to edit this transition."
          : "Finish the timeline interaction before editing this transition.",
      );
      return;
    }
    setError(null);
    try {
      const duration =
        nextEffect === "cut"
          ? 500
          : normalizeTransitionDurationMs(requestedDurationMs);
      const result = setSceneMediaTransitionBoundary(
        scene,
        fromItemId,
        toItemId,
        nextEffect,
        duration,
      );
      commit(result.scene);
    } catch {
      setError("That transition change could not be applied.");
    }
  };

  const handleDurationChange = (durationMs: number) => {
    if (
      playbackLocked ||
      isTimelineExclusiveInteractionActive() ||
      effect === "cut"
    ) {
      return;
    }
    setError(null);
    try {
      const result = setSceneMediaTransitionBoundary(
        scene,
        fromItemId,
        toItemId,
        effect,
        normalizeTransitionDurationMs(durationMs),
      );
      commit(result.scene);
    } catch {
      setError("That transition duration could not be applied.");
    }
  };

  const handleReset = () => {
    if (playbackLocked || isTimelineExclusiveInteractionActive()) {
      return;
    }
    setError(null);
    try {
      const result = resetSceneMediaTransitionBoundary(scene, fromItemId, toItemId);
      commit(result.scene);
    } catch {
      setError("That transition could not be reset.");
    }
  };

  return (
    <div className="space-y-3" data-scene-media-transition-inspector="true">
      <div>
        <p
          className="text-[11px] font-medium text-foreground/85"
          data-scene-media-transition-pair-label
        >
          {pairLabel}
        </p>
        <p className={`${studioSubtleText} mt-1`} role="status">
          {INTRA_SCENE_TRANSITION_EDITOR_NOTICE}
        </p>
        <p className={`${studioSubtleText} mt-1`}>
          Uses existing scene time at the head of the incoming media item. Narration, captions,
          and scene duration are unchanged. This is not a scene-to-scene transition.
        </p>
        <p className={`${studioSubtleText} mt-1`}>
          Current effect: {getTransitionEffectLabel(effect)}
          {effect !== "cut"
            ? ` · Requested ${requestedDurationMs}ms · Effective ${effectiveDurationMs}ms`
            : " · Cut (no stored boundary)"}
        </p>
      </div>

      {error ? (
        <p className="text-[11px] text-red-300/90" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <label
            htmlFor={`intra-scene-transition-effect-${scene.id}-${fromItemId}`}
            className={`${studioFieldLabel} mb-1`}
          >
            Effect
          </label>
          <div className="relative">
            <select
              id={`intra-scene-transition-effect-${scene.id}-${fromItemId}`}
              value={effect}
              disabled={controlsDisabled}
              onChange={(event) =>
                handleEffectChange(event.target.value as TransitionEffect)
              }
              className={studioSelectCompact}
            >
              {TRANSITION_EFFECT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} />
          </div>
        </div>
        <div className="min-w-0">
          <label
            htmlFor={`intra-scene-transition-duration-${scene.id}-${fromItemId}`}
            className={`${studioFieldLabel} mb-1`}
          >
            Duration
          </label>
          <div className="relative">
            <select
              id={`intra-scene-transition-duration-${scene.id}-${fromItemId}`}
              value={requestedDurationMs}
              disabled={controlsDisabled || effect === "cut"}
              onChange={(event) => handleDurationChange(Number(event.target.value))}
              className={studioSelectCompact}
            >
              {TRANSITION_DURATION_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {getTransitionDurationLabel(ms)}
                </option>
              ))}
            </select>
            <ChevronDown className={studioSelectChevronCompact} />
          </div>
        </div>
      </div>

      {effect !== "cut" ? (
        <p className={studioSubtleText} data-scene-media-transition-duration-summary>
          Requested {requestedDurationMs}ms ({getTransitionEffectLabel(effect)}). Effective{" "}
          {effectiveDurationMs}ms
          {effectiveDurationMs < requestedDurationMs
            ? " (clamped to 40% of adjacent media windows)."
            : "."}
        </p>
      ) : (
        <p className={studioSubtleText}>Cut — no stored transition record.</p>
      )}

      <button
        type="button"
        className={studioDestructiveButton}
        disabled={controlsDisabled || effect === "cut"}
        onClick={handleReset}
      >
        Reset to Cut
      </button>
    </div>
  );
}
