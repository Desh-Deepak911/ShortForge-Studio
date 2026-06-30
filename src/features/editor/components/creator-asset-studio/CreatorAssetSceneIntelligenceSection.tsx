"use client";

import type { SceneIntelligenceChip } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import { creatorAssetSectionClass } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetSceneIntelligenceSectionProps {
  chips: readonly SceneIntelligenceChip[];
}

function intelligenceChipClass(chip: SceneIntelligenceChip): string {
  switch (chip) {
    case "Climax":
    case "Hook":
      return "bg-accent/12 text-accent ring-accent/25";
    case "History":
    case "Biography":
      return "bg-amber-500/10 text-amber-100 ring-amber-500/20";
    case "Tactical":
    case "Comparison":
    case "Debate":
      return "bg-violet-500/10 text-violet-100 ring-violet-500/20";
    default:
      return "bg-surface-elevated/55 text-foreground/85 ring-border/25";
  }
}

/**
 * Scene intelligence chips derived from planning metadata.
 */
export default function CreatorAssetSceneIntelligenceSection({
  chips,
}: CreatorAssetSceneIntelligenceSectionProps) {
  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3">
        <p className={studioShellSectionTitle}>Scene Intelligence</p>
        <p className={studioSubtleText}>Story structure signals for this scene</p>
      </header>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition-opacity duration-300 ${intelligenceChipClass(chip)}`}
            >
              {chip}
            </span>
          ))}
        </div>
      ) : (
        <p className={studioSubtleText}>No scene intelligence chips available for this scene.</p>
      )}
    </section>
  );
}
