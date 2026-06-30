import type { ScriptMode } from "@/types/footiebitz";

import type { SceneBlueprintRole } from "../scene-blueprint.types";
import { resolveSupportedStoryStructure } from "../studio-intelligence.constants";
import type { StudioIntelligenceInput, VisualIntentType } from "../studio-intelligence.types";
import type { StoryStrategy, StoryStrategyId } from "./story-strategy.types";
import { getDefaultStoryStrategy, resolveStoryStrategy } from "./story-strategy.utils";

const STRATEGY_ID_TO_SCRIPT_MODE: Readonly<Record<StoryStrategyId, ScriptMode>> = {
  default: "story",
  history: "historical_explainer",
  debate: "opinion_debate",
  comparison: "story",
  countdown: "top_5",
  biography: "player_analysis",
  match_preview: "match_preview",
  tactical_analysis: "tactical_review",
  news: "match_recap",
};

/** Resolves the planner strategy from an explicit strategy or input mode. */
export function resolvePlannerStrategy(
  input?: StudioIntelligenceInput,
  strategy?: StoryStrategy,
): StoryStrategy {
  if (strategy) {
    return strategy;
  }

  if (input?.mode != null) {
    return resolveStoryStrategy(input.mode);
  }

  return getDefaultStoryStrategy();
}

/** Maps a resolved strategy to a recommended script mode label. */
export function resolveScriptModeFromStrategy(strategy: StoryStrategy): ScriptMode {
  return strategy.scriptModes?.[0] ?? STRATEGY_ID_TO_SCRIPT_MODE[strategy.id] ?? "story";
}

/** Returns intro visual override previously derived from script mode. */
export function strategyIntroVisualOverride(
  strategy: StoryStrategy,
  role: SceneBlueprintRole,
): VisualIntentType | undefined {
  if (role !== "intro") {
    return undefined;
  }

  switch (strategy.id) {
    case "match_preview":
    case "news":
      return "match_action";
    case "countdown":
      return "text_card";
    case "debate":
    case "comparison":
      return "comparison_split";
    case "tactical_analysis":
      return "stat_overlay";
    case "history":
      return "archive_footage";
    default:
      return undefined;
  }
}

/** Returns fallback asset query previously derived from script mode. */
export function strategyFallbackQuery(strategy: StoryStrategy): string {
  switch (strategy.id) {
    case "news":
      return "football match highlights";
    case "match_preview":
      return "football match preview atmosphere";
    case "countdown":
      return "football ranked list graphic";
    case "debate":
      return "football debate split comparison";
    case "biography":
      return "football player portrait action";
    case "tactical_analysis":
      return "football tactical analysis overlay";
    case "history":
      return "football archive historical footage";
    default:
      return "football story highlights";
  }
}

/** Builds a structure plan label from a resolved story strategy. */
export function resolveStructureLabelFromStrategy(strategy: StoryStrategy): string {
  return resolveSupportedStoryStructure(strategy.preferredStructure)?.label ?? "Hook → Story → Payoff";
}
