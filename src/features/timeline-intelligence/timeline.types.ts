import type {
  CaptionMode,
  SceneDurationSource,
  SceneImageMotion,
  SceneType,
  SubtitleEffect,
  TransitionEffect,
} from "@/features/story/types";

import type {
  ImageMotionBaseTransform,
  ImageMotionPreset,
  ImageMotionProgressCurve,
} from "./image-motion-presets.utils";

/** Schema version for canonical timeline payloads and migrations. */
export const TIMELINE_INTELLIGENCE_SCHEMA_VERSION = 1;

/**
 * Which timing pipeline produced this timeline.
 * Preview currently uses editor-scene-timing; export preflight uses export-refit-timing.
 */
export type TimelineAuthorityMode = "editor-scene-timing" | "export-refit-timing";

/** Provenance for an individual timed event. */
export type TimelineEventSource =
  | "editor-scene-timing"
  | "export-refit-timing"
  | "derived-subtitle"
  | "derived-caption-animation"
  | "derived-transition"
  | "derived-audio"
  | "derived-image-motion"
  | "manual";

export type TimelineEventType =
  | "scene"
  | "subtitle"
  | "caption-animation"
  | "audio"
  | "image-motion"
  | "transition";

export type TimelineTrackType = TimelineEventType;

/** Absolute-timestamp event shared by all timeline lanes. */
export interface TimelineEventBase<
  TType extends TimelineEventType,
  TMetadata = Record<string, unknown>,
> {
  id: string;
  type: TType;
  /** Inclusive start on the master timeline (milliseconds). */
  startMs: number;
  /** Exclusive end on the master timeline (milliseconds). */
  endMs: number;
  /** Cached span — must equal `endMs - startMs`. */
  durationMs: number;
  source: TimelineEventSource;
  metadata: TMetadata;
}

export interface SceneTimelineEventMetadata {
  sceneId: string;
  sceneIndex: number;
  sceneType?: SceneType;
  durationSource?: SceneDurationSource;
}

export interface SubtitleTimelineEventMetadata {
  sceneId: string;
  sceneIndex: number;
  chunkIndex: number;
  chunkCount: number;
  text: string;
  captionMode: CaptionMode;
}

export interface CaptionAnimationTimelineEventMetadata {
  sceneId: string;
  sceneIndex: number;
  chunkIndex: number;
  subtitleEventId: string;
  effect: SubtitleEffect;
  /** Phase 3A — timeline-driven animation scheduling (renderer not wired yet). */
  subtitleId: string;
  subtitleStartMs: number;
  subtitleEndMs: number;
  animationStartMs: number;
  animationEndMs: number;
  availableDurationMs: number;
  holdDurationMs: number;
  effectType: SubtitleEffect;
  textLength: number;
  /** Subtitle chunk copy for shared animation resolver (Phase 3A). */
  text: string;
  requiredAnimationMs?: number;
  captionTooShortForEffect?: boolean;
}

export interface AudioTimelineEventMetadata {
  trackId: "voiceover" | "background-music" | "narration-preview";
  url?: string;
  loop?: boolean;
  playbackRate?: number;
  volume?: number;
}

export interface ImageMotionTimelineEventMetadata {
  sceneId: string;
  sceneIndex: number;
  sceneEventId: string;
  /** Legacy editor motion — preserved for renderer bridge until Phase 3B wiring. */
  imageMotion: SceneImageMotion;
  /** Phase 3B — timeline-driven motion scheduling (renderer not wired yet). */
  motionType: ImageMotionPreset;
  progressCurve: ImageMotionProgressCurve;
  baseTransform: ImageMotionBaseTransform;
  startMs: number;
  endMs: number;
  durationMs: number;
  peakScale?: number;
  panTravelPct?: number;
}

export interface TransitionTimelineEventMetadata {
  transitionId: string;
  fromSceneId: string;
  toSceneId: string;
  fromSceneIndex: number;
  toSceneIndex: number;
  /** Phase 3C — canonical transition effect type for timeline scheduling. */
  transitionType: TransitionEffect;
  /** Legacy alias preserved for renderer bridge until Phase 3C wiring. */
  effect: TransitionEffect;
  /** Phase 3C — absolute scheduling fields mirrored from the event window. */
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Overlay window within the outgoing scene tail (not a standalone segment). */
  overlay: boolean;
}

export type SceneTimelineEvent = TimelineEventBase<"scene", SceneTimelineEventMetadata>;

export type SubtitleTimelineEvent = TimelineEventBase<
  "subtitle",
  SubtitleTimelineEventMetadata
