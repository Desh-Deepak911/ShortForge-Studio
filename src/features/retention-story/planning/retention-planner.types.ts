/**
 * Retention planner seam types — Sprint 10D / 10D.1.
 *
 * The planner is injected (dependency inversion). This module owns no model client,
 * no network calls, no env reads. Balanced/Studio may invoke the planner AT MOST ONCE.
 */

import type { QualityMode } from "@/types/footiebitz";

import type {
  EndingStrategy,
  InformationDensity,
  PacingProfile,
  RetentionClaimProvenance,
  RetentionClaimVerification,
  VisualDensity,
} from "../domain/retention-story-contract.types";
import type { RetentionStrategyProposalInput } from "../strategy/retention-strategy.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type {
  RetentionBeatCountRange,
  RetentionBeatPurpose,
  RetentionStoryPlan,
} from "./retention-story-plan.types";

/** Ephemeral, bounded claim summary passed to the planner. Never persisted. */
export interface RetentionPlannerClaimSummary {
  readonly claimId: string;
  readonly text: string;
  readonly provenance: RetentionClaimProvenance;
  readonly verification: RetentionClaimVerification;
  readonly eligibleForFactualSupport: boolean;
}

/** Topic authority marker — creator topic is unverified subject input, not evidence. */
export type RetentionPlannerTopicAuthority = "creator_subject_unverified";

/** Ephemeral request handed to the injected planner. Not part of any artifact. */
export interface RetentionPlannerRequest {
  readonly contractFingerprint: string;
  readonly topic: string;
  readonly topicAuthority: RetentionPlannerTopicAuthority;
  readonly scriptMode: string;
  readonly formatStrategyId: string;
  readonly durationSec: number;
  readonly qualityMode: QualityMode;
  readonly pacingProfile: PacingProfile;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly endingStrategy: EndingStrategy;
  readonly requirePayoff: boolean;
  readonly forbidGenericIntro: boolean;
  readonly targetBeatCountRange: RetentionBeatCountRange;
  readonly suggestedBeatPurposes: readonly RetentionBeatPurpose[];
  readonly controllingIdeaStatement: string;
  readonly strategySeed: RetentionStrategySeed;
  readonly manualContext: string;
  readonly userInstructions: string;
  readonly eligibleClaims: readonly RetentionPlannerClaimSummary[];
  readonly avoidanceClaims: readonly RetentionPlannerClaimSummary[];
  readonly requiredOutputSchema: {
    readonly requireStrategy: true;
    readonly requireBeats: true;
    readonly requireBeatFields: readonly [
      "purpose",
      "emotionalIntent",
      "viewerQuestion",
      "informationContribution",
      "narrationGoal",
      "visualOpportunity",
      "groundingClaimRefs",
    ];
    readonly factualContributionsRequireClaimIds: true;
    readonly structuredDataOnly: true;
  };
}

/** Raw beat proposal entry (untrusted). */
export interface RetentionPlannerBeatProposal {
  readonly purpose?: string;
  readonly emotionalIntent?: string;
  readonly viewerQuestion?: string;
  readonly informationContribution?: string;
  readonly narrationGoal?: string;
  readonly visualOpportunity?: string;
  readonly groundingClaimRefs?: readonly string[];
  readonly id?: string;
  readonly estimatedStartMs?: number;
  readonly estimatedEndMs?: number;
}

/** Raw planner proposal. Reasoning / diagnostics fields are ignored, never persisted. */
export interface RetentionPlannerProposal {
  readonly strategy?: RetentionStrategyProposalInput | null;
  readonly beats?: readonly RetentionPlannerBeatProposal[] | null;
}

export type RetentionPlannerCallback = (
  request: RetentionPlannerRequest,
) => RetentionPlannerProposal | Promise<RetentionPlannerProposal>;

export type RetentionPlannerRunOutcome =
  | { readonly status: "ok"; readonly attempts: 1; readonly proposal: unknown }
  | { readonly status: "unavailable"; readonly attempts: 0 }
  | { readonly status: "call_failed"; readonly attempts: 1 }
  | { readonly status: "proposal_invalid"; readonly attempts: 1 };

export type RetentionStoryPlanFailureReason =
  | "planner_unavailable"
  | "planner_call_failed"
  | "planner_proposal_invalid";

export type RetentionStoryPlanOutcome =
  | "deterministic_fast"
  | "planner_enriched"
  | "scenes_only"
  | RetentionStoryPlanFailureReason;

export interface RetentionStoryPlanDiagnostics {
  readonly qualityMode: QualityMode;
  readonly plannerAttempts: 0 | 1;
  readonly outcome: RetentionStoryPlanOutcome;
  readonly contractFingerprint: string;
  readonly planFingerprint?: string;
  /** Bounded normalize seam id when proposal fails semantic normalize (no proposal text). */
  readonly normalizeFailureReason?: string;
}

export type RetentionStoryPlanResult =
  | {
      readonly status: "ready";
      readonly plan: RetentionStoryPlan;
      /** Exact asserted strategy seed that produced the plan — ephemeral, not persisted. */
      readonly strategySeed: RetentionStrategySeed;
      readonly diagnostics: RetentionStoryPlanDiagnostics;
    }
  | {
      readonly status: "skipped";
      readonly reason: "scenes_only";
    }
  | {
      readonly status: "failed";
      readonly reason: RetentionStoryPlanFailureReason;
      readonly diagnostics: RetentionStoryPlanDiagnostics;
    };

export interface BuildRetentionStoryPlanInput {
  readonly contract: import("../domain/retention-story-contract.types").NormalizedStoryContract;
  readonly grounding: import("../domain/retention-story-contract.types").RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  /** Injected planner (required for Balanced/Studio quality modes). */
  readonly planner?: RetentionPlannerCallback | null;
  /**
   * Optional path-global ledger. When supplied, planner consumption is recorded
   * on this ledger and its policy must match the active contract.
   */
  readonly ledger?: import("../budget/create-retention-model-call-ledger").RetentionModelCallLedger;
}
