/**
 * Export mixed-media pipeline audit helpers (4.2C-8A).
 * Pure analysis — does not change the production renderer.
 *
 * Models the interaction between:
 * - Semantic frame timestamps (frameIndex + fps)
 * - Wall-clock prepare cost (seek / RVFC)
 * - canvas.captureStream(fps) automatic capture during waits
 * - FFmpeg mux `-t projectDuration` truncation of the silent blob
 */
import {
  resolveTimelineFrameCount,
  resolveTimelineFrameSampleTimeMs,
} from "@/features/timeline-intelligence/timeline-playback.utils";

export const EXPORT_PIPELINE_AUDIT_VERSION = "4.2C-8A";

/** Known production constants (mirrored for audit assertions). */
export const EXPORT_SEEK_TIMEOUT_MS = 2_000;
export const EXPORT_DECODE_READY_TIMEOUT_MS = 500;

export interface AuditSceneFixture {
  id: string;
  mediaType: "image" | "video";
  /** Scene slot duration on the project timeline (ms). */
  sceneDurationMs: number;
  /** Source media duration when video (ms). Does not extend the scene. */
  sourceDurationMs?: number;
}

export interface AuditTimelineSlot {
  id: string;
  mediaType: "image" | "video";
  startMs: number;
  endMs: number;
  durationMs: number;
  sourceDurationMs: number | null;
}

export interface AuditSeekRequest {
  requestId: number;
  frameIndex: number;
  sceneId: string;
  requestedSourceTimeMs: number;
  startedAtWallMs: number;
}

export interface AuditSeekCompletion extends AuditSeekRequest {
  completedAtWallMs: number;
  actualSourceTimeMs: number;
  reason: "seeked+rvfc" | "seeked+timeout" | "epsilon-skip" | "seek-timeout" | "stale";
  stale: boolean;
}

/**
 * Builds contiguous timeline slots from scene durations.
 * Source video duration never extends a slot.
 */
export function buildAuditTimelineSlots(scenes: AuditSceneFixture[]): AuditTimelineSlot[] {
  let cursor = 0;
  return scenes.map((scene) => {
    const durationMs = Math.max(1, Math.round(scene.sceneDurationMs));
    const startMs = cursor;
    const endMs = cursor + durationMs;
    cursor = endMs;
    return {
      id: scene.id,
      mediaType: scene.mediaType,
      startMs,
      endMs,
      durationMs,
      sourceDurationMs:
        scene.mediaType === "video"
          ? Math.max(0, Math.round(scene.sourceDurationMs ?? durationMs))
          : null,
    };
  });
}

/** Project content end = sum of scene durations (no source inflation). */
export function resolveAuditProjectDurationMs(scenes: AuditSceneFixture[]): number {
  const slots = buildAuditTimelineSlots(scenes);
  return slots.length === 0 ? 0 : slots[slots.length - 1]!.endMs;
}

/** Active scene at an absolute export timestamp (half-open [start, end)). */
export function resolveAuditActiveSceneAtTime(
  slots: AuditTimelineSlot[],
  exportTimestampMs: number,
): {
  scene: AuditTimelineSlot;
  sceneIndex: number;
  sceneElapsedMs: number;
} | null {
  if (slots.length === 0) {
    return null;
  }

  const t = Math.max(0, exportTimestampMs);
  for (let i = 0; i < slots.length; i++) {
    const scene = slots[i]!;
    if (t >= scene.startMs && t < scene.endMs) {
      return {
        scene,
        sceneIndex: i,
        sceneElapsedMs: Math.min(scene.durationMs, Math.max(0, t - scene.startMs)),
      };
    }
  }

  const last = slots[slots.length - 1]!;
  if (t >= last.startMs) {
    return {
      scene: last,
      sceneIndex: slots.length - 1,
      sceneElapsedMs: last.durationMs,
    };
  }

  const first = slots[0]!;
  return { scene: first, sceneIndex: 0, sceneElapsedMs: 0 };
}

/**
 * Clip time for a video scene: trimStart (0) + sceneElapsed, clamped to
 * min(sceneDuration, sourceDuration) window — never uses absolute export time.
 */
export function resolveAuditVideoClipTimeMs(input: {
  sceneElapsedMs: number;
  sceneDurationMs: number;
  sourceDurationMs: number;
  trimStartMs?: number;
  trimEndMs?: number;
}): number {
  const trimStartMs = Math.max(0, input.trimStartMs ?? 0);
  const trimEndMs = Math.min(
    input.sourceDurationMs,
    input.trimEndMs ?? input.sourceDurationMs,
  );
  const elapsed = Math.min(
    Math.max(0, input.sceneElapsedMs),
    Math.max(0, input.sceneDurationMs),
  );
  const unclamped = trimStartMs + elapsed;
  return Math.min(trimEndMs, Math.max(trimStartMs, unclamped));
}

