import {
  STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
  STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS,
} from "./studio-intelligence.constants";
import type { SceneBlueprint, SceneBlueprintCollection, TimingBlueprint } from "./scene-blueprint.types";
import type { StoryStrategy } from "./story-strategy/story-strategy.types";
import { resolvePlannerStrategy } from "./story-strategy/planner-strategy.utils";
import {
  calculateBlueprintCollectionStats,
  clampBlueprintConfidence,
  createEmptySceneBlueprintCollection,
} from "./scene-blueprint.utils";
import type { StudioIntelligenceInput } from "./studio-intelligence.types";
import { clampSceneDurationMs } from "./studio-intelligence.utils";

const ROLE_WEIGHTS: Record<SceneBlueprint["role"], number> = {
  intro: 0.55,
  context: 0.95,
  evidence: 1.05,
  conflict: 1.12,
  climax: 1.28,
  payoff: 1.22,
  transition: 0.8,
  ending: 1.15,
  cta: 0.62,
};

const KIND_WEIGHTS: Partial<Record<SceneBlueprint["kind"], number>> = {
  hook_opener: 0.55,
  stat_moment: 1.05,
  ranked_reveal: 1.1,
  match_highlight: 1.25,
  debate_split: 1.08,
  closing_moment: 1.2,
  cta_card: 0.6,
  text_card: 0.9,
};

function clampTotalTargetDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 45_000;
  }

  return Math.round(Math.min(300_000, Math.max(5_000, durationMs)));
}

function clampSceneTimingDuration(durationMs: number): number {
  return clampSceneDurationMs(durationMs);
}

/** Resolves the planning target duration in milliseconds. */
export function calculateTargetDurationMs(
  input: StudioIntelligenceInput | undefined,
  collection: SceneBlueprintCollection,
): number {
  if (input?.targetDurationMs != null && Number.isFinite(input.targetDurationMs) && input.targetDurationMs > 0) {
    return clampTotalTargetDuration(Math.round(input.targetDurationMs));
  }

  if (input?.targetDurationSec != null && Number.isFinite(input.targetDurationSec) && input.targetDurationSec > 0) {
    return clampTotalTargetDuration(Math.round(input.targetDurationSec * 1000));
  }

  if (collection.totalSuggestedDurationMs > 0) {
    return clampTotalTargetDuration(collection.totalSuggestedDurationMs);
  }

  return clampTotalTargetDuration(45_000);
}

/** Calculates a relative timing weight for one blueprint. */
export function calculateBlueprintTimingWeight(blueprint: SceneBlueprint): number {
  const roleWeight = ROLE_WEIGHTS[blueprint.role] ?? 1;
  const kindWeight = KIND_WEIGHTS[blueprint.kind] ?? 1;
  const importanceBoost = 0.75 + blueprint.importance.value * 0.55;

  let tierMultiplier = 1;
  switch (blueprint.importance.tier) {
    case "critical":
      tierMultiplier = 1.18;
      break;
    case "high":
      tierMultiplier = 1.08;
      break;
    case "low":
      tierMultiplier = 0.86;
      break;
    default:
      tierMultiplier = 1;
      break;
  }

  return Math.max(0.35, roleWeight * kindWeight * importanceBoost * tierMultiplier);
}

/** Normalizes timing weights into millisecond allocations that sum to the target. */
export function normalizeDurationAllocation(weights: number[], targetDurationMs: number): number[] {
  if (weights.length === 0) {
    return [];
  }

  const safeTarget = clampTotalTargetDuration(Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, targetDurationMs));
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);

  if (totalWeight <= 0) {
    const even = Math.floor(safeTarget / weights.length);
    return weights.map((_, index) =>
      clampSceneTimingDuration(index === weights.length - 1 ? safeTarget - even * (weights.length - 1) : even),
    );
  }

  const raw = weights.map((weight) => (Math.max(0, weight) / totalWeight) * safeTarget);
  const rounded = raw.map((value) => clampSceneTimingDuration(Math.round(value)));
  const allocated = rounded.reduce((sum, value) => sum + value, 0);
  const delta = safeTarget - allocated;

  if (delta !== 0 && rounded.length > 0) {
    const lastIndex = rounded.length - 1;
    rounded[lastIndex] = clampSceneTimingDuration((rounded[lastIndex] ?? 0) + delta);
  }

  return rounded;
}

