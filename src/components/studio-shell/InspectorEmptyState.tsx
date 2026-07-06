"use client";

import { MousePointerClick } from "lucide-react";

import { studioEmptyStateIcon, studioInspectorSummaryStrip, studioSubtleText } from "@/lib/utils/studioUi";

export interface InspectorEmptyStateProps {
  message?: string;
}

/**
 * Shown when no scene is available for inspector editing.
 */
export default function InspectorEmptyState({
  message = "Select a scene from the timeline to edit its image, motion, captions, and transition.",
}: InspectorEmptyStateProps) {
  return (
    <div className={`${studioInspectorSummaryStrip} flex flex-col items-center px-4 py-6 text-center`}>
      <span className={`${studioEmptyStateIcon} mb-3 h-12 w-12`}>
        <MousePointerClick className="h-5 w-5 text-muted" strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-sm font-semibold tracking-tight text-foreground/95">No scene selected</p>
      <p className={`${studioSubtleText} mt-2 max-w-[16rem] text-[11px] leading-relaxed`}>{message}</p>
    </div>
  );
}
