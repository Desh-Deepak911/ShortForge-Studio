import type { AssetEntityType } from "../asset-intelligence.types";
import type { AssetRequirementType } from "@/features/studio-intelligence/studio-intelligence.types";

import {
  ASSET_PROVIDER_REGISTRY,
  getAssetProviderDefinition,
  providerSupportsCapabilities,
} from "./asset-provider.registry";
import type {
  AssetCandidate,
  AssetProviderCapability,
  AssetProviderId,
  AssetProviderPlanInput,
  AssetProviderPlanResult,
  AssetProviderPriority,
  AssetProviderRequest,
  AssetProviderResult,
  ProviderDiagnostics,
  ProviderRecommendation,
} from "./asset-provider.types";
import { ASSET_PROVIDER_VERSION } from "./asset-provider.types";

const CAPABILITY_LABELS: Record<AssetProviderCapability, string> = {
  supportsPeople: "people",
  supportsSports: "sports",
  supportsHistorical: "historical",
  supportsLogos: "logos",
  supportsTransparent: "transparent assets",
  supportsPortrait: "portrait",
  supportsLandscape: "landscape",
  supportsIllustrations: "illustrations",
  supportsAI: "AI generation",
  supportsVideo: "video",
  supportsCommercialUse: "commercial use",
};

interface ProviderScoreContext {
  requiredCapabilities: AssetProviderCapability[];
  sceneProfile: SceneProfile;
}

interface SceneProfile {
  isHistorical: boolean;
  isAction: boolean;
  isPortrait: boolean;
  isTactical: boolean;
  isIllustration: boolean;
  isDebate: boolean;
  isVideo: boolean;
  isManualPreferred: boolean;
}

const PROFILE_TIEBREAK_ORDER: Partial<Record<AssetProviderId, number>> = {
  ai_generated: 0,
  internal_library: 1,
  wikimedia: 0,
  pexels: 1,
  unsplash: 2,
  pixabay: 3,
  manual: 4,
};

function compareProviderRankings(
  a: ProviderRecommendation,
  b: ProviderRecommendation,
  sceneProfile: SceneProfile,
): number {
  const scoreDiff = b.score - a.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const tieBreakOrder = sceneProfile.isTactical || sceneProfile.isIllustration
    ? { ai_generated: 0, internal_library: 1, pixabay: 2, pexels: 3, unsplash: 4, manual: 5, wikimedia: 6 }
    : sceneProfile.isHistorical
      ? { wikimedia: 0, internal_library: 1, pexels: 2, unsplash: 3, pixabay: 4, ai_generated: 5, manual: 6 }
      : sceneProfile.isAction
        ? { pexels: 0, unsplash: 1, pixabay: 2, internal_library: 3, ai_generated: 4, wikimedia: 5, manual: 6 }
        : sceneProfile.isDebate
          ? { pexels: 0, unsplash: 1, pixabay: 2, internal_library: 3, ai_generated: 4, wikimedia: 5, manual: 6 }
          : sceneProfile.isPortrait
            ? { unsplash: 0, pexels: 1, internal_library: 2, pixabay: 3, ai_generated: 4, wikimedia: 5, manual: 6 }
            : PROFILE_TIEBREAK_ORDER;

  const aRank = tieBreakOrder[a.providerId] ?? 99;
  const bRank = tieBreakOrder[b.providerId] ?? 99;
  return aRank - bRank;
}

function scoreToPriority(score: number, index: number): AssetProviderPriority {
  if (index === 0 && score >= 0.75) {
    return "primary";
  }
  if (index <= 2 && score >= 0.55) {
    return "secondary";
  }
  if (score >= 0.35) {
    return "fallback";
  }
  return "planning_only";
}

function uniqueCapabilities(values: AssetProviderCapability[]): AssetProviderCapability[] {
  return [...new Set(values)];
}

