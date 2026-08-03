/**
 * Immutable media-motion keyframe authoring commands.
 * Pure motion transforms — parents own story writes and dual-write authority.
 */

import type {
  MediaMotionEasing,
  MediaMotionKeyframe,
  SceneMediaMotion,
  SceneMediaTransform,
} from "@/features/story/types";

import {
  MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
  MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
  MEDIA_MOTION_KEYFRAME_MAX_OPACITY,
  MEDIA_MOTION_KEYFRAME_MAX_SCALE,
  MEDIA_MOTION_KEYFRAME_MIN_OPACITY,
  MEDIA_MOTION_KEYFRAME_MIN_SCALE,
  normalizeMediaMotionKeyframes,
} from "../domain/media-motion-keyframes";
import { resolveMediaMotionKeyframes } from "../domain/resolve-media-motion-keyframes";
import { normalizeSceneMediaMotionRecord } from "../media-motion.legacy";
import { resolveMediaMotionStateForSceneTiming } from "../media-motion.engine";
import { MEDIA_MOTION_IDENTITY_TRANSFORM, MEDIA_MOTION_VERSION } from "../media-motion.types";

export type MediaMotionKeyframeCommandStatus = "ok" | "recoverable" | "terminal";

export interface MediaMotionKeyframeCommandOptions {
  /**
   * Must be explicitly true. False/omitted refuses keyframe mutation even if
   * a hidden UI somehow invokes the command.
   */
  readonly keyframedVisualEffectsEnabled?: boolean;
  /**
   * When true, refuse writes that would target ignored scene.media while a
   * mixed-media visual selection is required.
   */
  readonly requiresMediaItemSelection?: boolean;
}

export interface MediaMotionKeyframeCommandResult {
  readonly status: MediaMotionKeyframeCommandStatus;
  readonly motion: SceneMediaMotion;
  /** Selected keyframe index after normalize, or null when none remain. */
  readonly selectedKeyframeIndex: number | null;
  readonly warnings: readonly string[];
  readonly message?: string;
}

export type MediaMotionAuthoringTargetStatus =
  | "ready"
  | "needs_selection"
  | "legacy_scene_media";

/**
 * Shared display/command target for motion + keyframe authoring.
 * `{mediaItemId, mediaWindowDurationMs}` must match every control in the panel.
 */
export interface MediaMotionAuthoringTarget {
  readonly status: MediaMotionAuthoringTargetStatus;
  readonly mediaItemId: string | null;
  readonly mediaWindowDurationMs: number;
}

export const MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING =
  "Fewer than two keyframes remain, so the usual motion preset will be used until you add another keyframe.";

export const MEDIA_MOTION_KEYFRAME_DUPLICATE_TIME_WARNING =
  "A keyframe already exists at that time, so the newer values replaced it.";

export const MEDIA_MOTION_KEYFRAME_CLAMP_WARNING =
  "Time was adjusted to stay inside this visual’s duration.";

export const MEDIA_MOTION_KEYFRAME_CAPABILITY_OFF_MESSAGE =
  "Keyframe editing is turned off for this project.";

export const MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE =
  "Select a visual to edit its motion.";

export const MEDIA_MOTION_KEYFRAME_INVALID_DURATION_MESSAGE =
  "This visual needs a valid duration before keyframes can be created.";

