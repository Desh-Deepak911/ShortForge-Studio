/**
 * Deterministic fallback composer — zero model calls.
 * Delegates to the canonical coherent rescue and returns mapped segments.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import { RetentionStoryError } from "../domain/retention-story-errors";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import { buildRetentionCoherentDeterministicRescue } from "./build-retention-coherent-deterministic-rescue";
import type { RetentionComposerCallback } from "./retention-narration-candidate.types";

export interface DeterministicFallbackComposerMeta {
  readonly omittedClaimIds: readonly string[];
  readonly usedClaimIds: readonly string[];
  readonly usedContentUnitIds?: readonly string[];
  readonly narration?: string;
  readonly hookReconciled?: boolean;
  readonly lowContextWarning?: boolean;
}

export function buildDeterministicFallbackComposer(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly grounding?: RetentionGroundingContext | null;
  readonly onBuilt?: (meta: DeterministicFallbackComposerMeta) => void;
  readonly preserveOpeningText?: string | null;
  readonly strategySeed?: RetentionStrategySeed | null;
  readonly hookStyle?: string | null;
}): RetentionComposerCallback {
  return (request) => {
    try {
      const built = buildRetentionCoherentDeterministicRescue({
        contract: input.contract,
        plan: input.plan,
        grounding: input.grounding ?? null,
        strategySeed: input.strategySeed ?? null,
        hookStyle: input.hookStyle ?? null,
        ...(input.preserveOpeningText
          ? { preserveOpeningText: input.preserveOpeningText }
          : {}),
      });
      input.onBuilt?.({
        omittedClaimIds: built.omittedClaimIds,
        usedClaimIds: built.usedClaimIds,
        usedContentUnitIds: built.usedContentUnitIds,
        narration: built.candidate.assembledNarration,
        hookReconciled: built.hookReconciled,
        lowContextWarning: built.lowContextWarning,
      });
      const byBeat = new Map(
        built.candidate.segments.map((segment) => [segment.beatId, segment]),
      );
      const segments = request.orderedBeatIds.map((beatId) => {
        const segment = byBeat.get(beatId);
        const text = segment?.text ?? built.candidate.assembledNarration;
        return Object.freeze({
          beatId,
          text,
          claimRefs: Object.freeze([...(segment?.claimRefs ?? [])] as string[]),
        });
      });
      return Object.freeze({
        title: built.title,
        hookClaimRefs: Object.freeze([] as string[]),
        hookOpening: built.hookOpening,
        payoffClosing: built.payoffClosing,
        usedContentIds: built.usedContentUnitIds,
        omittedContentIds: built.omittedContentUnitIds,
        assemblyGap: " " as const,
        segments: Object.freeze(segments),
      });
    } catch (error) {
      if (error instanceof RetentionStoryError) throw error;
      throw new RetentionStoryError(
        "composer_proposal_invalid",
        error instanceof Error ? error.message : "Deterministic rescue failed.",
      );
    }
  };
}
