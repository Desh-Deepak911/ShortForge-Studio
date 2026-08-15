"use client";

import { useEffect, useRef } from "react";

import { resolvePreviewMediaMotionStyle } from "@/features/editor/preview/motion";
import { resolveVideoBackgroundPaintMode } from "@/features/editor/preview/video-background-paint-loop";
import {
  isFitWithBlurredBackgroundActive,
  resolveMediaFramingLayerPlan,
  resolveSceneMediaFraming,
  scaleFitBackgroundBlurPx,
} from "@/features/media-framing";
import { buildComposedMediaVisualFilter } from "@/features/media-motion";
import {
  resolvePreviewVideoClipTime,
  shouldPlayPreviewVideoClip,
} from "@/features/preview/utils/preview-video-clip.utils";
import {
  VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
  createTrimPreviewSeekQueue,
  queueTrimPreviewSeek,
  takePendingTrimPreviewSeek,
  useActiveVideoTrimPreviewOverride,
} from "@/features/preview/video-trim-preview";
import type { FootieScene, SceneMedia } from "@/features/story/types";
import { useKeyframedVisualEffectsEnabled } from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";
import { useFrameSize } from "@/hooks/useFrameSize";

interface SceneFrameVideoProps {
  media: SceneMedia;
  alt: string;
  className?: string;
  videoClassName?: string;
  /** Scene id — used to scope temporary trim preview overrides. */
  sceneId?: string;
  /** Full scene — motion config read authority (media.motion + legacy fallbacks). */
  scene?: Pick<FootieScene, "image" | "uploadedImage" | "media">;
  /**
   * Item-local elapsed time in ms when multi-image Preview is active;
   * otherwise scene-local elapsed.
   */
  sceneElapsedMs?: number;
  /** Item/scene duration ms — motion progress denominator. */
  sceneDurationMs?: number;
  /** When true, attempt muted playback; otherwise seek and pause. */
  isPlaying?: boolean;
  /** Only the active preview scene should play. */
  isActive?: boolean;
  /** Live drag offset in screen pixels (framing edit only). */
  transformOffset?: { x: number; y: number };
  /** Keeps transforms on the compositor while panning. */
  isDragging?: boolean;
  /** Stable timeline item id when rendering a Scene Media Timeline item. */
  mediaItemId?: string;
}

function resolveVideoObjectFit(media: SceneMedia): "cover" | "contain" {
  const framing = resolveSceneMediaFraming({ media }, { media });
  if (isFitWithBlurredBackgroundActive(framing)) {
    return "contain";
  }
  return framing.fitMode === "fit" ? "contain" : "cover";
}

/**
 * Draw blurred Fill background from the same decoded <video> element.
 * Never creates a second video player — samples the foreground element.
 */
function paintVideoBackground(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  options: {
    readonly blurPx: number;
    readonly dimAlpha: number;
    readonly edgePad: number;
    readonly visualFilter: string;
  },
): void {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const coverScale =
    Math.max(width / sourceWidth, height / sourceHeight) * options.edgePad;
  const drawWidth = sourceWidth * coverScale;
  const drawHeight = sourceHeight * coverScale;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) {
    ctx.imageSmoothingQuality = "high";
  }

  const blurFilter = `blur(${options.blurPx}px)`;
  const composed =
    options.visualFilter && options.visualFilter !== "none"
      ? `${options.visualFilter} ${blurFilter}`
      : blurFilter;

  try {
    ctx.filter = composed;
    if (typeof ctx.filter === "string" && !ctx.filter.includes("blur")) {
      ctx.filter = options.visualFilter || "none";
    }
  } catch {
    ctx.filter = options.visualFilter || "none";
  }

  ctx.drawImage(
    video,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );

  ctx.filter = "none";
  ctx.globalAlpha = options.dimAlpha;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Renders a muted scene video clip inside the preview phone frame.
 * Framing uses the shared resolver + motion adapter; playback/seek/mute unchanged.
 * Fit with background paints a blurred Fill canvas from the same video element.
 */
