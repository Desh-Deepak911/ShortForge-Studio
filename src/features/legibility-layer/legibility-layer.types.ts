/**
 * Shared Preview / Browser / Headless legibility-layer contracts.
 * Local title/caption/branding treatments — never a permanent full-frame dark gradient.
 */

export const LEGIBILITY_TITLE_WINDOW_MS = 2_000;
export const LEGIBILITY_TITLE_FADE_MS = 300;

/** Reference vertical frame used by export/preview layout helpers. */
export const LEGIBILITY_REFERENCE_WIDTH = 1080;
export const LEGIBILITY_REFERENCE_HEIGHT = 1920;

export type LegibilityCaptionPlacement = "top" | "center" | "bottom" | "none";

export type LegibilityBrandingTreatmentMode = "shadow_outline" | "none";

export interface LegibilityRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LegibilityTitlePlan {
  readonly visible: boolean;
  readonly opacity: number;
  /** Local translucent backing behind the title block (reference pixels). */
  readonly region: LegibilityRegion;
  readonly fadePhase: "hidden" | "solid" | "fading";
}

export type LegibilityCaptionBackgroundIntent =
  | "explicit-transparent"
  | "enabled"
  | "absent"
  | "suppressed";

export interface LegibilityCaptionPlan {
  readonly active: boolean;
  readonly placement: LegibilityCaptionPlacement;
  /**
   * When true, the creator enabled a visible caption fill.
   * Transparent / opacity-0 choices are not treated as missing contrast.
   */
  readonly styleProvidesBackground: boolean;
  /**
   * Automatic caption scrim is retired. Creator transparent/low-opacity
   * choices are never replaced with a black rectangle.
   */
  readonly needsLocalScrim: false;
  readonly backgroundIntent: LegibilityCaptionBackgroundIntent;
  readonly region: LegibilityRegion | null;
}

export interface LegibilityBrandingPlan {
  readonly enabled: boolean;
  readonly treatment: LegibilityBrandingTreatmentMode;
  readonly region: LegibilityRegion;
}

export interface LegibilityLayerPlan {
  readonly version: 1;
  /** Always false — permanent full-frame darkening is retired. */
  readonly globalGradientEnabled: false;
  readonly title: LegibilityTitlePlan;
  readonly caption: LegibilityCaptionPlan;
  readonly branding: LegibilityBrandingPlan;
  /** Inter-scene transitions suppress caption/engagement overlays; title uses absolute time. */
  readonly suppressCaptionOverlays: boolean;
}

export interface ResolveLegibilityLayerPlanInput {
  /** Absolute content/visual time (ms) — not brand-sting local time. */
  readonly absoluteContentTimeMs: number;
  /** Narration/content duration (ms) excluding trailing brand sting. */
  readonly contentDurationMs: number;
  readonly storyTitle: string;
  readonly hasActiveCaption: boolean;
  readonly captionPlacement: LegibilityCaptionPlacement;
  readonly captionStyleBackgroundEnabled: boolean;
  /** 0–100 creator opacity. */
  readonly captionStyleBackgroundOpacity: number;
  readonly watermarkEnabled: boolean;
  readonly suppressCaptionOverlays?: boolean;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
}
