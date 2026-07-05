"use client";

import {
  resolveCaptionLayout,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "@/features/caption-engine/caption-layout.utils";
import type { CaptionAnimationState } from "@/features/timeline-intelligence/resolve-caption-animation-state.utils";
import { isTransitionVideoContent, resolveActiveSubtitleForScene } from "@/features/story/utils";
import { type DisplayCaptionScene } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";

interface SubtitleOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout">;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  activeSubtitleChunk?: string;
  chunkProgress?: number;
  captionAnimationState?: CaptionAnimationState | null;
  subtitleAvailableDurationMs?: number;
  captionTooShortForEffect?: boolean;
  className?: string;
}

/** Timed narration subtitles inside the phone preview frame. */
export default function SubtitleOverlay({
  scene,
  script,
  sceneElapsedMs,
  sceneDurationMs,
  activeSubtitleChunk,
  chunkProgress,
  captionAnimationState,
  subtitleAvailableDurationMs,
  captionTooShortForEffect,
  className = "",
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

  const caption = renderSceneCaptionContent(
    scene,
    "preview-narration-subtitle-text",
    `${scene.id ?? "preview"}-${visibleCaption}`,
    {
      maxLines: 3,
      activeSubtitleChunk: visibleCaption,
      captionAnimationState: captionAnimationState ?? undefined,
      subtitleAvailableDurationMs,
      captionTooShortForEffect,
    },
  );

  if (!caption) {
    return null;
  }

  const layout = resolveCaptionLayout(scene, script);
  const overlayStyle = resolvePreviewCaptionOverlayStyle(layout);
  const pillStyle = resolvePreviewCaptionPillStyle(layout);
  const useLegacyClass = layout.usesLegacyBottomPlacement;

  return (
    <div
      className={`${useLegacyClass ? "preview-narration-subtitle-overlay" : ""} ${className}`.trim()}
      style={useLegacyClass ? undefined : overlayStyle}
      aria-hidden
    >
      <div
        className={useLegacyClass ? "preview-narration-subtitle-pill" : "preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"}
        style={pillStyle}
      >
        {caption}
      </div>
    </div>
  );
}
