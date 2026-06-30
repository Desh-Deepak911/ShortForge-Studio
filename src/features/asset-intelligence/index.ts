export {
  ASSET_INTELLIGENCE_VERSION,
  type AssetDiversityPlan,
  type AssetEntity,
  type AssetEntityConfidence,
  type AssetEntitySource,
  type AssetEntitySummaryInput,
  type AssetEntityType,
  type AssetIntelligenceDiagnostics,
  type AssetIntelligenceInput,
  type AssetIntelligenceResult,
  type AssetQueryCandidate,
  type AssetQueryPriority,
  type AssetSceneTextInput,
  type AssetSearchPlan,
  type SceneAssetPlan,
} from "./asset-intelligence.types";

export {
  buildAssetIntelligenceDiagnostics,
  computeDiversityScore,
  computeEntityCoverage,
  computeQueryCoverage,
  computeRepeatedEntityRatio,
  findExpectedPrimaryEntities,
  isHumanReadableQuery,
  queriesIncludeThemes,
} from "./asset-diagnostics.utils";
export { mergeAssetEntities, resolveSceneEntities } from "./asset-entity-merge.utils";
export {
  buildEntityFocusedQuery,
  computeCandidateQualityScore,
  isGenericOnlyQuery,
  polishAssetQuery,
  queryIncludesVisualTerm,
  refineQueryCandidates,
  scoreQueryCandidateQuality,
} from "./asset-query-quality.utils";
export {
  buildSceneAssetPlans,
  ENTITY_QUERY_BIAS,
  sceneRequiresAssetCandidates,
} from "./asset-query-planner.utils";
export { buildAssetDiversityPlan } from "./asset-diversity.utils";
export { isAssetIntelligenceEnabled, runAssetIntelligence } from "./run-asset-intelligence";

export {
  RECOMMENDATION_ENGINE_VERSION,
  buildRecommendationsFromAssetIntelligence,
  buildSceneAssetRecommendations,
  type AssetRecommendation,
  type RecommendationConfidence,
  type RecommendationDiagnostics,
  type RecommendationReason,
  type RecommendationResult,
  type RecommendedAssetCandidate,
  type RejectedAssetCandidate,
  type SceneAssetRecommendationInput,
  type SceneRecommendation,
} from "./recommendation-engine";

export {
  ASSET_PROVIDER_VERSION,
  ASSET_PROVIDER_REGISTRY,
  buildAssetProviderPlan,
  buildPlanningAssetCandidates,
  describeRequiredCapabilities,
  getAssetProviderDefinition,
  inferRequiredCapabilitiesForRequest,
  listAssetProviderIds,
  providerSupportsCapabilities,
  resolveBestProviders,
  type AssetCandidate,
  type AssetProviderCapability,
  type AssetProviderDefinition,
  type AssetProviderId,
  type AssetProviderPlanInput,
  type AssetProviderPlanResult,
  type AssetProviderPriority,
  type AssetProviderRequest,
  type AssetProviderResult,
  type ProviderDiagnostics,
  type ProviderRecommendation,
} from "./providers";

export {
  ASSET_VALIDATOR_VERSION,
  createEmptyAssetValidationResult,
  evaluateAllAssetValidationRules,
  isAssetRecommendationValid,
  snapshotAssetValidatorInput,
  validateAssetRecommendations,
  type AssetRepairCandidate,
  type AssetRepairSuggestion,
  type AssetValidationResult,
  type AssetValidationRuleId,
  type AssetValidationRuleResult,
  type AssetValidationWarningType,
  type AssetValidatorContext,
  type AssetValidatorDiagnostics,
  type AssetValidatorInput,
} from "./validator";
