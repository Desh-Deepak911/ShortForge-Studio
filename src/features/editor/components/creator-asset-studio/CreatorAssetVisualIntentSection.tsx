"use client";

import type { VisualIntentLabel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetVisualIntentSectionProps {
  intents: readonly VisualIntentLabel[];
}

/**
 * Visual intent labels derived from planning metadata.
 */
export default function CreatorAssetVisualIntentSection({
  intents,
}: CreatorAssetVisualIntentSectionProps) {
  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3">
        <p className={studioShellSectionTitle}>Visual Intent</p>
        <p className={studioSubtleText}>Recommended visual treatment for this scene</p>
      </header>

      {intents.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {intents.map((intent) => (
            <span
              key={intent}
              className="inline-flex rounded-full bg-background/35 px-2.5 py-1 text-[11px] font-medium text-foreground/90 ring-1 ring-border/20 transition-opacity duration-300"
            >
              {intent}
            </span>
          ))}
        </div>
      ) : (
        <p className={studioSubtleText}>Visual intent will appear once planning metadata is available.</p>
      )}
    </section>
  );
}
