/**
 * Retention Studio body-rewrite + terminal validation types — Sprint 10F.2 / 10F.2A.
 */

import type {
  NormalizedStoryContract,
  RetentionGroundingContext,
} from "../domain/retention-story-contract.types";
import type { RetentionCreatorContextAuthority } from "../domain/retention-creator-context-authority";
import type { RetentionModelCallLedger } from "../budget/create-retention-model-call-ledger";
import type { RetentionModelCallLedgerSnapshot } from "../budget/retention-model-call-budget.types";
import type {
  RetentionComposerCallback,
  RetentionComposerProposal,
  RetentionNarrationCandidate,
} from "../composition/retention-narration-candidate.types";
import type { RetentionHookBridgeResult } from "../integration/retention-hook-bridge.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import type { RetentionStrategySeed } from "../strategy/retention-strategy.types";
import type {
  RetentionEditorialComponentId,
  RetentionValidationResult,
} from "../validation/retention-validation.types";
import type { RETENTION_REWRITE_TERMINAL_STATES } from "./retention-rewrite.constants";

export type {
  RetentionPostRewriteHookEvidence,
  RetentionTerminalHookAuthority,
} from "./retention-terminal-hook-authority.types";

export type RetentionRewriteTerminalState =
  (typeof RETENTION_REWRITE_TERMINAL_STATES)[number];

export interface RetentionApprovedOpeningAuthority {
  readonly openingText: string;
  readonly openingStartOffset: number;
  readonly openingEndOffset: number;
}

export interface RetentionRewriteValidationFailureSummary {
  readonly failureClass: "hard_gate" | "quality_threshold";
  readonly readinessScore: number;
  readonly activeThreshold: number;
  readonly failedHardGateIds: readonly string[];
  readonly editorialScores: Readonly<Record<string, number>>;
  readonly qualityDiagnosticIds: readonly string[];
}

export interface RetentionRewriteDiagnostics {
  readonly version: 1;
  readonly terminalState: RetentionRewriteTerminalState;
  readonly qualityMode: string;
  readonly contractFingerprint: string;
  readonly planFingerprint: string | null;
  readonly initialCandidateFingerprint: string | null;
  readonly finalCandidateFingerprint: string | null;
  readonly initialValidationFingerprint: string | null;
  readonly finalValidationFingerprint: string | null;
  readonly rewriteUsed: boolean;
  readonly lengthCompressionUsed: boolean;
  readonly deterministicTruncateUsed: boolean;
  readonly budget: RetentionModelCallLedgerSnapshot | null;
  readonly safeReasonIds: readonly string[];
  /** Canonical validation failure detail when terminal blocked on Retention validation. */
  readonly validationFailureSummary?: RetentionRewriteValidationFailureSummary;
}

export type RetentionTerminalValidationResult =
  | {
      readonly status: "pass_without_rewrite";
      readonly candidate: RetentionNarrationCandidate;
      readonly validation: RetentionValidationResult;
      readonly hookBridge: Extract<RetentionHookBridgeResult, { status: "ready" }>;
      readonly diagnostics: RetentionRewriteDiagnostics;
    }
  | {
      readonly status: "pass_after_rewrite";
      readonly candidate: RetentionNarrationCandidate;
      readonly validation: RetentionValidationResult;
      readonly hookBridge: Extract<RetentionHookBridgeResult, { status: "ready" }>;
      readonly diagnostics: RetentionRewriteDiagnostics;
    }
  | {
      readonly status: "skipped_scenes_only";
      readonly diagnostics: RetentionRewriteDiagnostics;
    }
  | {
      readonly status:
        | "rewrite_not_allowed"
        | "rewrite_unavailable"
        | "rewrite_call_failed"
        | "rewrite_proposal_invalid"
        | "opening_preservation_failed"
        | "length_enforcement_failed"
        | "post_rewrite_hook_failed"
        | "post_rewrite_retention_failed"
        | "ledger_invalid";
      readonly diagnostics: RetentionRewriteDiagnostics;
    };

export interface RetentionBodyRewriteRequest {
  readonly contractFingerprint: string;
  readonly planFingerprint: string;
  readonly qualityMode: "best";
  readonly modelCallKind: "body_rewrite";
  readonly controllingIdeaStatement: string;
  readonly controllingIdeaClaimRefs: readonly string[];
  readonly orderedBeatIds: readonly string[];
  readonly beats: readonly {
    readonly beatId: string;
    readonly purpose: string;
    readonly emotionalIntent: string;
    readonly viewerQuestion: string;
    readonly informationContribution: string;
    readonly narrationGoal: string;
    readonly visualOpportunity: string;
    readonly groundingClaimRefs: readonly string[];
  }[];
  readonly immutableApprovedOpening: RetentionApprovedOpeningAuthority;
  readonly currentCandidate: RetentionNarrationCandidate;
  readonly missedQualityComponentIds: readonly RetentionEditorialComponentId[];
  readonly failedSafeDimensions: readonly string[];
  readonly eligibleClaims: readonly {
    readonly claimId: string;
    readonly text: string;
    readonly provenance: string;
    readonly verification: string;
    readonly eligibleForFactualSupport: true;
  }[];
  readonly avoidanceClaims: readonly {
    readonly claimId: string;
    readonly text: string;
    readonly provenance: string;
    readonly verification: string;
    readonly eligibleForFactualSupport: false;
  }[];
  readonly targetWordBudget: number;
  readonly requiredOutputSchema: {
    readonly requireTitle: true;
    readonly requireSegments: true;
    readonly requireExactBeatIds: true;
    readonly requireHookClaimRefs: true;
    readonly preserveExactOpening: true;
    readonly structuredDataOnly: true;
  };
}

export type RetentionBodyRewriteCallback = (
  request: RetentionBodyRewriteRequest,
) => Promise<RetentionComposerProposal> | RetentionComposerProposal;

/**
 * Discriminated scenes-only terminal input.
 * Must not carry plan, seed, candidate, Hook bridge, or model callbacks.
 */
export interface RetentionTerminalScenesOnlyInput {
  readonly kind: "scenes_only";
  readonly contract: NormalizedStoryContract;
  readonly ledger: RetentionModelCallLedger;
}

/**
 * Script-path terminal validation input.
 * Terminal Hook authority comes only from the ready Hook bridge — never a
 * separately forged caller field.
 */
export interface RetentionTerminalScriptPathInput {
  readonly kind?: "script_path";
  readonly contract: NormalizedStoryContract;
  readonly grounding: RetentionGroundingContext;
  readonly strategySeed: RetentionStrategySeed;
  readonly plan: RetentionStoryPlan;
  readonly hookBridge: RetentionHookBridgeResult;
  readonly candidate: RetentionNarrationCandidate;
  /** Same path-global ledger used by planning / composition / Hook. */
  readonly ledger: RetentionModelCallLedger;
  /** Required for Studio rewrite; ignored when rewrite is not eligible. */
  readonly rewriteComposer?: RetentionBodyRewriteCallback | null;
  /** Optional structured composer for post-rewrite length_compression only. */
  readonly lengthComposer?: RetentionComposerCallback | null;
  readonly manualContext?: string | null;
  readonly userInstructions?: string | null;
  /**
   * Sprint 10H.4A — ephemeral creator-context authority. Prefer this over
   * reconstructing from raw strings at validation boundaries.
   */
  readonly creatorContextAuthority?: RetentionCreatorContextAuthority | null;
}

export type RunRetentionTerminalValidationInput =
  | RetentionTerminalScenesOnlyInput
  | RetentionTerminalScriptPathInput;