>;

export type CaptionAnimationTimelineEvent = TimelineEventBase<
  "caption-animation",
  CaptionAnimationTimelineEventMetadata
>;

export type AudioTimelineEvent = TimelineEventBase<"audio", AudioTimelineEventMetadata>;

export type ImageMotionTimelineEvent = TimelineEventBase<
  "image-motion",
  ImageMotionTimelineEventMetadata
>;

export type TransitionTimelineEvent = TimelineEventBase<
  "transition",
  TransitionTimelineEventMetadata
>;

export type TimelineEvent =
  | SceneTimelineEvent
  | SubtitleTimelineEvent
  | CaptionAnimationTimelineEvent
  | AudioTimelineEvent
  | ImageMotionTimelineEvent
  | TransitionTimelineEvent;

export interface TimelineTrack<
  TEvent extends TimelineEvent = TimelineEvent,
> {
  id: string;
  type: TimelineTrackType;
  label?: string;
  events: TEvent[];
}

export type MasterTimelineBuildMode = "preview" | "export";

export interface MasterTimelineDiagnostics {
  schemaVersion: typeof TIMELINE_INTELLIGENCE_SCHEMA_VERSION;
  authority: TimelineAuthorityMode;
  builtAtIso: string;
  sceneCount: number;
  eventCount: number;
  /** Sum of editor scene windows when both authorities are known. */
  editorSceneDurationMs?: number;
  /** Sum of export-refit scene windows when both authorities are known. */
  refitSceneDurationMs?: number;
  voiceoverDurationMs?: number;
  /** Absolute delta between editor and refit scene totals (milliseconds). */
  sceneTimingDeltaMs?: number;
  /** Caller mode passed to buildMasterTimeline. */
  buildMode?: MasterTimelineBuildMode;
  /** Padding added after the latest timed content span. */
  endBufferMs?: number;
  /** True when voiceover refit was applied to scene windows for this build. */
  exportRefitApplied?: boolean;
  /** True when preview-style and export-style builds would diverge materially. */
  previewExportTimingMismatchRisk?: boolean;
  audioShorterThanSubtitleTimeline?: boolean;
  subtitleExtendsBeyondScene?: boolean;
  sceneExtendsBeyondAudio?: boolean;
  missingTimings?: string[];
  negativeOrOverlappingEvents?: boolean;
  lineCapOverflowRisk?: boolean;
  /** Count of subtitle windows too short for scheduled caption animation (e.g. typewriter). */
  captionTooShortForAnimationCount?: number;
  /** Phase 3C — transition lane scheduling counts. */
  transitionsScheduled?: number;
  transitionOverlapCollisionCount?: number;
  transitionSceneVisibilityViolationCount?: number;
  transitionOutOfBoundsCount?: number;
  /** Latest exclusive subtitle event end (milliseconds). */
  finalSubtitleEndMs?: number;
  /** Latest exclusive timed content end before render buffer (milliseconds). */
  contentEndMs?: number;
  /** renderDurationMs minus endBufferMs. */
  renderEndBeforeBufferMs?: number;
  /** Gap between final subtitle end and render end before buffer (milliseconds). */
  finalSubtitleEndGapMs?: number;
  /** Phase 3D — timeline optimizer v1 audit trail. */
  optimizer?: TimelineOptimizerDiagnosticsSummary;
}

export interface TimelineOptimizerDiagnosticsSummary {
  appliedChangeCount: number;
  warningCount: number;
  findings: Array<{
    rule: string;
    severity: "info" | "warning" | "applied";
    message: string;
    eventId?: string;
    sceneId?: string;
  }>;
}

/**
 * Canonical timing authority for preview and export.
 * All consumers should derive scene, subtitle, and audio positions from this model.
 */
export interface MasterTimeline {
  id: string;
  authority: TimelineAuthorityMode;
  /** Total render/export span — future master clock length. */
  renderDurationMs: number;
  /** Voiceover + background music mux span. */
  audioDurationMs: number;
  /** Narration/voiceover lane span (may differ from mixed audio). */
  narrationDurationMs: number;
  /** Sum of scene segment spans on the active authority. */
  sceneDurationMs: number;
  /** Union span of subtitle chunk events. */
  subtitleDurationMs: number;
  /** Union span of caption animation events. */
  animationDurationMs: number;
  /** Union span of transition overlay events. */
  transitionDurationMs: number;
  tracks: TimelineTrack[];
  warnings: string[];
  diagnostics: MasterTimelineDiagnostics;
}
