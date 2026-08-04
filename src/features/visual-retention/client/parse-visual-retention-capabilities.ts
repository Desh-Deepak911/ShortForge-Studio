/**
 * Fail-closed parser for GET /api/visual-retention/capabilities JSON.
 * Only explicit `=== true` enables a capability; malformed bodies stay disabled.
 * Unknown or missing fields resolve false — version 1 responses remain compatible.
 */

export interface VisualRetentionCapabilitiesSnapshot {
  readonly mixedMediaScenesEnabled: boolean;
  readonly visualBeatDensityEnabled: boolean;
  readonly sourceQualityIntelligenceEnabled: boolean;
  readonly keyframedVisualEffectsEnabled: boolean;
  readonly engagementOverlaysEnabled: boolean;
  readonly shortForgeBrandStingEnabled: boolean;
  readonly subjectAwareReframingEnabled: boolean;
  readonly ready: boolean;
}

export const VISUAL_RETENTION_CAPABILITIES_DISABLED: VisualRetentionCapabilitiesSnapshot =
  Object.freeze({
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    sourceQualityIntelligenceEnabled: false,
    keyframedVisualEffectsEnabled: false,
    engagementOverlaysEnabled: false,
    shortForgeBrandStingEnabled: false,
    subjectAwareReframingEnabled: false,
    ready: false,
  });

function failClosedCapabilities(): Omit<
  VisualRetentionCapabilitiesSnapshot,
  "ready"
> {
  return {
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    sourceQualityIntelligenceEnabled: false,
    keyframedVisualEffectsEnabled: false,
    engagementOverlaysEnabled: false,
    shortForgeBrandStingEnabled: false,
    subjectAwareReframingEnabled: false,
  };
}

export function parseVisualRetentionCapabilitiesResponse(
  body: unknown,
): Omit<VisualRetentionCapabilitiesSnapshot, "ready"> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return failClosedCapabilities();
  }
  const record = body as Record<string, unknown>;
  return {
    mixedMediaScenesEnabled: record.mixedMediaScenesEnabled === true,
    visualBeatDensityEnabled: record.visualBeatDensityEnabled === true,
    sourceQualityIntelligenceEnabled:
      record.sourceQualityIntelligenceEnabled === true,
    keyframedVisualEffectsEnabled: record.keyframedVisualEffectsEnabled === true,
    engagementOverlaysEnabled: record.engagementOverlaysEnabled === true,
    shortForgeBrandStingEnabled: record.shortForgeBrandStingEnabled === true,
    subjectAwareReframingEnabled: record.subjectAwareReframingEnabled === true,
  };
}
