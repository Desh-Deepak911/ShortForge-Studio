import type { BlueprintMappedScene } from "@/features/studio-intelligence/blueprint-adapter/blueprint-adapter.types";
import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";
import type { SceneImportanceScore } from "@/features/studio-intelligence/studio-intelligence.types";

import type {
  AssetDiversityPlan,
  AssetEntity,
  AssetQueryCandidate,
  SceneAssetPlan,
} from "../asset-intelligence.types";
import {
  isGenericOnlyQuery,
  scoreQueryCandidateQuality,
} from "../asset-query-quality.utils";

import type {
  RecommendationConfidence,
  RecommendationReason,
  RecommendedAssetCandidate,
  RejectedAssetCandidate,
} from "./recommendation-engine.types";

const REASON_LABELS: Record<RecommendationReason, string> = {
  highest_confidence_entity: "Highest confidence entity",
  matches_climax_scene: "Matches climax scene",
  supports_tactical_explanation: "Supports tactical explanation",
  best_historical_context: "Best historical context",
  strong_visual_diversity: "Strong visual diversity",
  best_portrait_opportunity: "Best portrait opportunity",
  highest_narrative_impact: "Highest narrative impact",
  matches_visual_intent: "Matches visual intent",
  template_slot_alignment: "Template slot alignment",
  high_query_quality: "High query quality",
  caption_emphasis_match: "Caption emphasis match",
  timing_importance: "Timing importance",
  matches_scene_role: "Matches scene role",
  diversity_alternate: "Diversity alternate",
};

