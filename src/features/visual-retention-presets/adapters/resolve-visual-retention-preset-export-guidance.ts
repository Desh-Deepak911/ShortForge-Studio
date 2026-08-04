/**
 * Recoverable Visual Retention Preset export guidance.
 * Authoring orchestration metadata only — never a render authority or
 * ExportManifest field. Call only on the final export-prepared story.
 */

import type { FootieScript } from "@/features/story/types";

import {
  evaluateVisualRetentionPresetStaleness,
  type VisualRetentionPresetStalenessCapabilities,
} from "../domain/evaluate-visual-retention-preset-staleness";

export const VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES = {
  VISUAL_RETENTION_PRESET_STALE: "VISUAL_RETENTION_PRESET_STALE",
} as const;

export type VisualRetentionPresetExportGuidanceCode =
  (typeof VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES)[keyof typeof VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES];

export const VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_MESSAGES: Record<
  VisualRetentionPresetExportGuidanceCode,
  string
> = {
  VISUAL_RETENTION_PRESET_STALE:
    "Visual Retention Preset settings have changed since Apply. Export will use your current settings.",
};

export interface VisualRetentionPresetExportGuidanceItem {
  readonly code: VisualRetentionPresetExportGuidanceCode;
  readonly message: string;
}

export interface ResolveVisualRetentionPresetExportGuidanceInput {
  /**
   * Shared provider readiness. Fail-closed when not true — no preset guidance
   * while capabilities are still loading.
   */
  readonly visualRetentionCapabilitiesReady?: boolean;
  /** Explicit presets authoring capability. Fail-closed when not true. */
  readonly visualRetentionPresetsEnabled?: boolean;
  readonly visualBeatDensityEnabled?: boolean;
  readonly keyframedVisualEffectsEnabled?: boolean;
  readonly engagementOverlaysEnabled?: boolean;
  readonly shortForgeBrandStingEnabled?: boolean;
  readonly mixedMediaScenesEnabled?: boolean;
}

/**
 * Derive at most one non-blocking stale warning from a final prepared story.
 * Never blocks export; never mutates the story; never invents invalid/partial
 * guidance for provenance already normalized away.
 */
export function resolveVisualRetentionPresetExportGuidance(
  preparedStory: FootieScript,
  input: ResolveVisualRetentionPresetExportGuidanceInput = {},
): readonly VisualRetentionPresetExportGuidanceItem[] {
  if (input.visualRetentionCapabilitiesReady !== true) {
    return Object.freeze([]);
  }
  if (input.visualRetentionPresetsEnabled !== true) {
    return Object.freeze([]);
  }

  const capabilities: VisualRetentionPresetStalenessCapabilities = {
    ready: true,
    visualRetentionPresetsEnabled: true,
    visualBeatDensityEnabled: input.visualBeatDensityEnabled === true,
    keyframedVisualEffectsEnabled:
      input.keyframedVisualEffectsEnabled === true,
    engagementOverlaysEnabled: input.engagementOverlaysEnabled === true,
    shortForgeBrandStingEnabled: input.shortForgeBrandStingEnabled === true,
    mixedMediaScenesEnabled: input.mixedMediaScenesEnabled === true,
  };

  const projection = evaluateVisualRetentionPresetStaleness({
    script: preparedStory,
    capabilities,
  });

  // Only honest stale records. Absent/applied emit nothing. Invalid/malformed
  // provenance is normally stripped by story sync and must not invent a second
  // metadata-invalid warning on the final prepared copy.
  if (projection.effectiveStatus !== "stale") {
    return Object.freeze([]);
  }

  const code =
    VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_CODES.VISUAL_RETENTION_PRESET_STALE;
  return Object.freeze([
    Object.freeze({
      code,
      message: VISUAL_RETENTION_PRESET_EXPORT_GUIDANCE_MESSAGES[code],
    }),
  ]);
}
