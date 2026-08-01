/**
 * Mixed-media scenes capability gate (staging-only).
 * Defaults off unless phase gates explicitly enable 12A+12B.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
  type VisualRetentionPhaseGateSnapshotV1,
} from "@/features/visual-retention";

export const MIXED_MEDIA_SCENES_CAPABILITY_ID =
  "mixed-media-scenes-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable the reserved mixed-media-scenes capability. */
export function isMixedMediaScenesCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(MIXED_MEDIA_SCENES_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesMixedMediaScenesCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(MIXED_MEDIA_SCENES_CAPABILITY_ID);
}
