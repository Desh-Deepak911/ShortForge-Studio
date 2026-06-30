"use client";

import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetProviderContextSectionProps {
  context: string | null;
}

/**
 * Provider selection explanation derived from planning metadata.
 */
export default function CreatorAssetProviderContextSection({
  context,
}: CreatorAssetProviderContextSectionProps) {
  if (!context) {
    return null;
  }

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3">
        <p className={studioShellSectionTitle}>Provider Context</p>
        <p className={studioSubtleText}>Why this provider fits the scene</p>
      </header>

      <p className="text-sm leading-relaxed text-foreground/90">{context}</p>
    </section>
  );
}
