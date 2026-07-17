"use client";

/**
 * Dedicated transition-control row above the media segment track (Sprint 9D.2).
 * Lives outside overflow-hidden ancestors so chips are never clipped.
 */

import type { FootieScene, TransitionEffect } from "@/features/story/types";
import { resolveStoredBoundaryEffect } from "@/features/scene-media-transitions";
import type { ResolvedSceneMediaWindow } from "@/features/scene-media-timeline";

import SceneMediaTransitionAffordance from "./SceneMediaTransitionAffordance";
import { sceneMediaTransitionRow, sceneMediaTransitionSlot } from "./scene-media-timeline.ui";

export interface SceneMediaTransitionRowProps {
  scene: FootieScene;
  windows: readonly ResolvedSceneMediaWindow[];
  selectedMediaTransition: { fromItemId: string; toItemId: string } | null;
  disabled?: boolean;
  onSelect: (fromItemId: string, toItemId: string) => void;
}

export default function SceneMediaTransitionRow({
  scene,
  windows,
  selectedMediaTransition,
  disabled = false,
  onSelect,
}: SceneMediaTransitionRowProps) {
  if (windows.length < 2) {
    return null;
  }

  return (
    <div
      className={sceneMediaTransitionRow}
      data-scene-media-transition-row="true"
      data-scene-media-transition-control-count={windows.length - 1}
      role="toolbar"
      aria-label="Intra-scene media transitions"
    >
      {windows.map((window, index) => {
        const flexGrow = Math.max(window.durationMs, 1);
        const next = windows[index + 1];
        const effect: TransitionEffect = next
          ? resolveStoredBoundaryEffect(scene, window.itemId, next.itemId).effect
          : "cut";
        const selected = Boolean(
          next &&
            selectedMediaTransition?.fromItemId === window.itemId &&
            selectedMediaTransition?.toItemId === next.itemId,
        );

        return (
          <div
            key={window.itemId}
            className={sceneMediaTransitionSlot}
            style={{ flexGrow, flexBasis: 0 }}
            data-scene-media-transition-slot={window.itemId}
          >
            {next ? (
              <SceneMediaTransitionAffordance
                fromIndex={index}
                toIndex={index + 1}
                fromItemId={window.itemId}
                toItemId={next.itemId}
                effect={effect}
                selected={selected}
                disabled={disabled}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
