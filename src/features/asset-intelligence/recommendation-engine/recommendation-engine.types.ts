import type { AssetEntityType } from "../asset-intelligence.types";

/** Semantic version for the scene asset recommendation contract. */
export const RECOMMENDATION_ENGINE_VERSION = "0.1.0";

/** Structured reason codes for asset recommendations. */
export type RecommendationReason =
  | "highest_confidence_entity"
  | "matches_climax_scene"
  | "supports_tactical_explanation"
  | "best_historical_context"
  | "strong_visual_diversity"
  | "best_portrait_opportunity"
  | "highest_narrative_impact"
  | "matches_visual_intent"
  | "template_slot_alignment"
  | "high_query_quality"
  | "caption_emphasis_match"
  | "timing_importance"
  | "matches_scene_role"
  | "diversity_alternate";

/** Confidence tier for a scene asset recommendation. */
export type RecommendationConfidence = "very_high" | "high" | "medium" | "low";

/** A ranked asset query recommendation. */
export interface RecommendedAssetCandidate {
  query: string;
  entityIds: string[];
  entityNames: string[];
  entityTypes: AssetEntityType[];
  score: number;
  confidence: RecommendationConfidence;
  reasons: RecommendationReason[];
  reasonLabels: string[];
  tags: string[];
  visualIntent?: string;
  semanticRole?: string;
  assetRequirementType?: string;
}

/** Top-ranked recommendation for a scene. */
export interface AssetRecommendation extends RecommendedAssetCandidate {
  rank: 1;
}

/** A candidate rejected during ranking. */
export interface RejectedAssetCandidate {
  query: string;
  score: number;
  rejectionReason: string;
}

/** Per-scene recommendation output. */
export interface SceneRecommendation {
  sceneId: string;
  sceneIndex: number;
  topRecommendation?: AssetRecommendation;
  alternatives: RecommendedAssetCandidate[];
  rejectedCandidates: RejectedAssetCandidate[];
  reasoning: string[];
  confidence: RecommendationConfidence;
}

/** Diagnostics for a recommendation pass. */
export interface RecommendationDiagnostics {
  scenesWithRecommendation: number;
  scenesWithoutRecommendation: number;
  duplicateTopQueryCount: number;
  averageScore: number;
  genericRejectedCount: number;
  diversityAdjustments: number;
  entityReusePenaltyCount: number;
  warnings: string[];
}

/** Aggregate recommendation output for a script. */
export interface RecommendationResult {
  recommendationVersion: typeof RECOMMENDATION_ENGINE_VERSION;
  sceneRecommendations: SceneRecommendation[];
  globalRecommendations: RecommendedAssetCandidate[];
  unusedEntities: Array<{
    id: string;
    name: string;
    type: AssetEntityType;
  }>;
  coverageScore: number;
  confidenceScore: number;
  diagnostics: RecommendationDiagnostics;
  generatedAt: string;
}

/** Input to the scene asset recommendation engine. */
export interface SceneAssetRecommendationInput {
  entities: import("../asset-intelligence.types").AssetEntity[];
  sceneAssetPlans: import("../asset-intelligence.types").SceneAssetPlan[];
  diversityPlan: import("../asset-intelligence.types").AssetDiversityPlan;
  mappedScenes?: import("@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types").BlueprintMappedScene[];
  diagnostics?: import("../asset-intelligence.types").AssetIntelligenceDiagnostics;
}
