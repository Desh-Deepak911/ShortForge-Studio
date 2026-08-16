/**
 * ShortForge Studio brand sting — project-level trailing outro.
 * Domain, authoring commands, preview, and canvas draw helpers.
 */

export {
  BRAND_STING_COLORS,
  BRAND_STING_DEFAULT_DURATION_MS,
  BRAND_STING_DURATION_MS,
  BRAND_STING_DURATION_OPTIONS,
  BRAND_STING_FONT_FAMILY,
  BRAND_STING_LEAD_IN,
  BRAND_STING_LEAD_IN_DISPLAY,
  BRAND_STING_LOCKED_TITLE,
  BRAND_STING_LOCKUP_CENTER_Y_RATIO,
  BRAND_STING_MARK_SIZE_REF,
  BRAND_STING_PRESET_ID,
  isBrandStingDurationMs,
  type BrandStingDurationMs,
} from "./domain/brand-sting.presets";

export {
  createDefaultShortForgeBrandSting,
  getShortForgeBrandSting,
  normalizeShortForgeBrandSting,
  resolveAuthoritativeBrandStingDurationMs,
} from "./domain/normalize-brand-sting";

export {
  authoringBrandStingFromManifest,
  projectBrandStingToManifest,
  type ExportBrandStingManifestPayload,
  type ProjectBrandStingToManifestResult,
} from "./domain/project-brand-sting-to-manifest";

export {
  BRAND_STING_MARK_DIAMOND,
  BRAND_STING_MARK_FORGE_LINES,
  BRAND_STING_MARK_REVEAL_DIRECTION,
  BRAND_STING_MARK_UNIT,
  resolveBrandStingMarkRevealClip,
  scaleBrandStingMarkGeometry,
  type BrandStingMarkPoint,
  type BrandStingMarkRevealClip,
  type BrandStingMarkSegment,
  type ScaledBrandStingMarkGeometry,
} from "./domain/brand-sting-mark-geometry";

export {
  BRAND_STING_REFERENCE_HEIGHT,
  BRAND_STING_REFERENCE_WIDTH,
  isEnabledBrandSting,
  resolveBrandStingFinalElapsedMs,
  resolveBrandStingFrame,
  resolveBrandStingLocalElapsedMs,
  resolveBrandStingTerminalElapsedMs,
  resolveBrandStingTimelineBounds,
  resolvePreviewPlaybackDurationMs,
  type BrandStingAccentLinePlan,
  type BrandStingBeamPlan,
  type BrandStingGlowPlan,
  type BrandStingMarkGeometry,
  type BrandStingPhase,
  type BrandStingRingMarkerPlan,
  type BrandStingRingPlan,
  type BrandStingTimelineBounds,
  type ResolveBrandStingFrameInput,
  type ResolvedBrandStingFrame,
} from "./domain/resolve-brand-sting-frame";

export {
  BRAND_STING_CAPABILITY_OFF_MESSAGE,
  BRAND_STING_DURATION_INVALID_MESSAGE,
  disableBrandSting,
  enableBrandSting,
  setBrandStingDurationMs,
  type BrandStingCommandOptions,
  type BrandStingCommandResult,
  type BrandStingCommandStatus,
} from "./editor/brand-sting.commands";

export { default as BrandStingExportControls } from "./editor/BrandStingExportControls";
export type { BrandStingExportControlsProps } from "./editor/BrandStingExportControls";

export { default as BrandStingPreview } from "./preview/BrandStingPreview";
export type { BrandStingPreviewProps } from "./preview/BrandStingPreview";

export { drawBrandSting } from "./render/draw-brand-sting";
