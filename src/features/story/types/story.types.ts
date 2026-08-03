import type { AssetAttachMetadata } from "@/features/asset-attach/asset-attach.types";
import type { CaptionLayout, CaptionAnchor } from "@/features/caption-layout";
import type { CaptionStyle } from "@/features/caption-style";
import type { CaptionAnimation } from "@/features/caption-animation";
import type { CaptionPresetId } from "@/features/caption-engine/caption-engine.types";
import type { PlatformExportPresetId } from "@/features/export-profiles/export-profile.types";
import type { SceneMediaVisualAdjustments } from "@/features/media-visual-adjustments/media-visual-adjustments.types";
import type { SourceQualityAdjustmentProvenance } from "@/features/source-quality/domain/source-quality-adjustment-provenance";
import type { SpeechStylePreset } from "@/features/speech-style";
import type { VisualBeatPlanV1 } from "@/features/visual-beat-density/domain/visual-beat-plan";

export type SceneType = "intro" | "context" | "match" | "transition" | "ending";

/** How on-screen captions are sourced for a scene. */
export type CaptionMode = "generated" | "subtitles";

/** Visual treatment when displaying captions (subtitles mode or generated text). */
export type SubtitleEffect = "fade-up" | "typewriter" | "highlight";

/** @deprecated Use `CaptionAnchor`. */
export type CaptionLayoutPosition = "bottom" | "center" | "top" | "top_left" | "custom";

export type { CaptionAnchor, CaptionLayout };
export type { CaptionStyle };
export type { CaptionAnimation };

/** How a scene image fills its frame. */
export type SceneImageFitMode = "fill" | "fit";

/** Timeline image motion presets (Phase 3B). Legacy `none` / `zoom-in` / `zoom-out` remain valid. */
export type SceneImageMotionPreset =
  | "static"
  | "slow-zoom-in"
  | "slow-zoom-out"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "pan-left-zoom-in"
  | "pan-right-zoom-in"
  | "pan-up-zoom-in"
  | "pan-down-zoom-in";

/** Ken Burns-style motion applied during scene playback. */
export type SceneImageMotionType =
  | "none"
  | "zoom-in"
  | "zoom-out"
  | SceneImageMotionPreset;

export type SceneImageMotionIntensity = "subtle" | "medium" | "strong";

export interface SceneImageMotion {
  type: SceneImageMotionType;
  intensity: SceneImageMotionIntensity;
}

/** Scene media slot kind — images today; video and placeholder reserved for later phases. */
export type SceneMediaType = "image" | "video" | "placeholder";

export type SceneMediaSource =
  | "upload"
  | "asset"
  | "generated"
  | "external"
  | "legacy";

export interface SceneMediaTransform {
  x: number;
  y: number;
  scale: number;
  rotation?: number;
}

export type SceneMediaFitMode = "cover" | "contain";

/** Easing curve for shared media motion (image + video). */
export type MediaMotionEasing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Shared media motion config (4.2C).
 * Additive and optional — legacy `imageMotion` remains valid and is mapped on read.
 */
export interface SceneMediaMotion {
  version: 1;
  enabled?: boolean;
  presetId?: string;
  easing?: MediaMotionEasing;
  /** 0–2 intensity multiplier (1 = full preset strength). */
  intensity?: number;
  startTransform?: SceneMediaTransform;
  endTransform?: SceneMediaTransform;
}

export interface SceneMedia {
  type: SceneMediaType;
  url?: string;
  source?: SceneMediaSource;
  mimeType?: string;
  durationMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  /** Intrinsic clip dimensions when known (video uploads). */
  width?: number;
  height?: number;
  muted?: boolean;
  fitMode?: SceneMediaFitMode;
  transform?: SceneMediaTransform;
  /** @deprecated Prefer `motion`. Kept for upload dual-write / legacy reads. */
  imageMotion?: SceneImageMotion;
  /** Shared image/video motion — optional; no migration required. */
  motion?: SceneMediaMotion;
  /** Appearance-only media adjustments; never affects playback or captions. */
  visualAdjustments?: SceneMediaVisualAdjustments;
  /**
   * Authoring-only source-quality adjustment provenance.
   * Optional; Preview/Export/Headless ignore it. Malformed values normalize as absent.
   */
  sourceQualityAdjustmentProvenance?: SourceQualityAdjustmentProvenance;
  /** Optional still / poster frame URL (video). Images use `url` as poster. */
  posterUrl?: string;
  /** Absolute media time for the poster frame (video). Defaults to trim/window start. */
  posterTimeMs?: number;
  /** Preferred filmstrip sample count for future thumbnail UI. */
  thumbnailCount?: number;
}

/**
 * One ordered media slot inside a scene-local media timeline (Sprint 8A).
 * Array order is the canonical playback order.
 */
