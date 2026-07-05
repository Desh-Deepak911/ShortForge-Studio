import type { SubtitleEffect } from "@/features/story/types";

/** Schema version for persisted caption animation settings. */
export const CAPTION_ANIMATION_VERSION = 1;

export type CaptionAnimationPreset = "fade" | "typewriter" | "highlight" | "none";

export type CaptionAnimationEasing = "linear" | "ease_in" | "ease_out" | "ease_in_out";

export type CaptionAnimationDirection = "normal" | "reverse";

export type CaptionAnimationSource = "scene" | "project" | "engine" | "legacy";

export type CaptionAnimationFieldSource = "scene" | "project" | "preset" | "engine" | "legacy";

export type CaptionAnimationPhase = "inactive" | "animating" | "hold" | "completed";

/** Persisted caption animation — scene override or project default. */
export interface CaptionAnimation {
  version?: number;
  preset?: CaptionAnimationPreset;
  durationMs?: number;
  delayMs?: number;
  easing?: CaptionAnimationEasing;
  direction?: CaptionAnimationDirection;
  /** 0–100 — animation strength (100 = full legacy strength). */
  intensity?: number;
  /** Built-in motion preset profile id — configuration starting point, not a lock. */
  motionPresetId?: string;
}

export interface CaptionAnimationResolveInput {
  sceneAnimation?: Partial<CaptionAnimation> | null;
  projectAnimation?: Partial<CaptionAnimation> | null;
  sceneSubtitleEffect?: SubtitleEffect | null;
}

export interface CaptionAnimationTimelineInput {
  sceneId: string;
  chunkIndex: number;
  text: string;
  effect: SubtitleEffect;
  subtitleStartMs: number;
  subtitleEndMs: number;
  animationStartMs: number;
  animationEndMs: number;
  availableDurationMs: number;
  captionTooShortForEffect?: boolean;
}

export interface CaptionAnimationChunkInput {
  preset: CaptionAnimationPreset;
  text: string;
  chunkElapsedMs: number;
  chunkDurationMs: number;
  captionTooShortForEffect?: boolean;
  resolveInput?: CaptionAnimationResolveInput;
}

/** Renderer-agnostic caption animation state at a point in time. */
export interface CaptionAnimationState {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotation: number;
  blur: number;
  clipProgress: number;
  highlightProgress: number;
  typewriterProgress: number;
  visible: boolean;
  completed: boolean;
  visibleText: string;
  /** Linear reveal progress through the scheduled animation window (0–1). */
  progress: number;
  phase: CaptionAnimationPhase;
  /** Resolved animation configuration — exposed for preview/export consumers. */
  durationMs?: number;
  delayMs?: number;
  easing?: CaptionAnimationEasing;
  direction?: CaptionAnimationDirection;
  intensity?: number;
  /** Legacy playback fields — preserved for existing preview/export renderers. */
  isActive: boolean;
  localElapsedMs: number;
  transform: string;
  shouldRenderFullText: boolean;
}

export interface CaptionAnimationDiagnostics {
  animationPreset: CaptionAnimationPreset;
  animationSource: CaptionAnimationSource;
  resolvedAnimation: CaptionAnimation;
  progress: number;
  phase: CaptionAnimationPhase;
  visible: boolean;
  durationSource: CaptionAnimationFieldSource;
  delaySource: CaptionAnimationFieldSource;
  easingSource: CaptionAnimationFieldSource;
  directionSource: CaptionAnimationFieldSource;
  intensitySource: CaptionAnimationFieldSource;
  motionPresetId?: string;
  motionPresetSource: "scene" | "project" | "engine";
  resolvedMotionPreset: { id: string; label: string; category: string } | null;
  resolvedState: CaptionAnimationState;
}
