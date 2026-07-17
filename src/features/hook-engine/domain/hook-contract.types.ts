/**
 * Hook Engine domain types — Sprint 7B.1.
 * Semantic boundaries: docs/HOOK_CONTRACT.md (Accepted after Sprint 7A).
 */

import type { CreatorTemplateId } from "@/features/creator-templates/creator-template.types";
import type { ScriptMode, Tone } from "@/types/footiebitz";

import type { HookSelectableStrategyId } from "../presentation/hook-style-selection";

/** Contract version for plans, diagnostics, and stale-plan detection. */
export type HookContractVersion = `hook-contract/${number}`;

/** Opaque registry key owned by the Hook Strategy Library (not SI IDs). */
export type HookStrategyId = string;

/**
 * Why a strategy was selected.
 * HookSource ≡ HookStrategySource (singular meaning: strategy-selection source only).
 */
export type HookStrategySource =
  | "user_authored"
  | "user_selected"
  | "template_advisory"
  | "prompt_intelligence"
  | "strategy_library"
  | "compatibility_fallback";

export type HookSource = HookStrategySource;

/** Where candidate opening text came from (7C+). Reserved in domain for contract completeness. */
export type HookCandidateOrigin =
  | "model_narration_opening"
  | "user_authored"
  | "repair_rewrite"
  | "compatibility_fallback"
  /** Ephemeral post-Retention body-rewrite Hook revalidation (10F.2). */
  | "post_retention_body_rewrite";

/** Which narration generation path executed. */
export type HookGenerationPath =
  | "script_only"
  | "audio_first_full"
  | "generate_footie_script_fallback"
  | "scenes_only_non_hook";

export type HookClaimProvenanceCategory =
  | "research_verified"
  | "user_provided_unverified"
  | "qualitative_context"
  | "forbidden";

export type HookClaimVerificationStatus =
  | "verified"
  | "unverified"
  | "forbidden"
  | "unavailable";

/** Structured grounding claim — not a bare string list. */
export interface HookGroundingClaim {
  readonly claimId: string;
  readonly text: string;
  readonly provenance: HookClaimProvenanceCategory;
  readonly verificationStatus: HookClaimVerificationStatus;
  readonly sourceRef?: string;
  readonly permittedForFactualHookUse: boolean;
}

export type HookNormalizedGroundingStatus =
  | "research_verified_available"
  | "user_context_only"
  | "research_unavailable"
  | "mixed";

export interface HookGroundingContext {
  readonly claims: readonly HookGroundingClaim[];
  readonly unavailableResearch: boolean;
  readonly researchFingerprint?: string;
  readonly normalizedGroundingStatus: HookNormalizedGroundingStatus;
}

/**
 * Hook-owned semantic opening intention (not a PI/SI type import).
 * Currently only evidence-led surprise is defined for Sprint 7B.1.
 */
export type HookOpeningIntentKind = "evidence_led_surprise";

export interface HookOpeningIntent {
  readonly kind: HookOpeningIntentKind;
  /** Grounding claim IDs referenced for the intended opening. */
  readonly claimRefs: readonly string[];
}

/** Concrete constraints after strategy resolution — not optional in HookPlan. */
export interface HookResolvedConstraints {
  readonly maxOpeningWords: number;
  readonly maxOpeningSpokenSecondsHint: number;
  readonly mustPreserveSubject: boolean;
  readonly allowQuestionForm: boolean;
  readonly allowStatisticClaim: boolean;
  readonly forbidUnverifiedSuperlatives: boolean;
  readonly minProvocativeness: number;
  readonly minClarity: number;
}

/** Raw / additive adapter input. Legacy fields may be absent. */
export interface HookRequestInput {
  readonly contractVersion?: HookContractVersion;
  readonly topic: string;
  readonly scriptMode?: ScriptMode;
  readonly tone?: Tone;
  readonly durationSeconds?: number;
  readonly templateId?: CreatorTemplateId;
  readonly openingStyleAdvisory?: string;
  readonly userAuthoredHook?: string;
  /**
   * Explicit allowlisted strategy from Hook Style panel (Sprint 7E.6).
   * Auto = omit. Never accept internal-only IDs.
   */
  readonly requestedStrategyId?: HookSelectableStrategyId;
  readonly openingIntent?: HookOpeningIntent;
  readonly groundingInput?: {
    readonly claims?: readonly HookGroundingClaim[];
    readonly unavailableResearch?: boolean;
    readonly researchFingerprint?: string;
  };
  readonly generationPath: HookGenerationPath;
}

/**
 * Validated engine input. Strategy resolution must not run on HookRequestInput.
 * requestFingerprint is computed from normalized upstream inputs only.
 */
export interface NormalizedHookRequest {
  readonly contractVersion: HookContractVersion;
  readonly topic: string;
  readonly scriptMode: ScriptMode;
  readonly tone: Tone;
  readonly durationSeconds: number;
  readonly templateId?: CreatorTemplateId;
  readonly openingStyleAdvisory?: string;
  readonly userAuthoredHook?: string;
  /** Present only for explicit user Hook Style selection (not Auto). */
  readonly requestedStrategyId?: HookSelectableStrategyId;
  readonly openingIntent?: HookOpeningIntent;
  readonly grounding: HookGroundingContext;
  readonly generationPath: HookGenerationPath;
  readonly requestFingerprint: string;
}