const CONFIDENCE_RANK: Record<RecommendationConfidence, number> = {
  very_high: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const ENTITY_CONFIDENCE_SCORE = { high: 1, medium: 0.65, low: 0.35 };

const IMPORTANCE_TIER_SCORE = { critical: 1, high: 0.85, medium: 0.6, low: 0.4 };

interface ScoredCandidate {
  candidate: AssetQueryCandidate;
  candidateIndex: number;
  score: number;
  reasons: RecommendationReason[];
  entityIds: string[];
  entityNames: string[];
  rejectionReason?: string;
}

interface SceneContext {
  scenePlan: SceneAssetPlan;
  mappedScene?: BlueprintMappedScene;
  importance: number;
  visualIntent?: string;
  semanticRole?: string;
  semanticSlotLabel?: string;
  blueprintRole?: string;
  captionEmphasis?: string;
  timingWeight: number;
}

export function resolveReasonLabel(reason: RecommendationReason): string {
  return REASON_LABELS[reason];
}

export function scoreToRecommendationConfidence(score: number): RecommendationConfidence {
  if (score >= 0.85) {
    return "very_high";
  }
  if (score >= 0.68) {
    return "high";
  }
  if (score >= 0.48) {
    return "medium";
  }
  return "low";
}

function resolveImportanceScore(importance?: SceneImportanceScore): number {
  if (!importance) {
    return 0.5;
  }

  const tierScore = IMPORTANCE_TIER_SCORE[importance.tier] ?? 0.5;
  return Math.min(1, tierScore * 0.7 + importance.value * 0.3);
}

function resolveTimingWeight(mappedScene?: BlueprintMappedScene): number {
  const pacing = mappedScene?.timingMetadata.pacing;
  switch (pacing) {
    case "punchy":
      return 1;
    case "fast":
      return 0.85;
    case "normal":
      return 0.65;
    case "slow":
      return 0.5;
    default:
      return 0.6;
  }
}

export function buildSceneContext(
  scenePlan: SceneAssetPlan,
  mappedScene: BlueprintMappedScene | undefined,
): SceneContext {
  return {
    scenePlan,
    mappedScene,
    importance: resolveImportanceScore(mappedScene?.importance),
    visualIntent: mappedScene?.visualIntentType ?? scenePlan.candidates[0]?.visualIntent,
    semanticRole: mappedScene?.semanticRole ?? scenePlan.semanticRole,
    semanticSlotLabel: mappedScene?.semanticSlotLabel ?? scenePlan.semanticSlotLabel,
    blueprintRole: mappedScene?.blueprintRole,
    captionEmphasis: mappedScene?.captionHints.emphasis,
    timingWeight: resolveTimingWeight(mappedScene),
  };
}

export function resolveLinkedEntities(entityIds: string[], entities: AssetEntity[]): AssetEntity[] {
  return entityIds
    .map((entityId) => entities.find((entity) => entity.id === entityId))
    .filter((entity): entity is AssetEntity => Boolean(entity));
}

function inferRecommendationReasons(input: {
  context: SceneContext;
  candidate: AssetQueryCandidate;
  entities: AssetEntity[];
  queryQuality: number;
  diversityBonus: number;
}): RecommendationReason[] {
  const reasons: RecommendationReason[] = [];
  const linkedEntities = resolveLinkedEntities(input.candidate.entityIds, input.entities);
  const primaryEntity = linkedEntities[0];

  if (primaryEntity?.confidence === "high") {
    reasons.push("highest_confidence_entity");
  }

  if (input.context.importance >= 0.8) {
    reasons.push("highest_narrative_impact");
  }

  if (
    input.context.blueprintRole === "climax" ||
    input.context.semanticRole?.toLowerCase().includes("climax")
  ) {
    reasons.push("matches_climax_scene");
  }

  if (
    primaryEntity?.type === "tactic" ||
    primaryEntity?.type === "manager" ||
    input.context.visualIntent === "timeline_graphic"
  ) {
    reasons.push("supports_tactical_explanation");
  }

  if (
    input.context.visualIntent === "archive_footage" ||
    input.context.semanticRole?.toLowerCase().includes("history")
  ) {
    reasons.push("best_historical_context");
  }

  if (input.diversityBonus >= 0.12) {
    reasons.push("strong_visual_diversity");
  }

  if (
    input.context.visualIntent === "player_portrait" ||
    input.candidate.tags.includes("portrait")
  ) {
    reasons.push("best_portrait_opportunity");
  }

  if (
    input.candidate.visualIntent &&
    input.candidate.visualIntent === input.context.visualIntent
  ) {
    reasons.push("matches_visual_intent");
  }

  if (
    input.context.semanticSlotLabel &&
    input.candidate.semanticRole === input.context.semanticRole
  ) {
    reasons.push("template_slot_alignment");
  }

  if (input.queryQuality >= 0.7) {
    reasons.push("high_query_quality");
  }

  if (
    input.context.captionEmphasis &&
    input.context.captionEmphasis !== "none" &&
    (input.candidate.tags.includes("stat") || input.candidate.tags.includes("overlay"))
  ) {
    reasons.push("caption_emphasis_match");
  }

  if (input.context.timingWeight >= 0.85) {
    reasons.push("timing_importance");
  }

  if (input.candidate.tags.includes("role")) {
    reasons.push("matches_scene_role");
  }

  if (reasons.length === 0) {
    reasons.push("high_query_quality");
  }

  return [...new Set(reasons)];
}

function scoreCandidate(input: {
  candidate: AssetQueryCandidate;
  candidateIndex: number;
  context: SceneContext;
  entities: AssetEntity[];
  diversityPlan: AssetDiversityPlan;
  entityUsageCounts: Map<string, number>;
  assignedTopQueries: Set<string>;
}): ScoredCandidate {
  const linkedEntities = resolveLinkedEntities(input.candidate.entityIds, input.entities);
  const entityNames = linkedEntities.map((entity) => entity.name);
  const normalizedQuery = normalizeAssetSearchQuery(input.candidate.query);

  if (isGenericOnlyQuery(input.candidate.query, entityNames)) {
    return {
      candidate: input.candidate,
      candidateIndex: input.candidateIndex,
      score: 0.08,
      reasons: [],
      entityIds: input.candidate.entityIds,
      entityNames,
      rejectionReason: "Overly generic query without entity or visual context",
    };
  }

  const entityConfidence =
    linkedEntities.reduce((total, entity) => total + ENTITY_CONFIDENCE_SCORE[entity.confidence], 0) /
    Math.max(linkedEntities.length, 1);

  const queryQuality = scoreQueryCandidateQuality(input.candidate, input.entities);
  const importance = input.context.importance;
  const visualIntentMatch =
    input.candidate.visualIntent && input.candidate.visualIntent === input.context.visualIntent
      ? 1
      : 0.45;

  const templateMatch =
    input.candidate.semanticRole && input.candidate.semanticRole === input.context.semanticRole
      ? 1
      : 0.5;

  const captionMatch =
    input.context.captionEmphasis && input.context.captionEmphasis !== "none" ? 0.75 : 0.5;

  const priorityBoost =
    input.candidate.priority === "primary" ? 1 : input.candidate.priority === "fallback" ? 0.75 : 0.55;

  let diversityBonus = 0;
  const primaryEntityId = linkedEntities[0]?.id;
  if (primaryEntityId) {
    const usage = input.entityUsageCounts.get(primaryEntityId) ?? 0;
    diversityBonus = Math.max(0, 0.2 - usage * 0.08);

    if (input.diversityPlan.capRepeatedEntityIds.includes(primaryEntityId)) {
      diversityBonus -= 0.15;
    }
  }

  let duplicatePenalty = 0;
  if (input.assignedTopQueries.has(normalizedQuery)) {
    duplicatePenalty = 0.22;
  }

  const assetTypeMatch = input.candidate.expectedAssetTypes.includes(
    input.context.scenePlan.assetRequirementType,
  )
    ? 1
    : 0.6;

  const score = Math.min(
    1,
    Math.max(
      0,
      entityConfidence * 0.2 +
        importance * 0.15 +
        visualIntentMatch * 0.1 +
        templateMatch * 0.05 +
        queryQuality * 0.2 +
        diversityBonus +
        assetTypeMatch * 0.05 +
        captionMatch * 0.05 +
        input.context.timingWeight * 0.05 +
        priorityBoost * 0.05 -
        duplicatePenalty,
    ),
  );

  const reasons = inferRecommendationReasons({
    context: input.context,
    candidate: input.candidate,
    entities: input.entities,
    queryQuality,
    diversityBonus,
  });

  if (duplicatePenalty > 0) {
    reasons.push("diversity_alternate");
  }

  return {
    candidate: input.candidate,
    candidateIndex: input.candidateIndex,
    score,
    reasons: [...new Set(reasons)],
    entityIds: input.candidate.entityIds,
    entityNames,
  };
}

export function toRecommendedCandidate(
  scored: ScoredCandidate,
  entities: AssetEntity[],
): RecommendedAssetCandidate {
  const linkedEntities = resolveLinkedEntities(scored.entityIds, entities);

  return {
    query: scored.candidate.query,
    entityIds: scored.entityIds,
    entityNames: scored.entityNames,
    entityTypes: linkedEntities.map((entity) => entity.type),
    score: Math.round(scored.score * 1000) / 1000,
    confidence: scoreToRecommendationConfidence(scored.score),
    reasons: scored.reasons,
    reasonLabels: scored.reasons.map((reason) => resolveReasonLabel(reason)),
    tags: scored.candidate.tags,
    visualIntent: scored.candidate.visualIntent,
    semanticRole: scored.candidate.semanticRole,
    assetRequirementType: scored.candidate.expectedAssetTypes[0],
  };
}

export function rankSceneCandidates(input: {
  context: SceneContext;
  entities: AssetEntity[];
  diversityPlan: AssetDiversityPlan;
  entityUsageCounts: Map<string, number>;
  assignedTopQueries: Set<string>;
}): {
  ranked: ScoredCandidate[];
  rejected: RejectedAssetCandidate[];
} {
  const scored = input.context.scenePlan.candidates.map((candidate, candidateIndex) =>
    scoreCandidate({
      candidate,
      candidateIndex,
      context: input.context,
      entities: input.entities,
      diversityPlan: input.diversityPlan,
      entityUsageCounts: input.entityUsageCounts,
      assignedTopQueries: input.assignedTopQueries,
    }),
  );

  const rejected = scored
    .filter((entry) => entry.rejectionReason || entry.score < 0.2)
    .map((entry) => ({
      query: entry.candidate.query,
      score: Math.round(entry.score * 1000) / 1000,
      rejectionReason: entry.rejectionReason ?? "Score below recommendation threshold",
    }));

  const ranked = scored
    .filter((entry) => !entry.rejectionReason && entry.score >= 0.2)
    .sort((a, b) => b.score - a.score);

  return { ranked, rejected };
}

export function buildSceneReasoning(
  top: RecommendedAssetCandidate | undefined,
  alternatives: RecommendedAssetCandidate[],
): string[] {
  if (!top) {
    return ["No viable asset recommendation for this scene."];
  }

  const reasoning = [
    `Top pick: "${top.query}" (${top.confidence} confidence, score ${top.score.toFixed(2)}).`,
    ...top.reasonLabels,
  ];

  if (alternatives.length > 0) {
    reasoning.push(
      `Alternatives: ${alternatives.map((alt) => `"${alt.query}"`).join(", ")}.`,
    );
  }

  return reasoning;
}

export function computeCoverageScore(
  sceneRecommendations: Array<{ topRecommendation?: RecommendedAssetCandidate }>,
  eligibleSceneCount: number,
): number {
  if (eligibleSceneCount === 0) {
    return 1;
  }

  const covered = sceneRecommendations.filter((scene) => scene.topRecommendation).length;
  return Math.round((covered / eligibleSceneCount) * 1000) / 1000;
}

export function computeConfidenceScore(
  sceneRecommendations: Array<{
    confidence: RecommendationConfidence;
    topRecommendation?: RecommendedAssetCandidate;
  }>,
): number {
  const scores = sceneRecommendations
    .filter((scene) => scene.topRecommendation)
    .map((scene) => CONFIDENCE_RANK[scene.confidence] / CONFIDENCE_RANK.very_high);

  if (scores.length === 0) {
    return 0;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round((total / scores.length) * 1000) / 1000;
}

export function resolveUnusedEntities(
  entities: AssetEntity[],
  sceneRecommendations: Array<{
    topRecommendation?: RecommendedAssetCandidate;
    alternatives: RecommendedAssetCandidate[];
  }>,
): AssetEntity[] {
  const usedEntityIds = new Set<string>();

  for (const scene of sceneRecommendations) {
    for (const entityId of scene.topRecommendation?.entityIds ?? []) {
      usedEntityIds.add(entityId);
    }
    for (const alternative of scene.alternatives) {
      for (const entityId of alternative.entityIds) {
        usedEntityIds.add(entityId);
      }
    }
  }

  return entities.filter((entity) => !usedEntityIds.has(entity.id));
}

export function buildGlobalRecommendations(
  sceneRecommendations: Array<{
    topRecommendation?: RecommendedAssetCandidate;
    alternatives: RecommendedAssetCandidate[];
  }>,
  unusedEntities: AssetEntity[],
): RecommendedAssetCandidate[] {
  const globalCandidates: RecommendedAssetCandidate[] = [];
  const seenQueries = new Set<string>();

  for (const scene of sceneRecommendations) {
    for (const candidate of [scene.topRecommendation, ...scene.alternatives].filter(Boolean)) {
      const normalized = normalizeAssetSearchQuery(candidate!.query);
      if (seenQueries.has(normalized)) {
        continue;
      }
      seenQueries.add(normalized);
      globalCandidates.push(candidate!);
    }
  }

  for (const entity of unusedEntities.slice(0, 3)) {
    const query = normalizeAssetSearchQuery(`${entity.name} football highlights`);
    if (seenQueries.has(query)) {
      continue;
    }

    globalCandidates.push({
      query,
      entityIds: [entity.id],
      entityNames: [entity.name],
      entityTypes: [entity.type],
      score: 0.45,
      confidence: "medium",
      reasons: ["strong_visual_diversity"],
      reasonLabels: [resolveReasonLabel("strong_visual_diversity")],
      tags: ["unused_entity", entity.type],
    });
  }

  return globalCandidates.sort((a, b) => b.score - a.score).slice(0, 6);
}
