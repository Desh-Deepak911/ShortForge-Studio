import {
  attachNormalizedAssetToScene,
  type AssetAttachHandoff,
  type AssetAttachResult,
  type MaterializeAssetUrlFn,
} from "@/features/asset-attach";
import { createApiMaterializeAssetUrlFn } from "@/features/asset-materialization/asset-materialization.client";
import type { NormalizedAssetResult } from "@/features/asset-search/orchestrator";
import type { FootieScript } from "@/features/story/types";

import type {
  AssetBrowserInitialSearchContext,
  AssetBrowserSearchContext,
} from "./asset-browser.types";
import { isAssetBrowserVisible } from "./asset-browser.utils";

/** Whether attach CTA should render for a studio handoff browser session. */
export function canAttachFromAssetBrowser(input: {
  searchEnabled?: boolean;
  fromStudioHandoff: boolean;
  sceneId?: string;
}): boolean {
  const searchEnabled = input.searchEnabled ?? isAssetBrowserVisible();

  return (
    searchEnabled &&
    input.fromStudioHandoff &&
    Boolean(input.sceneId?.trim())
  );
}

export interface AttachBrowserAssetToSceneInput {
  script: FootieScript;
  sceneId: string;
  asset: Readonly<NormalizedAssetResult>;
  initialSearchContext: AssetBrowserInitialSearchContext;
  searchContext: AssetBrowserSearchContext;
  recommendationQuery: string;
  planningScriptHash?: string;
  materializeAssetUrl?: MaterializeAssetUrlFn;
  /** Explicit source-quality capture gate for known asset metadata. */
  sourceQualityIntelligenceEnabled?: boolean;
}

/** Attaches a browser-selected asset through materialization + attach service. */
export async function attachBrowserAssetToScene(
  input: AttachBrowserAssetToSceneInput,
): Promise<AssetAttachResult> {
  const sceneId = input.sceneId.trim();
  if (!sceneId) {
    return {
      success: false,
      sceneId: input.sceneId,
      warnings: [],
      error: "sceneId is required to attach an asset",
    };
  }

  const handoff: AssetAttachHandoff = {
    storyId: input.searchContext.storyId,
    sceneIndex: input.initialSearchContext.sceneIndex,
    recommendationQuery: input.recommendationQuery,
    semanticSlot: input.initialSearchContext.semanticSlot,
    visualIntent: input.initialSearchContext.visualIntent,
    rankedProviderIds: input.initialSearchContext.rankedProviderIds,
    planningScriptHash: input.planningScriptHash,
  };

  return attachNormalizedAssetToScene(
    {
      script: input.script,
      sceneId,
      asset: input.asset,
      source: "asset_search",
      handoff,
      options: {
        sourceQualityIntelligenceEnabled:
          input.sourceQualityIntelligenceEnabled === true,
      },
    },
    {
      materializeAssetUrl:
        input.materializeAssetUrl ?? createApiMaterializeAssetUrlFn(),
    },
  );
}
