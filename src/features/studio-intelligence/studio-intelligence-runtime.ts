import { STUDIO_INTELLIGENCE_VERSION } from "./studio-intelligence.constants";
import { applyDynamicTiming } from "./dynamic-timing-planner";
import { buildNarrativeArcs, determineDominantEmotion } from "./narrative-arc-builder";
import { detectNarrativeBeats } from "./narrative-beat-detector";
import { planSceneBlueprintsFromArcs } from "./scene-planner";
import { createEmptySceneBlueprintCollection } from "./scene-blueprint.utils";
import {
  resolveScriptModeFromStrategy,
  resolveStructureLabelFromStrategy,
} from "./story-strategy/planner-strategy.utils";
import type { StoryStrategy, StoryStrategyId } from "./story-strategy/story-strategy.types";
import { resolveStoryStrategy } from "./story-strategy/story-strategy.utils";
import type {
  NarrativeArc,
  NarrativeBeat,
  StudioIntelligenceDiagnostics,
  StudioIntelligenceInput,
  StudioIntelligenceMetrics,
  StudioIntelligenceResult,
  StudioIntelligenceSummary,
  VisualIntentType,
} from "./studio-intelligence.types";
import {
  createEmptyStudioIntelligenceResult,
  normalizeNarrationText,
} from "./studio-intelligence.utils";
import { enrichBlueprintsWithVisuals } from "./visual-planner";

export const STUDIO_INTELLIGENCE_PLANNER_STEPS = [
  "normalize_input",
  "resolve_story_strategy",
  "narrative_beat_detection",
  "narrative_arc_builder",
  "scene_planner",
  "visual_planner",
  "dynamic_timing_planner",
] as const;

function cloneInput(input: StudioIntelligenceInput): StudioIntelligenceInput {
  return {
    ...input,
    entities: input.entities ? [...input.entities] : undefined,
  };
}

function normalizePlanningInput(input: StudioIntelligenceInput): StudioIntelligenceInput {
  return {
    ...input,
    topic: normalizeNarrationText(input.topic),
    narration: normalizeNarrationText(input.narration),
    targetDurationSec: Math.max(1, Math.round(input.targetDurationSec)),
    entities: input.entities?.map((entity) => normalizeNarrationText(entity)).filter(Boolean),
  };
}

function detectUnsupportedPatterns(
  input: StudioIntelligenceInput,
  beats: NarrativeBeat[],
): string[] {
  const patterns: string[] = [];

  if (!normalizeNarrationText(input.narration)) {
    patterns.push("empty_narration");
  }

  if (beats.length > 12) {
    patterns.push("long_form_narration");
  }

  if (beats.length > 0 && !beats.some((beat) => beat.type === "hook")) {
    patterns.push("missing_hook");
  }

  if (beats.length > 2 && !beats.some((beat) => beat.type === "payoff" || beat.type === "conclusion")) {
    patterns.push("missing_payoff");
  }

  return patterns;
}

function inferRecommendedStoryMode(
  input: StudioIntelligenceInput,
  beats: NarrativeBeat[],
  arcs: NarrativeArc[],
  resolvedStrategy: StoryStrategy,
): StudioIntelligenceSummary["recommendedStoryMode"] {
  if (input.mode) {
    return resolveScriptModeFromStrategy(resolvedStrategy);
  }

  const narration = normalizeNarrationText(input.narration).toLowerCase();

  if (/\b(top\s+\d+|ranked|countdown)\b/.test(narration)) {
    return "top_5";
  }

  if (
    beats.some((beat) => beat.type === "conflict" || beat.type === "counterpoint") ||
    arcs.some((arc) => arc.type === "conflict")
  ) {
    return "opinion_debate";
  }

  if (/\b(recap|final score|full time)\b/.test(narration)) {
    return "match_recap";
  }

  if (/\b(preview|kickoff|lineup|watch for)\b/.test(narration)) {
    return "match_preview";
  }

  return "story";
}

function resolveDominantVisualStyle(
  collection: StudioIntelligenceResult["sceneBlueprintCollection"],
): string | undefined {
  if (collection.blueprints.length === 0) {
    return undefined;
  }

  const counts = new Map<VisualIntentType, number>();

  for (const blueprint of collection.blueprints) {
    const intent = blueprint.visual.visualIntentType;
    counts.set(intent, (counts.get(intent) ?? 0) + 1);
  }

  let dominant: VisualIntentType | undefined;
  let dominantCount = -1;

  for (const [intent, count] of counts.entries()) {
    if (count > dominantCount) {
      dominant = intent;
      dominantCount = count;
    }
  }

  return dominant?.replace(/_/g, " ");
}

function calculateVisualCoverage(
  collection: StudioIntelligenceResult["sceneBlueprintCollection"],
): number {
  if (collection.blueprints.length === 0) {
    return 0;
  }

  const enrichedCount = collection.blueprints.filter(
    (blueprint) =>
      blueprint.visual.visualIntentType !== "neutral_broll" &&
      blueprint.asset.assetRequirementType !== "placeholder" &&
      Boolean(blueprint.asset.searchQuery),
  ).length;

  return Math.round((enrichedCount / collection.blueprints.length) * 1000) / 1000;
}

function buildMetrics(
  beats: NarrativeBeat[],
  arcs: NarrativeArc[],
  collection: StudioIntelligenceResult["sceneBlueprintCollection"],
): StudioIntelligenceMetrics {
  return {
    beatCount: beats.length,
    arcCount: arcs.length,
    sceneBlueprintCount: collection.blueprints.length,
    averageImportance: collection.averageImportance,
    estimatedDurationMs: collection.totalSuggestedDurationMs,
    hookDetected: beats.some((beat) => beat.type === "hook"),
    ctaDetected: beats.some((beat) => beat.type === "cta"),
    visualCoverage: calculateVisualCoverage(collection),
    confidence: collection.confidence,
  };
}

