"use client";

import { MousePointerClick } from "lucide-react";

import { studioSubtleText } from "@/lib/utils/studioUi";

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
    <div className="flex min-h-[14rem] flex-col items-center justify-center px-3 py-10 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-elevated/40 ring-1 ring-border/20">
        <MousePointerClick className="h-4 w-4 text-muted" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-foreground/85">No scene selected</p>
      <p className={`${studioSubtleText} mt-1.5 max-w-[15rem] leading-relaxed`}>{message}</p>
    </div>
  );
}
