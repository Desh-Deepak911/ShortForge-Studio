/**
 * visual-beat-density-v1 capability gate (staging-only).
 * Defaults off unless phase gates explicitly enable narration retention,
 * mixed-media scenes, and visual-beat density.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const VISUAL_BEAT_DENSITY_CAPABILITY_ID =
  "visual-beat-density-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable the reserved visual-beat-density capability. */
export function isVisualBeatDensityCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(VISUAL_BEAT_DENSITY_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesVisualBeatDensityCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(VISUAL_BEAT_DENSITY_CAPABILITY_ID);
}
