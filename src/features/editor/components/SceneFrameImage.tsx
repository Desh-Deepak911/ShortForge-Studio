"use client";

import { resolvePreviewMediaMotionStyle } from "@/features/editor/preview/motion";
import {
  isFitWithBlurredBackgroundActive,
  resolveMediaFramingLayerPlan,
  resolveSceneMediaFraming,
  scaleFitBackgroundBlurPx,
} from "@/features/media-framing";
import { buildComposedMediaVisualFilter } from "@/features/media-motion";
import {
  getSceneImage,
  getSceneImageObjectFit,
} from "@/features/story/utils";
import { useFrameSize } from "@/hooks/useFrameSize";
import type { FootieScene } from "@/features/story/types";
import { useKeyframedVisualEffectsEnabled } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";

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
 * Fit with background: blurred Fill layer under sharp Fit (same source URL).
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
  const keyframedVisualEffectsEnabled = useKeyframedVisualEffectsEnabled();

  if (!baseImage) {
    return null;
  }

  const framing = resolveSceneMediaFraming(scene, { media: scene.media });
  const layerPlan = resolveMediaFramingLayerPlan(framing);
  const fitWithBackground = isFitWithBlurredBackgroundActive(framing);
  const objectFit = fitWithBackground
    ? "contain"
    : getSceneImageObjectFit(baseImage);
  const hasFrameSize = frameWidth > 0 && frameHeight > 0;

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
          keyframedVisualEffectsEnabled,
        }),
        ...(isDragging ? { willChange: "transform" as const } : {}),
      }
    : {
        transform: "none" as const,
        transformOrigin: "center center" as const,
        ...(isDragging ? { willChange: "transform" as const } : {}),
      };
  const visualFilter = buildComposedMediaVisualFilter(
    scene.media?.visualAdjustments,
    scene.media?.visualEffect,
    {
      keyframedVisualEffectsEnabled,
      targetWidth: frameWidth || 1080,
    },
  );
  const blurPx = scaleFitBackgroundBlurPx(
    frameWidth || 1080,
    layerPlan.backgroundBlurPxAt1080,
  );
  const backgroundFilter =
    visualFilter && visualFilter !== "none"
      ? `${visualFilter} blur(${blurPx}px) brightness(${1 - layerPlan.backgroundDimAlpha})`
      : `blur(${blurPx}px) brightness(${1 - layerPlan.backgroundDimAlpha})`;

  return (
    <div
      ref={containerRef}
      className={className}
      data-scene-frame-media="image"
      data-scene-media-item-id={mediaItemId ?? undefined}
      data-fit-with-background={fitWithBackground ? "true" : "false"}
    >
      <div className="absolute inset-0" style={transformStyle}>
        {fitWithBackground ? (
          <img
            src={baseImage.url}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`absolute inset-0 h-full w-full max-w-none object-cover ${imageClassName}`}
            style={{
              filter: backgroundFilter,
              transform: `scale(${layerPlan.backgroundCoverEdgePad})`,
            }}
            data-scene-frame-layer="background"
          />
        ) : null}
        <img
          src={baseImage.url}
          alt={alt}
          draggable={false}
          className={`absolute inset-0 h-full w-full max-w-none ${
            objectFit === "contain" ? "object-contain" : "object-cover"
          } ${imageClassName}`}
          style={{ filter: visualFilter }}
          data-scene-frame-layer="foreground"
        />
      </div>
    </div>
  );
}
