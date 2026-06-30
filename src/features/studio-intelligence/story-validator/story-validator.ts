import type { StudioIntelligenceResult } from "../studio-intelligence.types";
import { evaluateAllStoryCoherenceRules } from "./story-validator.rules";
import type { StoryValidationResult } from "./story-validator.types";
import {
  STORY_VALIDATOR_VERSION,
  aggregateRuleScore,
  buildRepairCandidates,
  buildRepairSuggestions,
  buildValidatorContext,
  clampValidatorScore,
  collectOverallWarnings,
} from "./story-validator.utils";

function computeCoherenceScore(ruleResults: StoryValidationResult["ruleResults"]): number {
  if (ruleResults.length === 0) {
    return 0;
  }

  const weightedTotal = ruleResults.reduce((total, rule) => {
    const weight =
      rule.ruleId === "hook_opener" ||
      rule.ruleId === "payoff_closer" ||
      rule.ruleId === "arc_order" ||
      rule.ruleId === "mode_template_consistency"
        ? 1.35
        : 1;

    return total + rule.score * weight;
  }, 0);

  const weightSum = ruleResults.reduce((total, rule) => {
    const weight =
      rule.ruleId === "hook_opener" ||
      rule.ruleId === "payoff_closer" ||
      rule.ruleId === "arc_order" ||
      rule.ruleId === "mode_template_consistency"
        ? 1.35
        : 1;

    return total + weight;
  }, 0);

  return clampValidatorScore(weightedTotal / weightSum);
}

/** Validates story coherence for a completed Studio Intelligence planning result. */
export function validateStoryCoherence(result: StudioIntelligenceResult): StoryValidationResult {
  const context = buildValidatorContext(result);
  const ruleResults = evaluateAllStoryCoherenceRules(result, context);
  const repairSuggestions = buildRepairSuggestions(result, ruleResults);
  const repairCandidates = buildRepairCandidates(result, ruleResults);

  return {
    validatorVersion: STORY_VALIDATOR_VERSION,
    coherenceScore: computeCoherenceScore(ruleResults),
    hookScore: aggregateRuleScore(ruleResults, ["hook_opener", "hook_strength"]),
    payoffScore: aggregateRuleScore(ruleResults, ["payoff_closer", "payoff_strength"]),
    arcScore: aggregateRuleScore(ruleResults, ["arc_order"]),
    visualScore: aggregateRuleScore(ruleResults, ["visual_diversity", "motion_diversity"]),
    timingScore: aggregateRuleScore(ruleResults, ["scene_density", "duration_consistency"]),
    captionScore: aggregateRuleScore(ruleResults, ["caption_diversity"]),
    templateScore: aggregateRuleScore(ruleResults, [
      "mode_template_consistency",
      "template_slot_coverage",
    ]),
    overallWarnings: collectOverallWarnings(ruleResults),
    repairSuggestions,
    repairCandidates,
    ruleResults,
    validatedStrategyId: result.strategyId,
    validatedAt: new Date().toISOString(),
  };
}

/** Returns whether a planning result meets the minimum coherence threshold. */
export function isStoryCoherent(
  result: StudioIntelligenceResult,
  threshold = 0.8,
): boolean {
  return validateStoryCoherence(result).coherenceScore >= threshold;
}

export function createEmptyStoryValidationResult(
  strategyId: StudioIntelligenceResult["strategyId"] = "default",
): StoryValidationResult {
  return {
    validatorVersion: STORY_VALIDATOR_VERSION,
    coherenceScore: 0,
    hookScore: 0,
    payoffScore: 0,
    arcScore: 0,
    visualScore: 0,
    timingScore: 0,
    captionScore: 0,
    templateScore: 0,
    overallWarnings: ["No planning output to validate."],
    repairSuggestions: [],
    repairCandidates: [],
    ruleResults: [],
    validatedStrategyId: strategyId,
    validatedAt: new Date(0).toISOString(),
  };
}