export interface CaptureStreamInflationFrame {
  frameIndex: number;
  exportTimestampMs: number;
  sceneId: string;
  mediaType: "image" | "video";
  prepareWallMs: number;
  sleepWallMs: number;
  iterationWallMs: number;
  /** Frames captureStream(fps) would emit during this iteration's wall time. */
  autoCapturedFrames: number;
  /** Cumulative wall-clock recorder time after this iteration (ms). */
  recorderTimeMs: number;
}

export interface CaptureStreamInflationReport {
  fps: number;
  totalSemanticFrames: number;
  projectDurationMs: number;
  totalRecorderWallMs: number;
  totalAutoCapturedFrames: number;
  /** Semantic frames whose canvas state appears inside the mux `-t` window. */
  semanticFramesVisibleAfterMuxTrim: number[];
  /** Scene IDs present in the mux-trimmed recorder window. */
  sceneIdsVisibleAfterMuxTrim: string[];
  /** True when later scenes exist semantically but are truncated out of the mux window. */
  laterScenesTruncatedByMux: boolean;
  frames: CaptureStreamInflationFrame[];
}

/**
 * Models production loop cost:
 *   iterationWall = prepareMs + sleep(1000/fps)
 * During that wall time, captureStream(fps) emits ~fps * wallSec frames of the
 * *same* canvas. Mux then keeps only the first projectDurationMs of recorder time.
 */
export function simulateCaptureStreamInflation(input: {
  slots: AuditTimelineSlot[];
  fps: number;
  /** Prepare cost for image frames (ms). */
  imagePrepareMs?: number;
  /** Prepare cost for video frames (ms) — typically seek + RVFC timeout. */
  videoPrepareMs?: number;
  /** Optional per-frame override. */
  prepareMsForFrame?: (frame: {
    frameIndex: number;
    sceneId: string;
    mediaType: "image" | "video";
  }) => number;
}): CaptureStreamInflationReport {
  const fps = input.fps > 0 ? input.fps : 30;
  const projectDurationMs = input.slots.length
    ? input.slots[input.slots.length - 1]!.endMs
    : 0;
  const totalSemanticFrames = resolveTimelineFrameCount(projectDurationMs, fps);
  const sleepWallMs = 1000 / fps;
  const imagePrepareMs = input.imagePrepareMs ?? 2;
  const videoPrepareMs = input.videoPrepareMs ?? EXPORT_DECODE_READY_TIMEOUT_MS;

  const frames: CaptureStreamInflationFrame[] = [];
  let recorderTimeMs = 0;

  for (let frameIndex = 0; frameIndex < totalSemanticFrames; frameIndex++) {
    const exportTimestampMs = resolveTimelineFrameSampleTimeMs(frameIndex, fps);
    const active = resolveAuditActiveSceneAtTime(input.slots, exportTimestampMs);
    const scene = active?.scene ?? input.slots[0]!;
    const prepareWallMs =
      input.prepareMsForFrame?.({
        frameIndex,
        sceneId: scene.id,
        mediaType: scene.mediaType,
      }) ?? (scene.mediaType === "video" ? videoPrepareMs : imagePrepareMs);

    const iterationWallMs = prepareWallMs + sleepWallMs;
    const autoCapturedFrames = Math.max(1, Math.round((iterationWallMs * fps) / 1000));
    recorderTimeMs += iterationWallMs;

    frames.push({
      frameIndex,
      exportTimestampMs,
      sceneId: scene.id,
      mediaType: scene.mediaType,
      prepareWallMs,
      sleepWallMs,
      iterationWallMs,
      autoCapturedFrames,
      recorderTimeMs,
    });
  }

  const semanticFramesVisibleAfterMuxTrim: number[] = [];
  const sceneIdSet = new Set<string>();
  let cursor = 0;
  for (const frame of frames) {
    const windowStart = cursor;
    const windowEnd = cursor + frame.iterationWallMs;
    // Any overlap of this iteration's recorder window with [0, projectDurationMs)
    // means this canvas state is present in the mux-trimmed output.
    if (windowStart < projectDurationMs) {
      semanticFramesVisibleAfterMuxTrim.push(frame.frameIndex);
      sceneIdSet.add(frame.sceneId);
    }
    cursor = windowEnd;
  }

  const allSceneIds = input.slots.map((s) => s.id);
  const laterScenesTruncatedByMux = allSceneIds.some((id) => !sceneIdSet.has(id));

  return {
    fps,
    totalSemanticFrames,
    projectDurationMs,
    totalRecorderWallMs: recorderTimeMs,
    totalAutoCapturedFrames: frames.reduce((sum, f) => sum + f.autoCapturedFrames, 0),
    semanticFramesVisibleAfterMuxTrim,
    sceneIdsVisibleAfterMuxTrim: [...sceneIdSet],
    laterScenesTruncatedByMux,
    frames,
  };
}