function clampDurationMs(mediaWindowDurationMs: number): number {
  return Number.isFinite(mediaWindowDurationMs) && mediaWindowDurationMs > 0
    ? mediaWindowDurationMs
    : 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneMotion(motion: SceneMediaMotion): SceneMediaMotion {
  return normalizeSceneMediaMotionRecord({
    ...motion,
    keyframes: motion.keyframes ? motion.keyframes.map((frame) => ({ ...frame })) : undefined,
  });
}

function withKeyframes(
  motion: SceneMediaMotion,
  keyframes: readonly MediaMotionKeyframe[] | undefined,
): SceneMediaMotion {
  const next = cloneMotion(motion);
  if (!keyframes || keyframes.length === 0) {
    delete next.keyframes;
    return next;
  }
  next.keyframes = keyframes.map((frame) => ({ ...frame }));
  return next;
}

function transformFields(
  value: SceneMediaTransform | null | undefined,
): Pick<MediaMotionKeyframe, "x" | "y" | "scale" | "rotation"> {
  const scale =
    typeof value?.scale === "number" && Number.isFinite(value.scale) && value.scale > 0
      ? value.scale
      : 1;
  return {
    x: typeof value?.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value?.y === "number" && Number.isFinite(value.y) ? value.y : 0,
    scale,
    rotation:
      typeof value?.rotation === "number" && Number.isFinite(value.rotation)
        ? value.rotation
        : 0,
  };
}

export function findNearestMediaMotionKeyframeIndex(
  keyframes: readonly MediaMotionKeyframe[],
  offsetMs: number,
): number {
  if (keyframes.length === 0) return -1;
  const exact = keyframes.findIndex((frame) => frame.offsetMs === offsetMs);
  if (exact >= 0) return exact;
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < keyframes.length; index += 1) {
    const distance = Math.abs(keyframes[index]!.offsetMs - offsetMs);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  return nearest;
}

/**
 * Local selection rule after normalize/reorder/collapse/delete/external updates.
 * Prefer the surviving semantic offset; otherwise nearest temporal survivor.
 * Never persisted into the story.
 */
export function resolveLocalMediaMotionKeyframeSelection(input: {
  readonly keyframes: readonly MediaMotionKeyframe[] | undefined;
  readonly preferredOffsetMs: number | null;
  readonly fallbackIndex?: number | null;
}): number | null {
  const frames = input.keyframes ?? [];
  if (frames.length === 0) return null;
  if (input.preferredOffsetMs != null && Number.isFinite(input.preferredOffsetMs)) {
    return findNearestMediaMotionKeyframeIndex(frames, input.preferredOffsetMs);
  }
  if (input.fallbackIndex == null || !Number.isFinite(input.fallbackIndex)) {
    return 0;
  }
  return Math.min(frames.length - 1, Math.max(0, Math.trunc(input.fallbackIndex)));
}

export function resolveMediaMotionAuthoringTarget(input: {
  readonly keyframedVisualEffectsEnabled?: boolean;
  readonly requiresMediaItemSelection?: boolean;
  readonly mediaItemId?: string | null;
  readonly mediaWindowDurationMs: number;
}): MediaMotionAuthoringTarget {
  const mediaWindowDurationMs = clampDurationMs(input.mediaWindowDurationMs);
  if (
    input.keyframedVisualEffectsEnabled === true &&
    input.requiresMediaItemSelection === true
  ) {
    return {
      status: "needs_selection",
      mediaItemId: null,
      mediaWindowDurationMs,
    };
  }
  if (input.keyframedVisualEffectsEnabled === true) {
    return {
      status: "ready",
      mediaItemId: input.mediaItemId ?? null,
      mediaWindowDurationMs,
    };
  }
  return {
    status: "legacy_scene_media",
    mediaItemId: input.mediaItemId ?? null,
    mediaWindowDurationMs,
  };
}

function refuseGuard(
  motion: SceneMediaMotion,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult | null {
  if (options?.keyframedVisualEffectsEnabled !== true) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: null,
      warnings: [],
      message: MEDIA_MOTION_KEYFRAME_CAPABILITY_OFF_MESSAGE,
    };
  }
  if (options?.requiresMediaItemSelection === true) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: null,
      warnings: [],
      message: MEDIA_MOTION_KEYFRAME_SELECTION_REQUIRED_MESSAGE,
    };
  }
  return null;
}

