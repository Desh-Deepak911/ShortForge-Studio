/**
 * Guarded export-frame diagnostics (4.2C-7).
 * Development only — never logs every frame by default.
 */
import type { FootieScene, SceneImage } from "@/features/story/types";
import type { ExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import type { MediaPlaybackState } from "@/features/media-playback";

export interface ExportFrameDiagnosticsFilter {
  /** Inclusive start frame index. */
  frameIndexMin?: number;
  /** Inclusive end frame index. */
  frameIndexMax?: number;
  /** Only log when scene id matches. */
  sceneId?: string;
  /** Explicit opt-in flag (also requires non-production). */
  enabled?: boolean;
}

export interface ExportFrameDiagnosticsSnapshot {
  frameIndex: number;
  fps: number;
  exportTimestampMs: number;
  sceneId: string;
  sceneStartMs: number;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  videoSourceTimeMs: number | null;
  videoActualCurrentTimeSec: number | null;
  videoReadyState: number | null;
  captionId: string | null;
  captionStartMs: number | null;
  captionEndMs: number | null;
  captionProgress: number | null;
  fitMode: SceneImage["fitMode"] | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  drawWidth: number | null;
  drawHeight: number | null;
  motionScale: number | null;
  motionTranslateX: number | null;
  motionTranslateY: number | null;
  motionRotation: number | null;
}

function isDiagnosticsEnabled(filter: ExportFrameDiagnosticsFilter | undefined): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (filter?.enabled === true) {
    return true;
  }
  return process.env.SHORTFORGE_EXPORT_FRAME_DEBUG === "1";
}

function matchesFilter(
  snapshot: Pick<ExportFrameDiagnosticsSnapshot, "frameIndex" | "sceneId">,
  filter: ExportFrameDiagnosticsFilter | undefined,
): boolean {
  if (!filter) {
    return true;
  }
  if (filter.sceneId && filter.sceneId !== snapshot.sceneId) {
    return false;
  }
  if (
    typeof filter.frameIndexMin === "number" &&
    snapshot.frameIndex < filter.frameIndexMin
  ) {
    return false;
  }
  if (
    typeof filter.frameIndexMax === "number" &&
    snapshot.frameIndex > filter.frameIndexMax
  ) {
    return false;
  }
  return true;
}

/** Builds a diagnostics snapshot for one export frame (no I/O). */
export function buildExportFrameDiagnosticsSnapshot(input: {
  frameIndex: number;
  fps: number;
  exportTimestampMs: number;
  scene: Pick<FootieScene, "id" | "startMs" | "start">;
  sceneElapsedMs: number;
  sceneDurationMs: number;
  playback?: MediaPlaybackState | null;
  videoElement?: HTMLVideoElement | null;
  subtitleDisplay?: ExportSubtitleDisplay | null;
  drawImage?: SceneImage | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  drawWidth?: number | null;
  drawHeight?: number | null;
  motion?: {
    scale?: number;
    translateX?: number;
    translateY?: number;
    rotation?: number;
  } | null;
}): ExportFrameDiagnosticsSnapshot {
  const sceneStartMs =
    input.scene.startMs ??
    (typeof input.scene.start === "number" ? Math.round(input.scene.start * 1000) : 0);

  return {
    frameIndex: input.frameIndex,
    fps: input.fps,
    exportTimestampMs: input.exportTimestampMs,
    sceneId: input.scene.id,
    sceneStartMs,
    sceneElapsedMs: input.sceneElapsedMs,
    sceneDurationMs: input.sceneDurationMs,
    videoSourceTimeMs:
      input.playback && Number.isFinite(input.playback.clipTimeMs)
        ? input.playback.clipTimeMs
        : null,
    videoActualCurrentTimeSec:
      input.videoElement && Number.isFinite(input.videoElement.currentTime)
        ? input.videoElement.currentTime
        : null,
    videoReadyState: input.videoElement?.readyState ?? null,
    captionId: input.subtitleDisplay ? input.scene.id : null,
    captionStartMs: null,
    captionEndMs: null,
    captionProgress: input.subtitleDisplay?.effectProgress ?? null,
    fitMode: input.drawImage?.fitMode ?? null,
    sourceWidth: input.sourceWidth ?? null,
    sourceHeight: input.sourceHeight ?? null,
    drawWidth: input.drawWidth ?? null,
    drawHeight: input.drawHeight ?? null,
    motionScale: input.motion?.scale ?? null,
    motionTranslateX: input.motion?.translateX ?? null,
    motionTranslateY: input.motion?.translateY ?? null,
    motionRotation: input.motion?.rotation ?? null,
  };
}

/** Logs a single export frame snapshot when filters match. */
export function logExportFrameDiagnostics(
  snapshot: ExportFrameDiagnosticsSnapshot,
  filter?: ExportFrameDiagnosticsFilter,
): void {
  if (!isDiagnosticsEnabled(filter)) {
    return;
  }
  if (!matchesFilter(snapshot, filter)) {
    return;
  }

  console.debug("[ExportFrame]", snapshot);
}
