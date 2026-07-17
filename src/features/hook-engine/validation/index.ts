export {
  assertHookCandidateId,
  buildHookCandidate,
  buildHookCandidateId,
  HookCandidateError,
  normalizeClaimRefs,
  type BuildHookCandidateInput,
} from "./build-hook-candidate";
export {
  detectFactualRiskSignals,
  isHardGateFailure,
  isQualityOnlyFailure,
  validateHookCandidate,
  type HookFactualRiskSignals,
  type ValidateHookCandidateInput,
} from "./validate-hook-candidate";
export {
  buildHookSelection,
  buildHookSelectionFromValidation,
  HookSelectionError,
} from "./build-hook-selection";
export { buildHookDiagnostics, HookDiagnosticsError } from "./build-hook-diagnostics";
export { extractOpeningSpan } from "./extract-opening-span";
