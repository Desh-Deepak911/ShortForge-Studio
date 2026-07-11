/**
 * Presentation-only helpers for timeline media visualization (4.2B-11).
 * No playback, trim, sync, or layout math — labels and visibility only.
 */
import type { FootieScene } from "@/features/story/types";
import { getSceneMedia, getSceneMediaType, sceneHasMedia } from "@/features/story/utils";

import { resolveTimelineVideoTrimWindow } from "./timeline-video-trim.utils";

/** Responsive width gates for progressive label disclosure (px). */
export const TIMELINE_MEDIA_VIZ_WIDTH = {
  /** Full corner labels (clip + trim + scene + badges). */
  full: 160,
  /** Scene + trim labels; clip label collapses. */
  secondary: 120,
  /** Badges + short icons; numeric labels hide. */
  compact: 96,
  /** Icons only. */
  icon: 72,
} as const;

export type TimelineMediaKind = "video" | "image" | "missing";

export type TimelineMediaVizDensity = "full" | "secondary" | "compact" | "icon";

export interface TimelineMediaVisualization {
  kind: TimelineMediaKind;
  density: TimelineMediaVizDensity;
  sceneDurationMs: number;
  sourceDurationMs: number;
  trimStartMs: number;
  trimEndMs: number;
  trimDurationMs: number;
  holdsLastFrame: boolean;
  usesEntireClipWindow: boolean;
  isMuted: boolean;
  hasPoster: boolean;
  sceneDurationLabel: string;
  clipDurationLabel: string;
  trimDurationLabel: string;
  holdLabel: string;
  holdShortLabel: string;
  mediaBadgeLabel: string;
  tooltip: string;
  ariaSummary: string;
  showSceneDurationLabel: boolean;
  showClipDurationLabel: boolean;
  showTrimDurationLabel: boolean;
  showHoldBadge: boolean;
  showHoldIconOnly: boolean;
  showMediaBadgeText: boolean;
  showMetaIcons: boolean;
}

/** Formats ms as a compact timeline duration (e.g. 3.2s). */
export function formatTimelineMediaSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }
  const sec = ms / 1000;
  if (sec >= 100) {
    return `${Math.round(sec)}s`;
  }
  if (sec >= 10) {
    return `${sec.toFixed(1)}s`;
  }
  return `${sec.toFixed(1)}s`;
}

export function resolveTimelineMediaVizDensity(blockWidthPx: number): TimelineMediaVizDensity {
  if (blockWidthPx >= TIMELINE_MEDIA_VIZ_WIDTH.full) {
    return "full";
  }
  if (blockWidthPx >= TIMELINE_MEDIA_VIZ_WIDTH.secondary) {
    return "secondary";
  }
  if (blockWidthPx >= TIMELINE_MEDIA_VIZ_WIDTH.compact) {
    return "compact";
  }
  return "icon";
}

export function resolveTimelineMediaKind(scene: FootieScene): TimelineMediaKind {
  const mediaType = getSceneMediaType(scene);
  if (mediaType === "video") {
    return "video";
  }
  if (mediaType === "image" || sceneHasMedia(scene)) {
    return "image";
  }
  return "missing";
}

export interface ResolveTimelineMediaVisualizationInput {
  scene: FootieScene;
  /** Scene block duration from layout VM (story time). */
  sceneDurationMs: number;
  blockWidthPx: number;
  /** Optional live trim preview while dragging (presentation only). */
  previewTrimStartMs?: number;
  previewTrimEndMs?: number;
}

/**
 * Derives all timeline media labels / visibility from SceneMedia + block width.
 * Pure — safe to call during render.
 */
