import type {
  AssetBlueprint,
  AssetBlueprintOrientation,
  MotionBlueprint,
  MotionBlueprintIntensity,
  MotionBlueprintSuggestion,
  SceneBlueprint,
  SceneBlueprintCollection,
  SceneBlueprintKind,
  SceneBlueprintRole,
  VisualBlueprint,
} from "./scene-blueprint.types";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import {
  strategyFallbackQuery,
  strategyIntroVisualOverride,
  resolvePlannerStrategy,
} from "./story-strategy/planner-strategy.utils";
import type { PlannerStrategyDiagnostics } from "./story-strategy/strategy-planning-diagnostics.utils";
import {
  isDefaultStoryStrategy,
  recordStrategyDecision,
  recordStrategyInfluence,
} from "./story-strategy/strategy-planning-diagnostics.utils";
import {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
  mapImportanceToMotionIntensity,
  mapVisualIntentToAssetRequirement,
  normalizeAssetSearchQuery,
} from "./scene-blueprint.utils";
import type { StudioIntelligenceInput, VisualIntentType } from "./studio-intelligence.types";
import { normalizeNarrationText } from "./studio-intelligence.utils";

const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "football",
  "from",
  "into",
  "just",
  "more",
  "most",
  "that",
  "the",
  "their",
  "this",
  "what",
  "when",
  "with",
]);

function resolveInput(input?: StudioIntelligenceInput): StudioIntelligenceInput {
  return {
    topic: normalizeNarrationText(input?.topic ?? ""),
    narration: normalizeNarrationText(input?.narration ?? ""),
    targetDurationSec: Math.max(1, Math.round(input?.targetDurationSec ?? 45)),
    entities: input?.entities?.map((entity) => normalizeNarrationText(entity)).filter(Boolean),
    researchContextId: input?.researchContextId,
  };
}

function extractSubjectFromSummary(summary: string): string | undefined {
  const normalized = normalizeNarrationText(summary);
  if (!normalized) {
    return undefined;
  }

  const words = normalized
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word.toLowerCase()));

  return words.slice(0, 4).join(" ") || undefined;
}

function resolveEntities(input?: StudioIntelligenceInput): string[] {
  const resolved = resolveInput(input);
  if (resolved.entities && resolved.entities.length > 0) {
    return resolved.entities;
  }

  const topicWords = resolved.topic
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word.toLowerCase()));

  return topicWords.slice(0, 3);
}

function roleVisualIntent(role: SceneBlueprintRole, kind: SceneBlueprintKind): VisualIntentType {
  if (kind === "hook_opener" || role === "intro") {
    return "player_portrait";
  }

  if (kind === "stat_moment" || kind === "ranked_reveal" || role === "evidence") {
    return kind === "ranked_reveal" ? "text_card" : "stat_overlay";
  }

  if (kind === "debate_split" || kind === "comparison" || role === "conflict") {
    return kind === "text_card" ? "text_card" : "comparison_split";
  }

  if (kind === "closing_moment" || role === "payoff" || role === "ending") {
    return "archive_footage";
  }

  if (kind === "cta_card" || role === "cta") {
    return "text_card";
  }

  if (kind === "match_highlight" || role === "climax") {
    return "match_action";
  }

  if (kind === "player_spotlight") {
    return "player_portrait";
  }

  if (role === "context") {
    return "archive_footage";
  }

  return "neutral_broll";
}

