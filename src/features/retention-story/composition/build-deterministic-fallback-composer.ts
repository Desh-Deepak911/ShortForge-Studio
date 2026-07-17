/**
 * Deterministic fallback composer callback — Sprint 10H.3 / 10H.3A.
 * Zero model calls. Produces a complete proposal from plan beat IDs + grounding.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { buildDeterministicFallbackNarrationCandidate } from "./build-deterministic-fallback-narration";
import type { RetentionComposerCallback } from "./retention-narration-candidate.types";

export interface DeterministicFallbackComposerMeta {
  readonly omittedClaimIds: readonly string[];
  readonly usedClaimIds: readonly string[];
}

/**
 * Build a ledger-safe composer that returns deterministic segment text.
 * Optional `onBuilt` reports claim-use / omission for disposition (IDs only).
 */
export function buildDeterministicFallbackComposer(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding?: RetentionGroundingContext | null;
  readonly onBuilt?: (meta: DeterministicFallbackComposerMeta) => void;
  /** Sprint 10H.3B — preserve Write My Own opening during body rescue. */
  readonly preserveOpeningText?: string | null;
}): RetentionComposerCallback {
  return (request) => {
    const built = buildDeterministicFallbackNarrationCandidate({
      contract: input.contract,
      plan: input.plan,
      grounding: input.grounding ?? null,
      ...(input.preserveOpeningText
        ? { preserveOpeningText: input.preserveOpeningText }
        : {}),
    });
    input.onBuilt?.({
      omittedClaimIds: built.omittedClaimIds,
      usedClaimIds: built.usedClaimIds,
    });
    const byBeat = new Map(
      built.candidate.segments.map((s) => [s.beatId, s]),
    );
    const segments = request.orderedBeatIds.map((beatId) => {
      const seg = byBeat.get(beatId);
      const text =
        seg?.text ??
        (beatId === request.orderedBeatIds[request.orderedBeatIds.length - 1]
          ? "In the end, pressure decides who advances."
          : "The contest tightens through pressure and resolve.");
      return Object.freeze({
        beatId,
        text,
        claimRefs: Object.freeze([...(seg?.claimRefs ?? [])] as string[]),
      });
    });
    return Object.freeze({
      title: built.title,
      hookClaimRefs: Object.freeze([] as string[]),
      segments: Object.freeze(segments),
    });
  };
}
