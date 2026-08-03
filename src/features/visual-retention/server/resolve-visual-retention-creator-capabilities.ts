/**
 * Server-only creator-UI capability snapshot for GET /api/visual-retention/capabilities.
 * Returns resolved booleans only — never raw env, branch policy internals, or secrets.
 */

import { isMixedMediaScenesCapabilityEnabled } from "@/features/mixed-media-scenes/domain/mixed-media-scenes-capability";

import { isSourceQualityIntelligenceCapabilityEnabled } from "../domain/source-quality-intelligence-capability";
import { isVisualBeatDensityCapabilityEnabled } from "../domain/visual-beat-density-capability";
import { resolveVisualRetentionGatesFromEnvironment } from "../domain/visual-retention-environment";

export interface VisualRetentionCreatorCapabilitiesV1 {
  readonly version: 1;
  readonly mixedMediaScenesEnabled: boolean;
  readonly visualBeatDensityEnabled: boolean;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly phasesValid: boolean;
}

export function resolveVisualRetentionCreatorCapabilitiesFromEnvironment(
  env: Readonly<Record<string, unknown>>,
): VisualRetentionCreatorCapabilitiesV1 {
  const gates = resolveVisualRetentionGatesFromEnvironment(env);
  return Object.freeze({
    version: 1 as const,
    mixedMediaScenesEnabled: isMixedMediaScenesCapabilityEnabled(gates),
    visualBeatDensityEnabled: isVisualBeatDensityCapabilityEnabled(gates),
    sourceQualityIntelligenceEnabled:
      isSourceQualityIntelligenceCapabilityEnabled(gates),
    phasesValid: gates.valid === true,
  });
}
