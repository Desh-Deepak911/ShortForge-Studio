/**
 * Compatibility entry for deterministic rescue.
 * Production authority lives in build-retention-coherent-deterministic-rescue.ts.
 * This file must not emit planning scaffold.
 */

export {
  buildRetentionCoherentDeterministicRescue,
  buildDeterministicFallbackNarrationCandidate,
  RETENTION_COHERENT_DETERMINISTIC_RESCUE_ID,
  type DeterministicFallbackBuildResult,
  type RetentionRescueThread,
} from "./build-retention-coherent-deterministic-rescue";
