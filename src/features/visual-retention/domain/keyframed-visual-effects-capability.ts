/**
 * keyframed-visual-effects-v1 capability gate (staging-only).
 *
 * Defaults off unless phase gates explicitly enable the ordered chain through
 * this reserved creator capability.
 *
 * Render authority note: multi-keyframe / custom transforms must not become
 * preview-only behavior that exports ignore. Keyframes cannot become
 * render-authoritative until a versioned ExportManifest and all Preview,
 * Browser, and Headless consumers support the same frozen motion fields.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID =
  "keyframed-visual-effects-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable keyframed visual effects. */
export function isKeyframedVisualEffectsCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesKeyframedVisualEffectsCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(KEYFRAMED_VISUAL_EFFECTS_CAPABILITY_ID);
}
