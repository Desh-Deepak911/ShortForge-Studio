"use client";

import { useEffect, useRef } from "react";

import { resolvePreviewMediaMotionStyle } from "@/features/editor/preview/motion";
import { resolveSceneMediaFraming } from "@/features/media-framing";
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
  /** Scene-local elapsed time in ms. */
  sceneElapsedMs?: number;
  /** Scene duration ms — motion progress denominator. */
  sceneDurationMs?: number;
  /** When true, attempt muted playback; otherwise seek and pause. */
  isPlaying?: boolean;
  /** Only the active preview scene should play. */
  isActive?: boolean;
  /** Live drag offset in screen pixels (framing edit only). */
  transformOffset?: { x: number; y: number };
  /** Keeps transforms on the compositor while panning. */
  isDragging?: boolean;
}

function resolveVideoObjectFit(media: SceneMedia): "cover" | "contain" {
  const framing = resolveSceneMediaFraming({ media }, { media });
  return framing.fitMode === "fit" ? "contain" : "cover";
}

/**
 * Renders a muted scene video clip inside the preview phone frame.
 * Framing uses the shared resolver + motion adapter; playback/seek/mute unchanged.
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
}: SceneFrameVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekQueueRef = useRef(createTrimPreviewSeekQueue());
  const rafRef = useRef<number | null>(null);
  const { ref: containerRef, width: frameWidth, height: frameHeight } =
    useFrameSize<HTMLDivElement>();

  const trimPreview = useActiveVideoTrimPreviewOverride(sceneId);
  const trimPreviewActive = Boolean(trimPreview);

  const url = media.url?.trim();
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

  if (!url) {
    return null;
  }

  const objectFit = resolveVideoObjectFit(media);
  const motionScene = scene ?? { media };
  const hasFrameSize = frameWidth > 0 && frameHeight > 0;
  // Shared engine + preview adapter — framing + motion; playback/seek unchanged.
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
        }),
        ...(isDragging ? { willChange: "transform" as const } : {}),
      }
    : {
        transform: "none" as const,
        opacity: 1,
        transformOrigin: "center center" as const,
        ...(isDragging ? { willChange: "transform" as const } : {}),
      };

  return (
    <div ref={containerRef} className={className} data-scene-frame-media="video">
      {/* PersistentFramingLayer + MediaMotionLayer: CSS transform only */}
      <div className="absolute inset-0" style={motionStyle}>
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
          data-preview-video-muted="true"
          data-preview-video-active={isActive ? "true" : "false"}
          data-preview-video-playing={shouldPlay ? "true" : "false"}
          data-preview-video-trim-scrub={trimPreviewActive ? "true" : "false"}
        />
      </div>
    </div>
  );
}
