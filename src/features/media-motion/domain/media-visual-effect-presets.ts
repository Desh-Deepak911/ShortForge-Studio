/**
 * Closed visual-effect preset catalog.
 * Deterministic brightness/contrast/saturation only — no blur, shaders, or CSS strings.
 * Story owns the persisted contract; this leaf owns authoring labels + full targets.
 */

import type {
  SceneMediaVisualEffect,
  SceneMediaVisualEffectPresetId,
} from "@/features/story/types/story.types";
import { SCENE_MEDIA_VISUAL_EFFECT_VERSION } from "@/features/story/types/story.types";

export type MediaVisualEffectPresetId = SceneMediaVisualEffectPresetId;
export type { SceneMediaVisualEffect };

export const MEDIA_VISUAL_EFFECT_VERSION = SCENE_MEDIA_VISUAL_EFFECT_VERSION;

/** Renderer-safe BCS parameters in the same 0–200% space as visualAdjustments. */
export interface MediaVisualEffectFilterParams {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
}

export interface MediaVisualEffectPresetDefinition {
  readonly id: MediaVisualEffectPresetId;
  readonly label: string;
  /** Full-intensity target (identity channels are 100). */
  readonly full: MediaVisualEffectFilterParams;
}

export const MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS: MediaVisualEffectFilterParams = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

/**
 * Small deterministic allowlist. Labels are non-technical.
 * No blur — avoids Browser/Headless edge differences in this catalog.
 */
export const MEDIA_VISUAL_EFFECT_PRESETS: readonly MediaVisualEffectPresetDefinition[] = [
  {
    id: "none",
    label: "None",
    full: { ...MEDIA_VISUAL_EFFECT_IDENTITY_PARAMS },
  },
  {
    id: "vivid",
    label: "Vivid",
    full: { brightness: 108, contrast: 112, saturation: 140 },
  },
  {
    id: "cinematic",
    label: "Cinematic",
    full: { brightness: 94, contrast: 118, saturation: 78 },
  },
  {
    id: "monochrome",
    label: "Monochrome",
    full: { brightness: 100, contrast: 110, saturation: 0 },
  },
];

const PRESET_BY_ID = new Map(
  MEDIA_VISUAL_EFFECT_PRESETS.map((preset) => [preset.id, preset] as const),
);

export function isMediaVisualEffectPresetId(
  value: unknown,
): value is MediaVisualEffectPresetId {
  return typeof value === "string" && PRESET_BY_ID.has(value as MediaVisualEffectPresetId);
}

export function getMediaVisualEffectPreset(
  presetId: unknown,
): MediaVisualEffectPresetDefinition {
  if (isMediaVisualEffectPresetId(presetId)) {
    return PRESET_BY_ID.get(presetId)!;
  }
  return PRESET_BY_ID.get("none")!;
}

export function listMediaVisualEffectPresets(): readonly MediaVisualEffectPresetDefinition[] {
  return MEDIA_VISUAL_EFFECT_PRESETS;
}
