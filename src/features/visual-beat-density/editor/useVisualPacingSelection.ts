"use client";

import { useState } from "react";

import type { VisualBeatDensity } from "../domain/visual-beat-plan";

const DEFAULT_DENSITY: VisualBeatDensity = "balanced";

/**
 * Scene-local density selection for Visual pacing.
 * Does not mutate the story — Suggest/Apply commands own persistence.
 * Resets when the selected scene changes; hydration-safe (no window reads).
 */
export function useVisualPacingSelection(
  sceneId: string,
  planDensity: VisualBeatDensity | undefined,
): {
  readonly selectedDensity: VisualBeatDensity;
  readonly setSelectedDensity: (density: VisualBeatDensity) => void;
} {
  const [state, setState] = useState(() => ({
    sceneId,
    density: planDensity ?? DEFAULT_DENSITY,
  }));

  if (state.sceneId !== sceneId) {
    setState({
      sceneId,
      density: planDensity ?? DEFAULT_DENSITY,
    });
  }

  return {
    selectedDensity: state.density,
    setSelectedDensity: (density) => {
      setState((prev) =>
        prev.sceneId === sceneId ? { sceneId, density } : prev,
      );
    },
  };
}

export const VISUAL_PACING_DEFAULT_DENSITY = DEFAULT_DENSITY;
