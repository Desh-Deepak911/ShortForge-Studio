"use client";

import { Play, Smartphone } from "lucide-react";

import { studioCompactButton } from "@/lib/studioUi";

import { invokeStudioPreviewMotion } from "./motion-panel.utils";
import {
  studioMotionIconTile,
  studioMotionPanelDesc,
  studioMotionPanelHeading,
  studioMotionPreviewCard,
} from "./motion-panel.ui";

/**
 * Compact callout — scrolls to preview and starts existing Voice playback.
 */
export default function PreviewMotionCard() {
  return (
    <div className={studioMotionPreviewCard}>
      <div className="flex min-w-0 items-start gap-2.5">
        <div className={studioMotionIconTile}>
          <Smartphone className="h-3.5 w-3.5 text-accent" strokeWidth={1.75} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className={studioMotionPanelHeading}>Preview Motion</p>
          <p className={studioMotionPanelDesc}>
            Watch how this animation plays in the preview canvas.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={invokeStudioPreviewMotion}
        className={`${studioCompactButton} w-full shrink-0 sm:w-auto`}
      >
        <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Preview
      </button>
    </div>
  );
}
