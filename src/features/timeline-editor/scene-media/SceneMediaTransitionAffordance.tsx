"use client";

import type { TransitionEffect } from "@/features/story/types";
import {
  formatMediaTransitionAffordanceLabel,
  formatMediaTransitionEffectChip,
} from "@/features/scene-media-transitions";

import { sceneMediaTransitionAffordance } from "./scene-media-timeline.ui";

export interface SceneMediaTransitionAffordanceProps {
  fromIndex: number;
  toIndex: number;
  fromItemId: string;
  toItemId: string;
  effect: TransitionEffect;
  selected?: boolean;
  disabled?: boolean;
  onSelect: (fromItemId: string, toItemId: string) => void;
}

/**
 * Select-only control for an adjacent media pair.
 * Rendered in the reserved transition row — never nested in the resize handle
 * and never positioned with negative offsets into overflow-hidden tracks.
 */
export default function SceneMediaTransitionAffordance({
  fromIndex,
  toIndex,
  fromItemId,
  toItemId,
  effect,
  selected = false,
  disabled = false,
  onSelect,
}: SceneMediaTransitionAffordanceProps) {
  const label = formatMediaTransitionAffordanceLabel(fromIndex, toIndex, effect);
  const chip = formatMediaTransitionEffectChip(effect);

  return (
    <button
      type="button"
      className={`${sceneMediaTransitionAffordance} ${
        selected ? "ring-1 ring-accent/70 bg-accent-soft/50" : ""
      }`}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      aria-disabled={disabled}
      data-scene-media-transition-affordance={`${fromItemId}:${toItemId}`}
      data-scene-media-transition-effect={effect}
      onPointerDown={(event) => {
        // Keep mutually exclusive with resize drag ownership.
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (disabled) {
          return;
        }
        onSelect(fromItemId, toItemId);
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect(fromItemId, toItemId);
        }
      }}
    >
      {chip}
    </button>
  );
}
