/**
 * Canonical persistent media framing (image + video).
 * Stored in reference-frame units (1080×1920) — not viewport pixels.
 *
 * Compatibility:
 * - Images: StoryDocument authority is scene.image.{fitMode,x,y,scale,rotation};
 *   scene.media.{fitMode,transform} is kept in sync on write.
 * - Videos: StoryDocument authority is scene.media.{fitMode,transform}.
 * - Preview + Export both read via resolveSceneMediaFraming().
 * - Optional backgroundTreatment is additive. Absent ≡ "none".
 *   Existing Fit stories must never be reinterpreted as Fit with background.
 */

/** User-facing fit labels (maps to media cover/contain). */
export type SceneMediaFramingFitMode = "fit" | "fill";

/**
 * Optional canvas presentation when Fit geometry is active.
 * `blurred_fill` draws a Fill background (blur + mild dim) under sharp Fit.
 * Absent / "none" preserves legacy single-layer Fit/Fill.
 */
export type SceneMediaBackgroundTreatment = "none" | "blurred_fill";

export interface SceneMediaFraming {
  readonly fitMode: SceneMediaFramingFitMode;
  /** Reference-frame pan X (SCENE_IMAGE_REFERENCE_WIDTH space). */
  readonly positionX: number;
  /** Reference-frame pan Y (SCENE_IMAGE_REFERENCE_HEIGHT space). */
  readonly positionY: number;
  /** Positive scale multiplier (zoom). */
  readonly zoom: number;
  /** Degrees. */
  readonly rotationDeg: number;
  /**
   * Additive Fit presentation. Only meaningful when fitMode === "fit".
   * Defaults to "none" when absent from persistence / callers.
   */
  readonly backgroundTreatment?: SceneMediaBackgroundTreatment;
}

export type SceneMediaFramingPatch = Partial<SceneMediaFraming>;

/** Inspector slider range (−100…100) mapped onto half the reference frame. */
export const MEDIA_FRAMING_POSITION_UI_MIN = -100;
export const MEDIA_FRAMING_POSITION_UI_MAX = 100;

export function normalizeSceneMediaBackgroundTreatment(
  value: unknown,
): SceneMediaBackgroundTreatment {
  return value === "blurred_fill" ? "blurred_fill" : "none";
}
