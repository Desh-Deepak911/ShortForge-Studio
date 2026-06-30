import {
  DEFAULT_SCENE_IMPORTANCE_RANGES,
  DEFAULT_TIMING_WEIGHTS,
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES,
  STUDIO_INTELLIGENCE_VERSION,
  STUDIO_INTELLIGENCE_WORDS_PER_SECOND,
  resolveDefaultStoryModeStrategy,
  resolveSupportedStoryStructure,
} from "./studio-intelligence.constants";
import { createEmptySceneBlueprintCollection } from "./scene-blueprint.utils";
import {
  resolveScriptModeFromStrategy,
  resolveStructureLabelFromStrategy,
} from "./story-strategy/planner-strategy.utils";
import { STORY_STRATEGY_VERSION } from "./story-strategy/story-strategy.constants";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import { resolveStoryStrategy } from "./story-strategy/story-strategy.utils";
import type {
  SceneImportanceScore,
  StudioIntelligenceDiagnostics,
  StudioIntelligenceInput,
  StudioIntelligenceMetrics,
  StudioIntelligenceResult,
  StudioIntelligenceSummary,
  StoryStructurePlan,
} from "./studio-intelligence.types";

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/** Trims and collapses whitespace in narration planning text. */
export function normalizeNarrationText(value: string | undefined | null): string {
  if (value == null) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

/** Splits narration into sentence-sized planning chunks. */
export function splitNarrationIntoSentences(value: string | undefined | null): string[] {
  const normalized = normalizeNarrationText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function countWords(value: string): number {
  const normalized = normalizeNarrationText(value);
  if (!normalized) {
    return 0;
  }

  return normalized.split(/\s+/).length;
}

/** Estimates spoken reading time from word count (planning only). */
export function estimateReadingTimeMs(
  value: string | undefined | null,
  wordsPerSecond: number = STUDIO_INTELLIGENCE_WORDS_PER_SECOND,
): number {
  const words = countWords(value ?? "");
  if (words <= 0) {
    return 0;
  }

  const safeRate = Number.isFinite(wordsPerSecond) && wordsPerSecond > 0 ? wordsPerSecond : 2.4;
  return Math.round((words / safeRate) * 1000);
}

/** Clamps a suggested scene duration to studio planning bounds. */
export function clampSceneDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) {
    return STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS;
  }

  return Math.min(
    STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
    Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, Math.round(durationMs)),
  );
}

function createEmptyStructurePlan(
  input: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): StoryStructurePlan {
  const resolvedStrategy = strategy ?? resolveStoryStrategy(input.mode);
  const arc = resolvedStrategy.preferredStructure;
  const supported = resolveSupportedStoryStructure(arc);
  const scriptMode = resolveScriptModeFromStrategy(resolvedStrategy);
  const modeStrategy = resolveDefaultStoryModeStrategy(scriptMode);
  const targetDurationSec = Math.max(1, Math.round(input.targetDurationSec));

  return {
    arc,
    arcLabel: supported?.label ?? resolveStructureLabelFromStrategy(resolvedStrategy),
    modeStrategy,
    beats: [],
    targetDurationSec,
  };
}

function createEmptyMetrics(): StudioIntelligenceMetrics {
  return {
    beatCount: 0,
    arcCount: 0,
    sceneBlueprintCount: 0,
    averageImportance: 0,
    estimatedDurationMs: 0,
    hookDetected: false,
    ctaDetected: false,
    visualCoverage: 0,
    confidence: 1,
  };
}

function createEmptyDiagnostics(): StudioIntelligenceDiagnostics {
  return {
    warnings: [],
    plannerStepsExecuted: [],
    plannerVersion: STUDIO_INTELLIGENCE_VERSION,
    executionTimeEstimateMs: 0,
    unsupportedPatterns: [],
  };
}

function createEmptySummary(
  input: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): StudioIntelligenceSummary {
  const resolvedStrategy = strategy ?? resolveStoryStrategy(input.mode);

  return {
    storyStructure: createEmptyStructurePlan(input, resolvedStrategy).arcLabel,
    estimatedScenes: 0,
    estimatedDurationMs: 0,
    recommendedStoryMode: resolveScriptModeFromStrategy(resolvedStrategy),
  };
}

/** Returns an empty planning result shell for a given input. */
export function createEmptyStudioIntelligenceResult(
  input: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): StudioIntelligenceResult {
  const originalInput: StudioIntelligenceInput = {
    ...input,
    entities: input.entities ? [...input.entities] : undefined,
  };
  const normalizedInput: StudioIntelligenceInput = {
    ...input,
    topic: normalizeNarrationText(input.topic),
    narration: normalizeNarrationText(input.narration),
    targetDurationSec: Math.max(1, Math.round(input.targetDurationSec)),
    entities: input.entities?.map((entity) => normalizeNarrationText(entity)).filter(Boolean),
  };
  const normalizedNarration = normalizedInput.narration;
  const resolvedStrategy = strategy ?? resolveStoryStrategy(normalizedInput.mode);

  return {
    version: STUDIO_INTELLIGENCE_VERSION,
    input: normalizedInput,
    originalInput,
    normalizedNarration,
    structure: createEmptyStructurePlan(normalizedInput, resolvedStrategy),
    beats: [],
    arcs: [],
    sceneBlueprintCollection: createEmptySceneBlueprintCollection(),
    summary: createEmptySummary(normalizedInput, resolvedStrategy),
    metrics: createEmptyMetrics(),
    diagnostics: createEmptyDiagnostics(),
    resolvedStrategy,
    strategyId: resolvedStrategy.id,
    plannerConfigurationVersion: STORY_STRATEGY_VERSION,
    scenePlans: [],
    generatedAt: new Date(0).toISOString(),
  };
}

/** Resolves an importance tier from a normalized score. */
export function resolveSceneImportanceTier(value: number): SceneImportanceScore["tier"] {
  const normalized = Math.min(1, Math.max(0, value));

  if (normalized >= DEFAULT_SCENE_IMPORTANCE_RANGES.critical.min) {
    return "critical";
  }

  if (normalized >= DEFAULT_SCENE_IMPORTANCE_RANGES.high.min) {
    return "high";
  }

  if (normalized >= DEFAULT_SCENE_IMPORTANCE_RANGES.medium.min) {
    return "medium";
  }

  return "low";
}

/** Exposes supported structure catalog count for diagnostics. */
export function getSupportedStoryStructureCount(): number {
  return STUDIO_INTELLIGENCE_SUPPORTED_STORY_STRUCTURES.length;
}

/** Default hook timing weight for external planners. */
export function getDefaultHookTimingWeight(): number {
  return DEFAULT_TIMING_WEIGHTS.hook;
}