export interface SceneMediaTimelineItem {
  /** Stable, persisted, unique within the owning scene. */
  id: string;
  media: SceneMedia;
  /** Finite weight > 0. Windows are proportional across the scene duration. */
  durationWeight: number;
}

/**
 * Versioned per-scene media timeline. Absence means a legacy/single-media scene.
 * When present with usable items, this is the future multi-media authority.
 */
export interface SceneMediaTimeline {
  version: 1;
  items: SceneMediaTimelineItem[];
}

/**
 * One ordered visual item in a narration-scene visual sequence.
 * Timing is scene-local (ms) and must fit within narration scene duration.
 */
export interface SceneVisualSequenceItem {
  /** Stable, persisted, unique within the owning scene. */
  id: string;
  media: SceneMedia;
  /**
   * Scene-local start offset in ms (narration-relative).
   * Sequential authority: item 0 is always 0; for item i > 0 this is the
   * boundary between item i-1 and item i (contiguous playback, no gaps).
   */
  startOffsetMs: number;
  /** On-screen duration in ms; sequence stays contiguous inside narration. */
  durationMs: number;
}

/**
 * Optional visual sequence: multiple ordered image/video items in one
 * narration scene. Absence preserves legacy/single-media and Sprint 8 timeline
 * behavior. Never required to open existing projects.
 */
export interface SceneVisualSequence {
  version: 1;
  items: SceneVisualSequenceItem[];
}

/** Pan/zoom transform for a manually uploaded scene image. */
export interface SceneImage {
  url: string;
  scale: number;
  x: number;
  y: number;
  rotation?: number;
  fitMode?: SceneImageFitMode;
  /** Slow drift/zoom during playback. Defaults to none/subtle when omitted. */
  imageMotion?: SceneImageMotion;
}

/** Persisted image value — legacy string URL or normalized image object. */
export type SceneImageInput = string | SceneImage;

/** How a scene's duration was determined. */
export type SceneDurationSource = "manual" | "voiceover";

export interface FootieScene {
  id: string;
  start: number;
  end: number;
  duration: number;
  subtitle: string;
  sceneType?: SceneType;
  /** Scene media with optional pan/zoom transform metadata. */
  image?: SceneImage;
  /**
   * Optional unified media slot — read-path foundation for image and video clips.
   * When absent, legacy `image` / `uploadedImage` remain authoritative.
   */
  media?: SceneMedia;
  /**
   * Optional ordered multi-media timeline for the scene (Sprint 8A foundation).
   * Absence means legacy/single-media. Preview/Export continue using `media` /
   * `image` / `uploadedImage` throughout the compatibility period.
   */
  mediaTimeline?: SceneMediaTimeline;
  /**
   * Optional visual sequence (mixed image/video) for one narration scene.
   * Absence means legacy/single-media or Sprint 8 weight timeline. Gated by
   * `mixed-media-scenes-v1`. Dual-written to `mediaTimeline` for shared Preview/Export.
   */
  visualSequence?: SceneVisualSequence;
  /**
   * Optional narration-driven visual-beat plan (suggestion/provenance only).
   * Absence preserves legacy projects. Never a Preview/Export render authority —
   * Apply writes timing into `visualSequence` / `mediaTimeline` only.
   */
  visualBeatPlan?: VisualBeatPlanV1;
  /**
   * Optional intra-scene media-to-media transition track (Sprint 9A).
   * Absence means every adjacent pair is Cut. Never stores Cut records.
   * Does not affect MasterTimeline, scene duration, or ExportManifest v2 in 9A.
   */
  mediaTransitions?: SceneMediaTransitionTrack;
  /**
   * @deprecated Legacy string URL — migrated to `image` on sync.
   * Still accepted on load for backward compatibility.
   */
  uploadedImage?: string;
  /**
   * Caption source — `generated` uses AI scene subtitles; `subtitles` derives
   * captions from narration locally. Defaults to `generated` when omitted (legacy).
   */
  captionMode?: CaptionMode;
  /** Caption animation style. Defaults to `fade-up` when omitted (legacy). */
  subtitleEffect?: SubtitleEffect;
  /**
   * Caption Engine v2 preset (optional). When omitted, derived from `subtitleEffect`.
   * Registry-only in 3.9F-1 — renderers still use `subtitleEffect`.
   */
  captionPreset?: CaptionPresetId;
  /**
   * Per-scene voiceover excerpt derived from story narration (timing reference).
   * On-screen subtitles use `subtitleText` when in subtitles mode.
   */
  narration?: string;
  /**
   * Editable on-screen subtitle copy when `captionMode` is `subtitles`.
   * Separate from voiceover narration and generated captions.
   */
  subtitleText?: string;
  /** Millisecond timing — optional companion to second-based `start`/`end`/`duration`. */
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  /** Set to `manual` when the user edits scene duration in the editor. */
  durationSource?: SceneDurationSource;
  /** Provenance for assets attached from search, smart edit, or remote sources. */
  assetAttachment?: AssetAttachMetadata;
  /** Per-scene caption placement override. Falls back to `FootieScript.defaultCaptionLayout`. */
  captionLayout?: CaptionLayout;
  /** Per-scene caption visual style override. Falls back to `FootieScript.defaultCaptionStyle`. */
  captionStyle?: CaptionStyle;
  /** Per-scene caption animation override. Falls back to `FootieScript.defaultCaptionAnimation`. */
  captionAnimation?: CaptionAnimation;
}

