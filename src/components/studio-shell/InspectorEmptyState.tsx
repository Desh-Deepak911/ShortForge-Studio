"use client";

import { MousePointerClick } from "lucide-react";

import { StudioStatus } from "@/components/studio-status";

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
    <StudioStatus
      variant="empty"
      layout="compact"
      title="No scene selected"
      description={message}
      icon={MousePointerClick}
    />
  );
}
