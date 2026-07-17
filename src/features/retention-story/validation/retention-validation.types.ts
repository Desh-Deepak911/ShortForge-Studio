/**
 * Retention validation types — Sprint 10F / 10F.1.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionCreatorContextAuthority } from "../domain/retention-creator-context-authority";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionHookBridgeResult } from "../integration/retention-hook-bridge.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type {
  RETENTION_EDITORIAL_COMPONENT_IDS,
  RETENTION_HARD_GATE_IDS,
} from "./retention-validation.constants";

export type RetentionHardGateId = (typeof RETENTION_HARD_GATE_IDS)[number];
export type RetentionEditorialComponentId =
  (typeof RETENTION_EDITORIAL_COMPONENT_IDS)[number];

export type RetentionValidationFailureClass =
  | "none"
  | "hard_gate"
  | "quality_threshold";

export interface RetentionHardGateOutcome {
  readonly id: RetentionHardGateId;
  readonly passed: boolean;
  /** Safe stable detail — never narration, claim text, prompts, or secrets. */
  readonly detail: string;
}

export interface RetentionEditorialScores {
  readonly clarity: number;
  readonly curiosity: number;
  readonly emotionalProgression: number;
  readonly compressionQuality: number;
  readonly novelty: number;
  readonly escalation: number;
  readonly payoffStrength: number;
  readonly visualPotential: number;
  readonly repetitionPenalty: number;
  readonly controllingIdeaAdherence: number;
  readonly genericIntroductionQuality: number;
}

export interface RetentionValidationResult {
  readonly version: 1;
  readonly ok: boolean;
  readonly failureClass: RetentionValidationFailureClass;
  readonly hardGates: readonly RetentionHardGateOutcome[];
  readonly editorial: RetentionEditorialScores;
  readonly retentionReadiness: number;
  readonly storyQualityConfidence: number;
  readonly frameworkCompliance: number;
  readonly activeStrategyThreshold: number;
  readonly notes: readonly string[];
  readonly validationFingerprint: string;
  readonly candidateFingerprint: string;
}

export type RetentionDiagnosticsTerminalState =
  | "pass"
  | "pass_after_rewrite"
  | "fail"
  | "skipped";

export interface RetentionDiagnostics {
  readonly contractFingerprint: string;
  readonly planFingerprint: string | null;
  readonly candidateFingerprint: string | null;
  readonly validationFingerprint: string | null;
  readonly failureClass: RetentionValidationFailureClass;
  readonly failedHardGateIds: readonly RetentionHardGateId[];
  readonly rewriteUsed: boolean;
  readonly terminalState: RetentionDiagnosticsTerminalState;
  readonly safeSummary: string;
  readonly noteIds: readonly string[];
}

export interface RetentionCompressionWordPolicyResult {
  readonly actualWordCount: number;
  readonly allowedWordCount: number;
  readonly passed: boolean;
}

/**
 * Discriminated validator input — Sprint 10F.1.
 * Runtime checks `contract.generationPath` before reading any non-contract field.
 */
export type ValidateRetentionStoryCandidateInput =
  | {
      readonly contract: NormalizedStoryContract;
    }
  | {
      readonly contract: NormalizedStoryContract;
      readonly grounding: RetentionGroundingContext;
      readonly strategySeed: RetentionStrategySeed;
      readonly plan: RetentionStoryPlan;
      readonly hookBridge: RetentionHookBridgeResult;
      readonly candidate: RetentionNarrationCandidate;
      /** Sprint 10H.4A — ephemeral; never null when contract identities are set. */
      readonly creatorContextAuthority?: RetentionCreatorContextAuthority | null;
    };

export type RetentionStoryValidationOutcome =
  | {
      readonly status: "validated";
      readonly validation: RetentionValidationResult;
      readonly diagnostics: RetentionDiagnostics;
    }
  | {
      readonly status: "skipped";
      readonly reason: "scenes_only";
      readonly diagnostics: RetentionDiagnostics;
    }
  | {
      readonly status: "failed";
      readonly reason:
        | "validation_input_invalid"
        | "hook_bridge_not_approved"
        | "authority_mismatch"
        | "creator_context_identity_mismatch"
        | "grounding_summary_mismatch"
        | "grounding_identity_mismatch"
        | "validation_authority_mismatch";
      readonly diagnostics: RetentionDiagnostics;
    };

/** Context required for full validation-result authority (not fingerprint-only). */
export interface RetentionValidationCoherenceInput {
  readonly result: RetentionValidationResult;
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly hookBridge: RetentionHookBridgeResult;
  readonly candidate: RetentionNarrationCandidate;
  readonly creatorContextAuthority?: RetentionCreatorContextAuthority | null;
}
