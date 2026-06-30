import {
  DEFAULT_STORY_STRATEGY_ID,
  SCRIPT_MODE_TO_STORY_STRATEGY_ID,
  STORY_STRATEGY_ALIASES,
  STORY_STRATEGY_IDS,
} from "./story-strategy.constants";
import { getStoryStrategyById, STORY_STRATEGY_REGISTRY } from "./story-strategy.registry";
import type { StoryStrategy, StoryStrategyId, StoryStrategyModeInput } from "./story-strategy.types";

/** Normalizes a mode input into a lookup key. */
export function normalizeStoryStrategyModeInput(mode: StoryStrategyModeInput): string {
  if (mode == null) {
    return DEFAULT_STORY_STRATEGY_ID;
  }

  return String(mode).trim().toLowerCase().replace(/\s+/g, "_");
}

/** Maps a script mode or alias to a story strategy identifier. */
export function mapModeToStoryStrategyId(mode: StoryStrategyModeInput): StoryStrategyId | undefined {
  const normalized = normalizeStoryStrategyModeInput(mode);

  if ((STORY_STRATEGY_IDS as readonly string[]).includes(normalized)) {
    return normalized as StoryStrategyId;
  }

  return STORY_STRATEGY_ALIASES[normalized] ?? SCRIPT_MODE_TO_STORY_STRATEGY_ID[normalized];
}

/** Resolves an immutable story strategy for a requested mode. */
export function resolveStoryStrategy(mode: StoryStrategyModeInput): StoryStrategy {
  const strategyId = mapModeToStoryStrategyId(mode) ?? DEFAULT_STORY_STRATEGY_ID;
  return getStoryStrategyById(strategyId);
}

/** Returns the default story strategy. */
export function getDefaultStoryStrategy(): StoryStrategy {
  return getStoryStrategyById(DEFAULT_STORY_STRATEGY_ID);
}

/** Checks whether a mode resolves to a known strategy id. */
export function isKnownStoryStrategyMode(mode: StoryStrategyModeInput): boolean {
  return mapModeToStoryStrategyId(mode) != null;
}

/** Lists all registered story strategy identifiers. */
export function listStoryStrategyIds(): readonly StoryStrategyId[] {
  return STORY_STRATEGY_IDS;
}

/** Returns the full immutable strategy registry. */
export function getStoryStrategyRegistry(): Readonly<Record<StoryStrategyId, StoryStrategy>> {
  return STORY_STRATEGY_REGISTRY;
}