function inferRequiredCapabilities(input: AssetProviderRequest): AssetProviderCapability[] {
  const required: AssetProviderCapability[] = [];
  const profile = buildSceneProfile(input);

  if (profile.isPortrait || input.visualIntent === "player_portrait") {
    required.push("supportsPortrait");
  }

  if (
    input.entityTypes.includes("player") ||
    input.entityTypes.includes("manager") ||
    profile.isPortrait ||
    profile.isDebate
  ) {
    required.push("supportsPeople");
  }

  if (profile.isHistorical) {
    required.push("supportsHistorical");
  }

  if (profile.isAction || profile.isDebate || input.entityTypes.includes("match")) {
    required.push("supportsSports");
  }

  if (
    input.visualIntent === "team_crest" ||
    (input.entityTypes.includes("club") && profile.isDebate)
  ) {
    required.push("supportsLogos");
  }

  if (profile.isTactical || profile.isIllustration) {
    required.push("supportsIllustrations");
  }

  if (profile.isVideo) {
    required.push("supportsVideo");
  }

  if (profile.isAction && !profile.isPortrait && !profile.isIllustration) {
    required.push("supportsLandscape");
  }

  return uniqueCapabilities(required);
}

function buildSceneProfile(input: AssetProviderRequest): SceneProfile {
  const top = input.sceneRecommendation.topRecommendation;
  const tags = top?.tags ?? [];
  const reasons = top?.reasons ?? [];

  return {
    isHistorical:
      input.visualIntent === "archive_footage" ||
      reasons.includes("best_historical_context") ||
      input.entityTypes.includes("season"),
    isAction:
      input.visualIntent === "match_action" ||
      tags.includes("action") ||
      tags.includes("match") ||
      input.entityTypes.includes("match"),
    isPortrait: input.visualIntent === "player_portrait" || tags.includes("portrait"),
    isTactical:
      input.visualIntent === "timeline_graphic" ||
      input.entityTypes.includes("tactic") ||
      reasons.includes("supports_tactical_explanation") ||
      tags.includes("tactic"),
    isIllustration:
      input.visualIntent === "text_card" ||
      input.visualIntent === "stat_overlay" ||
      input.assetRequirementType === "stat_card" ||
      input.assetRequirementType === "generated_graphic",
    isDebate:
      input.visualIntent === "comparison_split" ||
      tags.includes("debate") ||
      tags.includes("comparison"),
    isVideo: input.assetRequirementType === "video_clip",
    isManualPreferred: input.assetRequirementType === "user_upload",
  };
}

