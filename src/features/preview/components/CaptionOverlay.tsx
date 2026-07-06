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
import { getPreviewDisplayCaption, normalizeCaptionMode } from "@/features/story/utils";
import type { DisplayCaptionScene } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";
import { studioPreviewCaption } from "@/lib/utils/studioUi";

interface CaptionOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout" | "defaultCaptionStyle" | "scenes">;
  sceneIndex?: number;
  className?: string;
  draggable?: boolean;
  allowPointerEvents?: boolean;
  onOffsetCommit?: (offsetX: number, offsetY: number) => void;
  onResetLayout?: () => void;
}

/** Generated-caption overlay for phone preview (inline layout at bottom). */
export default function CaptionOverlay({
  scene,
  script,
  sceneIndex,
  className = "",
  draggable = false,
  allowPointerEvents = true,
  onOffsetCommit,
  onResetLayout,
}: CaptionOverlayProps) {
  const layoutScene = resolvePreviewCaptionLayoutScene(script, scene, sceneIndex);

  const isSubtitlesMode = normalizeCaptionMode(layoutScene.captionMode) === "subtitles";
  if (isSubtitlesMode) {
    return null;
  }

  const visibleCaption = getPreviewDisplayCaption(layoutScene);
  const maxLines = resolveCaptionStyleMaxLines(layoutScene, script);
  const typographyStyle = resolvePreviewCaptionTypographyStyleForScene(layoutScene, script);
  const caption = renderSceneCaptionContent(
    layoutScene,
    studioPreviewCaption,
    `${scene.id ?? "preview"}-${visibleCaption}`,
    { maxLines },
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

  if (useLegacyClass) {
    return (
      <div
        className={`preview-narration-subtitle-overlay ${className}`.trim()}
        style={{ pointerEvents: "none" }}
        aria-hidden
      >
        <div className="preview-narration-subtitle-pill" style={pillStyle}>
          {styledCaption}
        </div>
      </div>
    );
  }

  return (
    <div
      className={className.trim()}
      style={{ ...overlayStyle, pointerEvents: "none" }}
      aria-hidden
    >
      <div
        className="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
        style={pillStyle}
      >
        {styledCaption}
      </div>
    </div>
  );
}
