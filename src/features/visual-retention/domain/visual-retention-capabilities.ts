import type {
  VisualRetentionPhaseGateSnapshotV1,
  VisualRetentionPhaseId,
} from "./visual-retention-phase-gates";

export const VISUAL_RETENTION_CAPABILITY_IDS = [
  "narration-timing-v1",
  "mixed-media-scenes-v1",
  "visual-beat-density-v1",
  "source-quality-intelligence-v1",
  "keyframed-visual-effects-v1",
  "engagement-overlays-v1",
  "shortforge-brand-sting-v1",
  "visual-retention-presets-v1",
] as const;

export type VisualRetentionCapabilityId =
  (typeof VISUAL_RETENTION_CAPABILITY_IDS)[number];

export type VisualRetentionRendererKind = "preview" | "browser" | "headless";
export type VisualRetentionResolution = "720p" | "1080p" | "4k";

export interface VisualRetentionCapabilityRequirement {
  readonly capability: VisualRetentionCapabilityId;
  readonly level: "required" | "optional";
}

export interface VisualRetentionCapabilityEnvelopeV1 {
  readonly version: 1;
  readonly renderer: VisualRetentionRendererKind;
  readonly capabilities: readonly VisualRetentionCapabilityId[];
  readonly resolutions: readonly VisualRetentionResolution[];
}

export interface VisualRetentionCapabilityWarning {
  readonly code: "OPTIONAL_CAPABILITY_UNAVAILABLE";
  readonly capability: VisualRetentionCapabilityId;
  readonly message: string;
}

export interface VisualRetentionCapabilityTerminalFailure {
  readonly reasonId: "UNSUPPORTED_CAPABILITY";
  readonly stage: "pre_dispatch";
  readonly retryable: false;
  readonly missingCapabilities: readonly VisualRetentionCapabilityId[];
  readonly unsupportedResolution: VisualRetentionResolution | null;
  readonly message: string;
}

export interface VisualRetentionCapabilityNegotiationResult {
  readonly supported: boolean;
  readonly warnings: readonly VisualRetentionCapabilityWarning[];
  readonly terminalFailure: VisualRetentionCapabilityTerminalFailure | null;
}

const CAPABILITY_PHASE: Readonly<
  Partial<Record<VisualRetentionCapabilityId, VisualRetentionPhaseId>>
> = Object.freeze({
  "mixed-media-scenes-v1": "12B",
  "visual-beat-density-v1": "12C",
  "source-quality-intelligence-v1": "12D",
  "keyframed-visual-effects-v1": "12E",
  "engagement-overlays-v1": "12E",
  "shortforge-brand-sting-v1": "12E",
  "visual-retention-presets-v1": "12F",
});

/** Narration is the always-required backbone; music is intentionally not a capability. */
export function buildEnabledVisualRetentionCapabilities(
  gates: VisualRetentionPhaseGateSnapshotV1,
): readonly VisualRetentionCapabilityId[] {
  const capabilities: VisualRetentionCapabilityId[] = ["narration-timing-v1"];

  for (const capability of VISUAL_RETENTION_CAPABILITY_IDS) {
    const phase = CAPABILITY_PHASE[capability];
    if (phase && gates.phases[phase].enabled) {
      capabilities.push(capability);
    }
  }

  return Object.freeze([...new Set(capabilities)]);
}

export function negotiateVisualRetentionCapabilities(input: {
  readonly requirements: readonly VisualRetentionCapabilityRequirement[];
  readonly renderer: VisualRetentionCapabilityEnvelopeV1;
  readonly requestedResolution: VisualRetentionResolution;
}): VisualRetentionCapabilityNegotiationResult {
  const available = new Set(input.renderer.capabilities);
  const supportedResolutions = new Set(input.renderer.resolutions);
  const missingRequired = new Set<VisualRetentionCapabilityId>();
  const warnings: VisualRetentionCapabilityWarning[] = [];

  for (const requirement of input.requirements) {
    if (available.has(requirement.capability)) continue;
    if (requirement.level === "required") {
      missingRequired.add(requirement.capability);
      continue;
    }
    warnings.push(
      Object.freeze({
        code: "OPTIONAL_CAPABILITY_UNAVAILABLE" as const,
        capability: requirement.capability,
        message: `${requirement.capability} is unavailable in ${input.renderer.renderer}; export can continue without it.`,
      }),
    );
  }

  const missingCapabilities = [...missingRequired];
  const unsupportedResolution = supportedResolutions.has(input.requestedResolution)
    ? null
    : input.requestedResolution;
  if (missingCapabilities.length > 0 || unsupportedResolution !== null) {
    return Object.freeze({
      supported: false,
      warnings: Object.freeze(warnings),
      terminalFailure: Object.freeze({
        reasonId: "UNSUPPORTED_CAPABILITY" as const,
        stage: "pre_dispatch" as const,
        retryable: false as const,
        missingCapabilities: Object.freeze(missingCapabilities),
        unsupportedResolution,
        message:
          unsupportedResolution === null
            ? `The ${input.renderer.renderer} renderer does not support every required visual-retention capability.`
            : `The ${input.renderer.renderer} renderer does not support ${input.requestedResolution}.`,
      }),
    });
  }

  return Object.freeze({
    supported: true,
    warnings: Object.freeze(warnings),
    terminalFailure: null,
  });
}

export function createVisualRetentionCapabilityEnvelope(input: {
  readonly renderer: VisualRetentionRendererKind;
  readonly capabilities: readonly VisualRetentionCapabilityId[];
}): VisualRetentionCapabilityEnvelopeV1 {
  const resolutions: readonly VisualRetentionResolution[] =
    input.renderer === "headless"
      ? ["720p", "1080p", "4k"]
      : ["720p", "1080p"];

  return Object.freeze({
    version: 1 as const,
    renderer: input.renderer,
    capabilities: Object.freeze([...new Set(input.capabilities)]),
    resolutions: Object.freeze(resolutions),
  });
}

export interface VisualRetentionRendererChoiceResult {
  readonly browserSelectable: boolean;
  readonly headlessSelectable: boolean;
  readonly recommended: "browser" | "headless" | "blocked";
}

/**
 * Preference is advisory. It never changes whether Browser is selectable.
 */
export function resolveVisualRetentionRendererChoice(input: {
  readonly browser: VisualRetentionCapabilityNegotiationResult;
  readonly headless: VisualRetentionCapabilityNegotiationResult;
  readonly headlessPreferred: boolean;
}): VisualRetentionRendererChoiceResult {
  const browserSelectable = input.browser.supported;
  const headlessSelectable = input.headless.supported;

  const recommended =
    input.headlessPreferred && headlessSelectable
      ? "headless"
      : browserSelectable
        ? "browser"
        : headlessSelectable
          ? "headless"
          : "blocked";

  return Object.freeze({
    browserSelectable,
    headlessSelectable,
    recommended,
  });
}
