/**
 * Scene Video Inspector formatting helpers — pure, framework-free.
 */
import {
  getSceneMediaTrimDuration,
  MIN_VIDEO_TRIM_DURATION_MS,
} from "@/features/media-playback";
import type { SceneMedia } from "@/features/story/types";

export interface SceneVideoTrimWindowSummary {
  trimStartMs: number;
  trimEndMs: number;
  trimDurationMs: number;
  sourceDurationMs: number;
  label: string;
}

export interface SceneVideoTimingSummary {
  trimStartMs: number;
  trimEndMs: number;
  trimDurationMs: number;
  sceneDurationMs: number;
  /** trimDuration − sceneDuration (negative when clip is shorter than scene). */
  trimVsSceneDeltaMs: number;
  holdsLastFrame: boolean;
}

/** Formats a media duration in ms for inspector display. */
export function formatMediaDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }

  if (ms === 0) {
    return "0s";
  }

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/** Formats intrinsic resolution for inspector display. */
export function formatMediaResolution(
  width: number | null | undefined,
  height: number | null | undefined,
): string {
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "—";
  }

  return `${Math.round(width)}×${Math.round(height)}`;
}

/** Formats MIME type for a compact badge / row. */
export function formatMediaMimeType(mimeType: string | null | undefined): string {
  if (typeof mimeType !== "string" || !mimeType.trim()) {
    return "video";
  }

  const trimmed = mimeType.trim().toLowerCase();
  if (trimmed.startsWith("video/")) {
    const subtype = trimmed.slice("video/".length);
    if (subtype === "quicktime") {
      return "MOV";
    }
    return subtype.toUpperCase();
  }

  return trimmed;
}

/** Human-readable source badge. */
export function formatMediaSourceBadge(source: SceneMedia["source"] | undefined): string {
  switch (source) {
    case "upload":
      return "Upload";
    case "asset":
      return "Asset";
    case "generated":
      return "Generated";
    case "external":
      return "External";
    case "legacy":
      return "Legacy";
    default:
      return "Video";
  }
}

/** Resolves and formats the active trim window for a video SceneMedia. */
export function formatTrimWindow(
  media: Pick<SceneMedia, "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
): SceneVideoTrimWindowSummary {
  const sourceDurationMs =
    typeof media?.durationMs === "number" && Number.isFinite(media.durationMs) && media.durationMs > 0
      ? Math.round(media.durationMs)
      : 0;

  const trimStartMs =
    typeof media?.trimStartMs === "number" && Number.isFinite(media.trimStartMs) && media.trimStartMs >= 0
      ? Math.round(media.trimStartMs)
      : 0;

  const trimEndMs =
    typeof media?.trimEndMs === "number" &&
    Number.isFinite(media.trimEndMs) &&
    media.trimEndMs > trimStartMs
      ? Math.round(media.trimEndMs)
      : sourceDurationMs > 0
        ? sourceDurationMs
        : trimStartMs;

  const clampedEnd = sourceDurationMs > 0 ? Math.min(trimEndMs, sourceDurationMs) : trimEndMs;
  const clampedStart = Math.min(trimStartMs, clampedEnd);
  const trimDurationMs = getSceneMediaTrimDuration({
    durationMs: sourceDurationMs || undefined,
    trimStartMs: clampedStart,
    trimEndMs: clampedEnd,
  });

  return {
    trimStartMs: clampedStart,
    trimEndMs: Math.max(clampedStart, clampedEnd),
    trimDurationMs,
    sourceDurationMs,
    label: `${formatMediaDuration(clampedStart)} → ${formatMediaDuration(
      Math.max(clampedStart, clampedEnd),
    )} (${formatMediaDuration(trimDurationMs)})`,
  };
}

/** Compares trim window to scene duration for inspector timing copy. */
export function resolveSceneVideoTimingSummary(
  media: Pick<SceneMedia, "durationMs" | "trimStartMs" | "trimEndMs"> | null | undefined,
  sceneDurationMs: number,
): SceneVideoTimingSummary {
  const trimWindow = formatTrimWindow(media);
  const sceneMs =
    typeof sceneDurationMs === "number" && Number.isFinite(sceneDurationMs) && sceneDurationMs > 0
      ? Math.round(sceneDurationMs)
      : 0;
  const trimVsSceneDeltaMs = trimWindow.trimDurationMs - sceneMs;

  return {
    trimStartMs: trimWindow.trimStartMs,
    trimEndMs: trimWindow.trimEndMs,
    trimDurationMs: trimWindow.trimDurationMs,
    sceneDurationMs: sceneMs,
    trimVsSceneDeltaMs,
    holdsLastFrame:
      sceneMs > 0 && trimWindow.trimDurationMs > 0 && trimWindow.trimDurationMs < sceneMs,
  };
}

