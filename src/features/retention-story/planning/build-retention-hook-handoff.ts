/**
 * Derive the Retention → Hook handoff contract — Sprint 10D.
 *
 * Derived AFTER the beat plan is complete, from the first/second beats, the
 * controlling idea, the ending strategy, and first-beat grounding. Contains no
 * Hook engine IDs, Hook text, or Hook thresholds. Fully deterministic.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import { isClaimEligibleForControllingIdeaSupport } from "../strategy/retention-claim-support";
import { resolveRetentionDeterministicSubjectAnchor } from "../strategy/resolve-retention-deterministic-subject-anchor";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import {
  retentionBeatTextHasForbiddenMarker,
  sanitizeRetentionBeatText,
} from "./retention-beat-semantics";
import { RETENTION_MAX_HANDOFF_TEXT_CHARS } from "./retention-story-plan.constants";
import type {
  RetentionBeat,
  RetentionHookHandoff,
  RetentionHookHandoffControllingIdeaRelation,
} from "./retention-story-plan.types";

function safeHandoffText(raw: string): string {
  const canonical = sanitizeRetentionBeatText(
    raw,
    RETENTION_MAX_HANDOFF_TEXT_CHARS,
  );
  if (!canonical || retentionBeatTextHasForbiddenMarker(canonical)) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Derived hook handoff text failed Retention safety bounds.",
    );
  }
  return canonical;
}

export function buildRetentionHookHandoff(input: {
  readonly contract: NormalizedStoryContract;
  readonly seed: RetentionStrategySeed;
  readonly beats: readonly RetentionBeat[];
  readonly grounding: RetentionGroundingContext;
}): RetentionHookHandoff {
  const { contract, seed, beats, grounding } = input;
  const first = beats[0];
  const second = beats[1];
  if (!first || !second) {
    throw new RetentionStoryError(
      "retention_story_plan_mismatch",
      "Hook handoff requires at least two ordered beats.",
    );
  }

  const controllingIdeaRelation: RetentionHookHandoffControllingIdeaRelation =
    contract.endingStrategy === "open_loop" ? "teases" : "establishes";

  const subject =
    resolveRetentionDeterministicSubjectAnchor(contract.topic) ?? "this contest";

  const openingPsychologicalFunction = safeHandoffText(
    `Spark ${seed.emotionalArcBlueprint.primaryEmotion} and frame the central stakes of ${subject}.`,
  );
  const desiredTransitionIntoBody = safeHandoffText(
    `Carry momentum from the opening into the ${second.purpose} beat of ${subject}.`,
  );

  const claimIds = [
    ...new Set([
      ...first.groundingClaimRefs,
      ...seed.controllingIdeaClaimRefs,
    ]),
  ]
    .filter((claimId) =>
      isClaimEligibleForControllingIdeaSupport(grounding, claimId),
    )
    .sort((a, b) => a.localeCompare(b));

  return Object.freeze({
    version: 1 as const,
    openingPsychologicalFunction,
    controllingIdeaRelation,
    nextBeatPurpose: second.purpose,
    desiredTransitionIntoBody,
    groundingRequirements: Object.freeze({
      requireEligibleClaimRefs: claimIds.length > 0,
      claimIds: Object.freeze(claimIds),
    }),
  });
}
