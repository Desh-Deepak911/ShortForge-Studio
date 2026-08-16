/**
 * Compatibility adapter — story-quality Prompt 3.
 * Narration-first proposals become beat segments after acceptance.
 * Existing injected segment-based doubles keep the legacy path.
 */

import type { RetentionCreatorContentContract } from "../domain/retention-creator-content-contract.types";
import type { RetentionGroundingContext } from "../domain/retention-story-contract.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionCompositionBrief } from "./retention-composition-brief.types";
import { mapRetentionNarrationToBeats } from "./map-retention-narration-to-beats";
import {
  isRetentionNarrationFirstProposal,
  validateRetentionNarrationFirstProposal,
} from "./validate-retention-narration-first-proposal";
import type { RetentionNarrationAssemblyGap } from "./retention-narration-first.types";

export interface AdaptedRetentionComposerProposal {
  readonly title: string;
  readonly segments: unknown;
  readonly hookClaimRefs: readonly string[];
  readonly assemblyGap: RetentionNarrationAssemblyGap;
  readonly protocol: "narration_first" | "segment_compatible";
}

export function adaptRetentionComposerProposal(input: {
  readonly raw: unknown;
  readonly plan: RetentionStoryPlan;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly contentContract?: RetentionCreatorContentContract | null;
  readonly brief?: RetentionCompositionBrief | null;
  readonly eligibleClaimIds?: ReadonlySet<string>;
  readonly userWrittenHookAccepted?: boolean;
}): AdaptedRetentionComposerProposal | null {
  if (!isRetentionNarrationFirstProposal(input.raw)) {
    return null;
  }
  if (input.contentContract == null || input.brief == null) {
    return null;
  }
  const validated = validateRetentionNarrationFirstProposal({
    raw: input.raw,
    contentContract: input.contentContract,
    brief: input.brief,
    eligibleClaimIds: input.eligibleClaimIds ?? new Set(),
    grounding: input.grounding,
    userWrittenHookAccepted: input.userWrittenHookAccepted,
  });
  const mapped = mapRetentionNarrationToBeats({
    narration: validated.narration,
    plan: input.plan,
    grounding: input.grounding,
    strategySeed: input.strategySeed,
    usedClaimIds: [
      ...validated.usedContentIds,
      ...(validated.factualSupport ?? []).map((entry) => entry.claimId),
    ],
    hookOpening: validated.hookOpening,
    payoffClosing: validated.payoffClosing,
    allowEmptyInternalBeats: true,
  });
  const firstRefs = mapped.segments[0]?.claimRefs ?? [];
  const hookClaimRefs =
    validated.hookClaimRefs.length > 0
      ? validated.hookClaimRefs.filter((id) => firstRefs.includes(id))
      : [];
  return Object.freeze({
    title: validated.title,
    segments: mapped.segments.map((segment) =>
      Object.freeze({
        beatId: segment.beatId,
        text: segment.text,
        claimRefs: segment.claimRefs,
      }),
    ),
    hookClaimRefs: Object.freeze(hookClaimRefs),
    assemblyGap: " ",
    protocol: "narration_first",
  });
}
