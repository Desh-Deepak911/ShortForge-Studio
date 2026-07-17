/**
 * Pure SceneMedia → legacy SceneImage mapper for Preview/Export render adapters.
 * Does not import editor commands. Does not map SceneMedia.motion into imageMotion.
 */

import {
  framingToSceneImageFields,
  resolveSceneMediaFraming,
} from "@/features/media-framing";
import type { SceneImage, SceneMedia } from "@/features/story/types";

/**
 * Derives a SceneImage compatibility representation from image SceneMedia.
 * Returns undefined for non-image or missing URL.
 */
export function sceneMediaToCompatibilityImage(
  media: SceneMedia | null | undefined,
): SceneImage | undefined {
  if (!media || media.type !== "image") {
    return undefined;
  }
  const url = typeof media.url === "string" ? media.url.trim() : "";
  if (!url) {
    return undefined;
  }
  const framing = resolveSceneMediaFraming({ media }, { media });
  const image: SceneImage = {
    url,
    ...framingToSceneImageFields(framing),
  };
  if (media.imageMotion != null) {
    image.imageMotion = media.imageMotion;
  }
  return image;
}
