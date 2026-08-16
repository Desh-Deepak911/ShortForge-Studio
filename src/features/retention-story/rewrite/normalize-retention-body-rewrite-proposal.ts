/**
 * Normalize a Studio body-rewrite proposal — Sprint 10F.2.
 * Reuses the structured composer proposal normalizer.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import {
  normalizeRetentionComposerProposal,
  type NormalizedRetentionComposerProposal,
  type NormalizeRetentionComposerProposalExtras,
} from "../composition/normalize-retention-composer-proposal";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";

export function normalizeRetentionBodyRewriteProposal(
  proposal: unknown,
  plan: RetentionStoryPlan,
  grounding: RetentionGroundingContext,
  strategySeed: RetentionStrategySeed,
  permittedHookClaimIds: readonly string[],
  extras?: NormalizeRetentionComposerProposalExtras,
): NormalizedRetentionComposerProposal {
  return normalizeRetentionComposerProposal(
    proposal,
    plan,
    grounding,
    strategySeed,
    permittedHookClaimIds,
    undefined,
    extras,
  );
}