function sanitizeKeyframePatch(
  patch: Partial<MediaMotionKeyframe>,
): Partial<MediaMotionKeyframe> {
  const next: Partial<MediaMotionKeyframe> = { ...patch };
  if ("offsetMs" in next && next.offsetMs !== undefined && !isFiniteNumber(next.offsetMs)) {
    delete next.offsetMs;
  }
  if ("x" in next) {
    if (!isFiniteNumber(next.x)) delete next.x;
    else {
      next.x = clamp(
        next.x,
        -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
        MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
      );
    }
  }
  if ("y" in next) {
    if (!isFiniteNumber(next.y)) delete next.y;
    else {
      next.y = clamp(
        next.y,
        -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
        MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
      );
    }
  }
  if ("scale" in next) {
    if (!isFiniteNumber(next.scale)) delete next.scale;
    else {
      next.scale = clamp(
        next.scale,
        MEDIA_MOTION_KEYFRAME_MIN_SCALE,
        MEDIA_MOTION_KEYFRAME_MAX_SCALE,
      );
    }
  }
  if ("rotation" in next) {
    if (!isFiniteNumber(next.rotation)) delete next.rotation;
    else {
      next.rotation = clamp(
        next.rotation,
        -MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
        MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
      );
    }
  }
  if ("opacity" in next) {
    if (!isFiniteNumber(next.opacity)) delete next.opacity;
    else {
      next.opacity = clamp(
        next.opacity,
        MEDIA_MOTION_KEYFRAME_MIN_OPACITY,
        MEDIA_MOTION_KEYFRAME_MAX_OPACITY,
      );
    }
  }
  return next;
}

function finalize(
  motion: SceneMediaMotion,
  mediaWindowDurationMs: number,
  preferredOffsetMs: number | null,
  warnings: string[],
  message?: string,
  status: MediaMotionKeyframeCommandStatus = "ok",
): MediaMotionKeyframeCommandResult {
  const duration = clampDurationMs(mediaWindowDurationMs);
  const normalized = duration > 0
    ? normalizeMediaMotionKeyframes(motion.keyframes, { mediaWindowDurationMs: duration })
    : normalizeMediaMotionKeyframes(motion.keyframes);
  const next = withKeyframes(motion, normalized);
  const selectedKeyframeIndex = resolveLocalMediaMotionKeyframeSelection({
    keyframes: normalized,
    preferredOffsetMs,
  });
  const finalWarnings = [...warnings];
  if (normalized && normalized.length === 1) {
    finalWarnings.push(MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING);
  }
  return {
    status: finalWarnings.length > 0 && status === "ok" ? "recoverable" : status,
    motion: next,
    selectedKeyframeIndex,
    warnings: finalWarnings,
    ...(message ? { message } : {}),
  };
}

/**
 * Sample the motion delta at an item-local time without framing composition.
 * Prefers keyframes when usable; otherwise legacy start/end interpolation.
 */
export function sampleMediaMotionKeyframeDefaults(
  motion: SceneMediaMotion,
  itemElapsedMs: number,
  mediaWindowDurationMs: number,
): Omit<MediaMotionKeyframe, "offsetMs"> {
  const duration = clampDurationMs(mediaWindowDurationMs);
  const elapsed = Number.isFinite(itemElapsedMs)
    ? Math.min(duration, Math.max(0, itemElapsedMs))
    : 0;
  const keyframed = resolveMediaMotionKeyframes({
    keyframes: motion.keyframes,
    itemElapsedMs: elapsed,
    mediaWindowDurationMs: duration,
  });
  if (keyframed.available) {
    return {
      x: keyframed.sample.x,
      y: keyframed.sample.y,
      scale: keyframed.sample.scale,
      rotation: keyframed.sample.rotation,
      opacity: keyframed.sample.opacity,
      easing: (motion.easing ?? "linear") as MediaMotionEasing,
    };
  }

  const legacy = resolveMediaMotionStateForSceneTiming({
    motion,
    baseTransform: MEDIA_MOTION_IDENTITY_TRANSFORM,
    sceneElapsedMs: elapsed,
    sceneDurationMs: duration,
  });
  return {
    ...transformFields(legacy.transform),
    opacity: 1,
    easing: (motion.easing ?? "linear") as MediaMotionEasing,
  };
}

/**
 * Explicit user action: create two endpoint keyframes from legacy start/end.
 * Enables custom motion so the record stays authorable.
 */
