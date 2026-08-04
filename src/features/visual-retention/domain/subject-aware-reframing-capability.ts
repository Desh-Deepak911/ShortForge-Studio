/**
 * subject-aware-reframing-v1 capability gate (staging-only).
 *
 * Independently negotiated under the same ordered phase chain as other visual-
 * motion capabilities. It must not be inferred from source-quality-intelligence-v1
 * alone — earlier phases cannot expose this creator boolean.
 *
 * Future Apply/Undo may reuse source-quality framing mechanics, but enablement
 * remains this capability's responsibility.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const SUBJECT_AWARE_REFRAMING_CAPABILITY_ID =
  "subject-aware-reframing-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable subject-aware reframing. */
export function isSubjectAwareReframingCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(SUBJECT_AWARE_REFRAMING_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesSubjectAwareReframingCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(SUBJECT_AWARE_REFRAMING_CAPABILITY_ID);
}
