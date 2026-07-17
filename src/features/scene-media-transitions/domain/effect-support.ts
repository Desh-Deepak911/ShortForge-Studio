import type { TransitionEffect } from "@/features/story/types";

import {
  INTRA_SCENE_TRANSITION_DURATION_OPTIONS,
  INTRA_SCENE_TRANSITION_EFFECTS,
} from "./constants";

const EFFECT_SET = new Set<string>(INTRA_SCENE_TRANSITION_EFFECTS);
const DURATION_SET = new Set<number>(INTRA_SCENE_TRANSITION_DURATION_OPTIONS);

/**
 * True only for explicitly supported non-Cut effects.
 * Never maps unknown values to Fade (unlike scene-to-scene normalizeTransitionEffect).
 */
export function isSupportedIntraSceneTransitionEffect(
  effect: unknown,
): effect is Exclude<TransitionEffect, "cut"> {
  return typeof effect === "string" && EFFECT_SET.has(effect);
}

export function isSupportedIntraSceneTransitionDuration(durationMs: unknown): durationMs is number {
  return (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    DURATION_SET.has(durationMs)
  );
}

/**
 * Collision-safe adjacent-pair identity.
 * Deterministic serialization of `[fromItemId, toItemId]` — safe for NUL, pipes,
 * colons, quotes, Unicode, and delimiter-like combinations.
 */
export function pairKey(fromItemId: string, toItemId: string): string {
  return JSON.stringify([fromItemId, toItemId]);
}

/** True when two pair identities refer to the same ordered adjacent pair. */
export function pairKeysEqual(a: string, b: string): boolean {
  return a === b;
}