export function resolveTimelineMediaVisualization(
  input: ResolveTimelineMediaVisualizationInput,
): TimelineMediaVisualization {
  const density = resolveTimelineMediaVizDensity(input.blockWidthPx);
  const kind = resolveTimelineMediaKind(input.scene);
  const media = getSceneMedia(input.scene);
  const sceneDurationMs = Math.max(0, Math.round(input.sceneDurationMs));

  const window = kind === "video" ? resolveTimelineVideoTrimWindow(input.scene) : null;
  const sourceDurationMs = window?.sourceDurationMs ?? 0;
  const trimStartMs =
    typeof input.previewTrimStartMs === "number"
      ? Math.round(input.previewTrimStartMs)
      : window?.trimStartMs ?? 0;
  const trimEndMs =
    typeof input.previewTrimEndMs === "number"
      ? Math.round(input.previewTrimEndMs)
      : window?.trimEndMs ?? 0;
  const trimDurationMs = Math.max(0, trimEndMs - trimStartMs);

  const holdsLastFrame =
    kind === "video" && trimDurationMs > 0 && sceneDurationMs > trimDurationMs + 16;
  const usesEntireClipWindow =
    kind === "video" &&
    sourceDurationMs > 0 &&
    trimDurationMs > 0 &&
    trimDurationMs + 16 >= sourceDurationMs;

  const isMuted = kind === "video" ? media?.muted !== false : false;
  const hasPoster =
    kind === "video" &&
    (typeof media?.posterTimeMs === "number" || Boolean(media?.posterUrl?.trim()));

  const sceneDurationLabel = formatTimelineMediaSeconds(sceneDurationMs);
  const clipDurationLabel =
    sourceDurationMs > 0 ? `Clip ${formatTimelineMediaSeconds(sourceDurationMs)}` : "Clip —";
  const trimDurationLabel =
    trimDurationMs > 0 ? `Trim ${formatTimelineMediaSeconds(trimDurationMs)}` : "Trim —";
  const holdLabel = "Hold last frame";
  const holdShortLabel = "Freeze";

  const mediaBadgeLabel =
    kind === "video" ? "Video" : kind === "image" ? "Image" : "Missing Media";

  const playbackLine = holdsLastFrame
    ? "Playback: Last frame held"
    : kind === "video"
      ? "Playback: Clip fills scene"
      : kind === "image"
        ? "Playback: Still image"
        : "Playback: No media";

  const tooltipLines =
    kind === "video"
      ? [
          "Video",
          sourceDurationMs > 0
            ? `Source clip ${formatTimelineMediaSeconds(sourceDurationMs)}`
            : "Source clip unavailable",
          trimDurationMs > 0
            ? `Trimmed ${formatTimelineMediaSeconds(trimStartMs)}–${formatTimelineMediaSeconds(trimEndMs)}`
            : "Trim unavailable",
          `Scene ${sceneDurationLabel}`,
          playbackLine,
          isMuted ? "Muted clip" : null,
          hasPoster ? "Poster selected" : null,
        ].filter(Boolean)
      : kind === "image"
        ? ["Image", `Scene ${sceneDurationLabel}`, playbackLine]
        : ["Missing media", `Scene ${sceneDurationLabel}`, "Export blocked until media is added"];

  const tooltip = tooltipLines.join("\n");

  const ariaSummary =
    kind === "video"
      ? [
          "Video scene",
          `Scene duration ${sceneDurationLabel}`,
          sourceDurationMs > 0 ? `Clip duration ${formatTimelineMediaSeconds(sourceDurationMs)}` : null,
          trimDurationMs > 0 ? `Trim duration ${formatTimelineMediaSeconds(trimDurationMs)}` : null,
          holdsLastFrame ? "Hold last frame" : null,
          isMuted ? "Muted clip" : null,
          hasPoster ? "Poster selected" : null,
        ]
          .filter(Boolean)
          .join(", ")
      : kind === "image"
        ? `Image scene, Scene duration ${sceneDurationLabel}`
        : `Missing media, Scene duration ${sceneDurationLabel}`;

  return {
    kind,
    density,
    sceneDurationMs,
    sourceDurationMs,
    trimStartMs,
    trimEndMs,
    trimDurationMs,
    holdsLastFrame,
    usesEntireClipWindow,
    isMuted,
    hasPoster,
    sceneDurationLabel,
    clipDurationLabel,
    trimDurationLabel,
    holdLabel,
    holdShortLabel,
    mediaBadgeLabel,
    tooltip,
    ariaSummary,
    showSceneDurationLabel: density === "full" || density === "secondary",
    showClipDurationLabel: density === "full" && kind === "video" && sourceDurationMs > 0,
    showTrimDurationLabel:
      (density === "full" || density === "secondary") && kind === "video" && trimDurationMs > 0,
    showHoldBadge: holdsLastFrame && density === "full",
    showHoldIconOnly: holdsLastFrame && (density === "secondary" || density === "compact"),
    showMediaBadgeText: density !== "icon",
    showMetaIcons: kind === "video" && density !== "icon",
  };
}
