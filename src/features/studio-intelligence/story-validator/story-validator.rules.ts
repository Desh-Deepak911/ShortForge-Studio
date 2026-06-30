import type { StudioIntelligenceResult } from "../studio-intelligence.types";
import type { StoryCoherenceRuleResult, StoryValidatorContext } from "./story-validator.types";
import {
  clampValidatorScore,
  countRoleOccurrences,
  isHookBlueprint,
  isPayoffBlueprint,
  modeTemplateConsistencyScore,
  scoreArcOrder,
  scoreDurationConsistency,
  scoreHookStrength,
  scorePayoffStrength,
  scoreSceneDensity,
  scoreTemplateSlotCoverage,
  computeDiversityRatio,
} from "./story-validator.utils";

const INTRO_ROLES = new Set(["intro"]);
const ENDING_ROLES = new Set(["payoff", "ending", "cta"]);

const HOOK_OPENER_THRESHOLD = 0.55;
const PAYOFF_STRENGTH_THRESHOLD = 0.55;
const DIVERSITY_THRESHOLD = 0.45;
const CONFIDENCE_THRESHOLD = 0.55;
const TEMPLATE_COVERAGE_THRESHOLD = 0.5;

function diversityPassThreshold(strategyId: StudioIntelligenceResult["strategyId"]): number {
  switch (strategyId) {
    case "countdown":
      return 0.15;
    case "news":
    case "biography":
      return 0.3;
    default:
      return DIVERSITY_THRESHOLD;
  }
}

function adjustDiversityScore(result: StudioIntelligenceResult, baseScore: number): number {
  if (result.strategyId === "countdown") {
    const rankedCount = result.sceneBlueprintCollection.blueprints.filter(
      (blueprint) => blueprint.kind === "ranked_reveal",
    ).length;

    if (rankedCount >= 3) {
      return clampValidatorScore(Math.max(baseScore, 0.72));
    }
  }

  if (result.strategyId === "debate" || result.strategyId === "comparison") {
    const hasComparison = result.sceneBlueprintCollection.blueprints.some(
      (blueprint) =>
        blueprint.visual.visualIntentType === "comparison_split" ||
        blueprint.kind === "debate_split" ||
        blueprint.kind === "comparison",
    );

    if (hasComparison) {
      return clampValidatorScore(Math.max(baseScore, 0.55));
    }
  }

  return baseScore;
}

function rule(
  ruleId: StoryCoherenceRuleResult["ruleId"],
  score: number,
  message: string,
  passThreshold = 0.6,
): StoryCoherenceRuleResult {
  const normalized = clampValidatorScore(score);

  return {
    ruleId,
    passed: normalized >= passThreshold,
    score: normalized,
    message: normalized >= passThreshold ? undefined : message,
  };
}

export function evaluateHookOpenerRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const blueprints = result.sceneBlueprintCollection.blueprints;
  const first = blueprints[0];
  const hookBeat = result.beats.some((beat) => beat.type === "hook");

  if (!first && !hookBeat) {
    return rule("hook_opener", 0, "Story does not start with a hook scene or beat.");
  }

  let score = hookBeat ? 0.45 : 0.2;

  if (first && isHookBlueprint(first)) {
    score += 0.45;
  } else if (first && (first.kind === "ranked_reveal" || first.kind === "text_card")) {
    score += 0.35;
  }

  if (result.metrics.hookDetected) {
    score += 0.1;
  }

  if (result.strategyId === "countdown" && first?.title.toLowerCase().includes("hook")) {
    score += 0.1;
  }

  return rule("hook_opener", score, "Story should start with a hook opener scene.");
}

export function evaluatePayoffCloserRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const blueprints = result.sceneBlueprintCollection.blueprints;
  const last = blueprints[blueprints.length - 1];
  const payoffBeat = result.beats.some(
    (beat) => beat.type === "payoff" || beat.type === "conclusion" || beat.type === "cta",
  );

  if (!last && !payoffBeat) {
    return rule("payoff_closer", 0, "Story does not end with a payoff or CTA scene.");
  }

  let score = payoffBeat ? 0.4 : 0.15;

  if (last && isPayoffBlueprint(last)) {
    score += 0.45;
  }

  if (result.metrics.ctaDetected) {
    score += 0.1;
  }

  return rule("payoff_closer", score, "Story should end with a payoff, ending, or CTA scene.");
}

export function evaluateModeTemplateConsistencyRule(
  result: StudioIntelligenceResult,
): StoryCoherenceRuleResult {
  const score = modeTemplateConsistencyScore(result);

  return rule(
    "mode_template_consistency",
    score,
    "Mode template id does not match resolved story strategy or template was not applied.",
    0.65,
  );
}

export function evaluateDuplicateIntroRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const introScenes = countRoleOccurrences(result.sceneBlueprintCollection.blueprints, INTRO_ROLES);
  const duplicateCount = Math.max(0, introScenes.length - 1);

  if (duplicateCount === 0) {
    return rule("duplicate_intro", 1, "Duplicate intro scenes detected.", 0.5);
  }

  return rule(
    "duplicate_intro",
    clampValidatorScore(1 - duplicateCount * 0.35),
    `Duplicate intro scenes detected (${introScenes.length}).`,
    0.85,
  );
}

export function evaluateDuplicateEndingRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const endingScenes = countRoleOccurrences(result.sceneBlueprintCollection.blueprints, ENDING_ROLES);
  const duplicateCount = Math.max(0, endingScenes.length - 1);

  if (duplicateCount === 0) {
    return rule("duplicate_ending", 1, "Duplicate ending scenes detected.", 0.5);
  }

  return rule(
    "duplicate_ending",
    clampValidatorScore(1 - duplicateCount * 0.3),
    `Duplicate ending scenes detected (${endingScenes.length}).`,
    0.85,
  );
}

export function evaluateArcOrderRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const score = scoreArcOrder(result.arcs);

  return rule("arc_order", score, "Narrative arc order regresses — expected opening → development → ending flow.");
}

export function evaluateHookStrengthRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const first = result.sceneBlueprintCollection.blueprints[0];
  const score = scoreHookStrength(first);

  return rule(
    "hook_strength",
    score,
    "Hook strength is weak — opening scene lacks punchy pacing or importance.",
    HOOK_OPENER_THRESHOLD,
  );
}

export function evaluatePayoffStrengthRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const blueprints = result.sceneBlueprintCollection.blueprints;
  const last = blueprints[blueprints.length - 1];
  const score = scorePayoffStrength(last);

  return rule(
    "payoff_strength",
    score,
    "Payoff strength is weak — closing scene lacks sufficient importance or CTA role.",
    PAYOFF_STRENGTH_THRESHOLD,
  );
}

export function evaluateSceneDensityRule(
  result: StudioIntelligenceResult,
  context: StoryValidatorContext,
): StoryCoherenceRuleResult {
  const score = scoreSceneDensity(result.sceneBlueprintCollection, context.targetDurationMs);

  return rule("scene_density", score, "Scene density is inconsistent with target duration.");
}

export function evaluateDurationConsistencyRule(
  result: StudioIntelligenceResult,
  context: StoryValidatorContext,
): StoryCoherenceRuleResult {
  const score = scoreDurationConsistency(result.sceneBlueprintCollection, context.targetDurationMs);

  return rule("duration_consistency", score, "Blueprint total or per-scene durations drift from target envelope.");
}

export function evaluateVisualDiversityRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const intents = result.sceneBlueprintCollection.blueprints.map(
    (blueprint) => blueprint.visual.visualIntentType,
  );
  const score = adjustDiversityScore(result, computeDiversityRatio(intents));

  return rule(
    "visual_diversity",
    score,
    "Visual intent diversity is low — too many repeated visual treatments.",
    diversityPassThreshold(result.strategyId),
  );
}

export function evaluateMotionDiversityRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const motions = result.sceneBlueprintCollection.blueprints.map(
    (blueprint) => blueprint.motion.suggestedMotion,
  );
  const score = adjustDiversityScore(result, computeDiversityRatio(motions));

  return rule(
    "motion_diversity",
    score,
    "Motion diversity is low — too many repeated motion presets.",
    diversityPassThreshold(result.strategyId),
  );
}

export function evaluateCaptionDiversityRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const captions = result.sceneBlueprintCollection.blueprints.map(
    (blueprint) => blueprint.caption.captionStyleHint,
  );
  const score = adjustDiversityScore(result, computeDiversityRatio(captions));

  return rule(
    "caption_diversity",
    score,
    "Caption style diversity is low — vary emphasis across beats.",
    diversityPassThreshold(result.strategyId),
  );
}

export function evaluateTemplateSlotCoverageRule(
  result: StudioIntelligenceResult,
  context: StoryValidatorContext,
): StoryCoherenceRuleResult {
  const score = scoreTemplateSlotCoverage(result, context);

  return rule(
    "template_slot_coverage",
    score,
    "Template slot coverage is incomplete — mode template slots are under-represented.",
    TEMPLATE_COVERAGE_THRESHOLD,
  );
}

export function evaluatePlanningConfidenceRule(result: StudioIntelligenceResult): StoryCoherenceRuleResult {
  const collectionConfidence = result.sceneBlueprintCollection.confidence;
  const metricsConfidence = result.metrics.confidence;
  const score = clampValidatorScore((collectionConfidence + metricsConfidence) / 2);

  return rule(
    "planning_confidence",
    score,
    "Planning confidence is below acceptable threshold.",
    CONFIDENCE_THRESHOLD,
  );
}

export function evaluateAllStoryCoherenceRules(
  result: StudioIntelligenceResult,
  context: StoryValidatorContext,
): StoryCoherenceRuleResult[] {
  return [
    evaluateHookOpenerRule(result),
    evaluatePayoffCloserRule(result),
    evaluateModeTemplateConsistencyRule(result),
    evaluateDuplicateIntroRule(result),
    evaluateDuplicateEndingRule(result),
    evaluateArcOrderRule(result),
    evaluateHookStrengthRule(result),
    evaluatePayoffStrengthRule(result),
    evaluateSceneDensityRule(result, context),
    evaluateDurationConsistencyRule(result, context),
    evaluateVisualDiversityRule(result),
    evaluateMotionDiversityRule(result),
    evaluateCaptionDiversityRule(result),
    evaluateTemplateSlotCoverageRule(result, context),
    evaluatePlanningConfidenceRule(result),
  ];
}
