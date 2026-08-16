/**
 * Opening / Hook claim-ref authority helpers — Sprint 10E.1 / 10E.1A.
 *
 * Controlling-idea claim authority is exclusively
 * `assertedSeed.controllingIdeaClaimRefs`. Caller-supplied duplicate arrays
 * are never accepted.
 */

import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";

/**
 * Plan-authorized opening claim IDs:
 * first-beat grounding ∪ asserted-seed CI refs ∪ Hook handoff claimIds.
 */
export function resolvePlanAuthorizedOpeningClaimIds(
  plan: RetentionStoryPlan,
  strategySeed: RetentionStrategySeed,
): ReadonlySet<string> {
  const ids = new Set<string>();
  const first = plan.beatPlan.beats[0];
  if (first) {
    for (const id of first.groundingClaimRefs) ids.add(id);
  }
  for (const id of strategySeed.controllingIdeaClaimRefs) ids.add(id);
  for (const id of plan.hookHandoff.groundingRequirements.claimIds) {
    ids.add(id);
  }
  return ids;
}

/**
 * Composer eligible-claim ID universe:
 * plan relationship union ∪ exact asserted-seed controlling-idea refs.
 * Never widened by caller-owned arrays.
 */
export function resolvePlanAuthorizedComposerClaimIds(
  plan: RetentionStoryPlan,
  strategySeed: RetentionStrategySeed,
): ReadonlySet<string> {
  const ids = new Set<string>(plan.claimIdRelationships);
  for (const id of strategySeed.controllingIdeaClaimRefs) ids.add(id);
  for (const beat of plan.beatPlan.beats) {
    for (const id of beat.groundingClaimRefs) ids.add(id);
  }
  for (const id of plan.hookHandoff.groundingRequirements.claimIds) {
    ids.add(id);
  }
  return ids;
}

/** Beat-local claim authority: beat refs ∪ seed CI refs ∪ handoff refs. */
export function resolveAuthorizedClaimIdsForBeat(
  beatId: string,
  plan: RetentionStoryPlan,
  strategySeed: RetentionStrategySeed,
): ReadonlySet<string> {
  const beat = plan.beatPlan.beats.find((b) => b.id === beatId);
  const ids = new Set<string>();
  if (beat) {
    for (const id of beat.groundingClaimRefs) ids.add(id);
  }
  for (const id of strategySeed.controllingIdeaClaimRefs) ids.add(id);
  for (const id of plan.hookHandoff.groundingRequirements.claimIds) {
    ids.add(id);
  }
  if (beat?.payoffRelation === "deliver") {
    for (const id of resolvePlanAuthorizedComposerClaimIds(plan, strategySeed)) {
      ids.add(id);
    }
  }
  return ids;
}
