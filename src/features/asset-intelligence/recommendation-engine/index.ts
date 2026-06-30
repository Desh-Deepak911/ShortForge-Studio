export {
  RECOMMENDATION_ENGINE_VERSION,
  type AssetRecommendation,
  type RecommendationConfidence,
  type RecommendationDiagnostics,
  type RecommendationReason,
  type RecommendationResult,
  type RecommendedAssetCandidate,
  type RejectedAssetCandidate,
  type SceneAssetRecommendationInput,
  type SceneRecommendation,
} from "./recommendation-engine.types";

export {
  buildGlobalRecommendations,
  buildSceneContext,
  buildSceneReasoning,
  computeConfidenceScore,
  computeCoverageScore,
  rankSceneCandidates,
  resolveReasonLabel,
  resolveUnusedEntities,
  scoreToRecommendationConfidence,
  toRecommendedCandidate,
} from "./recommendation-engine.utils";

export {
  buildRecommendationsFromAssetIntelligence,
  buildSceneAssetRecommendations,
} from "./scene-asset-recommendation";
