/**
 * Inspector media-window projection — same capability decision as Preview/Export.
 * Uses projectSceneVisualPlan (canonical seam). No duplicated timing math.
 */

import type { ResolvedSceneMediaWindow } from "@/features/scene-media-timeline/resolution/resolve-media-windows";
import type { FootieScene } from "@/features/story/types";

import type { VisualSequenceWarning } from "../domain/normalize-visual-sequence";
import {
  projectSceneVisualPlan,
  type ProjectedSceneVisualPlan,
} from "./project-visual-sequence";

export interface InspectorSceneMediaProjection {
  readonly windows: ResolvedSceneMediaWindow[];
  readonly warnings: readonly VisualSequenceWarning[];
  readonly plan: ProjectedSceneVisualPlan;
}

/** Canonical inspector windows for the resolved mixed-media capability. */
export function resolveInspectorSceneMediaProjection(
  scene: FootieScene,
  options: { readonly mixedMediaScenesEnabled: boolean },
): InspectorSceneMediaProjection {
  const plan = projectSceneVisualPlan(scene, {
    mixedMediaScenesEnabled: options.mixedMediaScenesEnabled === true,
  });
  return {
    windows: plan.windows,
    warnings: plan.warnings,
    plan,
  };
}

/** Selectability against the same windows Preview/Export use for this capability. */
export function isInspectorSelectableMediaItemId(
  scene: FootieScene,
  mediaItemId: string,
  options: { readonly mixedMediaScenesEnabled: boolean },
): boolean {
  const trimmed = typeof mediaItemId === "string" ? mediaItemId.trim() : "";
  if (!trimmed) {
    return false;
  }
  return resolveInspectorSceneMediaProjection(scene, options).windows.some(
    (window) => window.itemId === trimmed,
  );
}

/**
 * After delete/reconcile removes the selected id, pick the nearest survivor.
 * Prefers the item at the prior index (clamped), else the first window, else null.
 */
export function resolveNearestInspectorMediaItemId(
  windows: readonly ResolvedSceneMediaWindow[],
  removedOrStaleId: string | null,
  previousIndexHint = -1,
): string | null {
  if (windows.length === 0) {
    return null;
  }
  if (removedOrStaleId) {
    const stillPresent = windows.find((window) => window.itemId === removedOrStaleId);
    if (stillPresent) {
      return stillPresent.itemId;
    }
  }
  if (previousIndexHint >= 0) {
    const clamped = Math.min(previousIndexHint, windows.length - 1);
    return windows[clamped]?.itemId ?? windows[0]!.itemId;
  }
  return windows[0]!.itemId;
}
