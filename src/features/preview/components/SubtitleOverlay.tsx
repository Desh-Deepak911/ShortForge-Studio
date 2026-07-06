"use client";

import {
  resolvePreviewCaptionLayoutForScene,
  resolvePreviewCaptionLayoutScene,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "@/features/caption-engine/caption-layout.utils";
import {
  resolveCaptionStyleMaxLines,
  resolvePreviewCaptionPillCombinedStyle,
  resolvePreviewCaptionTypographyStyleForScene,
} from "@/features/caption-style";
import { CaptionPreviewOverlay } from "@/features/caption-layout-drag";
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

/** Timed narration subtitles inside the phone preview frame. */
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
  const layoutScene = resolvePreviewCaptionLayoutScene(script, scene, sceneIndex);

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

  const maxLines = resolveCaptionStyleMaxLines(layoutScene, script);
  const typographyStyle = resolvePreviewCaptionTypographyStyleForScene(layoutScene, script);

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

  const styledCaption = typographyStyle ? (
    <div style={typographyStyle}>{caption}</div>
  ) : (
    caption
  );

  if (draggable) {
    return (
      <CaptionPreviewOverlay
        scene={layoutScene}
        script={script}
        sceneIndex={sceneIndex}
        draggable
        allowPointerEvents={allowPointerEvents}
        overlayClassName={className}
        pillClassName="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
        onOffsetCommit={onOffsetCommit}
        onResetLayout={onResetLayout}
      >
        {styledCaption}
      </CaptionPreviewOverlay>
    );
  }

  const resolvedLayout = resolvePreviewCaptionLayoutForScene(
    layoutScene,
    script,
    sceneIndex,
  );
  const overlayStyle = resolvePreviewCaptionOverlayStyle(resolvedLayout);
  const pillStyle = resolvePreviewCaptionPillCombinedStyle(
    layoutScene,
    script,
    resolvePreviewCaptionPillStyle(resolvedLayout),
  );
  const useLegacyClass = resolvedLayout.usesLegacyBottomCenter;

  return (
    <div
      className={`${useLegacyClass ? "preview-narration-subtitle-overlay" : ""} ${className}`.trim()}
      style={
        useLegacyClass
          ? { pointerEvents: "none" }
          : { ...overlayStyle, pointerEvents: "none" }
      }
      aria-hidden
    >
      <div
        className={
          useLegacyClass
            ? "preview-narration-subtitle-pill"
            : "preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
        }
        style={pillStyle}
      >
        {styledCaption}
      </div>
    </div>
  );
}
