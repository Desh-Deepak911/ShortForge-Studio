import type { StoryStrategyId } from "../story-strategy/story-strategy.types";

/** Semantic version for the story coherence validator contract. */
export type StoryValidatorVersion = string;

/** Canonical rule identifiers evaluated by the story coherence validator. */
export type StoryCoherenceRuleId =
  | "hook_opener"
  | "payoff_closer"
  | "mode_template_consistency"
  | "duplicate_intro"
  | "duplicate_ending"
  | "arc_order"
  | "hook_strength"
  | "payoff_strength"
  | "scene_density"
  | "duration_consistency"
  | "visual_diversity"
  | "motion_diversity"
  | "caption_diversity"
  | "template_slot_coverage"
  | "planning_confidence";

/** Outcome of a single coherence rule evaluation. */
export interface StoryCoherenceRuleResult {
  ruleId: StoryCoherenceRuleId;
  passed: boolean;
  /** Normalized score in `[0, 1]`. */
  score: number;
  message?: string;
}

/** Planning-only repair suggestion — does not mutate blueprints. */
export interface StoryRepairSuggestion {
  id: string;
  category:
    | "hook"
    | "payoff"
    | "merge"
    | "split"
    | "template"
    | "visual"
    | "timing"
    | "arc"
    | "density"
    | "cta";
  message: string;
  targetBlueprintIds?: readonly string[];
  priority: "low" | "medium" | "high";
}

/** Blueprint-level repair candidate surfaced by the validator. */
export interface StoryRepairCandidate {
  blueprintId: string;
  sceneIndex: number;
  issue: string;
  suggestedAction: string;
}

/** Aggregate story coherence validation output attached to a planning run. */
export interface StoryValidationResult {
  validatorVersion: StoryValidatorVersion;
  coherenceScore: number;
  hookScore: number;
  payoffScore: number;
  arcScore: number;
  visualScore: number;
  timingScore: number;
  captionScore: number;
  templateScore: number;
  overallWarnings: readonly string[];
  repairSuggestions: readonly StoryRepairSuggestion[];
  repairCandidates: readonly StoryRepairCandidate[];
  ruleResults: readonly StoryCoherenceRuleResult[];
  validatedStrategyId: StoryStrategyId;
  validatedAt: string;
}

/** Internal context passed to individual rule evaluators. */
export interface StoryValidatorContext {
  targetDurationMs: number;
  modeTemplateId?: StoryStrategyId;
  templateSlotsMatched?: number;
  templateFallbacks?: readonly string[];
}
