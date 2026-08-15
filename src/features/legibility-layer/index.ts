/**
 * Content-safe legibility layer — local title/caption/branding treatments.
 */

export {
  LEGIBILITY_TITLE_WINDOW_MS,
  LEGIBILITY_TITLE_FADE_MS,
  LEGIBILITY_REFERENCE_WIDTH,
  LEGIBILITY_REFERENCE_HEIGHT,
} from "./legibility-layer.types";
export type {
  LegibilityCaptionPlacement,
  LegibilityBrandingTreatmentMode,
  LegibilityRegion,
  LegibilityTitlePlan,
  LegibilityCaptionPlan,
  LegibilityBrandingPlan,
  LegibilityLayerPlan,
  ResolveLegibilityLayerPlanInput,
} from "./legibility-layer.types";

export {
  resolveLegibilityTitleTiming,
  type ResolvedLegibilityTitleTiming,
} from "./resolve-legibility-title-timing";

export {
  resolveLegibilityLayerPlan,
  mapCaptionAnchorToLegibilityPlacement,
  LEGIBILITY_CAPTION_BACKGROUND_SUFFICIENT_OPACITY,
} from "./resolve-legibility-layer-plan";

export {
  drawLegibilityLocalScrim,
  drawLegibilityCaptionScrimIfNeeded,
  applyLegibilityTextShadow,
  clearLegibilityTextShadow,
} from "./draw-legibility-layer";
