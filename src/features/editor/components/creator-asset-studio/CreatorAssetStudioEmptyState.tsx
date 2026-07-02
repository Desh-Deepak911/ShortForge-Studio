"use client";

import { Sparkles } from "lucide-react";

import { StudioStatus } from "@/components/studio-status";
import { studioShellSectionDesc, studioShellSectionTitle } from "@/lib/utils/studioUi";

export interface CreatorAssetStudioEmptyStateProps {
  message?: string;
}

/**
 * Empty state for Creator Asset Studio — presentation only.
 */
export default function CreatorAssetStudioEmptyState({
  message = "Generate your story to unlock AI-powered asset recommendations.",
}: CreatorAssetStudioEmptyStateProps) {
  return (
    <div className="min-w-0 shrink-0 space-y-3 border-t border-border/20 pt-3">
      <header className="px-0.5 pb-1">
        <p className={studioShellSectionTitle}>Creator Asset Studio</p>
        <p className={studioShellSectionDesc}>AI asset planning for the selected scene.</p>
      </header>

      <StudioStatus
        variant="empty"
        layout="centered"
        title={message}
        description="Recommendations appear after story generation completes."
        icon={Sparkles}
        className="max-w-none py-8"
      />
    </div>
  );
}
