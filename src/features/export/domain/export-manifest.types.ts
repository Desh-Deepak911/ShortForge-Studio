/**
 * Immutable ExportManifest domain types (Sprint 6B / 8D / 9C).
 * Contract: docs/architecture/EXPORT_CONTRACT.md
 *
 * Frozen backward-compatible pairs: v2 / "8D", v3 / "9C"
 * Current production pair: v4 / "9D"
 */

/** Frozen Sprint 8D contract — never silently upgraded. */
export const EXPORT_MANIFEST_V2_VERSION = 2;
export const EXPORT_RENDERER_CONTRACT_V2 = "8D";

/** Frozen Sprint 9C contract — never silently upgraded. */
export const EXPORT_MANIFEST_V3_VERSION = 3;
export const EXPORT_RENDERER_CONTRACT_V3 = "9C";

/** Current production ExportManifest / renderer contract without keyframe authority. */
export const EXPORT_MANIFEST_VERSION = 4;
export const EXPORT_RENDERER_CONTRACT_VERSION = "9D";

/** ExportManifest / renderer contract when authoritative media-motion keyframes are frozen. */
export const EXPORT_MANIFEST_V5_VERSION = 5;
export const EXPORT_RENDERER_CONTRACT_V5 = "9E";

/** Renderer feature IDs frozen into v5 requiredCapabilities. */
export type ExportRendererCapabilityId = "keyframed-visual-effects-v1";

export const EXPORT_RENDERER_CAPABILITY_KEYFRAMED_VISUAL_EFFECTS =
  "keyframed-visual-effects-v1" as const satisfies ExportRendererCapabilityId;

/** Frozen keyframe payload schema inside ExportManifest v5 motion records. */
export const EXPORT_MEDIA_MOTION_KEYFRAME_SCHEMA_VERSION = 1 as const;

/** @deprecated Prefer EXPORT_MANIFEST_V2_VERSION for frozen-v2 checks. */
export const EXPORT_MANIFEST_V2 = EXPORT_MANIFEST_V2_VERSION;
/** @deprecated Prefer EXPORT_RENDERER_CONTRACT_V2 for frozen-v2 checks. */
export const EXPORT_RENDERER_CONTRACT_8D = EXPORT_RENDERER_CONTRACT_V2;

export type ExportManifestFormat = "webm" | "mp4";
export type ExportManifestQuality = "standard" | "high";
/** Product resolution labels (maps from 720x1280 / 1080x1920 settings). */
export type ExportManifestResolutionLabel = "720p" | "1080p";
export type ExportFitMode = "fit" | "fill";
export type ExportAudioModeManifest = "silent" | "voice" | "voice-with-music";

export interface ExportProjectManifest {
  readonly projectId: string;
  readonly storyTitle: string;
  readonly contentDurationMs: number;
  readonly renderDurationMs: number;
  readonly endBufferMs: number;
  readonly aspectRatio: "9:16";
  readonly sceneCount: number;
}

export interface ExportOutputManifest {
  readonly format: ExportManifestFormat;
  readonly quality: ExportManifestQuality;
  readonly resolution: ExportManifestResolutionLabel;
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
  readonly filename: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly bitrate: number;
}

export interface ExportMediaMotionKeyframeManifest {
  readonly offsetMs: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
  readonly opacity: number;
  readonly easing: string;
}

/**
 * Frozen media-motion payload.
 * v4: enabled/presetId/easing/intensity only (no keyframes).
 * v5: may include authoritative keyframes + schema version when capability-gated.
 */
export interface ExportMediaMotionManifest {
  readonly enabled: boolean;
  readonly presetId: string;
  readonly easing: string;
  readonly intensity: number;
  readonly keyframes?: readonly ExportMediaMotionKeyframeManifest[];
  readonly keyframeSchemaVersion?: 1;
}

export interface ExportMediaVisualAdjustmentsManifest {
  readonly version: 1;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly shadowEnabled: boolean;
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  /** Canonical 1080-wide reference-frame pixels. */
  readonly shadowBlur: number;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
}

/**
 * Capability-gated closed visual-effect payload (v5 / 9E only).
 * Identity/absent effects are omitted — never present on v4.
 * brightness/contrast/saturation are frozen resolved renderer parameters;
 * Browser/Headless must consume them directly and never re-lookup the
 * authoring preset catalog. No CSS/canvas filter strings are stored.
 */
