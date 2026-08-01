/**
 * Fail-closed parser for GET /api/visual-retention/capabilities JSON.
 * Only explicit `=== true` enables a capability; malformed bodies stay disabled.
 */

export interface VisualRetentionCapabilitiesSnapshot {
  readonly mixedMediaScenesEnabled: boolean;
  readonly visualBeatDensityEnabled: boolean;
  readonly ready: boolean;
}

export const VISUAL_RETENTION_CAPABILITIES_DISABLED: VisualRetentionCapabilitiesSnapshot =
  Object.freeze({
    mixedMediaScenesEnabled: false,
    visualBeatDensityEnabled: false,
    ready: false,
  });

export function parseVisualRetentionCapabilitiesResponse(
  body: unknown,
): Omit<VisualRetentionCapabilitiesSnapshot, "ready"> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {
      mixedMediaScenesEnabled: false,
      visualBeatDensityEnabled: false,
    };
  }
  const record = body as Record<string, unknown>;
  return {
    mixedMediaScenesEnabled: record.mixedMediaScenesEnabled === true,
    visualBeatDensityEnabled: record.visualBeatDensityEnabled === true,
  };
}
