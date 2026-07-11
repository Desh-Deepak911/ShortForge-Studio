"use client";

import SceneFrameImage from "@/features/editor/components/SceneFrameImage";
import SceneFrameVideo from "@/features/editor/components/SceneFrameVideo";
import { getSceneMedia, getSceneMediaType, sceneHasImage } from "@/features/story/utils";
import type { FootieScene } from "@/features/story/types";

export interface SceneFrameMediaProps {
  scene: FootieScene;
  alt: string;
  className?: string;
  mediaClassName?: string;
  /** Live drag offset in screen pixels (framing edit — image or video). */
  transformOffset?: { x: number; y: number };
  isDragging?: boolean;
  /** Scene-local elapsed time for video clip sync + media motion. */
  sceneElapsedMs?: number;
  /** Scene duration for shared media motion progress. */
  sceneDurationMs?: number;
  /** Preview playback active. */
  isPlaying?: boolean;
  /** Only the active scene should play its video. */
  isActive?: boolean;
}

/**
 * Preview media renderer — video clips via SceneFrameVideo, images via SceneFrameImage.
 * Both paths resolve motion through the shared media-motion engine.
 */
export default function SceneFrameMedia({
  scene,
  alt,
  className,
  mediaClassName,
  transformOffset,
  isDragging = false,
  sceneElapsedMs = 0,
  sceneDurationMs = 0,
  isPlaying = false,
  isActive = true,
}: SceneFrameMediaProps) {
  const media = getSceneMedia(scene);
  const mediaType = getSceneMediaType(scene);

  if (mediaType === "video" && media?.type === "video" && media.url) {
    return (
      <SceneFrameVideo
        media={media}
        scene={scene}
        alt={alt}
        className={className}
        videoClassName={mediaClassName}
        sceneId={scene.id}
        sceneElapsedMs={sceneElapsedMs}
        sceneDurationMs={sceneDurationMs}
        isPlaying={isPlaying}
        isActive={isActive}
        transformOffset={transformOffset}
        isDragging={isDragging}
      />
    );
  }

  if (sceneHasImage(scene) || mediaType === "image") {
    return (
      <SceneFrameImage
        scene={scene}
        alt={alt}
        className={className}
        imageClassName={mediaClassName}
        transformOffset={transformOffset}
        sceneElapsedMs={sceneElapsedMs}
        sceneDurationMs={sceneDurationMs}
        isDragging={isDragging}
      />
    );
  }

  return null;
}

/** Pure helper for tests — which renderer path a scene would use. */
export function resolveSceneFrameMediaKind(
  scene: FootieScene,
): "video" | "image" | "placeholder" {
  const mediaType = getSceneMediaType(scene);
  if (mediaType === "video") {
    return "video";
  }
  if (sceneHasImage(scene) || mediaType === "image") {
    return "image";
  }
  return "placeholder";
}
