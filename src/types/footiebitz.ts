export type Tone = "dramatic" | "funny" | "tactical" | "news" | "emotional";

export type QualityMode = "cheap" | "balanced" | "best";

export type SceneType = "intro" | "context" | "match" | "transition" | "ending";

export interface FootieScene {
  id: string;
  start: number;
  end: number;
  duration: number;
  subtitle: string;
  sceneType?: SceneType;
  uploadedImage?: string;
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
