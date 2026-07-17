/**
 * Retention Story Plan types — Sprint 10D.
 *
 * The RetentionStoryPlan is the final beat + pacing artifact produced after the
 * strategy seed (10C). Beats carry real ordered IDs and half-open ms budgets.
 * EmotionalArc here is the final beat-bound arc (atBeatId), never the blueprint.
 * Nothing in this file imports Hook, Studio Intelligence, or generation types.
 */

import type {
  EndingStrategy,
  InformationDensity,
  NormalizedStoryContract,
  PacingProfile,
  RetentionGroundingContext,
  VisualDensity,
} from "../domain/retention-story-contract.types";
import type {
  ControllingIdea,
  EmotionalArc,
  RetentionStrategySeed,
} from "../strategy/retention-strategy.types";

export type RetentionStoryPlanVersion = 1;
export type RetentionBeatPlanVersion = 1;
export type RetentionHookHandoffVersion = 1;

export type RetentionBeatPurpose =
  | "hook_handoff"
  | "curiosity"
  | "reframe"
  | "proof"
  | "escalation"
  | "conflict"
  | "twist"
  | "reveal"
  | "payoff"
  | "challenge"
  | "resolution";

export type RetentionBeatNoveltyRole =
  | "setup"
  | "escalate"
  | "payoff"
  | "bridge";

export type RetentionBeatControllingIdeaRelation =
  | "establishes"
  | "supports"
  | "pays_off";

export type RetentionBeatPayoffRelation = "none" | "setup" | "deliver";

export interface RetentionBeat {
  readonly id: string;
  readonly purpose: RetentionBeatPurpose;
  readonly emotionalIntent: string;
  readonly viewerQuestion: string;
  readonly informationContribution: string;
  readonly narrationGoal: string;
  readonly visualOpportunity: string;
  readonly estimatedStartMs: number;
  readonly estimatedEndMs: number;
  readonly noveltyRole: RetentionBeatNoveltyRole;
  readonly groundingClaimRefs: readonly string[];
  readonly controllingIdeaRelation: RetentionBeatControllingIdeaRelation;
  readonly payoffRelation: RetentionBeatPayoffRelation;
}

export interface RetentionBeatCountRange {
  readonly min: number;
  readonly max: number;
}

export interface RetentionBeatPlan {
  readonly version: RetentionBeatPlanVersion;
  readonly beats: readonly RetentionBeat[];
  readonly targetBeatCountRange: RetentionBeatCountRange;
}

export interface RetentionCompressionGoals {
  readonly targetWordBudget: number;
  readonly preserveControllingIdea: true;
  readonly preservePayoff: boolean;
  readonly maxDeadAirSec: number;
}

export type RetentionHookHandoffControllingIdeaRelation =
  | "establishes"
  | "supports"
  | "teases";

export interface RetentionHookHandoffGroundingRequirements {
  readonly requireEligibleClaimRefs: boolean;
  readonly claimIds: readonly string[];
}

export interface RetentionHookHandoff {
  readonly version: RetentionHookHandoffVersion;
  readonly openingPsychologicalFunction: string;
  readonly controllingIdeaRelation: RetentionHookHandoffControllingIdeaRelation;
  readonly nextBeatPurpose: RetentionBeatPurpose;
  readonly desiredTransitionIntoBody: string;
  readonly groundingRequirements: RetentionHookHandoffGroundingRequirements;
}

export interface RetentionStoryPlan {
  readonly version: RetentionStoryPlanVersion;
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly strategyRegistryVersion: string;
  readonly controllingIdea: ControllingIdea;
  readonly emotionalArc: EmotionalArc;
  readonly beatPlan: RetentionBeatPlan;
  readonly pacingProfile: PacingProfile;
  readonly informationDensity: InformationDensity;
  readonly visualDensity: VisualDensity;
  readonly endingStrategy: EndingStrategy;
  readonly compressionGoals: RetentionCompressionGoals;
  readonly claimIdRelationships: readonly string[];
  readonly hookHandoff: RetentionHookHandoff;
  /**
   * Sprint 10H.4B — matchup participant-coverage summary stamped into the plan.
   * Derived from creator topic framing only (not research/claims).
   */
  readonly participantCoverage: import("../strategy/retention-matchup-participant-coverage").RetentionParticipantCoverageSummary;
}

/** Half-open [startMs, endMs) budget for a single ordered beat slot. */
export interface RetentionBeatBudget {
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Canonical per-beat semantic text overlay (planner-enriched or deterministic).
 * Structural fields (purpose / timing / relations / IDs) are never taken from here.
 */
export interface RetentionBeatSemanticFields {
  readonly emotionalIntent: string;
  readonly viewerQuestion: string;
  readonly informationContribution: string;
  readonly narrationGoal: string;
  readonly visualOpportunity: string;
}

export interface NormalizedRetentionBeatProposalEntry {
  readonly purpose: RetentionBeatPurpose;
  readonly emotionalIntent: string;
  readonly viewerQuestion: string;
  readonly informationContribution: string;
  readonly narrationGoal: string;
  readonly visualOpportunity: string;
  readonly groundingClaimRefs: readonly string[];
}

export interface NormalizedRetentionBeatProposal {
  readonly beats: readonly NormalizedRetentionBeatProposalEntry[];
}

/** Options for building the beat plan (shared by Fast + planner paths). */
export interface BuildRetentionBeatPlanOptions {
  /**
   * Complete normalized planner beat proposal. When present (Balanced/Studio),
   * purposes and semantic fields are planner-authoritative within Retention constraints.
   * Must be absent for Fast/cheap deterministic rebuilds.
   */
  readonly proposal?: NormalizedRetentionBeatProposal | null;
}

export interface RetentionBeatPlanResult {
  readonly beatPlan: RetentionBeatPlan;
  readonly emotionalArc: EmotionalArc;
  readonly orderedBeatIds: readonly string[];
}

export interface BuildRetentionStoryPlanContext {
  readonly context: import("../strategy/retention-strategy.types").RetentionStrategyPlanningContext;
  readonly strategySeed: RetentionStrategySeed;
}

export type { NormalizedStoryContract, RetentionGroundingContext };
