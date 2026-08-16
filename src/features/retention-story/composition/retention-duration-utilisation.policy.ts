/**
 * Story-level duration utilisation — story-quality Prompt 3.
 * One story budget. Beats are not equal narration boxes.
 * Minimum utilisation is class-specific, not one unexplained percentage.
 */

import { resolveStoryDurationClass } from "../domain/resolve-format-strategy";
import type { StoryDurationClass } from "../domain/retention-story-contract.types";
import { RETENTION_WORDS_PER_SECOND } from "../planning/retention-story-plan.constants";
import type { RetentionDurationUtilisationPolicy } from "./retention-composition-brief.types";

export const RETENTION_DURATION_UTILISATION_POLICY_VERSION =
  "retention-duration-utilisation/1" as const;

const CLASS_MINIMUM: Record<
  Exclude<StoryDurationClass, "long_form">,
  { readonly minimumUtilisation: number; readonly rationale: string }
> = {
  ultra_short: {
    minimumUtilisation: 0.58,
    rationale:
      "15–24s must land hook, one evidence move, and payoff; there is no room for optional padding.",
  },
  short: {
    minimumUtilisation: 0.66,
    rationale:
      "25–35s must carry evidence plus consequence after the opening, still without filler bridges.",
  },
  extended: {
    minimumUtilisation: 0.72,
    rationale:
      "36–60s should use optional detail when the contract has it, not repeated transitions.",
  },
};

export function resolveRetentionDurationUtilisationPolicy(input: {
  readonly durationSec: number;
  readonly storyHardWordBudget?: number;
}): RetentionDurationUtilisationPolicy {
  const durationClass = resolveStoryDurationClass(input.durationSec);
  const hard =
    input.storyHardWordBudget ??
    Math.round(input.durationSec * RETENTION_WORDS_PER_SECOND);
  const classKey = durationClass === "long_form" ? "extended" : durationClass;
  const spec = CLASS_MINIMUM[classKey];
  const minimumUsefulWords = Math.max(12, Math.floor(hard * spec.minimumUtilisation));
  const storyTargetWordBudget = Math.max(
    minimumUsefulWords,
    Math.floor(hard * 0.88),
  );
  return Object.freeze({
    durationClass,
    durationSec: input.durationSec,
    storyTargetWordBudget,
    storyHardWordBudget: hard,
    minimumUtilisation: spec.minimumUtilisation,
    minimumUsefulWords,
    rationale: spec.rationale,
  });
}
