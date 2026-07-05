"use client";

import {
  resolvePreviewCaptionLayout,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "@/features/caption-engine/caption-layout.utils";
import { CaptionPreviewOverlay } from "@/features/caption-layout-drag";
import { getPreviewDisplayCaption, normalizeCaptionMode } from "@/features/story/utils";
import type { DisplayCaptionScene } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";
import { studioPreviewCaption } from "@/lib/utils/studioUi";

interface CaptionOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout">;
  className?: string;
  draggable?: boolean;
  onOffsetCommit?: (offsetX: number, offsetY: number) => void;
  onResetLayout?: () => void;
}

/** Generated-caption overlay for phone preview (inline layout at bottom). */
export default function CaptionOverlay({
  scene,
  script,
  className = "",
  draggable = false,
  onOffsetCommit,
  onResetLayout,
}: CaptionOverlayProps) {
  const isSubtitlesMode = normalizeCaptionMode(scene.captionMode) === "subtitles";
  if (isSubtitlesMode) {
    return null;
  }

  const visibleCaption = getPreviewDisplayCaption(scene);
  const caption = renderSceneCaptionContent(
    scene,
    studioPreviewCaption,
    `${scene.id ?? "preview"}-${visibleCaption}`,
    {},
  );

  if (!caption) {
    return null;
  }

  if (draggable) {
    return (
      <CaptionPreviewOverlay
        scene={scene}
        script={script}
        draggable
        overlayClassName={className}
        pillClassName="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
        onOffsetCommit={onOffsetCommit}
        onResetLayout={onResetLayout}
      >
        {caption}
      </CaptionPreviewOverlay>
    );
  }

  const resolvedLayout = resolvePreviewCaptionLayout(scene, script);
  const overlayStyle = resolvePreviewCaptionOverlayStyle(resolvedLayout);
  const pillStyle = resolvePreviewCaptionPillStyle(resolvedLayout);
  const useLegacyClass = resolvedLayout.usesLegacyBottomCenter;

  if (useLegacyClass) {
    return (
      <div className={`preview-narration-subtitle-overlay ${className}`.trim()} aria-hidden>
        {caption}
      </div>
    );
  }

  return (
    <div
      className={`preview-narration-subtitle-overlay ${className}`.trim()}
      style={overlayStyle}
      aria-hidden
    >
      <div
        className="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed"
        style={pillStyle}
      >
        {caption}
      </div>
    </div>
  );
}
