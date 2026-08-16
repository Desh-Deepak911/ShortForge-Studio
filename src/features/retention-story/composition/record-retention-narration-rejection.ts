/**
 * Internal development-only rejection record — story-quality Prompt 7.
 * Safe IDs and enums only. Never store creator text, model text, prompts,
 * or raw provider responses.
 */

import type { RetentionContentIdProvenance } from "./rebind-retention-composer-content-ids";

export type RetentionNarrationRejectionClassification =
  | "correct_rejection"
  | "false_positive_validator_rejection"
  | "valid_narration_with_invalid_metadata"
  | "repairable_narration_defect"
  | "genuinely_unsupported_narration"
  | "genuinely_incoherent_narration";

export type RetentionHookPromiseRepresentation =
  | "spoken_opening"
  | "metadata_only"
  | "missing";

export type RetentionBodyPayoffEvidenceRepresentation =
  | "semantic"
  | "token_overlap_only"
  | "missing";

export type RetentionRewriteOutcome =
  | "unavailable"
  | "not_attempted"
  | "accepted"
  | "failed"
  | "rejected";

export interface RetentionInternalRejectionRecord {
  readonly rejectionStage: string;
  readonly reasonCode: string;
  readonly affectedSegmentOrBeatIndex: number | null;
  readonly referencedContentIds: readonly string[];
  readonly knownIds: readonly string[];
  readonly unknownIds: readonly string[];
  readonly spokenClaimIndependentlySupported: boolean;
  readonly hookPromiseRepresentation: RetentionHookPromiseRepresentation;
  readonly bodyPayoffEvidenceRepresentation: RetentionBodyPayoffEvidenceRepresentation;
  readonly targetedRewriteAttempted: boolean;
  readonly rewriteOutcome: RetentionRewriteOutcome;
  readonly rewriteUnavailableReason: string | null;
  readonly contentIdProvenance: RetentionContentIdProvenance;
  readonly classification: RetentionNarrationRejectionClassification | null;
}

export function buildRetentionInternalRejectionRecord(input: {
  readonly rejectionStage: string;
  readonly reasonCode: string;
  readonly affectedSegmentOrBeatIndex?: number | null;
  readonly referencedContentIds?: readonly string[];
  readonly knownIds?: readonly string[];
  readonly unknownIds?: readonly string[];
  readonly spokenClaimIndependentlySupported: boolean;
  readonly hookPromiseRepresentation: RetentionHookPromiseRepresentation;
  readonly bodyPayoffEvidenceRepresentation: RetentionBodyPayoffEvidenceRepresentation;
  readonly targetedRewriteAttempted?: boolean;
  readonly rewriteOutcome?: RetentionRewriteOutcome;
  readonly rewriteUnavailableReason?: string | null;
  readonly contentIdProvenance: RetentionContentIdProvenance;
  readonly classification?: RetentionNarrationRejectionClassification | null;
}): RetentionInternalRejectionRecord {
  return Object.freeze({
    rejectionStage: input.rejectionStage,
    reasonCode: input.reasonCode,
    affectedSegmentOrBeatIndex: input.affectedSegmentOrBeatIndex ?? null,
    referencedContentIds: Object.freeze([...(input.referencedContentIds ?? [])]),
    knownIds: Object.freeze([...(input.knownIds ?? [])]),
    unknownIds: Object.freeze([...(input.unknownIds ?? [])]),
    spokenClaimIndependentlySupported: input.spokenClaimIndependentlySupported,
    hookPromiseRepresentation: input.hookPromiseRepresentation,
    bodyPayoffEvidenceRepresentation: input.bodyPayoffEvidenceRepresentation,
    targetedRewriteAttempted: input.targetedRewriteAttempted === true,
    rewriteOutcome: input.rewriteOutcome ?? "not_attempted",
    rewriteUnavailableReason: input.rewriteUnavailableReason ?? null,
    contentIdProvenance: input.contentIdProvenance,
    classification: input.classification ?? null,
  });
}

export function classifyRetentionHookMetadataMismatch(input: {
  readonly hookOpeningInNarration: boolean;
  readonly spokenOpeningPaysOff: boolean;
}): RetentionNarrationRejectionClassification {
  if (!input.hookOpeningInNarration && input.spokenOpeningPaysOff) {
    return "valid_narration_with_invalid_metadata";
  }
  if (input.spokenOpeningPaysOff) {
    return "false_positive_validator_rejection";
  }
  return "correct_rejection";
}
