"use client";

import { Pin, PinOff } from "lucide-react";

import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioCompactButton, studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetPinnedRecommendationProps {
  query: string;
  isPinned: boolean;
  onTogglePin: () => void;
}

/**
 * Session-only pinned recommendation control — planning only, no persistence.
 */
export default function CreatorAssetPinnedRecommendation({
  query,
  isPinned,
  onTogglePin,
}: CreatorAssetPinnedRecommendationProps) {
  if (!query.trim()) {
    return null;
  }

  return (
    <section
      className={`${creatorAssetSectionClass} ${isPinned ? "ring-accent/25 bg-accent/5" : ""} transition-all duration-300`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={studioShellSectionTitle}>Pinned Recommendation</p>
          <p className={studioSubtleText}>
            {isPinned ? "Pinned for this session — planning only." : "Pin this recommendation for quick reference."}
          </p>
          {isPinned ? (
            <p className="mt-2 truncate text-sm font-medium text-foreground/90">{query}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onTogglePin}
          aria-pressed={isPinned}
          aria-label={isPinned ? "Unpin recommendation" : "Pin recommendation"}
          className={`${studioCompactButton} shrink-0 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] motion-reduce:transform-none`}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
          {isPinned ? "Unpin" : "Pin"}
        </button>
      </div>
    </section>
  );
}