/** Infers pacing from blueprint role and importance. */
export function inferPacingFromRoleAndImportance(blueprint: SceneBlueprint): TimingBlueprint["pacing"] {
  if (blueprint.role === "intro" || blueprint.kind === "hook_opener") {
    return "punchy";
  }

  if (blueprint.role === "cta" || blueprint.kind === "cta_card") {
    return "punchy";
  }

  if (blueprint.role === "climax" || blueprint.kind === "match_highlight") {
    return blueprint.importance.tier === "critical" ? "normal" : "fast";
  }

  if (blueprint.role === "payoff" || blueprint.role === "ending" || blueprint.kind === "closing_moment") {
    return "normal";
  }

  if (blueprint.importance.tier === "low") {
    return "fast";
  }

  if (blueprint.role === "context" || blueprint.role === "evidence") {
    return "normal";
  }

  return "normal";
}

/** Enforces studio timing bounds on a timing blueprint. */
export function enforceTimingBounds(timing: TimingBlueprint): TimingBlueprint {
  const minDurationMs = clampSceneTimingDuration(
    Math.min(timing.minDurationMs, timing.suggestedDurationMs, timing.maxDurationMs),
  );
  const maxDurationMs = clampSceneTimingDuration(
    Math.max(timing.maxDurationMs, timing.suggestedDurationMs, timing.minDurationMs),
  );
  const boundedMin = Math.max(STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS, Math.min(minDurationMs, maxDurationMs));
  const boundedMax = Math.min(
    STUDIO_INTELLIGENCE_MAX_SCENE_DURATION_MS,
    Math.max(maxDurationMs, boundedMin),
  );
  const suggestedDurationMs = clampSceneTimingDuration(
    Math.min(boundedMax, Math.max(boundedMin, timing.suggestedDurationMs)),
  );

  return {
    ...timing,
    suggestedDurationMs,
    minDurationMs: Math.min(boundedMin, suggestedDurationMs),
    maxDurationMs: Math.max(boundedMax, suggestedDurationMs),
  };
}

function buildTimingBlueprint(blueprint: SceneBlueprint, suggestedDurationMs: number): TimingBlueprint {
  const minDurationMs = clampSceneTimingDuration(Math.round(suggestedDurationMs * 0.72));
  const maxDurationMs = clampSceneTimingDuration(Math.round(suggestedDurationMs * 1.35));

  return enforceTimingBounds({
    suggestedDurationMs,
    minDurationMs,
    maxDurationMs,
    pacing: inferPacingFromRoleAndImportance(blueprint),
    reason: `Dynamic timing allocated ${suggestedDurationMs}ms for ${blueprint.role}/${blueprint.kind}.`,
  });
}

/** Allocates target duration across blueprints using role/importance weights. */
export function allocateDurationAcrossBlueprints(
  blueprints: SceneBlueprint[],
  targetDurationMs: number,
): TimingBlueprint[] {
  if (blueprints.length === 0) {
    return [];
  }

  const weights = blueprints.map((blueprint) => calculateBlueprintTimingWeight(blueprint));
  const allocations = normalizeDurationAllocation(weights, targetDurationMs);

  return blueprints.map((blueprint, index) =>
    buildTimingBlueprint(blueprint, allocations[index] ?? STUDIO_INTELLIGENCE_MIN_SCENE_DURATION_MS),
  );
}

function cloneBlueprintWithTiming(blueprint: SceneBlueprint, timing: TimingBlueprint): SceneBlueprint {
  return {
    ...blueprint,
    timing,
    importance: { ...blueprint.importance },
    visual: { ...blueprint.visual },
    asset: { ...blueprint.asset },
    motion: { ...blueprint.motion },
    caption: {
      ...blueprint.caption,
      highlightWords: [...blueprint.caption.highlightWords],
    },
    confidence: clampBlueprintConfidence(blueprint.confidence + 0.02),
  };
}

/** Applies dynamic timing allocation to a blueprint collection. */
export function applyDynamicTiming(
  collection: SceneBlueprintCollection,
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): SceneBlueprintCollection {
  void resolvePlannerStrategy(input, strategy);
  if (collection.blueprints.length === 0) {
    return createEmptySceneBlueprintCollection();
  }

  const targetDurationMs = calculateTargetDurationMs(input, collection);
  const timings = allocateDurationAcrossBlueprints(collection.blueprints, targetDurationMs);
  const blueprints = collection.blueprints.map((blueprint, index) =>
    cloneBlueprintWithTiming(blueprint, timings[index] ?? blueprint.timing),
  );
  const stats = calculateBlueprintCollectionStats(blueprints);

  return {
    blueprints,
    ...stats,
    warnings: [...collection.warnings],
  };
}
