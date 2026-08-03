/**
 * engagement-overlays-v1 capability gate (staging-only).
 * Defaults off unless phase gates explicitly enable the ordered chain through
 * this reserved creator capability. CTA UI remains unimplemented until a later
 * gated slice; this module only exposes fail-closed enablement.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const ENGAGEMENT_OVERLAYS_CAPABILITY_ID =
  "engagement-overlays-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable engagement overlays. */
export function isEngagementOverlaysCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(ENGAGEMENT_OVERLAYS_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesEngagementOverlaysCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(ENGAGEMENT_OVERLAYS_CAPABILITY_ID);
}