export interface HookPlan {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly grounding: HookGroundingContext;
  readonly constraints: HookResolvedConstraints;
  readonly intentSummary: string;
}

/**
 * Minimal serializable persistence under optional StoryCreationBrief.hookPlan.
 * Not persisted by Sprint 7B — builder only.
 */
export interface HookPlanSnapshot {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly resolvedConstraints: HookResolvedConstraints;
}

/**
 * Generation-time directive assembled from the active plan.
 * Prompt block is instruction text only — not a private system dump.
 */
export interface HookDirective {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly planFingerprint: string;
  readonly promptBlock: string;
  readonly constraints: HookResolvedConstraints;
}

/** Proposed opening span — ephemeral until selected (Sprint 7C). */
export interface HookCandidate {
  readonly candidateId: string;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly origin: HookCandidateOrigin;
  readonly openingText: string;
  readonly openingTextNormalized?: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
  readonly claimRefs: readonly string[];
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
}

/**
 * Transient pre-commit data. Never a second persisted spoken authority.
 * Story generation commits the approved complete narration into FootieScript.narration.
 */
export interface HookSelection {
  readonly candidateId: string;
  readonly strategyId: HookStrategyId;
  readonly strategySource: HookStrategySource;
  readonly candidateOrigin: HookCandidateOrigin;
  readonly openingText: string;
  readonly planFingerprint: string;
  readonly narrationCommitRule: "opening_span_of_narration";
}

export interface HookValidationScores {
  readonly provocativeness: number;
  readonly clarity: number;
  readonly grounding: number;
  readonly safety: number;
}

export type HookValidationGroundingStatus =
  | HookNormalizedGroundingStatus
  | "failed";

export type HookValidationOutcome =
  | "pass"
  | "fail"
  | "repaired"
  | "fallback"
  | "generation_failed";

export interface HookValidationResult {
  readonly ok: boolean;
  readonly candidateId: string;
  readonly planFingerprint: string;
  readonly scores: HookValidationScores;
  readonly hardGatesPassed: {
    readonly grounding: boolean;
    readonly safety: boolean;
  };
  readonly strategyThresholdsPassed: {
    readonly provocativeness: boolean;
    readonly clarity: boolean;
  };
  /** Declared opening maxima — required for ok; never truncate. */
  readonly openingLimitsPassed: {
    readonly wordLimit: boolean;
    readonly spokenDurationLimit: boolean;
  };
  readonly reasons: readonly string[];
  readonly groundingStatus: HookValidationGroundingStatus;
  readonly repairRecommended: boolean;
  readonly repairBoundExceeded?: boolean;
}

export type HookLengthEnforcementKind =
  | "none"
  | "compressed"
  | "truncated"
  | "compressed_then_truncated";

export interface HookDiagnostics {
  readonly contractVersion: HookContractVersion;
  readonly strategyId: HookStrategyId;
  readonly strategyVersion: string;
  readonly strategySource: HookStrategySource;
  readonly candidateOrigin?: HookCandidateOrigin;
  readonly generationPath: HookGenerationPath;
  readonly requestFingerprint: string;
  readonly planFingerprint: string;
  readonly fallbackReason?: string;
  readonly groundingStatus: HookValidationGroundingStatus;
  readonly validationOutcome: HookValidationOutcome;
  readonly repairAttempts: number;
  readonly compressionRevalidated?: boolean;
  /**
   * Length enforcement applied to the committed approved narration only (Sprint 7D.2).
   * Discarded earlier candidates must not influence this value.
   */
  readonly lengthEnforcement?: HookLengthEnforcementKind;
  readonly templateInfluenced: boolean;
  readonly promptIntelligenceInfluenced: boolean;
  readonly adapterRan: boolean;
}

/** Extracted opening span — original offsets into complete narration. */
export interface HookOpeningSpan {
  readonly openingText: string;
  readonly openingTextNormalized: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
}

export interface HookRepairRequest {
  readonly request: NormalizedHookRequest;
  readonly plan: HookPlan;
  readonly candidate: HookCandidate;
  readonly validation: HookValidationResult;
  readonly narration: string;
}

export interface HookRepairResult {
  readonly narration: string;
  readonly claimRefs: readonly string[];
}

export type HookRepairCallback = (
  input: HookRepairRequest,
) => Promise<HookRepairResult>;

export type HookFallbackKind = "compatibility" | "safe";

export interface HookFallbackRequest {
  readonly request: NormalizedHookRequest;
  /** Active plan for the fallback attempt (compatibility_punchy fallback plan). */
  readonly plan: HookPlan;
  readonly kind: HookFallbackKind;
  /**
   * Prior validation against a previous plan, when one existed.
   * Absent when initial candidate construction failed before validation.
   */
  readonly previousValidation?: HookValidationResult;
  /** Machine-readable reason when previousValidation is absent. */
  readonly previousFailureReason?: string;
  /** Latest attempted narration (repair output when repair ran; else initial). */
  readonly narration: string;
  /** Latest candidate when available (repair/initial). Absent if never built. */
  readonly latestCandidate?: HookCandidate;
}

export interface HookFallbackResult {
  readonly narration: string;
  readonly claimRefs: readonly string[];
}

export type HookFallbackCallback = (
  input: HookFallbackRequest,
) => Promise<HookFallbackResult | null>;