export type TransitionEffect =
  | "cut"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "blur";

/**
 * Transition between two adjacent media items inside one scene (Sprint 9A).
 * Identity is the ordered fromItemId/toItemId pair — no random transition id.
 * Absence of a record means Cut. Do not persist Cut.
 */
export interface SceneMediaTransitionBoundary {
  fromItemId: string;
  toItemId: string;
  effect: TransitionEffect;
  durationMs: number;
}

/**
 * Additive per-scene track for media-to-media transitions.
 * Distinct from scene-to-scene `TransitionTimelineItem`.
 */
export interface SceneMediaTransitionTrack {
  version: 1;
  boundaries: SceneMediaTransitionBoundary[];
}

/** A scene entry in the production timeline. */
export interface SceneTimelineItem {
  id: string;
  type: "scene";
  scene: FootieScene;
}

/** A transition between two scenes — app-side only, no AI generation. */
export interface TransitionTimelineItem {
  id: string;
  type: "transition";
  fromSceneId: string;
  toSceneId: string;
  effect: TransitionEffect;
  durationMs: number;
  label: string;
}

export type TimelineItem = SceneTimelineItem | TransitionTimelineItem;

/** Story-level TTS voice preferences (one per story, not per scene). */
export interface StoryVoiceSettings {
  voice?: string;
  speed: number;
  /** Delivery style preset — affects TTS instructions only, not subtitle text. */
  stylePreset?: SpeechStylePreset;
  /** When false, non-neutral presets fall back to neutral TTS behavior. */
  expressiveDelivery?: boolean;
}

import type { ProjectAudioMixerSettings } from "@/features/audio-mixer/audio-mixer.types";

export type BackgroundMusicSource = "none" | "upload" | "library";

/** Story-level background music preferences. Omitted on legacy stories — defaults applied on sync. */
export interface StoryBackgroundMusic {
  enabled: boolean;
  source: BackgroundMusicSource;
  fileUrl?: string;
  fileName?: string;
  /** Persisted MIME for draft-reloaded uploads; used by export normalization. */
  fileMimeType?: string;
  trackId?: string;
  trackName?: string;
  artist?: string;
  license?: string;
  attributionRequired?: boolean;
  attributionText?: string;
  volume: number;
  duckingEnabled: boolean;
  fadeIn: boolean;
  fadeOut: boolean;
}

export type ExportFormat = "mp4" | "webm";
export type ExportQualityTier = "standard" | "high";
export type ExportResolution = "1080x1920" | "720x1280";

/** Per-story export preferences. Omitted on legacy stories — defaults applied on export. */
export interface ExportSettings {
  fileName: string;
  format: ExportFormat;
  quality: ExportQualityTier;
  resolution: ExportResolution;
  /** Optional platform preset — omitted on legacy exports. */
  exportProfileId?: PlatformExportPresetId;
}

export interface FootieScript {
  title: string;
  totalDuration: number;
  narration: string;
  scenes: FootieScene[];
  /** Interleaved scene + transition items. Omitted in legacy stories — auto-built on sync. */
  timelineItems?: TimelineItem[];
  /** Blob or remote URL for generated narration audio. */
  voiceoverUrl?: string;
  /** Measured or estimated narration length in milliseconds. */
  voiceoverDurationMs?: number;
  /** Story narration text used when the current voiceover audio was generated. */
  voiceoverNarration?: string;
  /** Voice and speed used when the current voiceover audio was generated. */
  voiceoverVoiceSettings?: StoryVoiceSettings;
  /** Story-level narrator voice and speed preferences. */
  voiceSettings?: StoryVoiceSettings;
  /** Story-level background music preferences. Optional for legacy stories. */
  backgroundMusic?: StoryBackgroundMusic;
  /** Unified mixer overrides — optional; legacy music fields remain authoritative until adopted. */
  audioMixer?: ProjectAudioMixerSettings;
  /** Download filename, format, quality tier, and resolution. Optional for legacy stories. */
  exportSettings?: ExportSettings;
  /** Project-wide default caption placement. Scenes may override via `captionLayout`. */
  defaultCaptionLayout?: CaptionLayout;
  /** Project-wide default caption visual style. Scenes may override via `captionStyle`. */
  defaultCaptionStyle?: CaptionStyle;
  /** Project-wide default caption animation preset. */
  defaultCaptionAnimation?: CaptionAnimation;
}
