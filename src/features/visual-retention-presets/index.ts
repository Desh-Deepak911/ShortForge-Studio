/**
 * Visual Retention Presets — pure catalog/model surface.
 *
 * Editor commands, provenance, UI, and export guidance are later slices.
 */

export {
  assertValidVisualRetentionPresetRecipe,
  deriveVisualRetentionPresetAuthoringCapabilities,
  getVisualRetentionPresetById,
  getVisualRetentionPresetCatalogVersion,
  isPromotionalVisualRetentionPreset,
  listVisualRetentionPresets,
} from "./domain/visual-retention-preset.catalog";

export {
  isVisualRetentionPresetId,
  VISUAL_RETENTION_PRESET_CATALOG_VERSION,
  VISUAL_RETENTION_PRESET_IDS,
  type VisualRetentionPresetBrandStingDurationMs,
  type VisualRetentionPresetDefinitionV1,
  type VisualRetentionPresetEngagementRecipeV1,
  type VisualRetentionPresetEngagementTimingPolicy,
  type VisualRetentionPresetId,
  type VisualRetentionPresetLookPresetId,
  type VisualRetentionPresetLookRecipeV1,
  type VisualRetentionPresetMotionPresetId,
  type VisualRetentionPresetMotionRecipeV1,
  type VisualRetentionPresetOutroRecipeV1,
  type VisualRetentionPresetPacingRecipeV1,
  type VisualRetentionPresetPreservationV1,
  type VisualRetentionPresetRecipeV1,
} from "./domain/visual-retention-preset.types";
