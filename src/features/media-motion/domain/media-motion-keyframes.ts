/**
 * Dormant media-motion keyframe model and normalization.
 *
 * Pure data only — no preview/export/headless wiring. Keyframes remain
 * non-authoritative until ExportManifest + all render consumers agree.
 *
 * Coordinate units (match SceneMediaTransform / preset deltas):
 * - x/y are reference-frame pixels in the fixed 1080×1920 design space
 *   (same space as MEDIA_MOTION_PRESETS pan deltas and SCENE_IMAGE_REFERENCE_*).
 * - Preview/export adapters scale reference x/y into the live frame
 *   (`x * frameWidth/1080`, `y * frameHeight/1920`), so authored values do not
 *   drift between 720p, 1080p, and 4K.
 * - scale is a unitless multiplier (identity 1).
 * - rotation is degrees.
 * - opacity is a unitless 0–1 channel (identity 1); unused by current adapters.
 */

import type {
  MediaMotionEasing,
  MediaMotionKeyframe,
} from "@/features/story/types";

/** Maximum retained keyframes after normalization (policy constant). */
export const MEDIA_MOTION_MAX_KEYFRAMES = 32;

/**
 * Defensive serialization bound for offsetMs when no real media-window
 * duration is supplied. This is NOT an implied media duration — it only
 * prevents hostile/unbounded offsets from surviving story-level normalize
 * before item windows are known. Resolve still requires a finite duration > 0.
 */
export const MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS =
  24 * 60 * 60 * 1000;

/**
 * Reference frame matching media-motion presets / SCENE_IMAGE_REFERENCE_*
 * (duplicated to avoid importing scene.utils into this leaf).
 */
export const MEDIA_MOTION_KEYFRAME_REFERENCE_WIDTH = 1080;
export const MEDIA_MOTION_KEYFRAME_REFERENCE_HEIGHT = 1920;

/** Absolute |x| bound in reference-frame pixels (full reference width). */
export const MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X =
  MEDIA_MOTION_KEYFRAME_REFERENCE_WIDTH;

/** Absolute |y| bound in reference-frame pixels (full reference height). */
export const MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y =
  MEDIA_MOTION_KEYFRAME_REFERENCE_HEIGHT;

/**
 * Scale multiplier bounds — aligned with scene image scale limits
 * (identity = 1).
 */
export const MEDIA_MOTION_KEYFRAME_MIN_SCALE = 0.5;
export const MEDIA_MOTION_KEYFRAME_MAX_SCALE = 3;

/** Rotation bounds in degrees (identity 0). */
export const MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG = 360;

/** Opacity bounds (identity 1). */
export const MEDIA_MOTION_KEYFRAME_MIN_OPACITY = 0;
export const MEDIA_MOTION_KEYFRAME_MAX_OPACITY = 1;

/** Identity defaults for optional keyframe channels. */
export const MEDIA_MOTION_KEYFRAME_IDENTITY_ROTATION = 0;
export const MEDIA_MOTION_KEYFRAME_IDENTITY_OPACITY = 1;

const MEDIA_MOTION_EASINGS: readonly MediaMotionEasing[] = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
];

export interface NormalizeMediaMotionKeyframesOptions {
  /**
   * Real projected media-window duration in ms.
   * - finite and > 0: offsets clamp strictly to [0, duration]
   * - 0: offsets clamp to 0 (resolve remains unavailable)
   * - omitted / non-finite / negative: offsets clamp only to the defensive
   *   serialization bound (not treated as a real media duration)
   */
  readonly mediaWindowDurationMs?: number;
}

interface CandidateKeyframe {
  readonly originalIndex: number;
  readonly keyframe: MediaMotionKeyframe;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type OffsetClampMode =
  | { readonly kind: "window"; readonly maxMs: number }
  | { readonly kind: "serialization"; readonly maxMs: number };

function resolveOffsetClampMode(
  mediaWindowDurationMs: number | undefined,
): OffsetClampMode {
  if (
    typeof mediaWindowDurationMs === "number" &&
    Number.isFinite(mediaWindowDurationMs) &&
    mediaWindowDurationMs >= 0
  ) {
    return { kind: "window", maxMs: mediaWindowDurationMs };
  }
  return {
    kind: "serialization",
    maxMs: MEDIA_MOTION_KEYFRAME_SERIALIZATION_MAX_OFFSET_MS,
  };
}

function normalizeEasing(value: unknown): MediaMotionEasing {
  if (
    typeof value === "string" &&
    (MEDIA_MOTION_EASINGS as readonly string[]).includes(value)
  ) {
    return value as MediaMotionEasing;
  }
  return "linear";
}

/**
 * Parse one raw keyframe. Rejects non-finite required numerics fail-closed.
 * Optional rotation/opacity default to identity (0 / 1).
 * Does not mutate `value`.
 */
function parseRawKeyframe(
  value: unknown,
  originalIndex: number,
  offsetMaxMs: number,
): CandidateKeyframe | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;

  // Required finite numerics — NaN/Infinity rejected.
  if (
    !isFiniteNumber(record.offsetMs) ||
    !isFiniteNumber(record.x) ||
    !isFiniteNumber(record.y) ||
    !isFiniteNumber(record.scale)
  ) {
    return null;
  }

  // Optional channels: missing → identity; present non-finite → reject entry.
  let rotation = MEDIA_MOTION_KEYFRAME_IDENTITY_ROTATION;
  if (record.rotation !== undefined) {
    if (!isFiniteNumber(record.rotation)) {
      return null;
    }
    rotation = record.rotation;
  }

