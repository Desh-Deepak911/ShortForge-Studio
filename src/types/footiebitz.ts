export type Tone = "dramatic" | "funny" | "tactical" | "news" | "emotional";

export type QualityMode = "cheap" | "balanced" | "best";

export type SceneType = "intro" | "context" | "match" | "transition" | "ending";

/** How on-screen captions are sourced for a scene. */
export type CaptionMode = "generated" | "subtitles";

/** Visual treatment when displaying captions (subtitles mode or generated text). */
export type SubtitleEffect = "fade-up" | "typewriter" | "highlight";

/** How a scene image fills its frame. */
export type SceneImageFitMode = "fill" | "fit";

/** Pan/zoom transform for a manually uploaded scene image. */
export interface SceneImage {
  url: string;
  scale: number;
  x: number;
  y: number;
  rotation?: number;
  fitMode?: SceneImageFitMode;
}

/** Persisted image value — legacy string URL or normalized image object. */
export type SceneImageInput = string | SceneImage;

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
   * Narration excerpt for this scene when `captionMode` is `subtitles`.
   * Populated locally from the story narration — not from AI.
   */
  narration?: string;
}

export type TransitionEffect =
  | "cut"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "blur";

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

export interface FootieScript {
  title: string;
  totalDuration: number;
  narration: string;
  scenes: FootieScene[];
  /** Interleaved scene + transition items. Omitted in legacy stories — auto-built on sync. */
  timelineItems?: TimelineItem[];
  voiceoverUrl?: string;
}

export interface GenerateScriptRequest {
  topic: string;
  tone: Tone;
  duration: number;
  qualityMode?: QualityMode;
}

export interface GenerateScriptResponse {
  success: boolean;
  data?: FootieScript;
  error?: string;
}
