import type { StoryStrategyId } from "./story-strategy.types";

export const STORY_STRATEGY_VERSION = "0.1.0";

export const DEFAULT_STORY_STRATEGY_ID: StoryStrategyId = "default";

export const STORY_STRATEGY_IDS: readonly StoryStrategyId[] = [
  "default",
  "history",
  "debate",
  "comparison",
  "countdown",
  "biography",
  "match_preview",
  "tactical_analysis",
  "news",
] as const;

/** Maps FootieScript script modes to story strategy identifiers. */
export const SCRIPT_MODE_TO_STORY_STRATEGY_ID: Readonly<Record<string, StoryStrategyId>> = {
  story: "default",
  match_recap: "news",
  historical_explainer: "history",
  opinion_debate: "debate",
  top_5: "countdown",
  player_analysis: "biography",
  match_preview: "match_preview",
  tactical_review: "tactical_analysis",
};

/** Alias labels accepted by the resolver. */
export const STORY_STRATEGY_ALIASES: Readonly<Record<string, StoryStrategyId>> = {
  default: "default",
  story: "default",
  general: "default",
  history: "history",
  historical: "history",
  historical_explainer: "history",
  debate: "debate",
  opinion: "debate",
  opinion_debate: "debate",
  comparison: "comparison",
  compare: "comparison",
  versus: "comparison",
  countdown: "countdown",
  top_5: "countdown",
  ranked: "countdown",
  biography: "biography",
  player: "biography",
  player_analysis: "biography",
  match_preview: "match_preview",
  preview: "match_preview",
  tactical_analysis: "tactical_analysis",
  tactical: "tactical_analysis",
  tactical_review: "tactical_analysis",
  news: "news",
  recap: "news",
  match_recap: "news",
};
