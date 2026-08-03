/**
 * shortforge-brand-sting-v1 capability gate (staging-only).
 * Defaults off unless phase gates explicitly enable the ordered chain through
 * this reserved creator capability. Export-drawer outro UI remains unimplemented
 * until a later gated slice.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const SHORTFORGE_BRAND_STING_CAPABILITY_ID =
  "shortforge-brand-sting-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable the ShortForge Studio brand sting. */
export function isShortForgeBrandStingCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(SHORTFORGE_BRAND_STING_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesShortForgeBrandStingCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(SHORTFORGE_BRAND_STING_CAPABILITY_ID);
}
