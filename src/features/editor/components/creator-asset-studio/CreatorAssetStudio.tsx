"use client";

import { useMemo } from "react";

import CreatorAssetAlternativeList from "@/features/editor/components/creator-asset-studio/CreatorAssetAlternativeList";
import CreatorAssetCreatorTips from "@/features/editor/components/creator-asset-studio/CreatorAssetCreatorTips";
import CreatorAssetPinnedRecommendation from "@/features/editor/components/creator-asset-studio/CreatorAssetPinnedRecommendation";
import CreatorAssetProviderContextSection from "@/features/editor/components/creator-asset-studio/CreatorAssetProviderContextSection";
import CreatorAssetProviderList from "@/features/editor/components/creator-asset-studio/CreatorAssetProviderList";
import CreatorAssetQuickActions from "@/features/editor/components/creator-asset-studio/CreatorAssetQuickActions";
import CreatorAssetRecommendationCard from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationCard";
import CreatorAssetRecommendationComparison from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationComparison";
import CreatorAssetRecommendationContextSection from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationContextSection";
import CreatorAssetRecommendationHistory from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationHistory";
import CreatorAssetRepairSuggestions from "@/features/editor/components/creator-asset-studio/CreatorAssetRepairSuggestions";
import CreatorAssetSceneHeader from "@/features/editor/components/creator-asset-studio/CreatorAssetSceneHeader";
import CreatorAssetSceneImportanceSection from "@/features/editor/components/creator-asset-studio/CreatorAssetSceneImportanceSection";
import CreatorAssetSceneIntelligenceSection from "@/features/editor/components/creator-asset-studio/CreatorAssetSceneIntelligenceSection";
import CreatorAssetSearchQuery from "@/features/editor/components/creator-asset-studio/CreatorAssetSearchQuery";
import CreatorAssetStudioEmptyState from "@/features/editor/components/creator-asset-studio/CreatorAssetStudioEmptyState";
import CreatorAssetValidationCard from "@/features/editor/components/creator-asset-studio/CreatorAssetValidationCard";
import CreatorAssetVisualIntentSection from "@/features/editor/components/creator-asset-studio/CreatorAssetVisualIntentSection";
import { buildSceneIntelligenceViewModel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import {
  buildCreatorTips,
  formatRecommendationCopyText,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.workflow.utils";
import {
  selectSceneAlternatives,
  selectSceneHasRecommendation,
  selectSceneProviders,
  selectSceneRecommendation,
  selectSceneRepairSuggestions,
  selectSceneSearchQuery,
  selectSceneValidation,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.selectors";
import type { CreatorAssetStudioPlanningData } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.types";
import { formatProviderLabel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.utils";
import { useCreatorAssetStudioSession } from "@/features/editor/components/creator-asset-studio/useCreatorAssetStudioSession";
import { useInspectorContext } from "@/features/editor/inspector/InspectorContext";
import InspectorSection from "@/components/studio-shell/InspectorSection";
import { studioShellSectionDesc, studioShellSectionTitle, studioSubtleText } from "@/lib/utils/studioUi";

export interface CreatorAssetStudioProps {
  sceneIndex: number;
  planning: CreatorAssetStudioPlanningData | null;
}

function resolveSceneTitleFromScript(
  scene: { subtitle?: string; narration?: string } | undefined,
  fallbackQuery?: string,
): string {
  const subtitle = scene?.subtitle?.trim();
  if (subtitle) {
    return subtitle;
  }

  const narration = scene?.narration?.trim();
  if (narration) {
    return narration.length > 72 ? `${narration.slice(0, 69).trim()}…` : narration;
  }

  return fallbackQuery?.trim() || "Untitled scene";
}

/**
 * Creator Asset Studio — read-only planning shell for Asset Intelligence output.
 * No provider calls, uploads, searches, or image attachment.
 */
export default function CreatorAssetStudio({ sceneIndex, planning }: CreatorAssetStudioProps) {
  const { script } = useInspectorContext();
  const scene = script.scenes[sceneIndex];

  const sceneRecommendation = planning ? selectSceneRecommendation(planning, sceneIndex) : undefined;
  const providerResult = planning ? selectSceneProviders(planning, sceneIndex) : undefined;
  const alternatives = planning ? selectSceneAlternatives(planning, sceneIndex) : [];
  const validationResult = planning ? selectSceneValidation(planning) : undefined;
  const repairSuggestions = planning ? selectSceneRepairSuggestions(planning, sceneIndex) : [];
  const searchQuery = planning ? selectSceneSearchQuery(planning, sceneIndex) : "";
  const hasRecommendation = planning ? selectSceneHasRecommendation(planning, sceneIndex) : false;
  const primaryProvider = providerResult?.rankedProviders.find(
    (provider) => provider.priority === "primary",
  );
  const secondaryProvider = providerResult?.rankedProviders.find(
    (provider) => provider.priority === "secondary",
  );
  const topRecommendation = sceneRecommendation?.topRecommendation;
  const recommendationQuery = topRecommendation?.query ?? "";
  const sceneTitle = resolveSceneTitleFromScript(scene, topRecommendation?.query);

  const plannedFutureItems = useMemo(() => {
    if (!planning) {
      return [];
    }

    return script.scenes
      .map((scriptScene, index) => {
        if (index <= sceneIndex) {
          return null;
        }

        const recommendation = selectSceneRecommendation(planning, index)?.topRecommendation;
        if (!recommendation) {
          return null;
        }

        return {
          sceneIndex: index,
          sceneTitle: resolveSceneTitleFromScript(scriptScene, recommendation.query),
          query: recommendation.query,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [planning, sceneIndex, script.scenes]);

  const session = useCreatorAssetStudioSession({
    sceneIndex,
    sceneCount: script.scenes.length,
    sceneTitle,
    recommendationQuery,
    plannedFutureItems,
  });

  const creatorTips = buildCreatorTips({
    validationResult,
    repairSuggestions,
  });

  if (!planning) {
    return <CreatorAssetStudioEmptyState />;
  }

  const sceneView = buildSceneIntelligenceViewModel({
    sceneIndex,
    sceneCount: script.scenes.length,
    scene,
    sceneRecommendation,
    primaryProvider,
  });

  const comparisonAlternative =
    session.expandedAlternativeIndex != null
      ? alternatives[session.expandedAlternativeIndex]
      : undefined;

  return (
    <div className="min-w-0 shrink-0 space-y-3 border-t border-border/20 pt-3">
      <header className="px-0.5 pb-1">
        <p className={studioShellSectionTitle}>Creator Asset Studio</p>
        <p className={studioShellSectionDesc}>
          Scene-aware AI planning for the selected timeline moment — read only.
        </p>
      </header>

      <div
        key={sceneIndex}
        className="space-y-3.5 transition-opacity duration-300 ease-out motion-reduce:transition-none"
      >
        <CreatorAssetSceneHeader viewModel={sceneView} />

        <CreatorAssetSceneIntelligenceSection chips={sceneView.intelligenceChips} />

        <CreatorAssetVisualIntentSection intents={sceneView.visualIntents} />

        <CreatorAssetSceneImportanceSection
          importance={sceneView.importance}
          explanation={sceneView.importanceExplanation}
        />

        <CreatorAssetProviderContextSection context={sceneView.providerContext} />

        <CreatorAssetRecommendationContextSection contexts={sceneView.recommendationContexts} />

        {hasRecommendation && topRecommendation && sceneRecommendation ? (
          <InspectorSection
            title="Asset Planning"
            description="AI recommendation, alternatives, providers, and quality assessment."
            defaultOpen
          >
            <div className="space-y-3.5">
              <CreatorAssetQuickActions
                searchQuery={searchQuery}
                recommendationText={formatRecommendationCopyText(topRecommendation)}
                providerLabel={
                  primaryProvider ? formatProviderLabel(primaryProvider.providerId) : "Planning match"
                }
              />

              <CreatorAssetPinnedRecommendation
                query={recommendationQuery}
                isPinned={session.isPinned}
                onTogglePin={session.togglePin}
              />

              <CreatorAssetRecommendationHistory
                previousItems={session.previousItems}
                currentItem={session.currentItem}
                futureItems={session.futureItems}
              />

              <CreatorAssetRecommendationCard
                recommendation={topRecommendation}
                sceneConfidence={sceneRecommendation.confidence}
                reasoning={sceneRecommendation.reasoning}
                primaryProvider={primaryProvider}
                isPinned={session.isPinned}
              />

              <CreatorAssetAlternativeList
                alternatives={alternatives}
                expandedComparisonIndex={session.expandedAlternativeIndex}
                onCompare={session.toggleAlternativeComparison}
              />

              {comparisonAlternative ? (
                <CreatorAssetRecommendationComparison
                  current={topRecommendation}
                  alternative={comparisonAlternative}
                  sceneConfidence={sceneRecommendation.confidence}
                  primaryProvider={primaryProvider}
                  secondaryProvider={secondaryProvider}
                  expanded={session.expandedAlternativeIndex != null}
                  onToggle={() => session.setExpandedAlternativeIndex(null)}
                />
              ) : null}

              <CreatorAssetProviderList rankedProviders={providerResult?.rankedProviders ?? []} />

              <CreatorAssetSearchQuery searchQuery={searchQuery} />

              <CreatorAssetCreatorTips tips={creatorTips} />

              {validationResult ? (
                <CreatorAssetValidationCard validationResult={validationResult} />
              ) : null}

              <CreatorAssetRepairSuggestions suggestions={repairSuggestions} />
            </div>
          </InspectorSection>
        ) : (
          <section className="rounded-2xl bg-surface-elevated/20 p-4 ring-1 ring-border/15">
            <p className={studioShellSectionTitle}>Asset Planning</p>
            <p className={`${studioSubtleText} mt-2`}>
              No AI asset recommendation is available for this scene yet.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
