/**
 * source-quality-intelligence-v1 capability gate (staging-only).
 * Defaults off unless phase gates explicitly enable the ordered chain through
 * this reserved creator capability.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const SOURCE_QUALITY_INTELLIGENCE_CAPABILITY_ID =
  "source-quality-intelligence-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable source-quality intelligence. */
export function isSourceQualityIntelligenceCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(SOURCE_QUALITY_INTELLIGENCE_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesSourceQualityIntelligenceCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(SOURCE_QUALITY_INTELLIGENCE_CAPABILITY_ID);
}
