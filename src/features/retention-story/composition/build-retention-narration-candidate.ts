/**
 * Build an asserted RetentionNarrationCandidate from a composer proposal —
 * Sprint 10E / 10E.1 / 10E.1A.
 */

import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import {
  assembleRetentionNarrationCandidate,
} from "./assemble-retention-narration-candidate";
import { normalizeRetentionComposerProposal } from "./normalize-retention-composer-proposal";
import type {
  RetentionNarrationCandidate,
  RetentionNarrationCandidateOrigin,
} from "./retention-narration-candidate.types";
import { assertRetentionNarrationCandidateCoherence } from "./assert-retention-narration-candidate-coherence";

export function buildRetentionNarrationCandidateFromProposal(input: {
  readonly proposal: unknown;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly origin: RetentionNarrationCandidateOrigin;
  readonly permittedHookClaimIds?: readonly string[];
}): {
  readonly candidate: RetentionNarrationCandidate;
  readonly title: string;
  readonly hookClaimRefs: readonly string[];
} {
  const normalized = normalizeRetentionComposerProposal(
    input.proposal,
    input.plan,
    input.grounding,
    input.strategySeed,
    input.permittedHookClaimIds ?? [],
  );
  const orderedBeatIds = input.plan.beatPlan.beats.map((b) => b.id);
  const assembled = assembleRetentionNarrationCandidate({
    origin: input.origin,
    planFingerprint: input.plan.planFingerprint,
    orderedBeatIds,
    segments: normalized.segments,
  });
  const candidate = assertRetentionNarrationCandidateCoherence(assembled, {
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
  });
  return {
    candidate,
    title: normalized.title,
    hookClaimRefs: normalized.hookClaimRefs,
  };
}
