"use client";

import { useCallback, useState } from "react";

import {
  getCreatorAssetFutureItems,
  getCreatorAssetPreviousItems,
  recordCreatorAssetSceneVisit,
} from "@/features/editor/components/creator-asset-studio/creator-asset-studio.session-store";

export interface RecommendationHistoryItem {
  sceneIndex: number;
  sceneTitle: string;
  query: string;
}

interface UseCreatorAssetStudioSessionInput {
  sceneIndex: number;
  sceneCount: number;
  sceneTitle: string;
  recommendationQuery: string;
  plannedFutureItems?: RecommendationHistoryItem[];
}

interface UseCreatorAssetStudioSessionResult {
  isPinned: boolean;
  togglePin: () => void;
  previousItems: RecommendationHistoryItem[];
  currentItem: RecommendationHistoryItem;
  futureItems: RecommendationHistoryItem[];
  expandedAlternativeIndex: number | null;
  setExpandedAlternativeIndex: (index: number | null) => void;
  toggleAlternativeComparison: (index: number) => void;
}

/**
 * Session-only creator workflow state — no persistence, no planning recomputation.
 */
export function useCreatorAssetStudioSession({
  sceneIndex,
  sceneCount,
  sceneTitle,
  recommendationQuery,
  plannedFutureItems = [],
}: UseCreatorAssetStudioSessionInput): UseCreatorAssetStudioSessionResult {
  const [pinnedByScene, setPinnedByScene] = useState<Record<number, string>>({});
  const [comparisonState, setComparisonState] = useState<{
    sceneIndex: number;
    alternativeIndex: number;
  } | null>(null);

  recordCreatorAssetSceneVisit(sceneIndex, sceneTitle, recommendationQuery);

  const expandedAlternativeIndex =
    comparisonState?.sceneIndex === sceneIndex ? comparisonState.alternativeIndex : null;

  const isPinned = pinnedByScene[sceneIndex] === recommendationQuery && recommendationQuery.length > 0;

  const togglePin = useCallback(() => {
    if (!recommendationQuery.trim()) {
      return;
    }

    setPinnedByScene((current) => {
      if (current[sceneIndex] === recommendationQuery) {
        const next = { ...current };
        delete next[sceneIndex];
        return next;
      }

      return { ...current, [sceneIndex]: recommendationQuery };
    });
  }, [recommendationQuery, sceneIndex]);

  const toggleAlternativeComparison = useCallback(
    (index: number) => {
      setComparisonState((current) => {
        if (current?.sceneIndex === sceneIndex && current.alternativeIndex === index) {
          return null;
        }

        return { sceneIndex, alternativeIndex: index };
      });
    },
    [sceneIndex],
  );

  const setExpandedAlternativeIndex = useCallback(
    (index: number | null) => {
      if (index == null) {
        setComparisonState(null);
        return;
      }

      setComparisonState({ sceneIndex, alternativeIndex: index });
    },
    [sceneIndex],
  );

  const currentItem: RecommendationHistoryItem = {
    sceneIndex,
    sceneTitle,
    query: recommendationQuery,
  };

  const previousItems = getCreatorAssetPreviousItems(sceneIndex);
  const futureItems = getCreatorAssetFutureItems({
    sceneIndex,
    sceneCount,
    plannedFutureItems,
  });

  return {
    isPinned,
    togglePin,
    previousItems,
    currentItem,
    futureItems,
    expandedAlternativeIndex,
    setExpandedAlternativeIndex,
    toggleAlternativeComparison,
  };
}
