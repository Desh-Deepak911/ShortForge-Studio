"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

import StudioNumberStepper from "@/components/ui/StudioNumberStepper";
import type { SceneMedia } from "@/features/story/types";
import {
  studioFieldLabel,
  studioSecondaryButton,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import { listMediaVisualEffectPresets } from "../domain/media-visual-effect-presets";
import { normalizeSceneMediaVisualEffect } from "../domain/resolve-media-visual-effect";
import {
  applyMediaVisualEffectPreset,
  MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE,
  resetMediaVisualEffect,
  setMediaVisualEffectIntensity,
  type MediaVisualEffectCommandOptions,
  type MediaVisualEffectCommandResult,
} from "./media-visual-effect.commands";

export interface MediaVisualEffectControlsProps {
  controlId: string;
  media: SceneMedia;
  disabled?: boolean;
  keyframedVisualEffectsEnabled?: boolean;
  requiresMediaItemSelection?: boolean;
  mediaItemId?: string | null;
  mediaWindowDurationMs?: number;
  onMediaCommit: (result: MediaVisualEffectCommandResult) => void;
}

/**
 * Capability-gated look presets nested in Media motion / Adjust.
 * Distinct from freeform Brightness/Contrast/Saturation adjustments.
 */
export default function MediaVisualEffectControls({
  controlId,
  media,
  disabled = false,
  keyframedVisualEffectsEnabled = false,
  requiresMediaItemSelection = false,
  mediaItemId = null,
  mediaWindowDurationMs = 0,
  onMediaCommit,
}: MediaVisualEffectControlsProps) {
  const statusId = useId();
  const presetButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusIsAlert, setStatusIsAlert] = useState(false);

  const commandOptions: MediaVisualEffectCommandOptions = {
    keyframedVisualEffectsEnabled,
    requiresMediaItemSelection,
  };

  const stored = normalizeSceneMediaVisualEffect(media.visualEffect);
  const presetId = stored?.presetId ?? "none";
  const intensityPercent = Math.round((stored?.intensity ?? 1) * 100);
  const presets = listMediaVisualEffectPresets();
  const selectedPresetIndex = Math.max(
    0,
    presets.findIndex((preset) => preset.id === presetId),
  );
  const targetItemAttr =
    mediaItemId && mediaItemId.length > 0 ? mediaItemId : "scene";
  const activeDescendantId = `${controlId}-preset-${presets[selectedPresetIndex]!.id}`;

  const commit = (result: MediaVisualEffectCommandResult) => {
    if (result.status === "terminal") {
      setStatusMessage(result.message ?? "That look change could not be applied.");
      setStatusIsAlert(true);
      return;
    }
    onMediaCommit(result);
    setStatusMessage(result.warnings[0] ?? null);
    setStatusIsAlert(false);
  };

  const applyPresetAtIndex = (index: number) => {
    const preset = presets[index];
    if (!preset) return;
    commit(applyMediaVisualEffectPreset(media, preset.id, commandOptions));
    requestAnimationFrame(() => {
      presetButtonRefs.current[index]?.focus();
    });
  };

  const handlePresetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (selectedPresetIndex + 1) % presets.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (selectedPresetIndex - 1 + presets.length) % presets.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = presets.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    applyPresetAtIndex(nextIndex);
  };

  if (requiresMediaItemSelection) {
    return (
      <div
        className="min-w-0 space-y-2"
        data-media-visual-effect-controls="blocked"
        data-media-motion-target-item=""
        data-media-motion-target-duration={String(mediaWindowDurationMs)}
      >
        <p className={studioSubtleText} role="status">
          {MEDIA_VISUAL_EFFECT_SELECTION_REQUIRED_MESSAGE}
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-w-0 max-w-full space-y-2 overflow-x-hidden border-t border-border/60 pt-3"
      data-media-visual-effect-controls="true"
      data-media-motion-target-item={targetItemAttr}
      data-media-motion-target-duration={String(mediaWindowDurationMs)}
    >
      <div className="space-y-1">
        <p className={studioFieldLabel}>Look</p>
        <p className={studioSubtleText}>
          A quick color look for this visual. Preview updates right away. This is
          separate from motion keyframes.
        </p>
      </div>

      <div className="min-w-0 space-y-1.5">
        <p id={`${controlId}-preset-label`} className={studioFieldLabel}>
          Preset
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${controlId}-preset-label`}
          aria-activedescendant={activeDescendantId}
          className="flex max-w-full flex-wrap gap-1.5"
          data-media-visual-effect-preset="true"
          onKeyDown={handlePresetKeyDown}
        >
          {presets.map((preset, index) => {
            const selected = presetId === preset.id;
            return (
              <button
                key={preset.id}
                id={`${controlId}-preset-${preset.id}`}
                ref={(node) => {
                  presetButtonRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                tabIndex={selected ? 0 : -1}
                aria-checked={selected}
                disabled={disabled}
                data-media-visual-effect-preset-id={preset.id}
                data-selected={selected ? "true" : "false"}
                className={
                  selected
                    ? "max-w-full shrink rounded-md border border-foreground/30 bg-foreground/10 px-2 py-1 text-[11px] font-medium text-foreground"
                    : "max-w-full shrink rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:border-foreground/20 hover:text-foreground"
                }
                onClick={() => {
                  commit(applyMediaVisualEffectPreset(media, preset.id, commandOptions));
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {presetId !== "none" ? (
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <label htmlFor={`${controlId}-intensity`} className={studioFieldLabel}>
              Intensity
            </label>
            <span
              className="shrink-0 text-[10px] tabular-nums text-muted"
              data-media-visual-effect-intensity-value
            >
              {intensityPercent}%
            </span>
          </div>
          <StudioNumberStepper
            id={`${controlId}-intensity`}
            compact
            suffix="%"
            min={0}
            max={100}
            step={5}
            value={intensityPercent}
            disabled={disabled}
            aria-label="Look intensity percent"
            onStepValue={(value) => {
              commit(setMediaVisualEffectIntensity(media, value, commandOptions));
            }}
            onValueCommit={(value) => {
              commit(setMediaVisualEffectIntensity(media, value, commandOptions));
            }}
          />
        </div>
      ) : null}

      <button
        type="button"
        className={studioSecondaryButton}
        disabled={disabled || presetId === "none"}
        title="Reset look to None"
        aria-label="Reset look to None"
        data-media-visual-effect-reset="true"
        onClick={() => {
          commit(resetMediaVisualEffect(media, commandOptions));
        }}
      >
        Reset to None
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