export default function SceneFrameVideo({
  media,
  alt,
  className = "absolute inset-0 overflow-hidden",
  videoClassName = "",
  sceneId,
  scene,
  sceneElapsedMs = 0,
  sceneDurationMs = 0,
  isPlaying = false,
  isActive = true,
  transformOffset,
  isDragging = false,
  mediaItemId,
}: SceneFrameVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const seekQueueRef = useRef(createTrimPreviewSeekQueue());
  const rafRef = useRef<number | null>(null);
  const bgRafRef = useRef<number | null>(null);
  const { ref: containerRef, width: frameWidth, height: frameHeight } =
    useFrameSize<HTMLDivElement>();

  const trimPreview = useActiveVideoTrimPreviewOverride(sceneId);
  const trimPreviewActive = Boolean(trimPreview);
  const keyframedVisualEffectsEnabled = useKeyframedVisualEffectsEnabled();

  const url = media.url?.trim();
  const framing = resolveSceneMediaFraming(
    scene ?? { media },
    { media },
  );
  const layerPlan = resolveMediaFramingLayerPlan(framing);
  const fitWithBackground = isFitWithBlurredBackgroundActive(framing);

  const clipTime = resolvePreviewVideoClipTime({
    sceneElapsedMs,
    trimStartMs: media.trimStartMs,
    trimEndMs: media.trimEndMs,
    durationMs: media.durationMs,
  });
  const shouldPlay =
    !trimPreviewActive &&
    shouldPlayPreviewVideoClip({
      isActive,
      isPlaying,
      holdingLastFrame: clipTime.holdingLastFrame,
    });

  const targetTimeMs = trimPreviewActive
    ? trimPreview!.scrubTimeMs
    : clipTime.clipTimeMs;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) {
      return;
    }

    if (!trimPreviewActive) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      seekQueueRef.current = createTrimPreviewSeekQueue(
        Math.round(video.currentTime * 1000),
      );

      const targetSec = targetTimeMs / 1000;
      if (
        Number.isFinite(targetSec) &&
        Math.abs(video.currentTime - targetSec) > 0.08
      ) {
        try {
          video.currentTime = targetSec;
        } catch {
          // Ignore seek errors while metadata is still loading.
        }
      }

      if (shouldPlay) {
        const playResult = video.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {
            // Autoplay may be blocked; muted + playsInline usually succeeds.
          });
        }
        return;
      }

      if (!video.paused) {
        video.pause();
      }
      return;
    }

    // Trim scrub mode: pause and seek with latest-target rAF scheduling.
    if (!video.paused) {
      video.pause();
    }

    const queued = queueTrimPreviewSeek(
      seekQueueRef.current,
      targetTimeMs,
      VIDEO_TRIM_PREVIEW_SEEK_TOLERANCE_MS,
    );
    seekQueueRef.current = queued.queue;

    const flush = () => {
      rafRef.current = null;
      const taken = takePendingTrimPreviewSeek(seekQueueRef.current);
      seekQueueRef.current = taken.queue;
      const el = videoRef.current;
      if (taken.targetMs == null || !el) {
        return;
      }

      const targetSec = taken.targetMs / 1000;
      try {
        if (Number.isFinite(targetSec)) {
          el.currentTime = targetSec;
        }
      } catch {
        // Ignore seek errors while metadata is still loading.
      }

      if (seekQueueRef.current.pendingMs != null) {
        seekQueueRef.current = { ...seekQueueRef.current, scheduled: true };
        rafRef.current = requestAnimationFrame(flush);
      }
    };

    if (queued.shouldSchedule || (queued.queue.pendingMs != null && rafRef.current == null)) {
      seekQueueRef.current = { ...seekQueueRef.current, scheduled: true };
      rafRef.current = requestAnimationFrame(flush);
    }
  }, [shouldPlay, targetTimeMs, trimPreviewActive, url]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (video && !video.paused) {
        video.pause();
      }
    };
  }, []);

  // Paint blurred Fill background from the same video element (timestamp parity).
  // Lifecycle: one loop per active video; cancelled on unmount, inactive, hidden,
  // mode change, or pause (paused paints once; seek triggers a fresh once-paint).
  useEffect(() => {
    if (!fitWithBackground) {
      if (bgRafRef.current != null) {
        cancelAnimationFrame(bgRafRef.current);
        bgRafRef.current = null;
      }
      return;
    }

    const video = videoRef.current;
    const canvas = backgroundCanvasRef.current;
    if (!video || !canvas || frameWidth <= 0 || frameHeight <= 0) {
      return;
    }

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.max(1, Math.round(frameWidth * dpr));
    canvas.height = Math.max(1, Math.round(frameHeight * dpr));
    canvas.style.width = `${frameWidth}px`;
    canvas.style.height = `${frameHeight}px`;

    const visualFilter = buildComposedMediaVisualFilter(
      media.visualAdjustments,
      media.visualEffect,
      {
        keyframedVisualEffectsEnabled,
        targetWidth: frameWidth || 1080,
      },
    );
    const blurPx = scaleFitBackgroundBlurPx(
      frameWidth,
      layerPlan.backgroundBlurPxAt1080,
    );

    let stopped = false;
    const paintOnce = () => {
      if (stopped) {
        return;
      }
      paintVideoBackground(canvas, video, {
        blurPx: blurPx * dpr,
        dimAlpha: layerPlan.backgroundDimAlpha,
        edgePad: layerPlan.backgroundCoverEdgePad,
        visualFilter,
      });
    };

    const cancelLoop = () => {
      if (bgRafRef.current != null) {
        cancelAnimationFrame(bgRafRef.current);
        bgRafRef.current = null;
      }
    };

    const syncLoop = () => {
      cancelLoop();
      if (stopped) {
        return;
      }
      const mode = resolveVideoBackgroundPaintMode({
        fitWithBackground: true,
        isActive,
        shouldPlay,
        documentHidden:
          typeof document !== "undefined" ? document.visibilityState === "hidden" : false,
      });
      if (mode === "stop") {
        return;
      }
      paintOnce();
      if (mode === "continuous") {
        const tick = () => {
          if (stopped) {
            return;
          }
          paintOnce();
          bgRafRef.current = requestAnimationFrame(tick);
        };
        bgRafRef.current = requestAnimationFrame(tick);
      }
    };

    syncLoop();

    const onVisibility = () => {
      syncLoop();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      stopped = true;
      cancelLoop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [
    fitWithBackground,
    frameWidth,
    frameHeight,
    isActive,
    shouldPlay,
    targetTimeMs,
    keyframedVisualEffectsEnabled,
    layerPlan.backgroundBlurPxAt1080,
    layerPlan.backgroundCoverEdgePad,
    layerPlan.backgroundDimAlpha,
    media.visualAdjustments,
    media.visualEffect,
  ]);

  if (!url) {
    return null;
  }

  const objectFit = resolveVideoObjectFit(media);
  const motionScene = scene ?? { media };
  const hasFrameSize = frameWidth > 0 && frameHeight > 0;
  const motionStyle = hasFrameSize
    ? {
        ...resolvePreviewMediaMotionStyle({
          scene: motionScene,
          media,
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
        opacity: 1,
        transformOrigin: "center center" as const,
        ...(isDragging ? { willChange: "transform" as const } : {}),
      };
  const visualFilter = buildComposedMediaVisualFilter(
    media.visualAdjustments,
    media.visualEffect,
    {
      keyframedVisualEffectsEnabled,
      targetWidth: frameWidth || 1080,
    },
  );

  return (
    <div
      ref={containerRef}
      className={className}
      data-scene-frame-media="video"
      data-scene-media-item-id={mediaItemId ?? undefined}
      data-fit-with-background={fitWithBackground ? "true" : "false"}
    >
      <div className="absolute inset-0" style={motionStyle}>
        {fitWithBackground ? (
          <canvas
            ref={backgroundCanvasRef}
            className="absolute inset-0 h-full w-full max-w-none"
            aria-hidden="true"
            data-scene-frame-layer="background"
          />
        ) : null}
        <video
          ref={videoRef}
          src={url}
          poster={media.posterUrl}
          muted
          playsInline
          preload="metadata"
          loop={false}
          aria-label={alt}
          className={`absolute inset-0 h-full w-full max-w-none ${
            objectFit === "contain" ? "object-contain" : "object-cover"
          } ${videoClassName}`}
          style={{ filter: visualFilter }}
          data-preview-video-muted="true"
          data-preview-video-active={isActive ? "true" : "false"}
          data-preview-video-playing={shouldPlay ? "true" : "false"}
          data-preview-video-trim-scrub={trimPreviewActive ? "true" : "false"}
          data-scene-frame-layer="foreground"
        />
      </div>
    </div>
  );
}
