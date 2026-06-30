"use client";

import type { RecommendationContextLabel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetRecommendationContextSectionProps {
  contexts: readonly RecommendationContextLabel[];
}

/**
 * Recommendation context labels derived from planning reasons.
 */
export default function CreatorAssetRecommendationContextSection({
  contexts,
}: CreatorAssetRecommendationContextSectionProps) {
  if (contexts.length === 0) {
    return null;
  }

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3">
        <p className={studioShellSectionTitle}>Recommendation Context</p>
        <p className={studioSubtleText}>How this recommendation supports the scene</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {contexts.map((context) => (
          <span
            key={context}
            className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-100 ring-1 ring-emerald-500/20 transition-opacity duration-300"
          >
            {context}
          </span>
        ))}
      </div>
    </section>
  );
}
