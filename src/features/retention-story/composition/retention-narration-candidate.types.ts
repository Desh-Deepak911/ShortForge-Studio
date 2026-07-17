/**
 * Retention narration candidate + composer types — Sprint 10E.
 */

import type { QualityMode } from "@/types/footiebitz";

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type {
  RetentionHookHandoff,
  RetentionStoryPlan,
} from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type { RETENTION_NARRATION_CANDIDATE_VERSION } from "./retention-narration-candidate.constants";

export type RetentionNarrationCandidateOrigin =
  | "initial_compose"
  | "after_hook_approval"
  | "after_length_enforcement"
  | "after_body_rewrite"
  | "final";

export type RetentionNarrationCandidateVersion =
  typeof RETENTION_NARRATION_CANDIDATE_VERSION;

export interface RetentionNarrationSegment {
  readonly beatId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly claimRefs: readonly string[];
  readonly factualRisk: boolean;
}

export interface RetentionNarrationCandidate {
  readonly version: RetentionNarrationCandidateVersion;
  readonly origin: RetentionNarrationCandidateOrigin;
  readonly planFingerprint: string;
  readonly orderedBeatIds: readonly string[];
  readonly segments: readonly RetentionNarrationSegment[];
  readonly assembledNarration: string;
  readonly candidateFingerprint: string;
}

export type RetentionComposerModelCallKind =
  | "initial"
  | "repair"
  | "length_compress"
  | "compatibility_fallback"
  | "safe_fallback"
  | "body_rewrite";

export interface RetentionComposerClaimSummary {
  readonly claimId: string;
  readonly text: string;
  readonly provenance: string;
  readonly verification: string;
  readonly eligibleForFactualSupport: boolean;
}

export interface RetentionComposerRequest {
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly qualityMode: QualityMode;
  readonly topic: string;
  readonly topicAuthority: "creator_subject_unverified";
  readonly scriptMode: NormalizedStoryContract["scriptMode"];
  readonly durationSec: number;
  readonly modelCallKind: RetentionComposerModelCallKind;
  readonly controllingIdeaStatement: string;
  readonly controllingIdeaClaimRefs: readonly string[];
  readonly orderedBeatIds: readonly string[];
  /** Exact plan compression target (duration×2.4). */
  readonly targetWordBudget: number;
  /** Per-beat suggested word budgets that sum to targetWordBudget. */
  readonly beatSuggestedWordBudgets: readonly {
    readonly beatId: string;
    readonly suggestedWordBudget: number;
  }[];
  readonly beats: readonly {
    readonly beatId: string;
    readonly purpose: string;
    readonly emotionalIntent: string;
    readonly viewerQuestion: string;
    readonly informationContribution: string;
    readonly narrationGoal: string;
    readonly visualOpportunity: string;
    readonly groundingClaimRefs: readonly string[];
    readonly suggestedWordBudget: number;
  }[];
  readonly hookHandoff: RetentionHookHandoff;
  readonly hookDirectiveBlock: string;
  readonly manualContext: string;
  readonly userInstructions: string;
  readonly eligibleClaims: readonly RetentionComposerClaimSummary[];
  readonly avoidanceClaims: readonly RetentionComposerClaimSummary[];
  readonly previousCandidate: RetentionNarrationCandidate | null;
  readonly requiredOutputSchema: {
    readonly requireTitle: true;
    readonly requireSegments: true;
    readonly requireExactBeatIds: true;
    readonly requireHookClaimRefs: true;
    readonly structuredDataOnly: true;
  };
}

export interface RetentionComposerSegmentProposal {
  readonly beatId?: string;
  readonly text?: string;
  readonly claimRefs?: readonly string[];
}

export interface RetentionComposerProposal {
  readonly title?: string;
  readonly segments?: readonly RetentionComposerSegmentProposal[];
  readonly hookClaimRefs?: readonly string[];
}

export type RetentionComposerCallback = (
  request: RetentionComposerRequest,
) => Promise<RetentionComposerProposal> | RetentionComposerProposal;

export interface BuildRetentionComposerRequestInput {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  /** Exact asserted strategy seed — sole controlling-idea claim authority. */
  readonly strategySeed: RetentionStrategySeed;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  readonly hookDirectiveBlock: string;
  readonly modelCallKind: RetentionComposerModelCallKind;
  readonly previousCandidate?: RetentionNarrationCandidate | null;
}
