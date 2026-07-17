/**
 * Retention validation strategy thresholds — Sprint 10F.
 */

import type { StoryFormatStrategyId } from "../domain/retention-story-contract.types";
import { RETENTION_THRESHOLD_REGISTRY_VERSION } from "./retention-validation.constants";

export function getRetentionThresholdRegistryVersion(): string {
  return RETENTION_THRESHOLD_REGISTRY_VERSION;
}

/** Min retentionReadiness after all hard gates pass. */
export function resolveRetentionReadinessThreshold(
  formatStrategyId: StoryFormatStrategyId,
): number {
  switch (formatStrategyId) {
    case "short_retention":
      return 0.62;
    case "short_standard":
      return 0.55;
    case "extended_short":
      return 0.58;
    default:
      // Unsupported long-form in Sprint 10 — fail closed with unreachable threshold.
      return 1;
  }
}

export function usesShortRetentionWeighting(
  formatStrategyId: StoryFormatStrategyId,
): boolean {
  return formatStrategyId === "short_retention";
}
