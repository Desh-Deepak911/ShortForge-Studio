/**
 * Retention production activation — Sprint 10F.3.
 */

export type {
  RetentionStoryPlanSnapshot,
  RetentionValidationSummary,
  RetentionPersistedTerminalState,
  RetentionValidationSummaryLinkage,
} from "./retention-persistence.types";

export {
  validateRetentionStoryPlanSnapshot,
  validateRetentionValidationSummary,
  validateRetentionExplainabilityEnvelope,
  isCreatorStoryStrategyCoherentWithPlan,
  type RetentionPersistenceRejectReason,
  type RetentionPersistenceValidateResult,
  type RetentionExplainabilityEnvelopeResult,
} from "./validate-retention-persistence";

export {
  sanitizeCreationBriefRetentionPersistence,
  type CreationBriefRetentionSlice,
  type SanitizedStoryStrategySelection,
} from "./sanitize-creation-brief-retention";

export type {
  RetentionProductionFailureCategory,
  RetentionProductionSafeDiagnostics,
  RetentionApprovedNarrationResult,
  RetentionProductionNarrationResult,
  RunRetentionProductionNarrationInput,
} from "./retention-production.types";

export { summarizeLedgerBudget } from "./retention-production.types";

export {
  buildProductionStoryContractInput,
  mergeGroundingWithPremise,
  type BuildProductionStoryContractInputArgs,
} from "./build-production-story-contract-input";

export { deriveRetentionClaimAdaptations } from "./derive-retention-claim-adaptations";

export {
  captureRetentionRequestedHookAuthority,
  deriveRetentionHookPreferenceAdaptation,
  assertRetentionHookPreferenceDispositionCoherence,
  HOOK_STYLE_RECONCILED_CREATOR_NOTE,
  type RetentionRequestedHookAuthority,
  type RetentionHookPlanAuthorityRef,
  type DeriveRetentionHookPreferenceAdaptationResult,
} from "./derive-retention-hook-preference-adaptation";

export { buildRetentionStoryPlanSnapshot } from "./build-retention-plan-snapshot";
export { buildRetentionValidationSummary } from "./build-retention-validation-summary";

export {
  commitRetentionApprovedNarration,
  type CommitRetentionApprovedNarrationInput,
  type CommitRetentionApprovedNarrationResult,
} from "./commit-retention-approved-narration";

export {
  buildRetentionSafeResponseEnvelope,
  buildRetentionSafeResponseEnvelopeFromApproved,
  assertNoPrivateRetentionFieldsSerialized,
  type RetentionSafeResponseEnvelope,
} from "./build-retention-safe-response-envelope";

export {
  creatorSafeErrorMessage,
  mapStoryErrorReason,
  mapPlannerFailure,
  mapHookBridgeFailure,
  mapTerminalFailure,
} from "./map-retention-production-failure";

export {
  RETENTION_INVALID_CREATOR_INPUT_FAILURE_CATEGORIES,
  RETENTION_CREATOR_CORRECTABLE_FAILURE_CATEGORIES,
  RETENTION_SAFETY_FAILURE_CATEGORIES,
  RETENTION_INFRASTRUCTURE_FAILURE_CATEGORIES,
  RETENTION_LEGACY_QUALITY_FAILURE_CATEGORY,
  RETENTION_NON_APPLICABLE_FAILURE_CATEGORIES,
  RETENTION_NON_TERMINAL_EDITORIAL_ADAPTATIONS,
  RETENTION_VALID_FLEXIBLE_REMAINING_TERMINAL_CATEGORIES,
  CREATION_RELIABILITY_MODE_DEFAULT,
  type CreationReliabilityMode,
} from "./retention-terminal-failure-taxonomy";

export { runRetentionProductionNarration } from "./run-retention-production-narration";

export type {
  RetentionGenerationDisposition,
  RetentionGenerationAdaptationId,
  RetentionGenerationDispositionSummary,
  RetentionFactHandlingMode,
} from "./retention-generation-disposition.types";
export { freezeDispositionSummary } from "./retention-generation-disposition.types";
export { buildRetentionGenerationDisposition } from "./build-retention-generation-disposition";

export { assertCommitGateLedgerAuthority } from "./assert-commit-gate-ledger-authority";
export {
  resolveRetentionProductionMaxOutputTokens,
  RETENTION_PRODUCTION_OUTPUT_TOKEN_BOUNDS,
  type RetentionProductionModelCallKind,
  type ResolveRetentionProductionMaxOutputTokensInput,
} from "./resolve-retention-production-max-output-tokens";

// OpenAI adapter factories stay deep-imported / lazy-loaded by the orchestrator.
// Do not re-export them from this barrel — they pull server-only AI clients.
