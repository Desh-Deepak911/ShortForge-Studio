/**
 * Sorted, unique, eligible-only claim-id relationship union — Sprint 10D.
 * Union of controlling-idea refs + beat grounding refs + hook-handoff claimIds.
 * IDs only — never claim text.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import { isClaimEligibleForControllingIdeaSupport } from "../strategy/retention-claim-support";
import type {
  RetentionBeat,
  RetentionHookHandoff,
} from "./retention-story-plan.types";

export function buildRetentionClaimIdRelationships(input: {
  readonly controllingIdeaClaimRefs: readonly string[];
  readonly beats: readonly RetentionBeat[];
  readonly hookHandoff: RetentionHookHandoff;
  readonly grounding: RetentionGroundingContext;
}): readonly string[] {
  const union = new Set<string>();
  for (const ref of input.controllingIdeaClaimRefs) union.add(ref);
  for (const beat of input.beats) {
    for (const ref of beat.groundingClaimRefs) union.add(ref);
  }
  for (const ref of input.hookHandoff.groundingRequirements.claimIds) {
    union.add(ref);
  }

  const eligible = [...union].filter((claimId) =>
    isClaimEligibleForControllingIdeaSupport(input.grounding, claimId),
  );
  eligible.sort((a, b) => a.localeCompare(b));
  return Object.freeze(eligible);
}
