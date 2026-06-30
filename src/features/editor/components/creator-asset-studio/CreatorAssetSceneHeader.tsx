"use client";

import type { SceneIntelligenceViewModel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import {
  creatorAssetHeroClass,
  importanceBadgeClass,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetSceneHeaderProps {
  viewModel: SceneIntelligenceViewModel;
}

/**
 * Scene-aware header for Creator Asset Studio.
 */
export default function CreatorAssetSceneHeader({ viewModel }: CreatorAssetSceneHeaderProps) {
  return (
    <header className={creatorAssetHeroClass}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Scene {viewModel.sceneNumber} of {viewModel.sceneCount}
      </p>

      <h3 className="mt-2 text-base font-semibold leading-snug tracking-tight text-foreground">
        {viewModel.sceneTitle}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {viewModel.narrativeRole ? (
          <span className="inline-flex rounded-full bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-200 ring-1 ring-indigo-500/20">
            {viewModel.narrativeRole}
          </span>
        ) : null}

        {viewModel.templateSlot ? (
          <span className="inline-flex rounded-full bg-surface-elevated/55 px-2.5 py-1 text-[11px] font-medium text-foreground/85 ring-1 ring-border/25">
            {viewModel.templateSlot}
          </span>
        ) : null}

        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${importanceBadgeClass(
            viewModel.importance === "Critical"
              ? 0.9
              : viewModel.importance === "High"
                ? 0.72
                : viewModel.importance === "Medium"
                  ? 0.55
                  : 0.35,
          )}`}
        >
          {viewModel.importance} Importance
        </span>
      </div>

      <p className={`${studioSubtleText} mt-3 leading-relaxed`}>
        Scene-aware planning for the selected timeline moment.
      </p>
    </header>
  );
}
