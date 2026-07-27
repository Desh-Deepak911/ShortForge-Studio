import type { FootieScene, SceneMedia } from "@/features/story/types";
import { getSceneMedia } from "@/features/story/utils";

import {
  freezeMediaVisualAdjustments,
  normalizeMediaVisualAdjustments,
} from "./normalize-media-visual-adjustments";
import type { SceneMediaVisualAdjustments } from "./media-visual-adjustments.types";

export function patchSceneMediaVisualAdjustments(
  media: SceneMedia,
  patch: Partial<SceneMediaVisualAdjustments>,
): SceneMedia {
  const next = normalizeMediaVisualAdjustments({
    ...normalizeMediaVisualAdjustments(media.visualAdjustments),
    ...patch,
  });
  const frozen = freezeMediaVisualAdjustments(next);
  return {
    ...media,
    ...(frozen ? { visualAdjustments: frozen } : { visualAdjustments: undefined }),
  };
}

export function resetSceneMediaVisualAdjustments(media: SceneMedia): SceneMedia {
  return { ...media, visualAdjustments: undefined };
}

export function buildMediaVisualAdjustmentsPatch(
  scene: FootieScene,
  patch: Partial<SceneMediaVisualAdjustments>,
): { media: SceneMedia } | null {
  const media = getSceneMedia(scene);
  if (!media || media.type === "placeholder") return null;
  return { media: patchSceneMediaVisualAdjustments(media, patch) };
}

export function buildResetMediaVisualAdjustmentsPatch(
  scene: FootieScene,
): { media: SceneMedia } | null {
  const media = getSceneMedia(scene);
  if (!media || media.type === "placeholder") return null;
  return { media: resetSceneMediaVisualAdjustments(media) };
}
