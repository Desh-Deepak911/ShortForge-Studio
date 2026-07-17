"use client";

import SceneFrameImage from "@/features/editor/components/SceneFrameImage";
import SceneFrameVideo from "@/features/editor/components/SceneFrameVideo";
import {
  resolveActiveSceneMediaRenderView,
  type ActiveSceneMediaRenderView,
} from "@/features/scene-media-timeline";
import type { FootieScene } from "@/features/story/types";

export interface SceneFrameMediaProps {
  scene: FootieScene;
  /** Pre-resolved active media view from the Preview composition boundary. */
  activeMediaView: ActiveSceneMediaRenderView;
  alt: string;
  className?: string;
  mediaClassName?: string;
  /** Live drag offset in screen pixels (framing edit — image or video). */
  transformOffset?: { x: number; y: number };
  isDragging?: boolean;
  /** Preview playback active. */
  isPlaying?: boolean;
  /** Only the active scene should play its video. */
  isActive?: boolean;
  /**
   * When true, live framing drag is allowed (first timeline item only in multi-image).
   * Resolved at the composition boundary.
   */
  allowFramingDrag?: boolean;
}

/**
 * Preview media renderer — consumes a pre-resolved active timeline render view.
 * Does not read process.env; active item resolution happens at the Preview composition boundary.
 */
export default function SceneFrameMedia({
  scene,
  activeMediaView,
  alt,
  className,
  mediaClassName,
  transformOffset,
  isDragging = false,
  isPlaying = false,
  isActive = true,
  allowFramingDrag = false,
}: SceneFrameMediaProps) {
  const media = activeMediaView.media;
  const itemElapsedMs = activeMediaView.itemElapsedMs;
  const itemDurationMs = activeMediaView.windowDurationMs;
  const applyDrag = allowFramingDrag && Boolean(transformOffset);

  if (media?.type === "video" && media.url) {
    return (
      <SceneFrameVideo
        key={activeMediaView.mediaItemId ?? `video-${activeMediaView.itemIndex}`}
        media={media}
        scene={activeMediaView.renderScene}
        alt={alt}
        className={className}
        videoClassName={mediaClassName}
        sceneId={scene.id}
        sceneElapsedMs={itemElapsedMs}
        sceneDurationMs={itemDurationMs}
        isPlaying={isPlaying}
        isActive={isActive}
        transformOffset={applyDrag ? transformOffset : undefined}
        isDragging={applyDrag && isDragging}
        mediaItemId={activeMediaView.mediaItemId ?? undefined}
      />
    );
  }

  if (media?.type === "image" && media.url) {
    return (
      <SceneFrameImage
        key={activeMediaView.mediaItemId ?? `image-${activeMediaView.itemIndex}`}
        scene={activeMediaView.renderScene}
        alt={alt}
        className={className}
        imageClassName={mediaClassName}
        transformOffset={applyDrag ? transformOffset : undefined}
        sceneElapsedMs={itemElapsedMs}
        sceneDurationMs={itemDurationMs}
        isDragging={applyDrag && isDragging}
        mediaItemId={activeMediaView.mediaItemId ?? undefined}
      />
    );
  }

  return null;
}

/** Pure helper for tests — which renderer path a render view would use. */
export function resolveSceneFrameMediaKindFromView(
  view: ActiveSceneMediaRenderView,
): "video" | "image" | "placeholder" {
  if (view.media?.type === "video") {
    return "video";
  }
  if (view.media?.type === "image") {
    return "image";
  }
  return "placeholder";
}

/** Test helper — resolves a view then maps to media kind. */
export function resolveSceneFrameMediaKind(
  scene: FootieScene,
  options?: {
    /** When false, first-item-only (regression tests). Default true. */
    multiImageScenesEnabled?: boolean;
    sceneElapsedMs?: number;
  },
): "video" | "image" | "placeholder" {
  const view = resolveActiveSceneMediaRenderView(
    scene,
    options?.sceneElapsedMs ?? 0,
    { multiImageScenesEnabled: options?.multiImageScenesEnabled !== false },
  );
  return resolveSceneFrameMediaKindFromView(view);
}