function scoreProvider(
  providerId: AssetProviderId,
  context: ProviderScoreContext,
): ProviderRecommendation | null {
  const provider = getAssetProviderDefinition(providerId);
  if (!provider) {
    return null;
  }

  if (!providerSupportsCapabilities(provider, context.requiredCapabilities)) {
    return null;
  }

  let score = provider.baseScore;
  const reasons: string[] = [`Base planning score for ${provider.label}.`];
  const matched: AssetProviderCapability[] = [];

  for (const capability of context.requiredCapabilities) {
    if (provider.capabilities[capability]) {
      matched.push(capability);
      score += 0.04;
    }
  }

  const profile = context.sceneProfile;

  if (profile.isHistorical) {
    if (providerId === "wikimedia") {
      score += 0.18;
      reasons.push("Strong fit for historical archive scenes.");
    }
    if (providerId === "internal_library") {
      score += 0.14;
      reasons.push("Curated internal archive coverage.");
    }
    if (providerId === "pexels") {
      score += 0.06;
      reasons.push("Fallback stock archive for modern historical recaps.");
    }
  }

  if (profile.isAction) {
    if (providerId === "pexels") {
      score += 0.16;
      reasons.push("Action and sports stock coverage.");
    }
    if (providerId === "unsplash") {
      score += 0.12;
      reasons.push("High-quality action photography.");
    }
    if (providerId === "pixabay") {
      score += 0.08;
      reasons.push("Sports B-roll fallback.");
    }
  }

  if (profile.isPortrait) {
    if (providerId === "unsplash") {
      score += 0.14;
      reasons.push("Portrait-first photography catalog.");
    }
    if (providerId === "pexels") {
      score += 0.1;
      reasons.push("Player portrait stock coverage.");
    }
    if (providerId === "internal_library") {
      score += 0.08;
      reasons.push("Curated player portrait assets.");
    }
  }

  if (profile.isTactical || profile.isIllustration) {
    if (providerId === "ai_generated") {
      score += 0.2;
      reasons.push("Best fit for tactical boards and generated graphics.");
    }
    if (providerId === "internal_library") {
      score += 0.12;
      reasons.push("Internal tactical and overlay templates.");
    }
    if (providerId === "pexels") {
      score += 0.04;
      reasons.push("Limited tactical stock fallback.");
    }
  }

  if (profile.isDebate) {
    if (providerId === "pexels") {
      score += 0.1;
      reasons.push("Split-screen and comparison stock options.");
    }
    if (providerId === "unsplash") {
      score += 0.08;
      reasons.push("Portrait comparison coverage.");
    }
  }

  if (profile.isVideo) {
    if (provider.capabilities.supportsVideo) {
      score += 0.12;
      reasons.push("Provider supports video clips.");
    } else {
      score -= 0.25;
    }
  }

  if (profile.isManualPreferred && providerId === "manual") {
    score += 0.25;
    reasons.push("Scene expects a manual user upload.");
  }

  if (providerId === "manual" && !profile.isManualPreferred) {
    score -= 0.12;
    reasons.push("Manual upload reserved as creator fallback.");
  }

  score = Math.min(1, Math.max(0, Math.round(score * 1000) / 1000));

  return {
    providerId,
    priority: "planning_only",
    score,
    reasons,
    capabilitiesMatched: matched,
    planningOnly: true,
  };
}

/** Ranks providers for a single scene recommendation request. */
export function resolveBestProviders(request: AssetProviderRequest): ProviderRecommendation[] {
  const requiredCapabilities = inferRequiredCapabilities(request);
  const sceneProfile = buildSceneProfile(request);

  return ASSET_PROVIDER_REGISTRY.map((provider) =>
    scoreProvider(provider.id, { requiredCapabilities, sceneProfile }),
  )
    .filter((entry): entry is ProviderRecommendation => Boolean(entry))
    .sort((a, b) => compareProviderRankings(a, b, sceneProfile))
    .map((entry, index) => ({
      ...entry,
      priority: scoreToPriority(entry.score, index),
    }));
}

/** Builds planning-only asset candidates for a ranked provider list. */
export function buildPlanningAssetCandidates(
  query: string | undefined,
  rankedProviders: ProviderRecommendation[],
): AssetCandidate[] {
  if (!query?.trim()) {
    return [];
  }

  return rankedProviders.slice(0, 3).map((provider) => ({
    providerId: provider.providerId,
    query,
    planningOnly: true,
    estimatedMatchScore: provider.score,
    capabilitiesUsed: provider.capabilitiesMatched,
  }));
}

function cloneProviderPlanInput(input: AssetProviderPlanInput): AssetProviderPlanInput {
  return {
    recommendation: {
      ...input.recommendation,
      sceneRecommendations: input.recommendation.sceneRecommendations.map((scene) => ({
        ...scene,
        alternatives: scene.alternatives.map((alt) => ({ ...alt })),
        rejectedCandidates: scene.rejectedCandidates.map((entry) => ({ ...entry })),
        reasoning: [...scene.reasoning],
        topRecommendation: scene.topRecommendation ? { ...scene.topRecommendation } : undefined,
      })),
      globalRecommendations: input.recommendation.globalRecommendations.map((entry) => ({ ...entry })),
      unusedEntities: input.recommendation.unusedEntities.map((entry) => ({ ...entry })),
      diagnostics: {
        ...input.recommendation.diagnostics,
        warnings: [...input.recommendation.diagnostics.warnings],
      },
    },
    sceneAssetPlans: input.sceneAssetPlans?.map((plan) => ({
      ...plan,
      candidates: plan.candidates.map((candidate) => ({ ...candidate })),
      primaryEntityIds: [...plan.primaryEntityIds],
    })),
    mappedScenes: input.mappedScenes?.map((scene) => ({ ...scene })),
  };
}

