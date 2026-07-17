/**
 * Retention strategy types — Sprint 10C.
 *
 * EmotionalArcBlueprint is a pre-beat intermediate. It uses semantic phases
 * (opening/build/turn/payoff), never beat IDs. 10D binds phases to ordered
 * RetentionBeat IDs and produces the final EmotionalArc inside RetentionStoryPlan.
 * The blueprint is ephemeral and must not be persisted.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";

export type RetentionStrategySeedVersion = 1;

export type RetentionEmotion =
  | "curiosity"
  | "surprise"
  | "tension"
  | "anticipation"
  | "urgency"
  | "awe"
  | "satisfaction"
  | "admiration"
  | "empathy"
  | "defiance"
  | "conviction"
  | "delight";

export interface ControllingIdea {
  readonly statement: string;
  readonly mustPreserveThroughCompression: true;
}

export type ControllingIdeaSource =
  | "grounded_claim"
  | "deterministic_mode_strategy"
  | "planner_model_proposal";

export interface ControllingIdeaCandidate {
  readonly candidateId: string;
  readonly contractFingerprint: string;
  readonly statement: string;
  readonly source: ControllingIdeaSource;
  readonly claimRefs: readonly string[];
  readonly factualRisk: boolean;
  readonly subjectAnchored: boolean;
}

export interface ControllingIdeaSelection {
  readonly controllingIdea: ControllingIdea;
  readonly selectedCandidateId: string;
  readonly source: ControllingIdeaSource;
  readonly claimRefs: readonly string[];
}

export type EmotionalArcPhase = "opening" | "build" | "turn" | "payoff";

export type EmotionalIntensity = 1 | 2 | 3 | 4 | 5;

export interface EmotionalArcBlueprintPoint {
  readonly phase: EmotionalArcPhase;
  readonly emotion: RetentionEmotion;
  readonly intensity: EmotionalIntensity;
}

/**
 * Pre-beat emotional strategy. No atBeatId — beats do not exist until 10D.
 */
export interface EmotionalArcBlueprint {
  readonly version: 1;
  readonly primaryEmotion: RetentionEmotion;
  readonly secondaryEmotion?: RetentionEmotion;
  readonly curve: readonly EmotionalArcBlueprintPoint[];
  readonly blueprintFingerprint: string;
}

/**
 * Final EmotionalArc shape for 10D binding only.
 * Do not construct this in 10C planning without real ordered beat IDs.
 */
export interface EmotionalArcPoint {
  readonly atBeatId: string;
  readonly emotion: RetentionEmotion;
  readonly intensity: EmotionalIntensity;
}

export interface EmotionalArc {
  readonly primaryEmotion: RetentionEmotion;
  readonly secondaryEmotion?: RetentionEmotion;
  readonly curve: readonly EmotionalArcPoint[];
}

export interface RetentionStrategySeed {
  readonly version: RetentionStrategySeedVersion;
  readonly contractFingerprint: string;
  readonly controllingIdea: ControllingIdea;
  readonly controllingIdeaSource: ControllingIdeaSource;
  readonly controllingIdeaClaimRefs: readonly string[];
  readonly emotionalArcBlueprint: EmotionalArcBlueprint;
  readonly strategySeedFingerprint: string;
}

export type RetentionStrategySeedResult =
  | {
      readonly status: "ready";
      readonly seed: RetentionStrategySeed;
    }
  | {
      readonly status: "skipped";
      readonly reason: "scenes_only";
    };

export interface BuildRetentionStrategySeedInput {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
}

/** Canonical coherent planning input after validation. */
export interface RetentionStrategyPlanningContext {
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly manualContext: string;
  readonly userInstructions: string;
  readonly subjectTokens: readonly string[];
}

export type ControllingIdeaValidationReason =
  | "empty_statement"
  | "too_many_chars"
  | "too_many_words"
  | "too_few_words"
  | "missing_subject_anchor"
  | "no_subject_tokens"
  | "forbidden_label"
  | "generic_introduction"
  | "multiple_theses"
  | "multi_sentence"
  | "factual_risk_without_refs"
  | "unknown_claim_ref"
  | "ineligible_claim_ref"
  | "too_many_claim_refs"
  | "forbidden_claim_text"
  | "must_preserve_flag_invalid"
  | "claim_ref_does_not_support_statement";

export interface ControllingIdeaValidationResult {
  readonly ok: boolean;
  readonly reasons: readonly ControllingIdeaValidationReason[];
}

export interface RetentionStrategyProposalInput {
  readonly controllingIdea: string;
  readonly controllingIdeaClaimRefs?: readonly string[];
  readonly primaryEmotion?: string;
  readonly secondaryEmotion?: string;
  readonly curve?: readonly {
    readonly phase: string;
    readonly emotion: string;
    readonly intensity: number;
  }[];
}
