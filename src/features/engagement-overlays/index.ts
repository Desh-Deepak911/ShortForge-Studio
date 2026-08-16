/**
 * Engagement overlays — scene-scoped Like/Share/Subscribe prompts.
 * Domain, authoring commands, preview, and canvas draw helpers.
 */

export {
  ENGAGEMENT_OVERLAY_DEFAULT_DURATION_MS,
  ENGAGEMENT_OVERLAY_DEFAULT_POSITION,
  ENGAGEMENT_OVERLAY_DEFAULT_SCALE,
  ENGAGEMENT_OVERLAY_DEFAULT_SIZE,
  ENGAGEMENT_OVERLAY_KIND_OPTIONS,
  ENGAGEMENT_OVERLAY_MAX_DURATION_MS,
  ENGAGEMENT_OVERLAY_MAX_SCALE,
  ENGAGEMENT_OVERLAY_MIN_DURATION_MS,
  ENGAGEMENT_OVERLAY_MIN_SCALE,
  ENGAGEMENT_OVERLAY_POSITION_OPTIONS,
  ENGAGEMENT_OVERLAY_SIZE_OPTIONS,
  ENGAGEMENT_OVERLAY_PRESET_ID,
  ENGAGEMENT_OVERLAY_STYLE,
  ENGAGEMENT_OVERLAY_TYPE,
  ENGAGEMENT_OVERLAY_MOTION,
  ENGAGEMENT_OVERLAY_COMBINED_REF_HEIGHT,
  ENGAGEMENT_OVERLAY_COMBINED_REF_WIDTH,
  ENGAGEMENT_OVERLAY_SINGLE_REF_HEIGHT,
  ENGAGEMENT_OVERLAY_SINGLE_REF_WIDTH,
  engagementOverlayIconsForKind,
  engagementOverlayKindLabel,
  engagementOverlayLabelsForKind,
  isUiEngagementOverlayPosition,
  type EngagementOverlayIconToken,
} from "./domain/engagement-overlay.presets";

export {
  getSceneEngagementOverlay,
  normalizeSceneEngagementOverlay,
  normalizeVisualRetentionProjectExtensions,
  pruneEngagementOverlaysToScenes,
} from "./domain/normalize-engagement-overlays";

export {
  resolveEngagementOverlayWindow,
  type ResolveEngagementOverlayWindowInput,
  type ResolvedEngagementOverlayWindow,
} from "./domain/resolve-engagement-overlay-window";

export {
  projectEngagementOverlayToManifest,
  type ProjectEngagementOverlayToManifestResult,
} from "./domain/project-engagement-overlay-to-manifest";

export {
  ENGAGEMENT_OVERLAY_REFERENCE_HEIGHT,
  ENGAGEMENT_OVERLAY_REFERENCE_WIDTH,
  resolveEngagementOverlayCenteredIconLabel,
  resolveEngagementOverlayFrame,
  shouldSuppressEngagementOverlayForInterSceneTransition,
  type EngagementOverlayLayoutBox,
  type EngagementOverlayPhase,
  type ResolveEngagementOverlayFrameInput,
  type ResolvedEngagementOverlayChrome,
  type ResolvedEngagementOverlayFrame,
  type ResolvedEngagementOverlayIconLabelOrigin,
  type ResolvedEngagementOverlaySegment,
} from "./domain/resolve-engagement-overlay-frame";

export {
  ENGAGEMENT_OVERLAY_CAPTION_GAP_REF_PX,
  resolveEngagementOverlayCaptionExclusion,
  resolveEngagementOverlayCaptionSafePlacement,
  type EngagementOverlayCaptionCollisionInput,
  type EngagementOverlayCaptionSafeSlot,
  type ResolvedEngagementOverlayCaptionSafePlacement,
} from "./domain/resolve-engagement-overlay-caption-safe-placement";

export {
  ENGAGEMENT_OVERLAY_CAPABILITY_OFF_MESSAGE,
  ENGAGEMENT_OVERLAY_SCENE_MISSING_MESSAGE,
  addEngagementOverlay,
  removeEngagementOverlay,
  setEngagementOverlayDurationMs,
  setEngagementOverlayKind,
  setEngagementOverlayPosition,
  setEngagementOverlayScale,
  setEngagementOverlaySize,
  setEngagementOverlayStartMs,
  type EngagementOverlayCommandOptions,
  type EngagementOverlayCommandResult,
  type EngagementOverlayCommandStatus,
} from "./editor/engagement-overlay.commands";

export { default as EngagementOverlayControls } from "./editor/EngagementOverlayControls";
export type { EngagementOverlayControlsProps } from "./editor/EngagementOverlayControls";

export { default as EngagementOverlayPreview } from "./preview/EngagementOverlayPreview";
export type { EngagementOverlayPreviewProps } from "./preview/EngagementOverlayPreview";

export { drawEngagementOverlay } from "./render/draw-engagement-overlay";
