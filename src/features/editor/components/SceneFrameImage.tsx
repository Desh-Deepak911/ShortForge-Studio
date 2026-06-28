"use client";

import {
  getSceneImage,
  getSceneImageObjectFit,
  getSceneImageTransformStyle,
  withScreenDragOffset,
} from "@/features/story/utils";
import { resolveSceneImageMotionTransformState } from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import type { TimelineImageMotionInput } from "@/features/timeline-intelligence/resolve-image-motion-transform.utils";
import { useFrameSize } from "@/hooks/useFrameSize";
import type { FootieScene } from "@/features/story/types";

interface SceneFrameImageProps {
  scene: Pick<FootieScene, "image" | "uploadedImage">;
  alt: string;
  className?: string;
  imageClassName?: string;
  /** Live drag offset in screen pixels (preview only). */
  transformOffset?: { x: number; y: number };
  /** Timeline-driven image motion (preview/export parity). */
  timelineImageMotion?: TimelineImageMotionInput | null;
  /** Keeps transforms on the compositor while panning. */
  isDragging?: boolean;
}

/**
 * Renders a scene image inside a clipped frame with pan/zoom/rotation transform.
 * Uses normalized image metadata; legacy string URLs still work via `getSceneImage`.
 */
export default function SceneFrameImage({
  scene,
  alt,
  className = "absolute inset-0 overflow-hidden",
  imageClassName = "",
  transformOffset,
  timelineImageMotion = null,
  isDragging = false,
}: SceneFrameImageProps) {
  const { ref: containerRef, width: frameWidth, height: frameHeight } =
    useFrameSize<HTMLDivElement>();
  const baseImage = getSceneImage(scene);

  if (!baseImage) {
    return null;
  }

  const image = transformOffset
    ? withScreenDragOffset(baseImage, transformOffset, frameWidth, frameHeight)
    : baseImage;

  const objectFit = getSceneImageObjectFit(image);
  const hasFrameSize = frameWidth > 0 && frameHeight > 0;
  const motionTransformState =
    timelineImageMotion && hasFrameSize
      ? resolveSceneImageMotionTransformState(
          image,
          timelineImageMotion,
          frameWidth,
          frameHeight,
        )
      : null;
  const transformStyle = motionTransformState
    ? {
        transform: motionTransformState.transform,
        transformOrigin: "center center" as const,
        ...(isDragging ? { willChange: "transform" } : {}),
      }
    : {
        ...(hasFrameSize
          ? getSceneImageTransformStyle(image, frameWidth, frameHeight)
          : { transform: "none" as const, transformOrigin: "center center" as const }),
        ...(isDragging ? { willChange: "transform" } : {}),
      };

  return (
    <div ref={containerRef} className={className}>
      <img
        src={image.url}
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
