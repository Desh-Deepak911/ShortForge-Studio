import type { AssetProviderPlanResult } from "@/features/asset-intelligence/providers/asset-provider.types";
import type { RecommendationResult } from "@/features/asset-intelligence/recommendation-engine/recommendation-engine.types";
import type { AssetValidationResult } from "@/features/asset-intelligence/validator/asset-validator.types";

/** Semantic version for the creator asset planning cache contract. */
export const CREATOR_ASSET_PLANNING_VERSION = "0.1.0";

/** Planning-only snapshot consumed by Creator Asset Studio and future features. */
export interface CreatorAssetStudioPlanningData {
  recommendation: RecommendationResult;
  providerPlan: AssetProviderPlanResult;
  validationResult: AssetValidationResult;
}

/** Metadata tracked alongside cached planning output. */
export interface CreatorAssetPlanningCacheMetadata {
  planningVersion: string;
  generatedAt: string;
  storyId: string;
  scriptHash: string;
  sceneCount: number;
  storyMode: string;
}

/** Cached planning entry keyed by story id. */
export interface CreatorAssetPlanningCacheEntry extends CreatorAssetPlanningCacheMetadata {
  planning: CreatorAssetStudioPlanningData;
}

/** In-memory planning cache handle for a single story. */
export interface CreatorAssetPlanningCache {
  storyId: string;
  entry: CreatorAssetPlanningCacheEntry | null;
}

/** Inputs used to decide whether cached planning remains valid. */
export interface CreatorAssetPlanningCacheKeyInput {
  storyId: string;
  scriptHash: string;
  sceneCount: number;
  storyMode: string;
}

/** Future extension — load planning from draft persistence. */
export interface CreatorAssetPlanningPersistencePort {
  load(storyId: string): Promise<CreatorAssetPlanningCacheEntry | null>;
  save(entry: CreatorAssetPlanningCacheEntry): Promise<void>;
}

/** Future extension — Smart Edit reads cached planning without recomputing. */
export interface SmartEditPlanningReaderPort {
  read(storyId: string): CreatorAssetStudioPlanningData | null;
}

/** Future extension — AI Copilot reads cached planning context. */
export interface CopilotPlanningReaderPort {
  read(storyId: string): CreatorAssetStudioPlanningData | null;
}

/** Future extension — search providers consume cached provider rankings. */
export interface SearchProviderPlanningReaderPort {
  read(storyId: string): AssetProviderPlanResult | null;
}

/** Serializable snapshot returned from story generation for client cache hydration. */
export type CreatorAssetPlanningSnapshot = Omit<CreatorAssetPlanningCacheEntry, "storyId"> & {
  storyId?: string;
};
