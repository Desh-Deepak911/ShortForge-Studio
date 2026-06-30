import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import type { AssetBlueprintOrientation } from "@/features/studio-intelligence/scene-blueprint.types";
import type { StoryStrategyId } from "@/features/studio-intelligence/story-strategy/story-strategy.types";
import type {
  AssetRequirementType,
  StudioIntelligenceResult,
} from "@/features/studio-intelligence/studio-intelligence.types";
import type { EntityResolution } from "@/features/intelligence/entities/entity-types";

/** Semantic version for the Asset Intelligence planning contract. */
export const ASSET_INTELLIGENCE_VERSION = "0.2.0";

/** Football entity categories used for asset query planning. */
export type AssetEntityType =
  | "player"
  | "club"
  | "manager"
  | "tournament"
  | "country"
  | "national_team"
  | "tactic"
  | "season"
  | "award"
  | "match"
  | "generic_topic";

/** Provenance of an extracted or merged asset entity. */
export type AssetEntitySource =
  | "extractor"
  | "input"
  | "narration"
  | "blueprint"
  | "research"
  | "mapped_scene"
  | "inferred";

/** Confidence tier for asset entity planning. */
export type AssetEntityConfidence = "high" | "medium" | "low";

/** Structured football entity for asset search planning. */
export interface AssetEntity {
  id: string;
  type: AssetEntityType;
  name: string;
  confidence: AssetEntityConfidence;
  aliases: string[];
  source: AssetEntitySource;
  sceneIds: string[];
  evidence: string[];
}

/** Summary row from research or graph context. */
export interface AssetEntitySummaryInput {
  kind: string;
  name: string;
}

/** Per-scene text bundle for entity re-scanning. */
export interface AssetSceneTextInput {
  sceneId: string;
  narration?: string;
  caption?: string;
  summary?: string;
  title?: string;
}

/** Input to the Asset Intelligence planning layer. */
export interface AssetIntelligenceInput {
  topic: string;
  /** Full Studio Intelligence output when available. */
  studioIntelligence?: StudioIntelligenceResult;
  /** Mapped scenes with semantics and existing asset search queries. */
  mappedScenes?: BlueprintMappedScene[];
  /** Optional structured resolution from the intelligence layer. */
  entityResolution?: EntityResolution;
  /** Per-scene narration / caption text for entity re-scan. */
  sceneTexts?: AssetSceneTextInput[];
  /** Creator-provided entity strings. */
  inputEntities?: string[];
  /** Research graph summaries when available. */
  entitySummaries?: AssetEntitySummaryInput[];
  strategyId?: StoryStrategyId;
  modeTemplateId?: string;
}

/** Priority tier for a planned asset search query. */
export type AssetQueryPriority = "primary" | "fallback" | "exploratory";

/** A single asset search query candidate for a scene. */
export interface AssetQueryCandidate {
  query: string;
  priority: AssetQueryPriority;
  rationale: string;
  confidence: AssetEntityConfidence;
  entityIds: string[];
  visualIntent?: string;
  semanticRole?: string;
  orientation?: AssetBlueprintOrientation;
  expectedAssetTypes: AssetRequirementType[];
  tags: string[];
}

/** Per-scene asset search plan with preserved legacy SI queries. */
export interface SceneAssetPlan {
  sceneId: string;
  sceneIndex: number;
  blueprintId?: string;
  semanticRole?: string;
  semanticSlotLabel?: string;
  assetRequirementType: AssetRequirementType;
  /** Existing SI query preserved for diff/diagnostics — never overwritten. */
  legacySearchQuery?: string;
  candidates: AssetQueryCandidate[];
  primaryEntityIds: string[];
  diversityKey: string;
  planningNotes?: string[];
}

/** Cross-scene diversity constraints and warnings. */
export interface AssetDiversityPlan {
  capRepeatedEntityIds: string[];
  minDistinctVisualIntents: number;
  contrastPairs: Array<{ sceneIdA: string; sceneIdB: string; reason: string }>;
  entitySceneCap: Record<string, number>;
  warnings: string[];
  alternateRecommendations: Array<{
    sceneId: string;
    entityId: string;
    suggestedQuery: string;
    reason: string;
  }>;
  /** Normalized diversity score in `[0, 1]` — higher is more varied imagery. */
  diversityScore: number;
  /** Highest primary-entity repetition ratio in `[0, 1]`. */
  repeatedEntityRatio: number;
}

/** Aggregate asset search plan for a script. */
export interface AssetSearchPlan {
  version: typeof ASSET_INTELLIGENCE_VERSION;
  topic: string;
  entities: AssetEntity[];
  scenePlans: SceneAssetPlan[];
  diversity: AssetDiversityPlan;
  globalFallbackQueries: string[];
  generatedAt: string;
}

/** Diagnostics for an Asset Intelligence planning run. */
export interface AssetIntelligenceDiagnostics {
  entityCount: number;
  entityTypeCount: number;
  scenesWithEntities: number;
  scenesWithCandidates: number;
  legacyQueryPreservedCount: number;
  legacyQueryDiffCount: number;
  uncoveredEntityTypes: AssetEntityType[];
  /** Normalized entity extraction coverage in `[0, 1]`. */
  entityCoverage: number;
  /** Ratio of non-placeholder scenes with query candidates in `[0, 1]`. */
  queryCoverage: number;
  /** Warnings for overly generic query candidates. */
  genericQueryWarnings: string[];
  /** Highest primary-entity repetition ratio in `[0, 1]`. */
  repeatedEntityRatio: number;
  /** Cross-scene visual diversity score in `[0, 1]`. */
  diversityScore: number;
  /** Average query candidate quality score in `[0, 1]`. */
  candidateQualityScore: number;
  /** Count of non-generic query candidates. */
  qualityCandidateCount: number;
  warnings: string[];
}

/** Output of the Asset Intelligence planning layer. */
export interface AssetIntelligenceResult {
  version: typeof ASSET_INTELLIGENCE_VERSION;
  entities: AssetEntity[];
  sceneAssetPlans: SceneAssetPlan[];
  assetSearchPlan: AssetSearchPlan;
  diversityPlan: AssetDiversityPlan;
  diagnostics: AssetIntelligenceDiagnostics;
  warnings: string[];
  plannerStep: "asset_intelligence";
  generatedAt: string;
}
