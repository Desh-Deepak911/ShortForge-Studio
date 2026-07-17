/**
 * Retention Story validation public surface — Sprint 10F / 10F.1.
 *
 * Hard-gate raw evaluator is intentionally not exported here (not a public
 * authority bypass). Verification may deep-import the internal module.
 */

export {
  RETENTION_VALIDATION_VERSION,
  RETENTION_VALIDATION_FINGERPRINT_PREFIX,
  RETENTION_THRESHOLD_REGISTRY_VERSION,
  RETENTION_HEURISTIC_REGISTRY_VERSION,
  RETENTION_HARD_GATE_IDS,
  RETENTION_EDITORIAL_COMPONENT_IDS,
} from "./retention-validation.constants";

export type {
  RetentionHardGateId,
  RetentionEditorialComponentId,
  RetentionValidationFailureClass,
  RetentionHardGateOutcome,
  RetentionEditorialScores,
  RetentionValidationResult,
  RetentionDiagnostics,
  RetentionDiagnosticsTerminalState,
  RetentionCompressionWordPolicyResult,
  RetentionStoryValidationOutcome,
  ValidateRetentionStoryCandidateInput,
  RetentionValidationCoherenceInput,
} from "./retention-validation.types";

export {
  RetentionValidationError,
  isRetentionValidationError,
  type RetentionValidationErrorReason,
} from "./retention-validation-errors";

export {
  buildRetentionValidationFingerprint,
  buildRetentionValidationFingerprintFromResult,
  type RetentionValidationFingerprintPayload,
} from "./retention-validation-fingerprint";

export {
  getRetentionThresholdRegistryVersion,
  resolveRetentionReadinessThreshold,
  usesShortRetentionWeighting,
} from "./retention-validation-thresholds";

export {
  RETENTION_FORBIDDEN_INTRO_PATTERNS,
  matchesRetentionForbiddenIntroPattern,
} from "./retention-generic-intro-patterns";

export { countRetentionNarrationWords } from "./count-retention-narration-words";

export {
  RETENTION_SPOKEN_COMPLETENESS_VERSION,
  evaluateRetentionSpokenCompleteness,
  type RetentionSpokenCompletenessReasonId,
  type RetentionSpokenCompletenessResult,
} from "./evaluate-retention-spoken-completeness";

export { validateRetentionCompressionWordPolicy } from "./validate-retention-compression";

export {
  getRetentionHeuristicRegistryVersion,
  clamp01,
  scoreRetentionEditorialQuality,
  computeRetentionAggregates,
} from "./score-retention-editorial-quality";

export {
  buildRetentionValidationDiagnostics,
  buildSkippedScenesOnlyDiagnostics,
} from "./build-retention-validation-diagnostics";

export { assertRetentionValidationResultCoherence } from "./assert-retention-validation-result-coherence";

export { validateRetentionStoryCandidate } from "./validate-retention-story-candidate";