/**
 * Seek request registry for stale-completion detection.
 * Production currently has no equivalent generation token.
 */
export class ExportSeekRequestRegistry {
  private nextId = 1;
  private latestGlobal = 0;
  private latestByScene = new Map<string, number>();
  private completions: AuditSeekCompletion[] = [];

  begin(request: Omit<AuditSeekRequest, "requestId">): AuditSeekRequest {
    const requestId = this.nextId++;
    const full: AuditSeekRequest = { ...request, requestId };
    this.latestByScene.set(request.sceneId, requestId);
    this.latestGlobal = requestId;
    return full;
  }

  complete(
    request: AuditSeekRequest,
    partial: {
      completedAtWallMs: number;
      actualSourceTimeMs: number;
      reason: Exclude<AuditSeekCompletion["reason"], "stale">;
    },
  ): AuditSeekCompletion {
    const latestForScene = this.latestByScene.get(request.sceneId) ?? 0;
    const stale =
      request.requestId !== this.latestGlobal || request.requestId !== latestForScene;

    const completion: AuditSeekCompletion = {
      ...request,
      completedAtWallMs: partial.completedAtWallMs,
      actualSourceTimeMs: partial.actualSourceTimeMs,
      reason: stale ? "stale" : partial.reason,
      stale,
    };
    this.completions.push(completion);
    return completion;
  }

  getCompletions(): readonly AuditSeekCompletion[] {
    return this.completions;
  }

  getStaleCount(): number {
    return this.completions.filter((c) => c.stale).length;
  }
}

/** Structural flags describing production hazards (source-audited by verify script). */
export interface ExportPipelineHazardFlags {
  usesCaptureStreamWithPositiveFps: boolean;
  sleepsAfterEveryFrame: boolean;
  awaitsSeekPerVideoFrame: boolean;
  waitsForDecodedFrameAfterSeek: boolean;
  hasSeekGenerationToken: boolean;
  muxTruncatesWithDashT: boolean;
  decodeReadyTimeoutMs: number;
  seekTimeoutMs: number;
}

export function estimateVideoFrameCostMs(input: {
  seekMs: number;
  decodeWaitMs: number;
  drawMs?: number;
  sleepMs: number;
}): number {
  return (
    Math.max(0, input.seekMs) +
    Math.max(0, input.decodeWaitMs) +
    Math.max(0, input.drawMs ?? 0) +
    Math.max(0, input.sleepMs)
  );
}

/**
 * Answers whether per-frame HTMLVideoElement seeking is viable for production
 * given measured/estimated costs.
 */
export function assessPerFrameSeekViability(input: {
  fps: number;
  averageVideoFrameWallMs: number;
  projectDurationMs: number;
  /** Max acceptable wall/realtime ratio before export UX collapses. */
  maxRealtimeMultiplier?: number;
}): {
  viable: boolean;
  realtimeMultiplier: number;
  estimatedExportWallMs: number;
  reason: string;
} {
  const frameMs = 1000 / input.fps;
  const totalFrames = resolveTimelineFrameCount(input.projectDurationMs, input.fps);
  const estimatedExportWallMs = totalFrames * input.averageVideoFrameWallMs;
  const realtimeMultiplier =
    input.projectDurationMs > 0 ? estimatedExportWallMs / input.projectDurationMs : Infinity;
  const maxRealtimeMultiplier = input.maxRealtimeMultiplier ?? 3;
  const viable =
    input.averageVideoFrameWallMs <= frameMs * 1.5 &&
    realtimeMultiplier <= maxRealtimeMultiplier;

  return {
    viable,
    realtimeMultiplier,
    estimatedExportWallMs,
    reason: viable
      ? "Average video-frame cost stays near frame budget."
      : `Per-frame seek+decode (~${Math.round(input.averageVideoFrameWallMs)}ms) exceeds frame budget (${Math.round(frameMs)}ms) and inflates wall time ${realtimeMultiplier.toFixed(1)}× vs project duration; captureStream(fps) then duplicates canvas frames into the MediaRecorder blob before mux -t truncation.`,
  };
}
