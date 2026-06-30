import type { AssetEntityType } from "../asset-intelligence.types";
import type { AssetRequirementType } from "@/features/studio-intelligence/studio-intelligence.types";
import type { SceneRecommendation } from "../recommendation-engine/recommendation-engine.types";

/** Semantic version for the asset provider abstraction contract. */
export const ASSET_PROVIDER_VERSION = "0.1.0";

/** Supported asset provider identifiers — planning metadata only. */
export type AssetProviderId =
  | "manual"
  | "pexels"
  | "unsplash"
  | "pixabay"
  | "wikimedia"
  | "internal_library"
  | "ai_generated";

/** Capability flags describing what a provider can theoretically supply. */
export type AssetProviderCapability =
  | "supportsPeople"
  | "supportsSports"
  | "supportsHistorical"
  | "supportsLogos"
  | "supportsTransparent"
  | "supportsPortrait"
  | "supportsLandscape"
  | "supportsIllustrations"
  | "supportsAI"
  | "supportsVideo"
  | "supportsCommercialUse";

/** Priority tier for a ranked provider recommendation. */
export type AssetProviderPriority = "primary" | "secondary" | "fallback" | "planning_only";

/** Immutable provider definition in the planning registry. */
export interface AssetProviderDefinition {
  id: AssetProviderId;
  label: string;
  /** All registry entries are planning-only in 3.7E — no network calls. */
  planningOnly: true;
  /** Base ranking weight in `[0, 1]`. */
  baseScore: number;
  capabilities: Record<AssetProviderCapability, boolean>;
}

/** Request to rank providers for a scene recommendation. */
export interface AssetProviderRequest {
  sceneRecommendation: SceneRecommendation;
  visualIntent?: string;
  assetRequirementType?: AssetRequirementType;
  entityTypes: AssetEntityType[];
  query?: string;
  orientation?: "landscape" | "portrait" | "square" | "any";
}

/** Planning-only provider-side asset candidate — not an attached image. */
export interface AssetCandidate {
  providerId: AssetProviderId;
  query: string;
  planningOnly: true;
  estimatedMatchScore: number;
  capabilitiesUsed: AssetProviderCapability[];
}

/** Ranked provider recommendation for a scene. */
export interface ProviderRecommendation {
  providerId: AssetProviderId;
  priority: AssetProviderPriority;
  score: number;
  reasons: string[];
  capabilitiesMatched: AssetProviderCapability[];
  planningOnly: true;
}

/** Per-scene provider ranking output. */
export interface AssetProviderResult {
  sceneId: string;
  sceneIndex: number;
  query?: string;
  rankedProviders: ProviderRecommendation[];
  primaryProvider?: ProviderRecommendation;
  planningOnly: true;
}

/** Aggregate diagnostics for a provider planning pass. */
export interface ProviderDiagnostics {
  /** Ratio of scenes with at least one viable provider in `[0, 1]`. */
  providerCoverage: number;
  recommendedProviderCounts: Partial<Record<AssetProviderId, number>>;
  unsupportedRequests: string[];
  providerReasoning: string[];
}

/** Aggregate provider planning output. */
export interface AssetProviderPlanResult {
  version: typeof ASSET_PROVIDER_VERSION;
  sceneResults: AssetProviderResult[];
  diagnostics: ProviderDiagnostics;
  generatedAt: string;
}

/** Input to build provider plans from recommendation output. */
export interface AssetProviderPlanInput {
  recommendation: import("../recommendation-engine/recommendation-engine.types").RecommendationResult;
  sceneAssetPlans?: import("../asset-intelligence.types").SceneAssetPlan[];
  mappedScenes?: import("@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types").BlueprintMappedScene[];
}