/** Infers a visual intent type from blueprint role, kind, and summary text. */
export function inferVisualIntentFromRole(
  role: SceneBlueprintRole,
  kind: SceneBlueprintKind,
  summary: string,
): VisualIntentType {
  if (kind === "hook_opener" || role === "intro") {
    return "player_portrait";
  }

  if (kind === "debate_split" || kind === "comparison" || role === "conflict") {
    return kind === "text_card" ? "text_card" : "comparison_split";
  }

  if (kind === "closing_moment" || role === "payoff" || role === "ending") {
    const normalized = summary.toLowerCase();
    if (/\b(legacy|impact|best|goat|legend|finally|ultimately)\b/.test(normalized)) {
      return "crowd_atmosphere";
    }

    return "archive_footage";
  }

  const normalized = summary.toLowerCase();

  if (/\b(top\s+\d+|#\d+|number\s+\d+|ranked|countdown)\b/.test(normalized)) {
    return "text_card";
  }

  if (kind === "stat_moment" || role === "evidence") {
    if (/\b(goals|assists|stats|stat|record|%\d)\b/.test(normalized)) {
      return "stat_overlay";
    }

    return kind === "ranked_reveal" ? "text_card" : "stat_overlay";
  }

  if (/\b(however|debate|versus|vs\.?|critics|overrated)\b/.test(normalized)) {
    return "comparison_split";
  }

  return roleVisualIntent(role, kind);
}

/** Infers a composition hint from a visual intent type. */
export function inferCompositionFromVisualIntent(intent: VisualIntentType): string {
  switch (intent) {
    case "player_portrait":
      return "Close-up subject framing with shallow depth and strong focal point.";
    case "match_action":
      return "Dynamic action framing with room for score or moment context.";
    case "stat_overlay":
      return "Stat-led overlay with supporting subject context in the background.";
    case "timeline_graphic":
      return "Timeline-led graphic composition with chronological emphasis.";
    case "team_crest":
      return "Crest-forward composition with clean negative space.";
    case "crowd_atmosphere":
      return "Emotional atmosphere shot with legacy or reaction emphasis.";
    case "archive_footage":
      return "Archival storytelling frame with cinematic crop.";
    case "text_card":
      return "Text-card composition with bold headline hierarchy.";
    case "comparison_split":
      return "Split-screen comparison with balanced left/right framing.";
    case "neutral_broll":
      return "Neutral b-roll composition with flexible crop room.";
    default:
      return "Flexible football short-form composition.";
  }
}

function resolvePreferredOrientation(
  intent: VisualIntentType,
  strategy?: StoryStrategy,
): AssetBlueprintOrientation {
  if (strategy && !isDefaultStoryStrategy(strategy.id)) {
    if (strategy.assetBias.preferredOrientation !== "any") {
      return strategy.assetBias.preferredOrientation;
    }
  }

  switch (intent) {
    case "player_portrait":
      return "portrait";
    case "text_card":
    case "stat_overlay":
    case "timeline_graphic":
      return "square";
    case "comparison_split":
      return "landscape";
    default:
      return "landscape";
  }
}

function resolveImageCount(kind: SceneBlueprintKind, intent: VisualIntentType): number {
  if (kind === "comparison" || kind === "debate_split" || intent === "comparison_split") {
    return 2;
  }

  return 1;
}

function roleSearchTerms(role: SceneBlueprintRole, kind: SceneBlueprintKind): string[] {
  switch (role) {
    case "intro":
      return ["close up portrait", "hook opener"];
    case "evidence":
      return kind === "ranked_reveal" ? ["ranked list graphic"] : ["stats overlay", "performance data"];
    case "conflict":
      return ["debate split screen", "comparison graphic"];
    case "payoff":
    case "ending":
      return ["legacy moment", "emotional celebration"];
    case "climax":
      return ["match highlight", "decisive moment"];
    case "cta":
      return ["subscribe call to action card"];
    default:
      return ["football b-roll"];
  }
}

/** Builds a primary asset search query for a blueprint. */
export function buildAssetSearchQuery(
  blueprint: SceneBlueprint,
  visual: VisualBlueprint,
  input?: StudioIntelligenceInput,
): string {
  const resolved = resolveInput(input);
  const entities = resolveEntities(input);
  const subject = visual.subject ?? extractSubjectFromSummary(blueprint.summary);
  const terms = [
    resolved.topic,
    ...entities,
    subject,
    visual.visualIntentType.replace(/_/g, " "),
    ...roleSearchTerms(blueprint.role, blueprint.kind),
  ]
    .map((term) => normalizeAssetSearchQuery(term))
    .filter(Boolean);

  const uniqueTerms = [...new Set(terms)];
  const query = uniqueTerms.slice(0, 6).join(" ");

  return query || normalizeAssetSearchQuery(resolved.topic) || "football highlights";
}

/** Builds a fallback asset query when the primary search is too narrow. */
export function buildFallbackAssetQuery(
  blueprint: SceneBlueprint,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): string {
  const resolved = resolveInput(input);
  const entities = resolveEntities(input);
  const plannerStrategy = resolvePlannerStrategy(input, strategy);
  const fallbackQuery = strategyFallbackQuery(plannerStrategy);
  const subject = extractSubjectFromSummary(blueprint.summary);

  const terms = [entities[0], resolved.topic, subject, fallbackQuery, blueprint.role]
    .map((term) => normalizeAssetSearchQuery(term))
    .filter(Boolean);

  return [...new Set(terms)].slice(0, 4).join(" ") || fallbackQuery;
}

function resolveTextOverlay(
  blueprint: SceneBlueprint,
  intent: VisualIntentType,
): string | undefined {
  if (intent === "text_card" || intent === "stat_overlay") {
    return extractSubjectFromSummary(blueprint.summary);
  }

  if (blueprint.caption.highlightWords.length > 0) {
    return blueprint.caption.highlightWords.join(" ");
  }

  return undefined;
}

function applyStrategyVisualBias(
  strategy: StoryStrategy,
  blueprint: SceneBlueprint,
  inferred: VisualIntentType,
): VisualIntentType {
  if (isDefaultStoryStrategy(strategy.id)) {
    return inferred;
  }

  if (strategy.visualBias.favorComparisonSplit && (blueprint.role === "conflict" || blueprint.kind === "debate_split")) {
    return "comparison_split";
  }

  if (strategy.visualBias.favorStatOverlay && (blueprint.role === "evidence" || blueprint.kind === "stat_moment")) {
    return "stat_overlay";
  }

  if (strategy.visualBias.favorArchiveFootage && (blueprint.role === "context" || blueprint.role === "payoff")) {
    return "archive_footage";
  }

  if (blueprint.role === "intro" && strategy.hookStrategy.preferPortraitVisual) {
    return "player_portrait";
  }

  if (blueprint.role === "intro" || blueprint.kind === "hook_opener") {
    return strategy.visualBias.primaryIntent as VisualIntentType;
  }

  if (strategy.visualBias.secondaryIntent && blueprint.role === "evidence") {
    return strategy.visualBias.secondaryIntent as VisualIntentType;
  }

  return inferred;
}

/** Creates a visual blueprint for a scene blueprint. */
export function createVisualBlueprintForScene(
  blueprint: SceneBlueprint,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): VisualBlueprint {
  const resolved = resolveInput(input);
  const plannerStrategy = resolvePlannerStrategy(input, strategy);
  const introBias = strategyIntroVisualOverride(plannerStrategy, blueprint.role);
  const inferred = inferVisualIntentFromRole(blueprint.role, blueprint.kind, blueprint.summary);
  const visualIntentType =
    introBias ?? applyStrategyVisualBias(plannerStrategy, blueprint, inferred);
  const subject =
    extractSubjectFromSummary(blueprint.summary) ??
    resolveEntities(input)[0] ??
    normalizeNarrationText(resolved.topic);

  return {
    visualIntentType,
    composition: inferCompositionFromVisualIntent(visualIntentType),
    subject,
    emotion: blueprint.visual.emotion,
    textOverlaySuggestion: resolveTextOverlay(blueprint, visualIntentType),
    reason: `Visual planner inferred ${visualIntentType} for ${blueprint.role}/${blueprint.kind}.`,
  };
}

/** Creates an asset blueprint for a scene blueprint. */
export function createAssetBlueprintForScene(
  blueprint: SceneBlueprint,
  visual: VisualBlueprint,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): AssetBlueprint {
  const plannerStrategy = resolvePlannerStrategy(input, strategy);
  const assetRequirementType = mapVisualIntentToAssetRequirement(visual.visualIntentType);

  return {
    assetRequirementType,
    searchQuery: buildAssetSearchQuery(blueprint, visual, input),
    fallbackQuery: buildFallbackAssetQuery(blueprint, input, plannerStrategy),
    preferredOrientation: resolvePreferredOrientation(visual.visualIntentType, plannerStrategy),
    imageCount: resolveImageCount(blueprint.kind, visual.visualIntentType),
    reason: `Asset planner mapped ${visual.visualIntentType} to ${assetRequirementType}.`,
  };
}

function resolveMotionSuggestion(
  intensity: MotionBlueprintIntensity,
  visualIntentType: VisualIntentType,
): MotionBlueprintSuggestion {
  if (intensity === "low") {
    return "static";
  }

  if (visualIntentType === "player_portrait" || visualIntentType === "text_card") {
    return intensity === "high" ? "push_in" : "ken_burns";
  }

  if (visualIntentType === "match_action" || visualIntentType === "crowd_atmosphere") {
    return intensity === "high" ? "zoom_in" : "pan_left";
  }

  if (visualIntentType === "comparison_split") {
    return intensity === "high" ? "pan_right" : "ken_burns";
  }

  return intensity === "high" ? "push_in" : "ken_burns";
}

/** Creates a motion blueprint for a scene blueprint. */
export function createMotionBlueprintForScene(
  blueprint: SceneBlueprint,
  visual: VisualBlueprint,
  strategy?: StoryStrategy,
): MotionBlueprint {
  const plannerStrategy = strategy ? resolvePlannerStrategy(undefined, strategy) : undefined;
  let intensity = mapImportanceToMotionIntensity(blueprint.importance);

  if (plannerStrategy && !isDefaultStoryStrategy(plannerStrategy.id)) {
    intensity = plannerStrategy.motionBias.defaultIntensity;

    if (plannerStrategy.motionBias.boostHighImportance && blueprint.importance.tier === "high") {
      intensity = intensity === "low" ? "medium" : intensity;
    }

    if (
      plannerStrategy.motionBias.preferPushInOnHook &&
      (blueprint.role === "intro" || blueprint.kind === "hook_opener")
    ) {
      return {
        suggestedMotion: "push_in",
        intensity,
        reason: "Strategy prefers push-in motion on hook scenes.",
      };
    }
  }

  const suggestedMotion = resolveMotionSuggestion(intensity, visual.visualIntentType);

  return {
    suggestedMotion,
    intensity,
    reason:
      intensity === "high"
        ? "High-importance scene favors stronger motion."
        : intensity === "medium"
          ? "Medium-importance scene favors subtle motion."
          : "Low-importance scene favors static or minimal motion.",
  };
}

function enrichBlueprint(
  blueprint: SceneBlueprint,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): SceneBlueprint {
  const visual = createVisualBlueprintForScene(blueprint, input, strategy);
  const asset = createAssetBlueprintForScene(blueprint, visual, input, strategy);
  const motion = createMotionBlueprintForScene(blueprint, visual, strategy);

  return {
    ...blueprint,
    timing: { ...blueprint.timing },
    importance: { ...blueprint.importance },
    caption: {
      ...blueprint.caption,
      highlightWords: [...blueprint.caption.highlightWords],
    },
    visual,
    asset,
    motion,
    confidence: clampBlueprintConfidence(blueprint.confidence + 0.04),
  };
}

/** Enriches a blueprint collection with visual, asset, and motion planning. */
export function enrichBlueprintsWithVisuals(
  collection: SceneBlueprintCollection,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
  diagnostics?: PlannerStrategyDiagnostics,
): SceneBlueprintCollection {
  const resolvedStrategy = resolvePlannerStrategy(input, strategy);

  if (diagnostics && !isDefaultStoryStrategy(resolvedStrategy.id)) {
    recordStrategyInfluence(diagnostics, "visualBias.primaryIntent");
    recordStrategyInfluence(diagnostics, "visualBias.favorComparisonSplit");
    recordStrategyInfluence(diagnostics, "visualBias.favorStatOverlay");
    recordStrategyInfluence(diagnostics, "visualBias.favorArchiveFootage");
    recordStrategyInfluence(diagnostics, "assetBias.preferredOrientation");
    recordStrategyInfluence(diagnostics, "motionBias.defaultIntensity");
    recordStrategyDecision(
      diagnostics,
      `Visual bias ${resolvedStrategy.visualBias.primaryIntent} with motion ${resolvedStrategy.motionBias.defaultIntensity}.`,
    );
  }

  if (collection.blueprints.length === 0) {
    return createEmptySceneBlueprintCollection();
  }

  const blueprints = collection.blueprints.map((blueprint) =>
    enrichBlueprint(blueprint, input, resolvedStrategy),
  );
  const stats = calculateBlueprintCollectionStats(blueprints);

  return {
    blueprints,
    ...stats,
    warnings: [...collection.warnings],
  };
}
