/**
 * Source-quality winning adjustment target.
 *
 * Composes mixed-media inspector projection leaves with the local
 * source-quality legacy-media fallback so media + command mediaItemId always
 * describe the same item. Lives in source-quality so mixed-media remains free
 * of a reverse dependency on this later feature.
 */

import {
  resolveInspectorSceneMediaProjection,
  resolveNearestInspectorMediaItemId,
} from "@/features/mixed-media-scenes/adapters/inspector-scene-media-projection";
import type { FootieScene, SceneMedia } from "@/features/story/types";

import { resolveSourceQualityMedia } from "./resolve-source-quality-media";

export interface SourceQualityWinningAdjustmentTarget {
  readonly media: SceneMedia | null;
  readonly mediaItemId: string | null;
}

function normalizeSelectedMediaItemId(
  value: string | null | undefined,
): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Single winning Source-quality adjustment target.
 * Does not mutate editor selection.
 *
 * - live selected item → that media and id
 * - stale selected id → nearest surviving projected media and that survivor id
 * - mixed-media on, no selection → first projected media and its id
 * - mixed-media off / legacy → canonical single media and mediaItemId null
 * - no media → both null
 */
export function resolveSourceQualityWinningAdjustmentTarget(
  scene: FootieScene,
  options: {
    readonly mixedMediaScenesEnabled: boolean;
    readonly selectedMediaItemId?: string | null;
    readonly previousIndexHint?: number;
  },
): SourceQualityWinningAdjustmentTarget {
  const mixedMediaScenesEnabled = options.mixedMediaScenesEnabled === true;
  const selectedId = normalizeSelectedMediaItemId(options.selectedMediaItemId);
  const previousIndexHint =
    typeof options.previousIndexHint === "number" &&
    Number.isFinite(options.previousIndexHint)
      ? options.previousIndexHint
      : -1;
  const { windows } = resolveInspectorSceneMediaProjection(scene, {
    mixedMediaScenesEnabled,
  });

  if (windows.length > 0) {
    if (selectedId) {
      const live = windows.find((window) => window.itemId === selectedId);
      if (live?.media) {
        return { media: live.media, mediaItemId: live.itemId };
      }
      const nearestId = resolveNearestInspectorMediaItemId(
        windows,
        selectedId,
        previousIndexHint,
      );
      const nearest = nearestId
        ? windows.find((window) => window.itemId === nearestId)
        : windows[0];
      if (nearest?.media) {
        return { media: nearest.media, mediaItemId: nearest.itemId };
      }
    } else if (mixedMediaScenesEnabled) {
      const first = windows[0];
      if (first?.media) {
        return { media: first.media, mediaItemId: first.itemId };
      }
    }
  }

  return {
    media: resolveSourceQualityMedia({ scene }),
    mediaItemId: null,
  };
}
