/**
 * Retention ↔ Hook integration — Sprint 10E / 10E.1 / 10F.1.
 */

export type {
  RetentionHookBridgeFailureReason,
  RetentionHookBridgeDiagnostics,
  RetentionHookBridgeResult,
} from "./retention-hook-bridge.types";

export {
  runRetentionHookBridge,
  type RunRetentionHookBridgeInput,
  type RetentionHookRunner,
} from "./run-retention-hook-bridge";

export { reconcileRetentionHookPreferenceZeroModel } from "./reconcile-retention-hook-preference-zero-model";

export {
  assertRetentionHookBridgeReadyCoherence,
  type RetentionHookBridgeReadyResult,
  type AssertRetentionHookBridgeReadyContext,
} from "./assert-retention-hook-bridge-ready-coherence";

export { assertRetentionSafeHookEnvelopeCoherence } from "./assert-retention-safe-hook-envelope-coherence";

export type { RetentionCompositionAuthority } from "./retention-hook-bridge.types";