function resolveSceneContext(
  sceneIndex: number,
  input: AssetProviderPlanInput,
): {
  visualIntent?: string;
  assetRequirementType?: AssetRequirementType;
  entityTypes: AssetEntityType[];
  orientation?: AssetProviderRequest["orientation"];
} {
  const scenePlan = input.sceneAssetPlans?.[sceneIndex];
  const mappedScene = input.mappedScenes?.[sceneIndex];
  const top = input.recommendation.sceneRecommendations[sceneIndex]?.topRecommendation;

  return {
    visualIntent: mappedScene?.visualIntentType ?? top?.visualIntent,
    assetRequirementType: (scenePlan?.assetRequirementType ??
      top?.assetRequirementType) as AssetRequirementType | undefined,
    entityTypes: top?.entityTypes ?? [],
    orientation: mappedScene?.mediaHints.preferredOrientation,
  };
}

function buildProviderDiagnostics(sceneResults: AssetProviderResult[]): ProviderDiagnostics {
  const recommendedProviderCounts: ProviderDiagnostics["recommendedProviderCounts"] = {};
  const providerReasoning: string[] = [];
  const unsupportedRequests: string[] = [];

  let covered = 0;

  for (const scene of sceneResults) {
    if (scene.primaryProvider) {
      covered += 1;
      recommendedProviderCounts[scene.primaryProvider.providerId] =
        (recommendedProviderCounts[scene.primaryProvider.providerId] ?? 0) + 1;

      providerReasoning.push(
        `Scene ${scene.sceneId}: ${scene.primaryProvider.providerId} (${scene.primaryProvider.priority}) — ${scene.primaryProvider.reasons[0] ?? "selected"}`,
      );
      continue;
    }

    if (scene.query) {
      unsupportedRequests.push(`Scene ${scene.sceneId} has no viable provider match.`);
    }
  }

  const eligibleCount = sceneResults.filter((scene) => scene.query).length;

  return {
    providerCoverage: eligibleCount === 0 ? 1 : Math.round((covered / eligibleCount) * 1000) / 1000,
    recommendedProviderCounts,
    unsupportedRequests,
    providerReasoning,
  };
}

/** Builds provider rankings for all scene recommendations. */
export function buildAssetProviderPlan(input: AssetProviderPlanInput): AssetProviderPlanResult {
  const clonedInput = cloneProviderPlanInput(input);

  const sceneResults: AssetProviderResult[] = clonedInput.recommendation.sceneRecommendations.map(
    (sceneRecommendation, sceneIndex) => {
      const context = resolveSceneContext(sceneIndex, clonedInput);
      const query = sceneRecommendation.topRecommendation?.query;

      if (!query) {
        return {
          sceneId: sceneRecommendation.sceneId,
          sceneIndex,
          rankedProviders: [],
          planningOnly: true,
        };
      }

      const rankedProviders = resolveBestProviders({
        sceneRecommendation,
        visualIntent: context.visualIntent,
        assetRequirementType: context.assetRequirementType,
        entityTypes: context.entityTypes,
        query,
        orientation: context.orientation,
      });

      return {
        sceneId: sceneRecommendation.sceneId,
        sceneIndex,
        query,
        rankedProviders,
        primaryProvider: rankedProviders[0],
        planningOnly: true,
      };
    },
  );

  return {
    version: ASSET_PROVIDER_VERSION,
    sceneResults,
    diagnostics: buildProviderDiagnostics(sceneResults),
    generatedAt: new Date().toISOString(),
  };
}

export function describeRequiredCapabilities(capabilities: AssetProviderCapability[]): string {
  return capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(", ");
}

export function inferRequiredCapabilitiesForRequest(
  request: AssetProviderRequest,
): AssetProviderCapability[] {
  return inferRequiredCapabilities(request);
}
