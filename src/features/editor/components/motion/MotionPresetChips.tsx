"use client";

import {
  studioMotionPresetChip,
  studioMotionPresetChipActive,
} from "./motion-panel.ui";
import type { ImageMotionPreset } from "@/features/timeline-intelligence/image-motion-presets.utils";

import type { MotionPresetOption } from "./motion-categories.config";

export interface MotionPresetChipsProps {
  presets: readonly MotionPresetOption[];
  activePreset: ImageMotionPreset;
  onSelect: (preset: ImageMotionPreset) => void;
}

/**
 * Selectable preset chips inside a motion category card.
 */
export default function MotionPresetChips({
  presets,
  activePreset,
  onSelect,
}: MotionPresetChipsProps) {
  return (
    <div
      className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2"
      role="group"
      aria-label="Motion presets"
    >
      {presets.map((preset) => {
        const isActive = activePreset === preset.id;

        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(preset.id)}
            className={`${isActive ? studioMotionPresetChipActive : studioMotionPresetChip} w-full min-w-0 justify-center truncate sm:justify-start`}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
