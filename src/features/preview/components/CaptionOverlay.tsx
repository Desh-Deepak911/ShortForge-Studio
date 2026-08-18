"use client";

import { CaptionPreviewOverlay } from "@/features/caption-layout-drag";
import { resolveCaptionStyleMaxLines } from "@/features/caption-style";
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

/** Generated-caption overlay for phone preview (shared placement surface). */
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
  const isSubtitlesMode = normalizeCaptionMode(scene.captionMode) === "subtitles";
  if (isSubtitlesMode) {
    return null;
  }

  const visibleCaption = getPreviewDisplayCaption(scene);
  const maxLines = resolveCaptionStyleMaxLines(scene, script);
  const caption = renderSceneCaptionContent(
    scene,
    studioPreviewCaption,
    `${scene.id ?? "preview"}-${visibleCaption}`,
    { maxLines },
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
      measurementKey={`generated:${scene.id ?? "preview"}:${visibleCaption}`}
    >
      {caption}
    </CaptionPreviewOverlay>
  );
}
