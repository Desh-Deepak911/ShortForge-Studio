/**
 * Immutable ExportManifest domain types (Sprint 6B).
 * Contract: docs/EXPORT_CONTRACT.md
 */

export const EXPORT_MANIFEST_VERSION = 1;
export const EXPORT_RENDERER_CONTRACT_VERSION = "6C.1";

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

export interface ExportMediaMotionManifest {
  readonly enabled: boolean;
  readonly presetId: string;
  readonly easing: string;
  readonly intensity: number;
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
}

export interface ExportPlaceholderMediaManifest {
  readonly type: "placeholder";
}

export type ExportMediaManifest =
  | ExportImageMediaManifest
  | ExportVideoMediaManifest
  | ExportPlaceholderMediaManifest;

export interface ExportTransitionManifest {
  readonly type: string;
  readonly durationMs: number;
  readonly fromSceneId: string;
  readonly toSceneId: string;
}

export interface ExportSceneManifest {
  readonly id: string;
  readonly index: number;
  readonly startMs: number;
  readonly durationMs: number;
  readonly endMs: number;
  readonly media: ExportMediaManifest;
  readonly transitionOut: ExportTransitionManifest | null;
  readonly captionMode: string;
  readonly hasDrawableMedia: boolean;
}

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
}

/** Draft before fingerprint assignment. */
export type ExportManifestDraft = Omit<ExportManifest, "fingerprint">;

export interface ExportManifest {
  readonly version: typeof EXPORT_MANIFEST_VERSION;
  readonly manifestId: string;
  readonly createdAt: string;
  readonly rendererContractVersion: typeof EXPORT_RENDERER_CONTRACT_VERSION;
  readonly project: ExportProjectManifest;
  readonly output: ExportOutputManifest;
  readonly scenes: readonly ExportSceneManifest[];
  readonly captions: readonly ExportCaptionManifest[];
  readonly audio: ExportAudioManifest;
  readonly branding: ExportBrandingManifest;
  readonly capabilities: ExportCapabilitySnapshot;
  readonly fingerprint: string;
}
