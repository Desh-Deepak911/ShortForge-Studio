import type { VisualRetentionCapabilityId } from "./visual-retention-capabilities";

export const VISUAL_RETENTION_UI_SURFACES = [
  "editor",
  "scene-inspector",
  "timeline",
  "preview",
  "browser-export",
  "headless-export",
  "warnings-and-errors",
] as const;

export type VisualRetentionUiSurface =
  (typeof VISUAL_RETENTION_UI_SURFACES)[number];

export interface VisualRetentionUiCoverageResult {
  readonly complete: boolean;
  readonly capability: VisualRetentionCapabilityId;
  readonly missingSurfaces: readonly VisualRetentionUiSurface[];
}

const DEFAULT_CREATOR_FACING_SURFACES = VISUAL_RETENTION_UI_SURFACES;

function uiSurfaces(
  ...values: VisualRetentionUiSurface[]
): readonly VisualRetentionUiSurface[] {
  return Object.freeze(values);
}

const CAPABILITY_UI_SURFACES: Readonly<
  Partial<
    Record<VisualRetentionCapabilityId, readonly VisualRetentionUiSurface[]>
  >
> = Object.freeze({
  "shortforge-brand-sting-v1": uiSurfaces(
    "editor",
    "timeline",
    "preview",
    "browser-export",
    "headless-export",
    "warnings-and-errors",
  ),
  "narration-timing-v1": uiSurfaces(
    "editor",
    "preview",
    "browser-export",
    "headless-export",
    "warnings-and-errors",
  ),
});

/**
 * Completion gate for every creator-facing Sprint 12 capability.
 * A renderer-only or editor-only implementation is never phase-complete.
 */
export function evaluateVisualRetentionUiCoverage(input: {
  readonly capability: VisualRetentionCapabilityId;
  readonly implementedSurfaces: readonly VisualRetentionUiSurface[];
}): VisualRetentionUiCoverageResult {
  const implemented = new Set(input.implementedSurfaces);
  const requiredSurfaces =
    CAPABILITY_UI_SURFACES[input.capability] ?? DEFAULT_CREATOR_FACING_SURFACES;
  const missingSurfaces = requiredSurfaces.filter(
    (surface) => !implemented.has(surface),
  );

  return Object.freeze({
    complete: missingSurfaces.length === 0,
    capability: input.capability,
    missingSurfaces: Object.freeze(missingSurfaces),
  });
}
