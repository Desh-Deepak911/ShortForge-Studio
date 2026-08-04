/**
 * Pure Visual Retention Preset recipe model (catalog version 1).
 *
 * Recipes express creator intent only. They contain no commands, story objects,
 * renderer objects, clocks, randomness, or mutable collections.
 *
 * Discriminated unions make preserve vs apply/add policies mutually exclusive:
 * preserve arms carry no CTA/look/outro payload fields.
 */

import type { VisualBeatDensity } from "@/features/visual-beat-density/domain/visual-beat-plan";
import type { BrandStingDurationMs } from "@/features/brand-sting/domain/brand-sting.presets";
import type { VisualRetentionCapabilityId } from "@/features/visual-retention/domain/visual-retention-capabilities";
import type {
  EngagementOverlayKind,
  EngagementOverlayPosition,
} from "@/features/visual-retention/domain/visual-retention-extension-contracts";

export const VISUAL_RETENTION_PRESET_CATALOG_VERSION = 1 as const;

export const VISUAL_RETENTION_PRESET_IDS = [
  "visual-retention-balanced-clarity",
  "visual-retention-pulse-edit",
  "visual-retention-cinematic-hold",
  "visual-retention-share-ready",
] as const;

export type VisualRetentionPresetId =
  (typeof VISUAL_RETENTION_PRESET_IDS)[number];

/** Symbolic engagement placement policy — never a computed start time. */
export type VisualRetentionPresetEngagementTimingPolicy = "closing-scene";

/**
 * Closed look IDs a recipe may apply.
 * Identity/`none` is represented only by `{ mode: "preserve" }`.
 */
export type VisualRetentionPresetLookPresetId =
  | "vivid"
  | "cinematic"
  | "monochrome";

/**
 * Closed motion IDs used by the built-in catalog.
 * Excludes `static` and `custom` — those are not recipe apply targets.
 */
export type VisualRetentionPresetMotionPresetId =
  | "slow-zoom-in"
  | "sports-punch"
  | "gentle-drift";

export type VisualRetentionPresetBrandStingDurationMs = BrandStingDurationMs;

/** Finite motion intensity in the closed unit interval `[0, 1]`. */
export type VisualRetentionPresetMotionIntensity = number;

/** Finite look intensity in the open-closed unit interval `(0, 1]`. */
export type VisualRetentionPresetLookIntensity = number;

export type VisualRetentionPresetPacingRecipeV1 = {
  readonly mode: "suggest";
  readonly density: VisualBeatDensity;
};

export type VisualRetentionPresetMotionRecipeV1 = {
  readonly mode: "apply-if-no-keyframes";
  readonly presetId: VisualRetentionPresetMotionPresetId;
  readonly intensity: VisualRetentionPresetMotionIntensity;
};

export type VisualRetentionPresetLookRecipeV1 =
  | { readonly mode: "preserve" }
  | {
      readonly mode: "apply";
      readonly presetId: VisualRetentionPresetLookPresetId;
      readonly intensity: VisualRetentionPresetLookIntensity;
    };

export type VisualRetentionPresetEngagementRecipeV1 =
  | { readonly mode: "preserve" }
  | {
      readonly mode: "add-if-absent";
      readonly kind: EngagementOverlayKind;
      readonly position: EngagementOverlayPosition;
      readonly durationMs: number;
      readonly timingPolicy: VisualRetentionPresetEngagementTimingPolicy;
    };

export type VisualRetentionPresetOutroRecipeV1 =
  | { readonly mode: "preserve" }
  | {
      readonly mode: "enable-if-absent";
      readonly durationMs: VisualRetentionPresetBrandStingDurationMs;
    };

export interface VisualRetentionPresetRecipeV1 {
  readonly version: 1;
  readonly pacing: VisualRetentionPresetPacingRecipeV1;
  readonly motion: VisualRetentionPresetMotionRecipeV1;
  readonly look: VisualRetentionPresetLookRecipeV1;
  readonly engagement: VisualRetentionPresetEngagementRecipeV1;
  readonly outro: VisualRetentionPresetOutroRecipeV1;
}

/**
 * Explicit preservation of settings the catalog never overwrites.
 *
 * `engagementOverlays` / `shortForgeOutro` mean existing values are never
 * replaced. Share Ready may only add when the corresponding value is absent.
 *
 * Intentionally omitted (recipe may change these): pacing density intent,
 * legacy motion preset (when no keyframes), and media look when `look.mode`
 * is `apply`.
 */
export interface VisualRetentionPresetPreservationV1 {
  readonly version: 1;
  readonly narrationAndVoice: true;
  readonly musicAudioMixer: true;
  readonly sceneDurations: true;
  readonly mediaOrdering: true;
  readonly manualFraming: true;
  readonly freeformVisualAdjustments: true;
  readonly captionStyleAndAnimation: true;
  readonly subjectFocus: true;
  readonly sourceQualityProvenance: true;
  readonly subjectAwareFramingProvenance: true;
  readonly customKeyframes: true;
  /** Existing overlays are never overwritten; add-if-absent only when absent. */
  readonly engagementOverlays: true;
  /** Existing outro is never overwritten; enable-if-absent only when absent. */
  readonly shortForgeOutro: true;
}

export interface VisualRetentionPresetDefinitionV1 {
  readonly version: 1;
  readonly id: VisualRetentionPresetId;
  readonly title: string;
  readonly description: string;
  readonly recommendedFor: string;
  readonly previewCopy: string;
  readonly recipe: VisualRetentionPresetRecipeV1;
  readonly preserves: VisualRetentionPresetPreservationV1;
  /**
   * Underlying authoring capabilities required by this recipe, including
   * `visual-retention-presets-v1`, in canonical visual-retention order.
   * Always derived from the recipe — never hand-authored beside a preset.
   */
  readonly requiredAuthoringCapabilities: readonly VisualRetentionCapabilityId[];
}

export function isVisualRetentionPresetId(
  value: unknown,
): value is VisualRetentionPresetId {
  return (
    typeof value === "string" &&
    (VISUAL_RETENTION_PRESET_IDS as readonly string[]).includes(value)
  );
}
