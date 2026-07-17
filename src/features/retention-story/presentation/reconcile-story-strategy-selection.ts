/**
 * Pure Story Strategy ↔ duration reconciliation — Sprint 10G.
 * No React state side effects. Never silently sends a different explicit strategy.
 */

import {
  isStoryStrategyCompatibleWithDuration,
  type StoryStrategySelection,
} from "./story-strategy-selection";

export interface StoryStrategyReconciliationResult {
  readonly selection: StoryStrategySelection;
  /** Set when selection was reset to Auto; otherwise null. */
  readonly compatibilityNotice: string | null;
}

export const STORY_STRATEGY_INCOMPATIBLE_RESET_NOTICE =
  "Story strategy reset to Auto — the previous strategy isn’t available for this duration.";

/**
 * Pure: current Story Strategy + next duration → compatible selection or Auto.
 */
export function reconcileStoryStrategySelection(
  current: StoryStrategySelection,
  nextDurationSec: number,
): StoryStrategyReconciliationResult {
  if (
    current === "auto" ||
    isStoryStrategyCompatibleWithDuration(current, nextDurationSec)
  ) {
    return { selection: current, compatibilityNotice: null };
  }
  return {
    selection: "auto",
    compatibilityNotice: STORY_STRATEGY_INCOMPATIBLE_RESET_NOTICE,
  };
}
