"use client";

import { resolveSceneCaptionPreset } from "./caption-engine.utils";
import { getCaptionPresets } from "./caption-preset.registry";
import {
  studioCardTag,
  studioFieldLabel,
  studioPickerCard,
  studioPickerCardActive,
  studioPickerCardDescription,
  studioPickerCardDescriptionCompact,
  studioPickerCardLabel,
  studioPickerCardLabelLg,
  studioPickerGrid,
  studioPickerGridCompact,
  studioPickerStack,
  studioPickerStackCompact,
  studioSubtleText,
} from "@/lib/utils/studioUi";

import type { CaptionPresetId, CaptionPresetScene } from "./caption-engine.types";

function formatTokenLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface CaptionPresetPanelProps extends CaptionPresetScene {
  disabled?: boolean;
  compact?: boolean;
  onPresetSelect: (presetId: CaptionPresetId) => void;
}

export default function CaptionPresetPanel({
  captionPreset,
  subtitleEffect,
  disabled = false,
  compact = false,
  onPresetSelect,
}: CaptionPresetPanelProps) {
  const selectedPresetId = resolveSceneCaptionPreset({ captionPreset, subtitleEffect });
  const presets = getCaptionPresets();

  return (
    <section aria-label="Caption preset" className={compact ? studioPickerStackCompact : studioPickerStack}>
      <div className="space-y-1">
        <p className={studioFieldLabel}>Caption Preset</p>
        <p className={`${studioSubtleText} ${compact ? "text-[10px]" : "text-[11px]"}`}>
          Presets control caption style. Rendering remains export-safe.
        </p>
      </div>

      <div
        className={compact ? studioPickerGridCompact : studioPickerGrid}
        role="radiogroup"
        aria-label="Caption preset"
      >
        {presets.map((preset) => {
          const active = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onPresetSelect(preset.id)}
              className={`${active ? studioPickerCardActive : studioPickerCard} ${
                compact ? "px-1.5 py-1" : "px-2 py-1.5"
              }`}
            >
              <span className={compact ? studioPickerCardLabel : studioPickerCardLabelLg}>
                {preset.label}
              </span>

              {!compact ? (
                <span className={studioPickerCardDescription}>{preset.description}</span>
              ) : null}

              <span className="flex flex-wrap gap-0.5">
                <span className={studioCardTag}>{formatTokenLabel(preset.entranceEffect)}</span>
                <span className={studioCardTag}>{formatTokenLabel(preset.emphasisBehavior)}</span>
              </span>

              <span className={compact ? studioPickerCardDescriptionCompact : studioPickerCardDescription}>
                {preset.recommendedUse.slice(0, 2).join(" · ")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
