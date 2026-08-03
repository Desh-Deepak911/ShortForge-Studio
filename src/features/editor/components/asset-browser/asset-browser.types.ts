import type {
  AssetLicensePreference,
  AssetSearchOrientation,
  AssetSearchProviderId,
  NormalizedAssetResult,
} from "@/features/asset-search/orchestrator";
import type { AssetProviderId } from "@/features/asset-intelligence/providers/asset-provider.types";
import type { AssetProviderResult } from "@/features/asset-intelligence/providers/asset-provider.types";
import type { SceneRecommendation } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { FootieScript } from "@/features/story/types";
import type { StoryScriptChangeOptions } from "@/lib/utils/voiceover";

export type AssetBrowserSort = "relevance" | "newest" | "score";

export type AssetBrowserProviderFilter = AssetSearchProviderId | "all";

export type AssetBrowserLicenseFilter = AssetLicensePreference | "all";

export type AssetBrowserEmptyStateKind =
  | "none"
  | "no_results"
  | "provider_unavailable"
  | "search_disabled"
  | "missing_query";

export interface AssetBrowserFilters {
  providerId: AssetBrowserProviderFilter;
  orientation: AssetSearchOrientation | "all";
  license: AssetBrowserLicenseFilter;
  sort: AssetBrowserSort;
}

export interface AssetBrowserInitialSearchContext {
  query: string;
  sceneId: string;
  sceneIndex: number;
  visualIntent?: string;
  semanticSlot?: string;
  rankedProviderIds?: AssetProviderId[];
}

export interface AssetBrowserSearchContext {
  storyId: string;
  sceneId: string;
  sceneIndex: number;
  recommendation: SceneRecommendation;
  providerResult: AssetProviderResult;
}

export interface AssetBrowserSearchRequest {
  context: AssetBrowserSearchContext;
  query: string;
  page: number;
  limit: number;
  orientation: AssetSearchOrientation;
  semanticSlot?: string;
  visualIntent?: string;
}

export interface AssetBrowserSearchResponse {
  success: boolean;
  query: string;
  results: NormalizedAssetResult[];
  page: number;
  limit: number;
  totalResults: number;
  hasNextPage: boolean;
  error?: string;
  disabledReason?: string;
}

export type AssetBrowserAttachState = "idle" | "loading" | "success" | "error";

export interface AssetBrowserAttachContext {
  enabled: boolean;
  script: FootieScript;
  onScriptChange: (script: FootieScript, options?: StoryScriptChangeOptions) => void;
  searchContext: AssetBrowserSearchContext;
  recommendationQuery: string;
  planningScriptHash?: string;
  /** Explicit source-quality capture gate for known asset metadata. */
  sourceQualityIntelligenceEnabled?: boolean;
}

export interface AssetBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSearchContext: AssetBrowserInitialSearchContext;
  context: AssetBrowserSearchContext;
  attachContext?: AssetBrowserAttachContext;
}

export const ASSET_BROWSER_DEFAULT_LIMIT = 12;
export const ASSET_BROWSER_DEBOUNCE_MS = 300;

export const DEFAULT_ASSET_BROWSER_FILTERS: AssetBrowserFilters = {
  providerId: "all",
  orientation: "all",
  license: "all",
  sort: "relevance",
};
