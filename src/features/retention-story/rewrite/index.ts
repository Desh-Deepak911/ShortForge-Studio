/**
 * Retention Studio body rewrite + terminal validation — Sprint 10F.2 / 10F.2A.
 *
 * Public surface: terminal orchestrator + necessary types/callbacks only.
 * Verification suites may deep-import internal modules.
 */

export {
  RETENTION_REWRITE_VERSION,
  RETENTION_REWRITE_TERMINAL_STATES,
} from "./retention-rewrite.constants";

export type {
  RetentionRewriteTerminalState,
  RetentionTerminalHookAuthority,
  RetentionPostRewriteHookEvidence,
  RetentionApprovedOpeningAuthority,
  RetentionRewriteDiagnostics,
  RetentionTerminalValidationResult,
  RetentionBodyRewriteRequest,
  RetentionBodyRewriteCallback,
  RetentionTerminalScenesOnlyInput,
  RetentionTerminalScriptPathInput,
  RunRetentionTerminalValidationInput,
} from "./retention-rewrite.types";

export { buildRetentionRewriteDiagnostics } from "./build-retention-rewrite-diagnostics";

export { runRetentionTerminalValidation } from "./run-retention-terminal-validation";
