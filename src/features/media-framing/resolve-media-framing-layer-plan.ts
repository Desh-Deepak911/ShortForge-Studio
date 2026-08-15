/**
 * Shared Fit-with-background layer plan.
 * Preview, Browser export, and Headless must consume the same constants/semantics.
 * Geometry authority remains Fit/Fill; this is an additive presentation treatment.
 */

import type { SceneMediaFraming } from "./media-framing.types";
import {
  normalizeSceneMediaBackgroundTreatment,
  type SceneMediaBackgroundTreatment,
} from "./media-framing.types";

/** Blur radius at canonical 1080-wide output; scales linearly with target width. */
export const FIT_BACKGROUND_BLUR_PX_AT_1080 = 28;

/** Mild dimming alpha drawn over the blurred Fill background (0–1). */
export const FIT_BACKGROUND_DIM_ALPHA = 0.32;

/**
 * Slight overscale on the Fill background so blur kernels do not expose
 * transparent/dark canvas edges.
 */
export const FIT_BACKGROUND_COVER_EDGE_PAD = 1.1;

export type MediaFramingLayerPlanMode = "single" | "fit_with_blurred_background";

export interface MediaFramingLayerPlan {
  readonly mode: MediaFramingLayerPlanMode;
  /** Sharp foreground Fit/Fill mode (canonical framing). */
  readonly foregroundFitMode: "fit" | "fill";
  /** Background fill mode when dual-layer; always fill when active. */
  readonly backgroundFitMode: "fill" | null;
  readonly backgroundTreatment: SceneMediaBackgroundTreatment;
  readonly backgroundBlurPxAt1080: number;
  readonly backgroundDimAlpha: number;
  readonly backgroundCoverEdgePad: number;
}

export function scaleFitBackgroundBlurPx(
  targetWidth: number,
  blurPxAt1080: number = FIT_BACKGROUND_BLUR_PX_AT_1080,
): number {
  const width =
    typeof targetWidth === "number" && Number.isFinite(targetWidth) && targetWidth > 0
      ? targetWidth
      : 1080;
  return Math.max(1, (blurPxAt1080 * width) / 1080);
}

/**
 * Resolve the shared Preview/Browser/Headless layer plan from canonical framing.
 * Missing/unknown treatment → single-layer legacy Fit/Fill behavior.
 */
export function resolveMediaFramingLayerPlan(
  framing: Pick<SceneMediaFraming, "fitMode" | "backgroundTreatment">,
): MediaFramingLayerPlan {
  const fitMode = framing.fitMode === "fill" ? "fill" : "fit";
  const treatment = normalizeSceneMediaBackgroundTreatment(
    framing.backgroundTreatment,
  );
  const active = fitMode === "fit" && treatment === "blurred_fill";

  if (!active) {
    return Object.freeze({
      mode: "single",
      foregroundFitMode: fitMode,
      backgroundFitMode: null,
      backgroundTreatment: "none",
      backgroundBlurPxAt1080: FIT_BACKGROUND_BLUR_PX_AT_1080,
      backgroundDimAlpha: FIT_BACKGROUND_DIM_ALPHA,
      backgroundCoverEdgePad: FIT_BACKGROUND_COVER_EDGE_PAD,
    });
  }

  return Object.freeze({
    mode: "fit_with_blurred_background",
    foregroundFitMode: "fit",
    backgroundFitMode: "fill",
    backgroundTreatment: "blurred_fill",
    backgroundBlurPxAt1080: FIT_BACKGROUND_BLUR_PX_AT_1080,
    backgroundDimAlpha: FIT_BACKGROUND_DIM_ALPHA,
    backgroundCoverEdgePad: FIT_BACKGROUND_COVER_EDGE_PAD,
  });
}

/** True when the creator explicitly selected Fit with background. */
export function isFitWithBlurredBackgroundActive(
  framing: Pick<SceneMediaFraming, "fitMode" | "backgroundTreatment">,
): boolean {
  return resolveMediaFramingLayerPlan(framing).mode === "fit_with_blurred_background";
}
