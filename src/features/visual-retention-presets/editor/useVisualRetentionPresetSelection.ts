"use client";

import { useState } from "react";

import {
  isVisualRetentionPresetId,
  VISUAL_RETENTION_PRESET_IDS,
  type VisualRetentionPresetId,
} from "../domain/visual-retention-preset.types";

function normalizeAppliedPresetId(
  value: string | null | undefined,
): VisualRetentionPresetId | null {
  return isVisualRetentionPresetId(value) ? value : null;
}

/**
 * Project-local Visual Retention Preset card selection.
 * Never writes the story. Parent remounts this hook per opened story via `key`.
 * Ordinary useState only — no render-phase setters, effects, timers, or storage.
 */
export function useVisualRetentionPresetSelection(input: {
  /** Valid applied provenance preset, if any — seeds selection on mount only. */
  readonly appliedPresetId?: string | null;
}): {
  readonly selectedPresetId: VisualRetentionPresetId | null;
  readonly setSelectedPresetId: (presetId: VisualRetentionPresetId | null) => void;
  readonly selectAdjacent: (delta: number) => VisualRetentionPresetId;
  readonly selectFirst: () => VisualRetentionPresetId;
  readonly selectLast: () => VisualRetentionPresetId;
} {
  const [selectedPresetId, setSelectedPresetIdState] =
    useState<VisualRetentionPresetId | null>(() =>
      normalizeAppliedPresetId(input.appliedPresetId),
    );

  const setSelectedPresetId = (presetId: VisualRetentionPresetId | null) => {
    if (presetId != null && !isVisualRetentionPresetId(presetId)) {
      setSelectedPresetIdState(null);
      return;
    }
    setSelectedPresetIdState(presetId);
  };

  const selectAtIndex = (index: number): VisualRetentionPresetId => {
    const next =
      VISUAL_RETENTION_PRESET_IDS[
        Math.max(0, Math.min(VISUAL_RETENTION_PRESET_IDS.length - 1, index))
      ]!;
    setSelectedPresetId(next);
    return next;
  };

  const selectAdjacent = (delta: number): VisualRetentionPresetId => {
    if (selectedPresetId == null) {
      return delta >= 0
        ? selectAtIndex(0)
        : selectAtIndex(VISUAL_RETENTION_PRESET_IDS.length - 1);
    }
    const currentIndex = VISUAL_RETENTION_PRESET_IDS.indexOf(selectedPresetId);
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex =
      (safeIndex + delta + VISUAL_RETENTION_PRESET_IDS.length) %
      VISUAL_RETENTION_PRESET_IDS.length;
    return selectAtIndex(nextIndex);
  };

  return {
    selectedPresetId,
    setSelectedPresetId,
    selectAdjacent,
    selectFirst: () => selectAtIndex(0),
    selectLast: () => selectAtIndex(VISUAL_RETENTION_PRESET_IDS.length - 1),
  };
}
