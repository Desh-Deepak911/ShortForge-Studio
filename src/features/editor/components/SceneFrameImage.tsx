"use client";

import { resolvePreviewMediaMotionStyle } from "@/features/editor/preview/motion";
import {
  getSceneImage,
  getSceneImageObjectFit,
} from "@/features/story/utils";
import { useFrameSize } from "@/hooks/useFrameSize";
import type { FootieScene } from "@/features/story/types";

interface SceneFrameImageProps {
  scene: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  alt: string;
  className?: string;
  imageClassName?: string;
  /** Live drag offset in screen pixels (preview only). */
  transformOffset?: { x: number; y: number };
  /**
   * Item-local elapsed ms when multi-image Preview is active; otherwise scene-local.
   * Drives shared media motion progress.
   */
  sceneElapsedMs?: number;
  /** Item/scene duration ms — motion progress denominator. */
  sceneDurationMs?: number;
  /** Keeps transforms on the compositor while panning. */
  isDragging?: boolean;
  /** Stable timeline item id when rendering a Scene Media Timeline item. */
  mediaItemId?: string;
}

/**
 * Renders a scene image inside a clipped frame with pan/zoom/rotation transform.
 * Motion is resolved via the shared media-motion engine (preview adapter → CSS).
 */
export default function SceneFrameImage({
  scene,
  alt,
  className = "absolute inset-0 overflow-hidden",
  imageClassName = "",
  transformOffset,
  sceneElapsedMs = 0,
  sceneDurationMs = 0,
  isDragging = false,
  mediaItemId,
}: SceneFrameImageProps) {
  const { ref: containerRef, width: frameWidth, height: frameHeight } =
    useFrameSize<HTMLDivElement>();
  const baseImage = getSceneImage(scene);

  if (!baseImage) {
    return null;
  }

  const objectFit = getSceneImageObjectFit(baseImage);
  const hasFrameSize = frameWidth > 0 && frameHeight > 0;

  // Shared engine composes base framing × motion delta; adapter emits CSS.
  const transformStyle = hasFrameSize
    ? {
        ...resolvePreviewMediaMotionStyle({
          scene,
          media: scene.media,
          sceneElapsedMs,
          sceneDurationMs,
          frameWidth,
          frameHeight,
          transformOffset,
        }),
        ...(isDragging ? { willChange: "transform" as const } : {}),
      }
    : {
        transform: "none" as const,
        transformOrigin: "center center" as const,
        ...(isDragging ? { willChange: "transform" as const } : {}),
      };

  return (
    <div
      ref={containerRef}
      className={className}
      data-scene-frame-media="image"
      data-scene-media-item-id={mediaItemId ?? undefined}
    >
      {/* MotionLayer + BaseMediaTransformLayer: composition owned by resolveMediaMotionState */}
      <img
        src={baseImage.url}
        alt={alt}
        draggable={false}
        className={`absolute inset-0 h-full w-full max-w-none ${
          objectFit === "contain" ? "object-contain" : "object-cover"
        } ${imageClassName}`}
        style={transformStyle}
      />
    </div>
  );
}