export function formatTrimVsSceneDelta(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    return "Matches scene duration";
  }

  if (deltaMs < 0) {
    return `Clip shorter by ${formatMediaDuration(Math.abs(deltaMs))}`;
  }

  return `Clip longer by ${formatMediaDuration(deltaMs)}`;
}

/** Minimum trim window used for UI bounds (matches engine). */
export const SCENE_VIDEO_TRIM_MIN_GAP_MS = MIN_VIDEO_TRIM_DURATION_MS;

export const SCENE_VIDEO_TRIM_STEP_SEC = 0.1;
export const SCENE_VIDEO_TRIM_SHIFT_STEP_SEC = 1;

/** Formats absolute source time for trim inputs (3 decimal places). */
export function formatTrimSeconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) {
    return "0.000";
  }

  return (Math.round(ms) / 1000).toFixed(3);
}

/** Parses a seconds string/number into milliseconds. Returns null when invalid. */
export function parseTrimSecondsToMs(value: string | number): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 1000);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 1000);
}

export interface SceneVideoTrimDraftValidation {
  ok: boolean;
  startMs: number | null;
  endMs: number | null;
  errors: string[];
}

/**
 * Validates draft trim inputs before commit.
 * Final clamping still happens in buildVideoTrimPatch.
 */
export function validateSceneVideoTrimDraft(
  startValue: string,
  endValue: string,
  sourceDurationMs: number,
): SceneVideoTrimDraftValidation {
  const errors: string[] = [];

  if (!(typeof sourceDurationMs === "number" && Number.isFinite(sourceDurationMs) && sourceDurationMs > 0)) {
    errors.push("Trim unavailable until video metadata is loaded.");
    return { ok: false, startMs: null, endMs: null, errors };
  }

  const startMs = parseTrimSecondsToMs(startValue);
  const endMs = parseTrimSecondsToMs(endValue);

  if (startMs == null) {
    errors.push("Trim start must be a valid number of seconds.");
  } else if (startMs < 0) {
    errors.push("Trim start cannot be negative.");
  }

  if (endMs == null) {
    errors.push("Trim end must be a valid number of seconds.");
  } else if (endMs > sourceDurationMs) {
    errors.push("Trim end cannot exceed the source duration.");
  }

  if (startMs != null && endMs != null) {
    if (startMs >= endMs) {
      errors.push("Trim start must be less than trim end.");
    } else if (endMs - startMs < MIN_VIDEO_TRIM_DURATION_MS) {
      errors.push(
        `Trim window must be at least ${MIN_VIDEO_TRIM_DURATION_MS}ms.`,
      );
    }
  }

  return {
    ok: errors.length === 0 && startMs != null && endMs != null,
    startMs,
    endMs,
    errors,
  };
}

/** Concise playback result copy for trim vs scene duration. */
export function formatTrimPlaybackResult(
  trimDurationMs: number,
  sceneDurationMs: number,
): string {
  const trimMs =
    typeof trimDurationMs === "number" && Number.isFinite(trimDurationMs) && trimDurationMs > 0
      ? Math.round(trimDurationMs)
      : 0;
  const sceneMs =
    typeof sceneDurationMs === "number" && Number.isFinite(sceneDurationMs) && sceneDurationMs > 0
      ? Math.round(sceneDurationMs)
      : 0;

  if (trimMs <= 0 || sceneMs <= 0) {
    return "Trim duration matches scene duration.";
  }

  if (trimMs < sceneMs) {
    const holdMs = sceneMs - trimMs;
    return `Final frame will be held for ${formatMediaDuration(holdMs)}.`;
  }

  if (trimMs > sceneMs) {
    return `Only the first ${formatMediaDuration(sceneMs)} of this trim will be used.`;
  }

  return "Trim duration matches scene duration.";
}

/** True when numeric trim controls can edit this video. */
export function isSceneVideoTrimEditorAvailable(
  media: Pick<SceneMedia, "type" | "durationMs"> | null | undefined,
): boolean {
  return (
    media?.type === "video" &&
    typeof media.durationMs === "number" &&
    Number.isFinite(media.durationMs) &&
    media.durationMs >= MIN_VIDEO_TRIM_DURATION_MS
  );
}

export const SCENE_VIDEO_INSPECTOR_SAFETY_COPY =
  "Only use clips you own or have rights to use.";

export const SCENE_VIDEO_COMING_SOON_CONTROLS = [
  { id: "clip-audio", label: "Clip audio", hint: "Coming soon" },
] as const;
