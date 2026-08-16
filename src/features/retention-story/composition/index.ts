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
  RETENTION_MAX_COMPOSER_REQUEST_CLAIMS_HARD,
} from "./retention-narration-candidate.constants";

export { RETENTION_NARRATION_FIRST_PROTOCOL_VERSION } from "./retention-narration-first.types";
export type {
  RetentionNarrationFirstProposal,
  RetentionNarrationAssemblyGap,
} from "./retention-narration-first.types";

export { RETENTION_COMPOSITION_BRIEF_VERSION } from "./retention-composition-brief.types";
export type { RetentionCompositionBrief } from "./retention-composition-brief.types";

export {
  getRetentionModeArchitecture,
  listRetentionModeArchitectures,
  RETENTION_MODE_ARCHITECTURE_REGISTRY_VERSION,
} from "./retention-mode-architecture.registry";

export { getRetentionTonePresentation } from "./retention-tone-presentation.registry";
export { resolveRetentionDurationUtilisationPolicy } from "./retention-duration-utilisation.policy";
export {
  resolveRetentionQualityCompositionEffort,
  listRetentionQualityCompositionEffort,
} from "./retention-quality-composition-effort.policy";
export { buildRetentionCompositionBrief } from "./build-retention-composition-brief";
export { selectRetentionAdaptiveComposerClaims } from "./select-retention-adaptive-composer-claims";
export { evaluateRetentionHookBodyPayoff } from "./evaluate-retention-hook-body-payoff";
export type {
  RetentionHookQualityWarningId,
  RetentionHookBodyPayoffReasonId,
} from "./evaluate-retention-hook-body-payoff";
export { isRetentionHardHookBodyReason } from "./evaluate-retention-hook-body-payoff";
export { evaluateRetentionSpokenClaimGrounding } from "./evaluate-retention-spoken-claim-grounding";
export { evaluateRetentionCanonicalNarrationAcceptance } from "./evaluate-retention-canonical-narration-acceptance";
export {
  applyRetentionBoundedOpeningRepair,
  applyRetentionBoundedRankingPayoffRepair,
  buildDeterministicRankingNumberOneCloser,
  extractReplacementOpening,
  extractReplacementClosing,
} from "./apply-retention-bounded-region-repair";
export { applyRetentionSupportedOpeningPromotion } from "./apply-retention-supported-opening-promotion";
export { applyRetentionBoundedDurationCompression } from "./apply-retention-bounded-duration-compression";
export { evaluateRetentionDurationFit } from "./evaluate-retention-duration-fit";
export type {
  RetentionBoundedRewriteType,
  RetentionBoundedRegionRepairResult,
} from "./apply-retention-bounded-region-repair";
export { mapRetentionNarrationToBeats } from "./map-retention-narration-to-beats";
export { validateRetentionNarrationFirstProposal } from "./validate-retention-narration-first-proposal";
export { adaptRetentionComposerProposal } from "./adapt-retention-composer-proposal";
export {
  rebindRetentionComposerContentIds,
  type RetentionContentIdProvenance,
  type RebindRetentionComposerContentIdsResult,
} from "./rebind-retention-composer-content-ids";
export {
  buildRetentionInternalRejectionRecord,
  classifyRetentionHookMetadataMismatch,
  type RetentionInternalRejectionRecord,
  type RetentionNarrationRejectionClassification,
} from "./record-retention-narration-rejection";

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
  RetentionComposerContentUnitSummary,
  RetentionComposerContentAuthority,
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

export {
  buildRetentionComposerRequest,
  RETENTION_COMPOSER_CONTENT_AUTHORITY_RULES,
} from "./build-retention-composer-request";

export { allocateRetentionCreatorContentUnits } from "./allocate-retention-creator-content-units";

export {
  buildRetentionCoherentDeterministicRescue,
  buildDeterministicFallbackNarrationCandidate,
  RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
  getRetentionCoherentRescueRuntimeProbe,
  resetRetentionCoherentRescueRuntimeProbe,
  buildLegacyPlanningLanguageFallback,
  type DeterministicFallbackBuildResult,
  type RetentionRescueThread,
} from "./build-retention-coherent-deterministic-rescue";

export {
  applyRetentionTonePresentation,
  extractRetentionPresentationInvariantTokens,
} from "./apply-retention-tone-presentation";

export {
  assertRetentionRescuePromotionFidelity,
  type RetentionRescuePromotionFidelityInput,
  type RetentionRescuePromotionFidelityResult,
} from "./assert-retention-rescue-promotion-fidelity";

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
