export type {
  StoryCoherenceRuleId,
  StoryCoherenceRuleResult,
  StoryRepairCandidate,
  StoryRepairSuggestion,
  StoryValidationResult,
  StoryValidatorContext,
  StoryValidatorVersion,
} from "./story-validator.types";

export {
  STORY_VALIDATOR_VERSION,
  aggregateRuleScore,
  buildRepairCandidates,
  buildRepairSuggestions,
  buildValidatorContext,
  clampValidatorScore,
  collectOverallWarnings,
  computeDiversityRatio,
  countRoleOccurrences,
  isHookBlueprint,
  isPayoffBlueprint,
  modeTemplateConsistencyScore,
  resolveTargetDurationMs,
  scoreArcOrder,
  scoreDurationConsistency,
  scoreHookStrength,
  scorePayoffStrength,
  scoreSceneDensity,
  scoreTemplateSlotCoverage,
} from "./story-validator.utils";

export {
  evaluateAllStoryCoherenceRules,
  evaluateArcOrderRule,
  evaluateCaptionDiversityRule,
  evaluateDuplicateEndingRule,
  evaluateDuplicateIntroRule,
  evaluateDurationConsistencyRule,
  evaluateHookOpenerRule,
  evaluateHookStrengthRule,
  evaluateModeTemplateConsistencyRule,
  evaluateMotionDiversityRule,
  evaluatePayoffCloserRule,
  evaluatePayoffStrengthRule,
  evaluatePlanningConfidenceRule,
  evaluateSceneDensityRule,
  evaluateTemplateSlotCoverageRule,
  evaluateVisualDiversityRule,
} from "./story-validator.rules";

export {
  createEmptyStoryValidationResult,
  isStoryCoherent,
  validateStoryCoherence,
} from "./story-validator";