export interface ExportMediaVisualEffectManifest {
  readonly version: 1;
  readonly presetId: "vivid" | "cinematic" | "monochrome";
  /** Normalized intensity in (0, 1] — provenance for the freeze. */
  readonly intensity: number;
  /** Frozen BCS parameters in the visualAdjustments percent space. */
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
}

export interface ExportImageMediaManifest {
  readonly type: "image";
  readonly source: string;
  readonly fitMode: ExportFitMode;
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
  readonly motion: ExportMediaMotionManifest | null;
  readonly visualAdjustments?: ExportMediaVisualAdjustmentsManifest;
  readonly visualEffect?: ExportMediaVisualEffectManifest;
}

export interface ExportVideoMediaManifest {
  readonly type: "video";
  readonly source: string;
  readonly sourceDurationMs: number;
  readonly trimStartMs: number;
  readonly trimEndMs: number;
  readonly playbackRate: 1;
  readonly sourceAudioPolicy: "muted";
  readonly fitMode: ExportFitMode;
  readonly positionX: number;
  readonly positionY: number;
  readonly zoom: number;
  readonly rotationDeg: number;
  readonly motion: ExportMediaMotionManifest | null;
  readonly visualAdjustments?: ExportMediaVisualAdjustmentsManifest;
  readonly visualEffect?: ExportMediaVisualEffectManifest;
}

export interface ExportPlaceholderMediaManifest {
  readonly type: "placeholder";
}

export type ExportMediaManifest =
  | ExportImageMediaManifest
  | ExportVideoMediaManifest
  | ExportPlaceholderMediaManifest;

/**
 * Frozen per-item media window on a scene (Sprint 8D).
 * Windows are scene-local half-open [startOffsetMs, endOffsetMs).
 */
export interface ExportSceneMediaTimelineItemManifest {
  readonly id: string;
  readonly index: number;
  readonly startOffsetMs: number;
  readonly endOffsetMs: number;
  readonly durationMs: number;
  readonly media: ExportMediaManifest;
}

/** Canonical per-scene media timeline frozen into the ExportManifest. */
export interface ExportSceneMediaTimelineManifest {
  readonly version: 1;
  readonly items: readonly ExportSceneMediaTimelineItemManifest[];
}

export interface ExportTransitionManifest {
  readonly type: string;
  readonly durationMs: number;
  readonly fromSceneId: string;
  readonly toSceneId: string;
}

/**
 * Frozen intra-scene media transition boundary (ExportManifest v3 / 9C).
 * Cut is absence — never stored. Overlay offsets are scene-local.
 */
export interface ExportSceneMediaTransitionBoundaryManifest {
  readonly fromItemId: string;
  readonly toItemId: string;
  readonly fromItemIndex: number;
  readonly toItemIndex: number;
  readonly effect:
    | "fade"
    | "slide-left"
    | "slide-right"
    | "zoom-in"
    | "zoom-out"
    | "blur";
  readonly requestedDurationMs: number;
  readonly effectiveDurationMs: number;
  readonly overlayStartOffsetMs: number;
  readonly overlayEndOffsetMs: number;
}

/** Always present on v3 scenes; empty boundaries = hard-cut. */
export interface ExportSceneMediaTransitionTrackManifest {
  readonly version: 1;
  readonly boundaries: readonly ExportSceneMediaTransitionBoundaryManifest[];
}

interface ExportSceneManifestBase {
  readonly id: string;
  readonly index: number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly endMs: number;
  /**
   * First-item compatibility media — must equal `mediaTimeline.items[0].media`.
   * Renderers must resolve active media from `mediaTimeline`, not this field.
   */
  readonly media: ExportMediaManifest;
  /** Canonical frozen Scene Media Timeline for this scene. */
  readonly mediaTimeline: ExportSceneMediaTimelineManifest;
  readonly transitionOut: ExportTransitionManifest | null;
  readonly captionMode: string;
  /** True when at least one timeline item is drawable. */
  readonly hasDrawableMedia: boolean;
}

/** Frozen v2 / 8D scene — no intra-scene transition track. */
export type ExportSceneManifestV2 = ExportSceneManifestBase;

