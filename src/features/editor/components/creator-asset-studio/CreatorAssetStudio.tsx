"use client";

import { useMemo, useState } from "react";

import {
  useSourceQualityIntelligenceEnabled,
  useVisualRetentionCapabilitiesReady,
} from "@/features/visual-retention/client/VisualRetentionCapabilitiesContext";

import CreatorAssetPlanningStaleBadge from "@/features/editor/components/creator-asset-studio/CreatorAssetPlanningStaleBadge";
import CreatorAssetAlternativeList from "@/features/editor/components/creator-asset-studio/CreatorAssetAlternativeList";
import CreatorAssetCreatorTips from "@/features/editor/components/creator-asset-studio/CreatorAssetCreatorTips";
import CreatorAssetPinnedRecommendation from "@/features/editor/components/creator-asset-studio/CreatorAssetPinnedRecommendation";
import CreatorAssetPlanningContextSection from "@/features/editor/components/creator-asset-studio/CreatorAssetPlanningContextSection";
import CreatorAssetProviderList from "@/features/editor/components/creator-asset-studio/CreatorAssetProviderList";
import CreatorAssetQuickActions from "@/features/editor/components/creator-asset-studio/CreatorAssetQuickActions";
import CreatorAssetRecommendationCard from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationCard";
import CreatorAssetRecommendationComparison from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationComparison";
import CreatorAssetRecommendationHistory from "@/features/editor/components/creator-asset-studio/CreatorAssetRecommendationHistory";
import CreatorAssetRepairSuggestions from "@/features/editor/components/creator-asset-studio/CreatorAssetRepairSuggestions";
import CreatorAssetSceneHeader from "@/features/editor/components/creator-asset-studio/CreatorAssetSceneHeader";
import CreatorAssetSearchAssetsCta from "@/features/editor/components/creator-asset-studio/CreatorAssetSearchAssetsCta";
import CreatorAssetSearchQuery from "@/features/editor/components/creator-asset-studio/CreatorAssetSearchQuery";
import CreatorAssetStudioEmptyState from "@/features/editor/components/creator-asset-studio/CreatorAssetStudioEmptyState";
import { CreatorAssetStudioCompactProvider } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.compact-context";
import {
  AssetBrowser,
  buildAssetBrowserInitialSearchContext,
  buildAssetBrowserSearchContext,
  canAttachFromAssetBrowser,
  canHandoffToAssetBrowser,
  isAssetBrowserVisible,
} from "@/features/editor/components/asset-browser";
import { buildScriptHash } from "@/features/editor/creator-asset-planning/creator-asset-planning.utils";
import CreatorAssetValidationCard from "@/features/editor/components/creator-asset-studio/CreatorAssetValidationCard";
import { buildSceneIntelligenceViewModel } from "@/features/editor/components/creator-asset-studio/creator-asset-studio.scene-view.utils";
import {
  buildCreatorTips,
  formatRecommendationCopyText,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.workflow.utils";
import {
  buildPlanningStaleBadge,
  buildPlanningStaleChips,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.staleness.utils";
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
  /** Narrow inspector layout — collapses secondary metadata and tightens spacing. */
  compact?: boolean;
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
export default function CreatorAssetStudio({
  sceneIndex,
  planning,
  compact = false,
}: CreatorAssetStudioProps) {
  const { script, onScriptChange, storyId } = useInspectorContext();
  const capabilitiesReady = useVisualRetentionCapabilitiesReady();
  const sourceQualityEnabled = useSourceQualityIntelligenceEnabled();
  const sourceQualityIntelligenceEnabled =
    capabilitiesReady && sourceQualityEnabled;
  const scene = script.scenes[sceneIndex];
  const [browserSceneIndex, setBrowserSceneIndex] = useState<number | null>(null);
  const assetSearchEnabled = isAssetBrowserVisible();
  const assetBrowserOpen = browserSceneIndex === sceneIndex;

  const sceneRecommendation = planning
    ? selectSceneRecommendation(planning, sceneIndex, scene?.id ?? "")
    : undefined;
  const providerResult = planning
    ? selectSceneProviders(planning, sceneIndex, scene?.id ?? "")
    : undefined;
  const alternatives = planning ? selectSceneAlternatives(planning, sceneIndex, scene?.id ?? "") : [];
  const validationResult = planning ? selectSceneValidation(planning) : undefined;
  const repairSuggestions = planning
    ? selectSceneRepairSuggestions(planning, sceneIndex, scene?.id ?? "")
    : [];
  const searchQuery = planning ? selectSceneSearchQuery(planning, sceneIndex, scene?.id ?? "") : "";
  const hasRecommendation = planning
    ? selectSceneHasRecommendation(planning, sceneIndex, scene?.id ?? "")
    : false;
  const primaryProvider = providerResult?.rankedProviders.find(
    (provider) => provider.priority === "primary",
  );
  const secondaryProvider = providerResult?.rankedProviders.find(
    (provider) => provider.priority === "secondary",
  );
  const topRecommendation = sceneRecommendation?.topRecommendation;
  const recommendationQuery = topRecommendation?.query ?? "";
  const sceneTitle = resolveSceneTitleFromScript(scene, topRecommendation?.query);
  const sceneId = scene?.id;

  const initialSearchContext = sceneId
    ? buildAssetBrowserInitialSearchContext({
        sceneId,
        sceneIndex,
        query: searchQuery,
        topRecommendation,
        providerResult,
      })
    : null;

  const assetBrowserSearchContext =
    planning && sceneRecommendation && providerResult && storyId && sceneId
      ? buildAssetBrowserSearchContext({
          storyId,
          sceneId,
          sceneIndex,
          sceneRecommendation,
          providerResult,
        })
      : null;

  const showSearchAssetsCta = canHandoffToAssetBrowser({
    searchEnabled: assetSearchEnabled,
    hasRecommendation,
    initialSearchContext,
    searchContext: assetBrowserSearchContext,
  });

  const attachContext =
    showSearchAssetsCta &&
    initialSearchContext &&
    assetBrowserSearchContext &&
    sceneId &&
    storyId
      ? {
          enabled: canAttachFromAssetBrowser({
            searchEnabled: assetSearchEnabled,
            fromStudioHandoff: true,
            sceneId,
          }),
          script,
          onScriptChange,
          searchContext: assetBrowserSearchContext,
          recommendationQuery: initialSearchContext.query,
          planningScriptHash: buildScriptHash(script),
          sourceQualityIntelligenceEnabled,
        }
      : undefined;

  const plannedFutureItems = useMemo(() => {
    if (!planning) {
      return [];
    }

    return script.scenes
      .map((scriptScene, index) => {
        if (index <= sceneIndex) {
          return null;
        }

        const recommendation = selectSceneRecommendation(planning, index, scriptScene.id)?.topRecommendation;
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

  const staleBadge = buildPlanningStaleBadge(planning?.staleness);
  const staleChips = buildPlanningStaleChips(planning?.staleness);

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

  const searchAssetsCta =
    showSearchAssetsCta && initialSearchContext ? (
      <CreatorAssetSearchAssetsCta
        initialSearchContext={initialSearchContext}
        onSearchAssets={() => setBrowserSceneIndex(sceneIndex)}
      />
    ) : null;

  const assetPlanningBody = hasRecommendation && topRecommendation && sceneRecommendation ? (
    <div className={compact ? "space-y-2.5" : "space-y-3.5"}>
      {!compact ? (
        <>
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
        </>
      ) : null}

      {!compact ? (
        <CreatorAssetRecommendationCard
          recommendation={topRecommendation}
          sceneConfidence={sceneRecommendation.confidence}
          reasoning={sceneRecommendation.reasoning}
          primaryProvider={primaryProvider}
          isPinned={session.isPinned}
        />
      ) : null}

      {!compact ? (
        <>
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

          {searchAssetsCta}

          <CreatorAssetCreatorTips tips={creatorTips} />

          {validationResult ? (
            <CreatorAssetValidationCard validationResult={validationResult} />
          ) : null}

          <CreatorAssetRepairSuggestions suggestions={repairSuggestions} />
        </>
      ) : null}

      {compact ? (
        <InspectorSection
          title="More options"
          description="Alternatives, providers, tips, and detailed quality metrics."
          defaultOpen={false}
        >
          <div className="space-y-2.5">
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

            <CreatorAssetCreatorTips tips={creatorTips} />

            {validationResult ? (
              <CreatorAssetValidationCard validationResult={validationResult} />
            ) : null}

            <CreatorAssetRepairSuggestions suggestions={repairSuggestions} />
          </div>
        </InspectorSection>
      ) : null}
    </div>
  ) : (
    <section className="rounded-2xl bg-surface-elevated/20 p-4 ring-1 ring-border/15">
      <p className={studioShellSectionTitle}>Asset Planning</p>
      <p className={`${studioSubtleText} mt-2`}>
        No AI asset recommendation is available for this scene yet.
      </p>
    </section>
  );

  const content = (
    <div className={`min-w-0 shrink-0 border-t border-border/20 pt-3 ${compact ? "space-y-2.5" : "space-y-3"}`}>
      <header className="px-0.5 pb-0.5">
        <p className={studioShellSectionTitle}>Creator Asset Studio</p>
        <p className={studioShellSectionDesc}>
          {compact
            ? "Scene-aware AI planning — read only."
            : "Scene-aware AI planning for the selected timeline moment — read only."}
        </p>
      </header>

      {staleBadge ? (
        <CreatorAssetPlanningStaleBadge badge={staleBadge} chips={staleChips} />
      ) : null}

      <div
        key={sceneIndex}
        className={`transition-opacity duration-300 ease-out motion-reduce:transition-none ${
          compact ? "space-y-2.5" : "space-y-3.5"
        }`}
      >
        <CreatorAssetSceneHeader viewModel={sceneView} />

        {compact ? (
          <InspectorSection
            title="Planning Context"
            description="Scene intelligence, visual intent, importance, and provider context."
            defaultOpen={false}
          >
            <CreatorAssetPlanningContextSection viewModel={sceneView} embedded />
          </InspectorSection>
        ) : (
          <CreatorAssetPlanningContextSection viewModel={sceneView} />
        )}

        {compact && hasRecommendation && topRecommendation && sceneRecommendation ? (
          <div className="space-y-2.5">
            <CreatorAssetRecommendationCard
              recommendation={topRecommendation}
              sceneConfidence={sceneRecommendation.confidence}
              reasoning={sceneRecommendation.reasoning}
              primaryProvider={primaryProvider}
              isPinned={session.isPinned}
            />

            <CreatorAssetSearchQuery searchQuery={searchQuery} />

            {searchAssetsCta}

            {validationResult ? (
              <CreatorAssetValidationCard validationResult={validationResult} summaryOnly />
            ) : null}

            <CreatorAssetRepairSuggestions suggestions={repairSuggestions} summaryOnly />

            {assetPlanningBody}
          </div>
        ) : (
          <>
            {hasRecommendation && topRecommendation && sceneRecommendation ? (
              <InspectorSection
                title="Asset Planning"
                description="AI recommendation, alternatives, providers, and quality assessment."
                defaultOpen
              >
                {assetPlanningBody}
              </InspectorSection>
            ) : (
              assetPlanningBody
            )}
          </>
        )}
      </div>

      {initialSearchContext && assetBrowserSearchContext ? (
        <AssetBrowser
          open={assetBrowserOpen}
          onOpenChange={(open) => setBrowserSceneIndex(open ? sceneIndex : null)}
          initialSearchContext={initialSearchContext}
          context={assetBrowserSearchContext}
          attachContext={attachContext}
        />
      ) : null}
    </div>
  );

  return (
    <CreatorAssetStudioCompactProvider compact={compact}>
      {content}
    </CreatorAssetStudioCompactProvider>
  );
}
