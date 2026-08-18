"use client";

import { CaptionPreviewOverlay } from "@/features/caption-layout-drag";
import { resolveCaptionStyleMaxLines } from "@/features/caption-style";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import { isTransitionVideoContent, resolveActiveSubtitleForScene } from "@/features/story/utils";
import { type DisplayCaptionScene } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";

interface SubtitleOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle" | "scenes">;
  sceneIndex?: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  activeSubtitleChunk?: string;
  chunkProgress?: number;
  captionAnimationState?: CaptionAnimationState | null;
  subtitleAvailableDurationMs?: number;
  captionTooShortForEffect?: boolean;
  className?: string;
  draggable?: boolean;
  allowPointerEvents?: boolean;
  onOffsetCommit?: (offsetX: number, offsetY: number) => void;
  onResetLayout?: () => void;
}

/**
 * Timed narration subtitles inside the phone preview frame.
 * Legacy `preview-narration-subtitle-overlay` class is applied by CaptionPreviewOverlay.
 */
export default function SubtitleOverlay({
  scene,
  script,
  sceneIndex,
  sceneElapsedMs,
  sceneDurationMs,
  activeSubtitleChunk,
  chunkProgress,
  captionAnimationState,
  subtitleAvailableDurationMs,
  captionTooShortForEffect,
  className = "",
  draggable = false,
  allowPointerEvents = true,
  onOffsetCommit,
  onResetLayout,
}: SubtitleOverlayProps) {
  const previewChunkState =
    activeSubtitleChunk?.trim()
      ? {
          activeChunk: activeSubtitleChunk,
          chunkProgress: chunkProgress ?? 0,
        }
      : resolveActiveSubtitleForScene(scene, {
          sceneElapsedMs,
          sceneDurationMs,
        });
  const visibleCaption = isTransitionVideoContent(previewChunkState.activeChunk)
    ? ""
    : previewChunkState.activeChunk;

  const maxLines = resolveCaptionStyleMaxLines(scene, script);

  const caption = renderSceneCaptionContent(
    scene,
    "preview-narration-subtitle-text",
    `${scene.id ?? "preview"}-${visibleCaption}`,
    {
      maxLines,
      activeSubtitleChunk: visibleCaption,
      captionAnimationState: captionAnimationState ?? undefined,
      subtitleAvailableDurationMs,
      captionTooShortForEffect,
    },
  );

  if (!caption) {
    return null;
  }

  return (
    <CaptionPreviewOverlay
      scene={scene}
      script={script}
      sceneIndex={sceneIndex}
      draggable={draggable}
      allowPointerEvents={allowPointerEvents}
      overlayClassName={className}
      pillClassName="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
      onOffsetCommit={onOffsetCommit}
      onResetLayout={onResetLayout}
      measurementKey={`subtitle:${scene.id ?? "preview"}:${visibleCaption}:${scene.subtitleEffect ?? "none"}:${captionAnimationState?.phase ?? "static"}`}
    >
      {caption}
    </CaptionPreviewOverlay>
  );
}
