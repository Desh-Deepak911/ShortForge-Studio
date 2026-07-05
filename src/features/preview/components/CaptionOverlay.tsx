"use client";

import {
  resolveCaptionLayout,
  resolvePreviewCaptionOverlayStyle,
  resolvePreviewCaptionPillStyle,
} from "@/features/caption-engine/caption-layout.utils";
import { getPreviewDisplayCaption, normalizeCaptionMode } from "@/features/story/utils";
import type { DisplayCaptionScene } from "@/features/story/utils";
import type { FootieScript } from "@/features/story/types";

import { renderSceneCaptionContent } from "@/features/editor/components/subtitleEffectPreview";
import { studioPreviewCaption } from "@/lib/utils/studioUi";

interface CaptionOverlayProps {
  scene: DisplayCaptionScene & { id?: string };
  script?: Pick<FootieScript, "defaultCaptionLayout">;
  className?: string;
}

/** Generated-caption overlay for phone preview (inline layout at bottom). */
export default function CaptionOverlay({ scene, script, className = "" }: CaptionOverlayProps) {
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

  const layout = resolveCaptionLayout(scene, script);
  const overlayStyle = resolvePreviewCaptionOverlayStyle(layout);
  const pillStyle = resolvePreviewCaptionPillStyle(layout);
  const useLegacyClass = layout.usesLegacyBottomPlacement;

  if (useLegacyClass) {
    return (
      <div className={`preview-narration-subtitle-overlay ${className}`.trim()} aria-hidden>
        {caption}
      </div>
    );
  }

  return (
    <div className={`preview-narration-subtitle-overlay ${className}`.trim()} style={overlayStyle} aria-hidden>
      <div className="preview-narration-subtitle-pill preview-narration-subtitle-pill--placed" style={pillStyle}>
        {caption}
      </div>
    </div>
  );
}
