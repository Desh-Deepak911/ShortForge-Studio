/**
 * visual-retention-presets-v1 capability gate (staging-only).
 *
 * Defaults off unless phase gates explicitly enable the ordered chain through
 * this reserved creator-authoring orchestration capability (phase 12F).
 *
 * `visualRetentionPresetsEnabled` authorizes future creator-side preset
 * orchestration of existing authoring settings. It is not a renderer capability
 * by itself: it must not become an ExportManifest requiredCapabilities entry,
 * Browser/Headless supported-renderer advertisement, fingerprint input, or
 * preview/frame-preparation requirement solely because the phase gate is on.
 * Later applied settings may still generate their own existing renderer
 * requirements; this preset capability never does.
 */

import {
  buildEnabledVisualRetentionCapabilities,
  type VisualRetentionCapabilityId,
} from "./visual-retention-capabilities";
import type { VisualRetentionPhaseGateSnapshotV1 } from "./visual-retention-phase-gates";

export const VISUAL_RETENTION_PRESETS_CAPABILITY_ID =
  "visual-retention-presets-v1" as const satisfies VisualRetentionCapabilityId;

/** True when staging phase gates enable visual-retention presets. */
export function isVisualRetentionPresetsCapabilityEnabled(
  gates: VisualRetentionPhaseGateSnapshotV1,
): boolean {
  if (!gates.valid) {
    return false;
  }
  const enabled = buildEnabledVisualRetentionCapabilities(gates);
  return enabled.includes(VISUAL_RETENTION_PRESETS_CAPABILITY_ID);
}

/** Pure membership check against an already-resolved capability list. */
export function listIncludesVisualRetentionPresetsCapability(
  capabilities: readonly VisualRetentionCapabilityId[],
): boolean {
  return capabilities.includes(VISUAL_RETENTION_PRESETS_CAPABILITY_ID);
}
