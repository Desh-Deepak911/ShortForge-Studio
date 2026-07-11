/**
 * Shared Media Motion Engine types (4.2C-2).
 * Pure data only — no React, DOM, canvas, or playback coupling.
 */
import type {
  MediaMotionEasing,
  SceneMediaMotion,
  SceneMediaTransform,
} from "@/features/story/types";

export type { MediaMotionEasing, SceneMediaMotion, SceneMediaTransform };

export const MEDIA_MOTION_VERSION = 1 as const;

/** Identity motion delta (no framing change). */
export const MEDIA_MOTION_IDENTITY_TRANSFORM: SceneMediaTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

export const MEDIA_MOTION_STATIC: SceneMediaMotion = {
  version: MEDIA_MOTION_VERSION,
  enabled: false,
  presetId: "static",
  easing: "linear",
  intensity: 0,
  startTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
  endTransform: { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
};

/** Resolved motion state for one scene progress sample. */
export interface MediaMotionState {
  active: boolean;
  progress: number;
  easedProgress: number;
  transform: SceneMediaTransform;
  presetId: string;
}

/** Config-only preset definition — engine interpolates; presets do not render. */
export interface MediaMotionPresetDefinition {
  id: string;
  label: string;
  category: "minimal" | "directional" | "sports" | "cinematic" | "custom";
  defaultEasing: MediaMotionEasing;
  /** Default intensity 0–1 when unset on SceneMediaMotion. */
  defaultIntensity: number;
  /** Motion delta at progress 0 (relative to identity; composed onto base). */
  startDelta: SceneMediaTransform;
  /** Motion delta at progress 1. */
  endDelta: SceneMediaTransform;
}

export interface ResolveMediaMotionInput {
  motion: SceneMediaMotion;
  baseTransform: SceneMediaTransform;
  sceneProgress: number;
}
