import type { AssetIntelligenceResult } from "../asset-intelligence.types";
import type { AssetProviderPlanResult } from "../providers/asset-provider.types";
import type { RecommendationResult } from "../recommendation-engine/recommendation-engine.types";
import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";

/** Semantic version for the asset recommendation validator contract. */
export const ASSET_VALIDATOR_VERSION = "0.1.0";

/** Canonical rule identifiers evaluated by the asset recommendation validator. */
export type AssetValidationRuleId =
  | "every_scene_has_recommendations"
  | "primary_recommendation_exists"
  | "provider_selected"
  | "recommendation_confidence"
  | "entity_coverage"
  | "visual_diversity"
  | "provider_diversity"
  | "historical_provider_match"
  | "tactical_provider_preference"
  | "portrait_asset_match"
  | "countdown_asset_variety"
  | "debate_both_sides"
  | "biography_arc_coverage"
  | "query_quality"
  | "duplicate_recommendations"
  | "unused_important_entities"
  | "confidence_consistency"
  | "provider_capability_consistency";

/** Warning categories aggregated in validator diagnostics. */
export type AssetValidationWarningType =
  | "coverage"
  | "confidence"
  | "diversity"
  | "provider"
  | "query"
  | "entity"
  | "arc"
  | "duplicate"
  | "capability"
  | "tactical"
  | "portrait"
  | "comparison";

/** Outcome of a single asset validation rule evaluation. */
export interface AssetValidationRuleResult {
  ruleId: AssetValidationRuleId;
  passed: boolean;
  /** Normalized score in `[0, 1]`. */
  score: number;
  message?: string;
  warningType?: AssetValidationWarningType;
}

/** Planning-only repair suggestion — does not mutate recommendations or providers. */
export interface AssetRepairSuggestion {
  id: string;
  category:
    | "entity"
    | "provider"
    | "visual"
    | "query"
    | "diversity"
    | "arc"
    | "comparison"
    | "tactical"
    | "climax"
    | "portrait"
    | "archive";
  message: string;
  targetSceneId?: string;
  priority: "low" | "medium" | "high";
}

/** Scene-level repair candidate surfaced by the validator. */
export interface AssetRepairCandidate {
  sceneId: string;
  sceneIndex: number;
  issue: string;
  suggestedAction: string;
}

/** Aggregate validator diagnostics for planning audits. */
export interface AssetValidatorDiagnostics {
  validatorVersion: string;
  validationRulesExecuted: AssetValidationRuleId[];
  warningsByType: Partial<Record<AssetValidationWarningType, number>>;
  repairSuggestionCount: number;
}

/** Aggregate asset recommendation validation output. */
export interface AssetValidationResult {
  validatorVersion: string;
  validationScore: number;
  entityCoverageScore: number;
  providerCoverageScore: number;
  visualDiversityScore: number;
  recommendationQualityScore: number;
  providerQualityScore: number;
  warnings: readonly string[];
  repairSuggestions: readonly AssetRepairSuggestion[];
  repairCandidates: readonly AssetRepairCandidate[];
  ruleResults: readonly AssetValidationRuleResult[];
  diagnostics: AssetValidatorDiagnostics;
  validatedAt: string;
}

/** Combined planning output audited by the asset validator. */
export interface AssetValidatorInput {
  assetIntelligence: AssetIntelligenceResult;
  recommendation: RecommendationResult;
  providerPlan: AssetProviderPlanResult;
  mappedScenes?: BlueprintMappedScene[];
}

/** Internal context passed to individual rule evaluators. */
export interface AssetValidatorContext {
  eligibleSceneIndexes: number[];
  strategyId?: string;
}