export function initializeMediaMotionKeyframes(
  motion: SceneMediaMotion,
  mediaWindowDurationMs: number,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult {
  const refused = refuseGuard(motion, options);
  if (refused) return refused;

  const duration = clampDurationMs(mediaWindowDurationMs);
  if (!(duration > 0)) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: null,
      warnings: [],
      message: MEDIA_MOTION_KEYFRAME_INVALID_DURATION_MESSAGE,
    };
  }

  const easing = (motion.easing ?? "linear") as MediaMotionEasing;
  const start = transformFields(motion.startTransform);
  const end = transformFields(motion.endTransform);
  const keyframes: MediaMotionKeyframe[] = [
    {
      offsetMs: 0,
      ...start,
      opacity: 1,
      easing,
    },
    {
      offsetMs: duration,
      ...end,
      opacity: 1,
      easing,
    },
  ];

  const next = normalizeSceneMediaMotionRecord({
    ...motion,
    version: MEDIA_MOTION_VERSION,
    enabled: true,
    presetId: motion.presetId === "static" ? "custom" : motion.presetId || "custom",
    intensity:
      typeof motion.intensity === "number" && motion.intensity > 0
        ? motion.intensity
        : 1,
    easing,
    startTransform: motion.startTransform ?? { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    endTransform: motion.endTransform ?? { ...MEDIA_MOTION_IDENTITY_TRANSFORM },
    keyframes,
  });

  return finalize(next, duration, 0, [], undefined, "ok");
}

export function addMediaMotionKeyframe(
  motion: SceneMediaMotion,
  input: {
    readonly offsetMs: number;
    readonly sample?: Partial<Omit<MediaMotionKeyframe, "offsetMs">>;
  },
  mediaWindowDurationMs: number,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult {
  const refused = refuseGuard(motion, options);
  if (refused) return refused;

  const duration = clampDurationMs(mediaWindowDurationMs);
  if (!(duration > 0)) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: null,
      warnings: [],
      message: "This visual needs a valid duration before a keyframe can be added.",
    };
  }

  const warnings: string[] = [];
  const requested = Number.isFinite(input.offsetMs) ? input.offsetMs : 0;
  const offsetMs = Math.min(duration, Math.max(0, requested));
  if (offsetMs !== requested) {
    warnings.push(MEDIA_MOTION_KEYFRAME_CLAMP_WARNING);
  }

  const existing = normalizeMediaMotionKeyframes(motion.keyframes, {
    mediaWindowDurationMs: duration,
  });
  if (existing?.some((frame) => frame.offsetMs === offsetMs)) {
    warnings.push(MEDIA_MOTION_KEYFRAME_DUPLICATE_TIME_WARNING);
  }

  const defaults = sampleMediaMotionKeyframeDefaults(motion, offsetMs, duration);
  const sanitizedSample = input.sample
    ? sanitizeKeyframePatch(input.sample as Partial<MediaMotionKeyframe>)
    : {};
  const frame: MediaMotionKeyframe = {
    offsetMs,
    x: sanitizedSample.x ?? defaults.x,
    y: sanitizedSample.y ?? defaults.y,
    scale: sanitizedSample.scale ?? defaults.scale,
    rotation: sanitizedSample.rotation ?? defaults.rotation,
    opacity: sanitizedSample.opacity ?? defaults.opacity,
    easing: (sanitizedSample.easing ?? defaults.easing) as MediaMotionEasing,
  };

  const next = withKeyframes(motion, [...(existing ?? []), frame]);
  const enabledNext = normalizeSceneMediaMotionRecord({
    ...next,
    enabled: true,
    presetId: next.presetId === "static" ? "custom" : next.presetId,
  });
  return finalize(enabledNext, duration, offsetMs, warnings);
}

export function updateMediaMotionKeyframe(
  motion: SceneMediaMotion,
  index: number,
  patch: Partial<MediaMotionKeyframe>,
  mediaWindowDurationMs: number,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult {
  const refused = refuseGuard(motion, options);
  if (refused) return refused;

  const duration = clampDurationMs(mediaWindowDurationMs);
  const current = normalizeMediaMotionKeyframes(motion.keyframes, {
    mediaWindowDurationMs: duration > 0 ? duration : undefined,
  });
  if (!current || index < 0 || index >= current.length) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: current && current.length > 0 ? 0 : null,
      warnings: [],
      message: "That keyframe is no longer available.",
    };
  }

  const warnings: string[] = [];
  const previous = current[index]!;
  const sanitized = sanitizeKeyframePatch(patch);
  let offsetMs = previous.offsetMs;
  if (sanitized.offsetMs !== undefined) {
    const requested = sanitized.offsetMs;
    offsetMs = duration > 0 ? Math.min(duration, Math.max(0, requested)) : Math.max(0, requested);
    if (offsetMs !== requested) {
      warnings.push(MEDIA_MOTION_KEYFRAME_CLAMP_WARNING);
    }
    if (
      current.some(
        (frame, frameIndex) => frameIndex !== index && frame.offsetMs === offsetMs,
      )
    ) {
      warnings.push(MEDIA_MOTION_KEYFRAME_DUPLICATE_TIME_WARNING);
    }
  }

  const nextFrames = current.map((frame, frameIndex) =>
    frameIndex === index
      ? {
          ...frame,
          ...sanitized,
          offsetMs,
        }
      : frame,
  );
  return finalize(withKeyframes(motion, nextFrames), duration, offsetMs, warnings);
}

