"use client";

import { Sparkles } from "lucide-react";

import { studioShellSectionDesc, studioShellSectionTitle } from "@/lib/utils/studioUi";

export interface CreatorAssetStudioEmptyStateProps {
  message?: string;
}

/**
 * Premium empty state for Creator Asset Studio — presentation only.
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

      <div className="rounded-2xl bg-gradient-to-b from-surface-elevated/35 to-surface-elevated/15 px-5 py-8 text-center ring-1 ring-border/20">
        <div
          aria-hidden
          className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20"
        >
          <div className="absolute inset-0 rounded-2xl bg-accent/5 blur-md" />
          <Sparkles className="relative h-5 w-5 text-accent" />
        </div>

        <p className="mt-4 text-sm font-medium leading-relaxed text-foreground/90">{message}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Recommendations appear after story generation completes.
        </p>
      </div>
    </div>
  );
}
