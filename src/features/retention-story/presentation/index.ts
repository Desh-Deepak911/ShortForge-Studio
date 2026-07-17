/**
 * Client-safe Retention Story presentation — Sprint 10G.
 * Create / Review UI import from here only (not production barrels).
 */

export type {
  StoryStrategyCatalogEntry,
  StoryStrategyExplicitSelection,
  StoryStrategySelection,
} from "./story-strategy-selection";

export {
  STORY_STRATEGY_CATALOG,
  STORY_STRATEGY_NON_SELECTABLE_IDS,
  assertStoryStrategyAllowed,
  formatStrategyIdFromStoryStrategy,
  getStoryStrategyCatalogEntry,
  isNonSelectableStoryStrategyId,
  isStoryStrategyCompatibleWithDuration,
  isStoryStrategyExplicitSelection,
  isStoryStrategySelection,
  listCompatibleStoryStrategySelections,
  parseStoryStrategySelection,
  predictAutoStoryStrategy,
  resolvedFormatStrategyLabel,
  storyStrategyDescription,
  storyStrategyLabel,
} from "./story-strategy-selection";

export type { StoryStrategyReconciliationResult } from "./reconcile-story-strategy-selection";
export {
  STORY_STRATEGY_INCOMPATIBLE_RESET_NOTICE,
  reconcileStoryStrategySelection,
} from "./reconcile-story-strategy-selection";

export type {
  RetentionExplainabilityModel,
  RetentionExplainabilityRow,
} from "./retention-explainability";

export {
  RETENTION_EXPLAINABILITY_FORBIDDEN_PHRASES,
  buildRetentionExplainabilityModel,
  explainabilityTextContainsForbiddenScoreLanguage,
} from "./retention-explainability";