export function deleteMediaMotionKeyframe(
  motion: SceneMediaMotion,
  index: number,
  mediaWindowDurationMs: number,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult {
  const refused = refuseGuard(motion, options);
  if (refused) return refused;

  const duration = clampDurationMs(mediaWindowDurationMs);
  const current = normalizeMediaMotionKeyframes(motion.keyframes, {
    mediaWindowDurationMs: duration > 0 ? duration : undefined,
  });
  if (!current || index < 0 || index >= current.length) {
    return {
      status: "terminal",
      motion: cloneMotion(motion),
      selectedKeyframeIndex: current && current.length > 0 ? 0 : null,
      warnings: [],
      message: "That keyframe is no longer available.",
    };
  }

  const deletedOffsetMs = current[index]!.offsetMs;
  const nextFrames = current.filter((_, frameIndex) => frameIndex !== index);
  const warnings: string[] = [];
  if (nextFrames.length < 2) {
    warnings.push(MEDIA_MOTION_KEYFRAME_BELOW_TWO_WARNING);
  }
  const preferred =
    nextFrames.length === 0
      ? null
      : nextFrames[findNearestMediaMotionKeyframeIndex(nextFrames, deletedOffsetMs)]!
          .offsetMs;
  return finalize(withKeyframes(motion, nextFrames), duration, preferred, warnings);
}

/** Removes keyframe metadata only — preserves preset/start/end motion. */
export function clearMediaMotionKeyframes(
  motion: SceneMediaMotion,
  options?: MediaMotionKeyframeCommandOptions,
): MediaMotionKeyframeCommandResult {
  const refused = refuseGuard(motion, options);
  if (refused) return refused;

  const next = cloneMotion(motion);
  delete next.keyframes;
  return {
    status: "ok",
    motion: next,
    selectedKeyframeIndex: null,
    warnings: [],
  };
}

/**
 * Disable/enable through the motion authority while retaining authored keyframes.
 * Not a keyframe-authoring command — remains available under established motion behavior.
 */
export function setMediaMotionEnabledPreservingKeyframes(
  motion: SceneMediaMotion,
  enabled: boolean,
): MediaMotionKeyframeCommandResult {
  const keyframes = motion.keyframes
    ? normalizeMediaMotionKeyframes(motion.keyframes)
    : undefined;
  if (!enabled) {
    const next: SceneMediaMotion = {
      version: MEDIA_MOTION_VERSION,
      enabled: false,
      presetId: "static",
      easing: "linear",
      intensity: 0,
      startTransform: { ...(motion.startTransform ?? MEDIA_MOTION_IDENTITY_TRANSFORM) },
      endTransform: { ...(motion.endTransform ?? MEDIA_MOTION_IDENTITY_TRANSFORM) },
    };
    if (keyframes && keyframes.length > 0) {
      next.keyframes = keyframes.map((frame) => ({ ...frame }));
    }
    return {
      status: "ok",
      motion: next,
      selectedKeyframeIndex: keyframes && keyframes.length > 0 ? 0 : null,
      warnings: [],
    };
  }

  const next = normalizeSceneMediaMotionRecord({
    ...motion,
    enabled: true,
    presetId: motion.presetId === "static" ? "custom" : motion.presetId || "custom",
    intensity:
      typeof motion.intensity === "number" && motion.intensity > 0
        ? motion.intensity
        : 1,
    keyframes,
  });
  return {
    status: "ok",
    motion: next,
    selectedKeyframeIndex: next.keyframes && next.keyframes.length > 0 ? 0 : null,
    warnings: [],
  };
}
