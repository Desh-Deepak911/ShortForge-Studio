/**
 * Neutral research/PI evidence handoff — owned by Hook integration.
 * Research and Prompt Intelligence core modules must not import Hook domain types.
 */

export type HookNeutralFactProvenance =
  | "provider_verified"
  | "user_manual"
  | "qualitative"
  | "forbidden";

export interface HookNeutralResearchFact {
  readonly factId: string;
  readonly text: string;
  readonly provenance: HookNeutralFactProvenance;
  readonly sourceRef?: string;
  /** Provider-verified and suitable for factual hook use when true. */
  readonly verified: boolean;
  readonly permittedForFactualHookUse: boolean;
}

export interface HookNeutralOpeningBeatAssignment {
  readonly factIds: readonly string[];
  /**
   * Explicit Prompt Intelligence signal for evidence-led opening.
   * Verified research alone must not imply this.
   */
  readonly evidenceLedSurprise?: boolean;
}

/**
 * Structured research handoff for the canonical Hook adapter.
 * Built from AssembledContext / NarrativePlan without parsing prompt strings.
 */
export interface HookNeutralResearchEvidence {
  readonly facts: readonly HookNeutralResearchFact[];
  readonly unavailableResearch: boolean;
  readonly researchFingerprint?: string;
  readonly forbiddenClaimTexts?: readonly string[];
  readonly openingBeat?: HookNeutralOpeningBeatAssignment;
  readonly manualNotes?: string;
}