/** Production v3 / 9C scene — always carries mediaTransitions (may be empty). */
export interface ExportSceneManifestV3 extends ExportSceneManifestBase {
  readonly mediaTransitions: ExportSceneMediaTransitionTrackManifest;
}

export type ExportSceneManifest = ExportSceneManifestV2 | ExportSceneManifestV3;

export interface ExportCaptionStyleManifest {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly color: string;
  readonly backgroundColor: string;
  readonly textAlign: string;
  /** 0–100 percent. Explicit values must not be overwritten by defaults. */
  readonly backgroundOpacity: number;
  readonly backgroundEnabled: boolean;
  readonly paddingX: number;
  readonly paddingY: number;
  readonly cornerRadius: number;
  readonly lineHeight: number;
}

/**
 * Frozen caption layout in reference-frame units (1080×1920).
 * Offsets are pixels; backgroundOpacity is 0–100 percent.
 */
export interface ExportCaptionLayoutManifest {
  readonly anchor: string;
  readonly textAlign: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly maxWidthPercent: number;
  readonly safeAreaEnabled: boolean;
  /** 0–100 when set; omit when layout does not own opacity (style may). */
  readonly backgroundOpacity: number | null;
  /**
   * True when the story had no stored caption layout — export must use the
   * legacy bottom-center path for Preview/Export parity.
   */
  readonly usesLegacyBottomCenter: boolean;
}

export interface ExportCaptionAnimationManifest {
  readonly preset: string;
  readonly enabled: boolean;
}

export interface ExportCaptionManifest {
  readonly id: string;
  readonly sceneId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly style: ExportCaptionStyleManifest;
  readonly layout: ExportCaptionLayoutManifest;
  readonly animation: ExportCaptionAnimationManifest;
}

export interface ExportAudioTrackManifest {
  readonly source: string;
  readonly durationMs: number;
  readonly volume: number;
  /** Exported file already contains TTS speed — do not apply again. */
  readonly generatedPlaybackRate: 1;
  readonly sourceVoiceSpeed: number;
}

export interface ExportMusicTrackManifest {
  readonly source: string;
  readonly volume: number;
  readonly duckingEnabled: boolean;
  readonly duckingStrength: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  readonly looping: true;
}

export interface ExportAudioManifest {
  readonly mode: ExportAudioModeManifest;
  readonly voiceover: ExportAudioTrackManifest | null;
  readonly music: ExportMusicTrackManifest | null;
  readonly sourceVideoAudioPolicy: "muted";
  /**
   * Frozen peak-protection decision from mixer + stem gains at manifest build.
   * `volume` on voice/music tracks is stem gain (bus × master), not raw bus slider.
   */
  readonly applyPeakProtection: boolean;
}

export interface ExportBrandingManifest {
  readonly watermarkEnabled: true;
  readonly watermarkText: string;
  readonly position: "top-left";
  readonly opacity: number;
}

export interface ExportEnvironmentSnapshot {
  readonly browserName: string;
  readonly supportsCanvasCaptureStream: boolean;
  readonly supportsManualCanvasFrameRequest: boolean;
  readonly supportsMediaRecorder: boolean;
  readonly supportsRequestVideoFrameCallback: boolean;
  readonly supportsWebAssembly: boolean;
  readonly estimatedHeapLimitBytes: number | null;
  readonly serverRendererAvailable: boolean;
  readonly ffmpegRuntimePoisoned: boolean;
  /**
   * Sprint 6F — runtime MP4 probe result.
   * When false, supportedFormats excludes mp4 and preflight blocks MP4 exports.
   * When undefined, capability snapshot defaults to including mp4 for legacy/test paths;
   * production prepareExportRequest always sets this from probeExportMp4Runtime().
   */
  readonly mp4EncoderAvailable?: boolean;
}

export interface ExportCapabilitySnapshot {
  readonly supportedFormats: readonly ExportManifestFormat[];
  readonly supportedResolutions: readonly ExportManifestResolutionLabel[];
  readonly supportedFps: readonly [30];
  readonly browserRendererAvailable: boolean;
  readonly serverRendererAvailable: boolean;
  readonly environment: ExportEnvironmentSnapshot;
  /**
   * Renderer-advertised feature support. Absent on frozen v2–v4 snapshots.
   * Browser export advertises keyframed-visual-effects-v1 when the draw path supports it.
   */
  readonly supportedCapabilities?: readonly ExportRendererCapabilityId[];
}