  let opacity = MEDIA_MOTION_KEYFRAME_IDENTITY_OPACITY;
  if (record.opacity !== undefined) {
    if (!isFiniteNumber(record.opacity)) {
      return null;
    }
    opacity = record.opacity;
  }

  const keyframe: MediaMotionKeyframe = {
    offsetMs: clamp(record.offsetMs, 0, offsetMaxMs),
    x: clamp(
      record.x,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_X,
    ),
    y: clamp(
      record.y,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
      MEDIA_MOTION_KEYFRAME_MAX_ABS_TRANSLATION_Y,
    ),
    scale: clamp(
      record.scale,
      MEDIA_MOTION_KEYFRAME_MIN_SCALE,
      MEDIA_MOTION_KEYFRAME_MAX_SCALE,
    ),
    rotation: clamp(
      rotation,
      -MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
      MEDIA_MOTION_KEYFRAME_MAX_ABS_ROTATION_DEG,
    ),
    opacity: clamp(
      opacity,
      MEDIA_MOTION_KEYFRAME_MIN_OPACITY,
      MEDIA_MOTION_KEYFRAME_MAX_OPACITY,
    ),
    easing: normalizeEasing(record.easing),
  };

  return { originalIndex, keyframe };
}

/**
 * Endpoint-preserving maximum-count selection.
 *
 * Preconditions: `frames` is already sorted by offset and duplicate-resolved.
 * Algorithm:
 * 1. If length <= maxCount, keep all frames in order.
 * 2. Otherwise always keep frames[0] and frames[n-1].
 * 3. Fill the remaining (maxCount - 2) slots from the interior by selecting
 *    distinct indices:
 *      index(i) = floor(i * (interiorLength - 1) / (budget - 1))
 *      for i in [0, budget), with budget === 1 → middle interior index.
 * 4. Selection is pure and stable for the same normalized input.
 */
export function selectEndpointPreservingKeyframes(
  frames: readonly MediaMotionKeyframe[],
  maxCount: number = MEDIA_MOTION_MAX_KEYFRAMES,
): MediaMotionKeyframe[] {
  if (frames.length === 0) {
    return [];
  }
  if (maxCount < 1) {
    return [];
  }
  if (frames.length <= maxCount) {
    return frames.map((frame) => ({ ...frame }));
  }
  if (maxCount === 1) {
    return [{ ...frames[0]! }];
  }

  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const interior = frames.slice(1, -1);
  const budget = maxCount - 2;

  if (budget <= 0 || interior.length === 0) {
    return [{ ...first }, { ...last }];
  }

  if (interior.length <= budget) {
    return [
      { ...first },
      ...interior.map((frame) => ({ ...frame })),
      { ...last },
    ];
  }

  const selectedInterior: MediaMotionKeyframe[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < budget; i += 1) {
    const index =
      budget === 1
        ? Math.floor((interior.length - 1) / 2)
        : Math.floor((i * (interior.length - 1)) / (budget - 1));
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    selectedInterior.push({ ...interior[index]! });
  }

  // If rounding/floor collapsed indices, backfill lowest unused interiors.
  if (selectedInterior.length < budget) {
    for (let index = 0; index < interior.length; index += 1) {
      if (seen.has(index)) {
        continue;
      }
      seen.add(index);
      selectedInterior.push({ ...interior[index]! });
      if (selectedInterior.length >= budget) {
        break;
      }
    }
    selectedInterior.sort((a, b) => a.offsetMs - b.offsetMs);
  }

  return [{ ...first }, ...selectedInterior, { ...last }];
}

/**
 * Normalize raw keyframes into a deterministic, immutable list.
 *
 * Order of operations (stable):
 * 1. parse entries (reject non-finite required fields; optional rotation/opacity
 *    → identity; clamp offset using window duration or serialization bound;
 *    clamp transform/opacity bounds);
 * 2. sort by offsetMs ascending, then originalIndex ascending;
 * 3. resolve duplicate offsets (last-write-wins) AFTER offset clamping so values
 *    that clamp to the same boundary cannot survive ambiguously;
 * 4. apply endpoint-preserving maximum-count selection;
 * 5. freeze copies — never mutates `input` or nested objects.
 *
 * Returns undefined when no usable keyframes remain (treat as absent).
 */
export function normalizeMediaMotionKeyframes(
  input: unknown,
  options: NormalizeMediaMotionKeyframesOptions = {},
): readonly MediaMotionKeyframe[] | undefined {
  if (!Array.isArray(input) || input.length === 0) {
    return undefined;
  }

  const offsetMode = resolveOffsetClampMode(options.mediaWindowDurationMs);
  const candidates: CandidateKeyframe[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const parsed = parseRawKeyframe(input[index], index, offsetMode.maxMs);
    if (parsed) {
      candidates.push(parsed);
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((a, b) => {
    if (a.keyframe.offsetMs !== b.keyframe.offsetMs) {
      return a.keyframe.offsetMs - b.keyframe.offsetMs;
    }
    return a.originalIndex - b.originalIndex;
  });

  const deduped: MediaMotionKeyframe[] = [];
  for (const candidate of candidates) {
    const last = deduped[deduped.length - 1];
    if (last && last.offsetMs === candidate.keyframe.offsetMs) {
      deduped[deduped.length - 1] = { ...candidate.keyframe };
      continue;
    }
    deduped.push({ ...candidate.keyframe });
  }

  const selected = selectEndpointPreservingKeyframes(
    deduped,
    MEDIA_MOTION_MAX_KEYFRAMES,
  );
  return Object.freeze(selected.map((frame) => Object.freeze({ ...frame })));
}
