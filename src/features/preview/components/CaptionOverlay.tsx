"use client";

import { normalizeCaptionMode } from "@/features/story/utils";
import { getDisplayCaption, type DisplayCaptionScene } from "@/features/story/utils";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";
import { studioPreviewCaption } from "@/lib/utils/studioUi";

interface CaptionOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  className?: string;
}

/** Generated-caption overlay for phone preview (inline layout at bottom). */
export default function CaptionOverlay({ scene, className = "" }: CaptionOverlayProps) {
  const isSubtitlesMode = normalizeCaptionMode(scene.captionMode) === "subtitles";
  if (isSubtitlesMode) {
    return null;
  }

  const visibleCaption = getDisplayCaption(scene);
  const caption = renderSceneCaptionContent(
    scene,
    studioPreviewCaption,
    `${scene.id ?? "preview"}-${visibleCaption}`,
    {},
  );

  if (!caption) {
    return null;
  }

  return (
    <div className={className} aria-hidden>
      {caption}
    </div>
  );
}