interface ExportManifestBase {
  readonly manifestId: string;
  readonly createdAt: string;
  readonly project: ExportProjectManifest;
  readonly output: ExportOutputManifest;
  readonly captions: readonly ExportCaptionManifest[];
  readonly audio: ExportAudioManifest;
  readonly branding: ExportBrandingManifest;
  readonly capabilities: ExportCapabilitySnapshot;
  readonly fingerprint: string;
}

/** Frozen ExportManifest v2 / renderer "8D". */
export interface ExportManifestV2 extends ExportManifestBase {
  readonly version: typeof EXPORT_MANIFEST_V2_VERSION;
  readonly rendererContractVersion: typeof EXPORT_RENDERER_CONTRACT_V2;
  readonly scenes: readonly ExportSceneManifestV2[];
}

/** Frozen ExportManifest v3 / renderer "9C". */
export interface ExportManifestV3 extends ExportManifestBase {
  readonly version: typeof EXPORT_MANIFEST_V3_VERSION;
  readonly rendererContractVersion: typeof EXPORT_RENDERER_CONTRACT_V3;
  readonly scenes: readonly ExportSceneManifestV3[];
}

/** Production ExportManifest v4 / renderer "9D". */
export interface ExportManifestV4 extends ExportManifestBase {
  readonly version: typeof EXPORT_MANIFEST_VERSION;
  readonly rendererContractVersion: typeof EXPORT_RENDERER_CONTRACT_VERSION;
  readonly scenes: readonly ExportSceneManifestV3[];
}

/** ExportManifest v5 / renderer "9E" — authoritative media-motion keyframes. */
export interface ExportManifestV5 extends ExportManifestBase {
  readonly version: typeof EXPORT_MANIFEST_V5_VERSION;
  readonly rendererContractVersion: typeof EXPORT_RENDERER_CONTRACT_V5;
  readonly scenes: readonly ExportSceneManifestV3[];
  readonly requiredCapabilities: readonly ExportRendererCapabilityId[];
}

export type ExportManifest =
  | ExportManifestV2
  | ExportManifestV3
  | ExportManifestV4
  | ExportManifestV5;

/** Draft before fingerprint assignment. */
export type ExportManifestDraft = Omit<ExportManifest, "fingerprint">;
export type ExportManifestV2Draft = Omit<ExportManifestV2, "fingerprint">;
export type ExportManifestV3Draft = Omit<ExportManifestV3, "fingerprint">;
export type ExportManifestV4Draft = Omit<ExportManifestV4, "fingerprint">;
export type ExportManifestV5Draft = Omit<ExportManifestV5, "fingerprint">;

export function isExportManifestV2(
  manifest: ExportManifest,
): manifest is ExportManifestV2 {
  return (
    manifest.version === EXPORT_MANIFEST_V2_VERSION &&
    manifest.rendererContractVersion === EXPORT_RENDERER_CONTRACT_V2
  );
}

export function isExportManifestV3(
  manifest: ExportManifest,
): manifest is ExportManifestV3 {
  return (
    manifest.version === EXPORT_MANIFEST_V3_VERSION &&
    manifest.rendererContractVersion === EXPORT_RENDERER_CONTRACT_V3
  );
}

export function isExportManifestV4(
  manifest: ExportManifest,
): manifest is ExportManifestV4 {
  return (
    manifest.version === EXPORT_MANIFEST_VERSION &&
    manifest.rendererContractVersion === EXPORT_RENDERER_CONTRACT_VERSION
  );
}

export function isExportManifestV5(
  manifest: ExportManifest,
): manifest is ExportManifestV5 {
  return (
    manifest.version === EXPORT_MANIFEST_V5_VERSION &&
    manifest.rendererContractVersion === EXPORT_RENDERER_CONTRACT_V5
  );
}

export function isExportSceneManifestV3(
  scene: ExportSceneManifest,
): scene is ExportSceneManifestV3 {
  return (
    "mediaTransitions" in scene &&
    scene.mediaTransitions != null &&
    typeof scene.mediaTransitions === "object"
  );
}
