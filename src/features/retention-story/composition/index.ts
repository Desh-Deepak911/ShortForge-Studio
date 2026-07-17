/**
 * Retention Narrative Composer — Sprint 10E / 10E.1.
 */

export {
  RETENTION_NARRATION_CANDIDATE_VERSION,
  RETENTION_CANDIDATE_FINGERPRINT_PREFIX,
  RETENTION_SEGMENT_SEPARATOR,
  RETENTION_MAX_SEGMENT_TEXT_CHARS,
  RETENTION_MAX_SEGMENT_CLAIM_REFS,
  RETENTION_MAX_COMPOSER_TITLE_CHARS,
  RETENTION_MAX_COMPOSER_REQUEST_CLAIMS,
} from "./retention-narration-candidate.constants";

export {
  RETENTION_NARRATION_CANDIDATE_ORIGINS,
  isRetentionNarrationCandidateOrigin,
} from "./retention-narration-candidate-origin";

export type {
  RetentionNarrationCandidateOrigin,
  RetentionNarrationCandidateVersion,
  RetentionNarrationSegment,
  RetentionNarrationCandidate,
  RetentionComposerModelCallKind,
  RetentionComposerClaimSummary,
  RetentionComposerRequest,
  RetentionComposerSegmentProposal,
  RetentionComposerProposal,
  RetentionComposerCallback,
  BuildRetentionComposerRequestInput,
} from "./retention-narration-candidate.types";

export {
  assembleRetentionNarrationCandidate,
  buildRetentionNarrationCandidateFingerprint,
  type RetentionSegmentDraft,
} from "./assemble-retention-narration-candidate";

export { canonicalizeRetentionSegmentText } from "./canonicalize-retention-segment-text";

export {
  normalizeRetentionComposerProposal,
  type NormalizedRetentionComposerProposal,
} from "./normalize-retention-composer-proposal";

export { buildRetentionComposerRequest } from "./build-retention-composer-request";

export { buildRetentionNarrationCandidateFromProposal } from "./build-retention-narration-candidate";

export { allocateRetentionSegmentWordBudgets } from "./allocate-retention-segment-word-budgets";

export {
  enforceRetentionCandidateWordBudget,
  extractFirstSpokenSentence,
} from "./enforce-retention-candidate-word-budget";

export {
  validateRetentionNarrationCandidate,
  assertRetentionNarrationCandidateCoherence,
  type AssertRetentionNarrationCandidateContext,
} from "./assert-retention-narration-candidate-coherence";

export {
  reconcileRetentionCandidateAfterHook,
  type HookApprovedOpening,
  type ReconcileRetentionCandidateAfterHookInput,
} from "./reconcile-retention-candidate-after-hook";

export {
  reconcileRetentionParticipantCoverageZeroModel,
  type ReconcileParticipantCoverageResult,
} from "./reconcile-retention-participant-coverage";

export {
  resolvePlanAuthorizedOpeningClaimIds,
  resolvePlanAuthorizedComposerClaimIds,
  resolveAuthorizedClaimIdsForBeat,
} from "./retention-opening-claim-authority";
