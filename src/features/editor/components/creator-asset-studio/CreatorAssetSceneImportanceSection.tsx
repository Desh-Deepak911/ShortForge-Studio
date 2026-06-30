"use client";

import type { SceneIntelligenceViewModel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import {
  creatorAssetSectionClass,
  importanceBadgeClass,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetSceneImportanceSectionProps {
  importance: SceneIntelligenceViewModel["importance"];
  explanation: string;
}

/**
 * Scene importance summary with narrative explanation.
 */
export default function CreatorAssetSceneImportanceSection({
  importance,
  explanation,
}: CreatorAssetSceneImportanceSectionProps) {
  const score =
    importance === "Critical" ? 0.9 : importance === "High" ? 0.72 : importance === "Medium" ? 0.55 : 0.35;

  return (
    <section className={creatorAssetSectionClass}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className={studioShellSectionTitle}>Scene Importance</p>
          <p className={studioSubtleText}>How much this scene shapes the story</p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${importanceBadgeClass(score)}`}
        >
          {importance}
        </span>
      </header>

      <p className="text-sm leading-relaxed text-foreground/90">{explanation}</p>
    </section>
  );
}