function buildSummary(
  result: Pick<
    StudioIntelligenceResult,
    "structure" | "beats" | "arcs" | "sceneBlueprintCollection" | "input" | "resolvedStrategy"
  >,
): StudioIntelligenceSummary {
  const arcStructure =
    result.arcs.length > 0
      ? result.arcs.map((arc) => arc.type).join(" → ")
      : result.structure.arcLabel;

  return {
    storyStructure: arcStructure,
    estimatedScenes: result.sceneBlueprintCollection.blueprints.length,
    estimatedDurationMs: result.sceneBlueprintCollection.totalSuggestedDurationMs,
    dominantEmotion: determineDominantEmotion(result.beats),
    dominantVisualStyle: resolveDominantVisualStyle(result.sceneBlueprintCollection),
    recommendedStoryMode: inferRecommendedStoryMode(
      result.input,
      result.beats,
      result.arcs,
      result.resolvedStrategy,
    ),
  };
}

function buildDiagnostics(
  steps: string[],
  warnings: string[],
  unsupportedPatterns: string[],
  executionTimeEstimateMs: number,
  strategyHandoffTrace: readonly StoryStrategyId[],
): StudioIntelligenceDiagnostics {
  return {
    warnings,
    plannerStepsExecuted: steps,
    plannerVersion: STUDIO_INTELLIGENCE_VERSION,
    executionTimeEstimateMs,
    unsupportedPatterns,
    strategyHandoffTrace,
  };
}

function createStructurePlanFromStrategy(
  input: StudioIntelligenceInput,
  strategy: StoryStrategy,
): StudioIntelligenceResult["structure"] {
  const base = createEmptyStudioIntelligenceResult(input, strategy);

  return {
    ...base.structure,
    arc: strategy.preferredStructure,
    arcLabel: resolveStructureLabelFromStrategy(strategy),
  };
}

/** Runs the full Studio Intelligence planning pipeline. */
export function runStudioIntelligence(input: StudioIntelligenceInput): StudioIntelligenceResult {
  const startedAt = Date.now();
  const originalInput = cloneInput(input);
  const steps: string[] = [];

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[0]);
  const normalizedInput = normalizePlanningInput(input);
  const normalizedNarration = normalizedInput.narration;

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[1]);
  const resolvedStrategy = resolveStoryStrategy(normalizedInput.mode);
  const strategyHandoffTrace: StoryStrategyId[] = [];

  if (!normalizedNarration) {
    const empty = createEmptyStudioIntelligenceResult(normalizedInput, resolvedStrategy);
    return {
      ...empty,
      originalInput,
      normalizedNarration,
      structure: createStructurePlanFromStrategy(normalizedInput, resolvedStrategy),
      diagnostics: buildDiagnostics(
        steps,
        ["Empty narration provided; planners skipped after normalization."],
        ["empty_narration"],
        Date.now() - startedAt,
        strategyHandoffTrace,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[2]);
  const beats = detectNarrativeBeats(normalizedInput, resolvedStrategy);
  strategyHandoffTrace.push(resolvedStrategy.id);

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[3]);
  const arcs = buildNarrativeArcs(beats, resolvedStrategy);
  strategyHandoffTrace.push(resolvedStrategy.id);

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[4]);
  const plannedCollection = planSceneBlueprintsFromArcs(arcs, normalizedInput, resolvedStrategy);
  strategyHandoffTrace.push(resolvedStrategy.id);

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[5]);
  const visualCollection = enrichBlueprintsWithVisuals(plannedCollection, normalizedInput, resolvedStrategy);
  strategyHandoffTrace.push(resolvedStrategy.id);

  steps.push(STUDIO_INTELLIGENCE_PLANNER_STEPS[6]);
  const sceneBlueprintCollection = applyDynamicTiming(visualCollection, normalizedInput, resolvedStrategy);
  strategyHandoffTrace.push(resolvedStrategy.id);

  const base = createEmptyStudioIntelligenceResult(normalizedInput, resolvedStrategy);
  const warnings: string[] = [];

  if (sceneBlueprintCollection.blueprints.length === 0) {
    warnings.push("No scene blueprints were produced from the detected beats.");
  }

  const unsupportedPatterns = detectUnsupportedPatterns(normalizedInput, beats);
  if (unsupportedPatterns.includes("missing_hook")) {
    warnings.push("No hook beat detected in narration.");
  }

  const partialResult: StudioIntelligenceResult = {
    ...base,
    originalInput,
    normalizedNarration,
    structure: createStructurePlanFromStrategy(normalizedInput, resolvedStrategy),
    beats,
    arcs,
    sceneBlueprintCollection,
    scenePlans: [],
    generatedAt: new Date().toISOString(),
    metrics: buildMetrics(beats, arcs, sceneBlueprintCollection),
    diagnostics: buildDiagnostics(
      steps,
      warnings,
      unsupportedPatterns,
      Date.now() - startedAt,
      strategyHandoffTrace,
    ),
    summary: {
      storyStructure: base.structure.arcLabel,
      estimatedScenes: 0,
      estimatedDurationMs: 0,
      recommendedStoryMode: resolveScriptModeFromStrategy(resolvedStrategy),
    },
  };

  return {
    ...partialResult,
    summary: buildSummary(partialResult),
  };
}

export function createEmptyRuntimeResult(input: StudioIntelligenceInput): StudioIntelligenceResult {
  return createEmptyStudioIntelligenceResult(input);
}

export function isEmptyBlueprintCollection(
  collection: StudioIntelligenceResult["sceneBlueprintCollection"],
): boolean {
  return collection.blueprints.length === 0;
}

export { createEmptySceneBlueprintCollection };
