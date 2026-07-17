export type {
  HookCandidate,
  HookCandidateOrigin,
  HookClaimProvenanceCategory,
  HookClaimVerificationStatus,
  HookContractVersion,
  HookDiagnostics,
  HookFallbackCallback,
  HookFallbackKind,
  HookFallbackRequest,
  HookFallbackResult,
  HookGenerationPath,
  HookGroundingClaim,
  HookGroundingContext,
  HookLengthEnforcementKind,
  HookNormalizedGroundingStatus,
  HookOpeningIntent,
  HookOpeningIntentKind,
  HookOpeningSpan,
  HookPlan,
  HookPlanSnapshot,
  HookRepairCallback,
  HookRepairRequest,
  HookRepairResult,
  HookRequestInput,
  HookResolvedConstraints,
  HookSelection,
  HookSource,
  HookStrategyId,
  HookStrategySource,
  HookValidationGroundingStatus,
  HookValidationOutcome,
  HookValidationResult,
  HookValidationScores,
  NormalizedHookRequest,
  HookDirective,
} from "./hook-contract.types";

export {
  HOOK_COMPATIBILITY_FALLBACK_STRATEGY_ID,
  HOOK_CONTRACT_VERSION,
  HOOK_DEFAULT_DURATION_SECONDS,
  HOOK_EVIDENCE_SURPRISE_STRATEGY_ID,
  HOOK_MAX_CLAIM_ID_CHARS,
  HOOK_MAX_CLAIM_TEXT_CHARS,
  HOOK_MAX_DURATION_SECONDS,
  HOOK_MAX_OPENING_STYLE_ADVISORY_CHARS,
  HOOK_MAX_USER_AUTHORED_HOOK_CHARS,
  HOOK_MAX_USER_AUTHORED_HOOK_WORDS,
  HOOK_MIN_DURATION_SECONDS,
  HOOK_OPENING_INTENT_EVIDENCE_LED_SURPRISE,
  HOOK_PLAN_FINGERPRINT_PREFIX,
  HOOK_REQUEST_FINGERPRINT_PREFIX,
  HOOK_SPEAKING_WORDS_PER_SECOND,
  HOOK_USER_DIRECTED_STRATEGY_ID,
} from "./hook-contract.constants";

export { countHookWords } from "./hook-word-count";

export {
  assertHookPlanFingerprint,
  assertHookRequestFingerprint,
  buildHookPlanFingerprint,
  buildHookRequestFingerprint,
  hookStableHash,
  hookStableStringify,
  normalizeGroundingClaimsForFingerprint,
} from "./hook-fingerprint";

export {
  HookNormalizationError,
  hasEligibleVerifiedFactualClaim,
  isEligibleVerifiedFactualClaim,
  normalizeHookRequest,
  resolveNormalizedGroundingStatus,
} from "./normalize-hook-request";

export {
  assertRequestPlanCoherence,
  HookRequestPlanMismatchError,
} from "./assert-request-plan-coherence";

export {
  extractHookSubjectTokens,
  openingPreservesHookSubject,
  resolveHookExampleSubjectAnchor,
} from "./hook-subject-tokens";
