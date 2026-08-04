"use client";

import type { FootieScript } from "@/features/story/types";

import {
  assertExportPayload,
  buildFootieExportPayload,
  getRenderableScenesFromPayload,
  isTransitionVideoContent,
  type ExportScene,
  type FootieExportPayload,
} from "./export-payload.service";
import type { ExportAudioInput } from "@/features/export/utils/export-audio-input.utils";
import { downloadBlob } from "@/features/export/utils/download.utils";
import {
  type ExportBackgroundMusicMixSettings,
} from "@/features/export/utils/export-background-music.utils";
import {
  type ExportProgress,
  type ExportQualityPreset,
  type FootieExportOptions,
} from "@/features/export/utils/export-quality.utils";
import {
  buildExportDownloadFileName,
  type ExportSettings,
} from "@/features/export/utils/export-settings.utils";
import {
  isWebmExportPath,
  type ExportPath,
} from "@/features/export/utils/export-path.utils";
import {
  prepareExportRequest,
  type PrepareExportRequestResult,
} from "@/features/export/domain";
import type { ExportAudioMuxOutputFormat } from "@/features/export/utils/ffmpeg.utils";
import {
  drawExportGeneratedCaption,
  drawExportSubtitlesCaption,
  resetExportCanvasDrawState,
} from "@/features/export/utils/export-caption-canvas.utils";
import { drawExportTransitionBackgrounds } from "@/features/export/utils/export-transition-canvas.utils";
import {
  createExportMediaCache,
  disposeExportMediaCache,
  preloadExportStoryMedia,
  type ExportMediaCache,
} from "@/features/export/utils/export-media-cache.utils";
import {
  buildExportFrameDiagnosticsSnapshot,
  logExportFrameDiagnostics,
} from "@/features/export/utils/export-frame-diagnostics.dev.utils";
import {
  createManualCanvasFrameCapture,
  flushAndStopExportMediaRecorder,
  probeBlobDurationSec,
  resolveExpectedSilentVisualDurationSec,
  startExportMediaRecorder,
  validateEffectivePlaybackFps,
  validateSilentVisualDuration,
  ManualCanvasCaptureError,
} from "@/features/export/utils/export-manual-canvas-capture.utils";
import {
  EXPORT_TIMING_NORMALIZE_USER_ERROR,
  SILENT_VISUAL_NORMALIZE_STRATEGY,
  describeRawSilentTiming,
  resolveNormalizedDurationToleranceSec,
} from "@/features/export/utils/export-timestamp-normalization.utils";
import {
  ExportPipelineError,
  assessImageSequenceViability,
  emitExportStageEvent,
  resetExportStageEvents,
  captureExportJsHeapSnapshot,
  toExportPipelineError,
} from "@/features/export/utils/export-pipeline-forensics.utils";
import {
  drawSceneMediaFrame,
  exportSceneHasDrawableMedia,
  getExportVideoSamplingState,
  prepareExportMediaForTimelineFrame,
  resetExportVideoSamplingState,
  resolveExportSceneMediaDrawImage,
  type PrepareExportSceneMediaResult,
} from "@/features/export/utils/export-scene-media-renderer";
import {
  resolveExportSubtitleDisplayFromTimeline,
  type ExportSubtitleDisplay,
} from "@/features/export/utils/export-subtitle.utils";
import { resolveTimelineTransitionOverlay } from "@/features/timeline-intelligence/resolve-timeline-transition-overlay.utils";
import type { TimelineTransitionOverlay } from "@/features/timeline-intelligence/resolve-timeline-transition-overlay.utils";
import {
  resolveTimelineFrameCount,
  resolveTimelineFrameSampleTimeMs,
  resolveTimelineSceneFrame,
  resolveTimelineVisualTimeMs,
} from "@/features/timeline-intelligence/timeline-playback.utils";
import type { MasterTimeline } from "@/features/timeline-intelligence/timeline.types";
import {
  getExportSceneCaptionLines,
  normalizeCaptionMode,
} from "@/features/story/utils";

function assertBrowserExportEnvironment(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Video export is only available in the browser");
  }
}

function getSupportedMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function logExportPerformanceSummary(summary: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  if (
    process.env.SHORTFORGE_EXPORT_FRAME_DEBUG !== "1" &&
    process.env.SHORTFORGE_EXPORT_DEBUG !== "1"
  ) {
    return;
  }
  console.info("[ExportPerformance]", summary);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign = "left",
) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  const previousAlign = ctx.textAlign;
  ctx.textAlign = align;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, currentY);
  ctx.textAlign = previousAlign;
}

export interface ExportFrameTiming {
  sceneElapsedMs: number;
  sceneDurationMs: number;
}

export interface ExportFrameFromTimeline {
  scene: ExportScene;
  sceneIndex: number;
  timing: ExportFrameTiming;
  subtitleDisplay: ExportSubtitleDisplay | null;
}

/** Resolves export frame state from shared MasterTimeline playback helpers. */
export function resolveExportFrameFromMasterTimeline(
  masterTimeline: MasterTimeline,
  scenes: ExportScene[],
  sceneById: Map<string, ExportScene>,
  currentTimeMs: number,
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"],
): ExportFrameFromTimeline {
  const visualTimeMs = resolveTimelineVisualTimeMs(masterTimeline, currentTimeMs);
  const frame = resolveTimelineSceneFrame(masterTimeline, scenes, currentTimeMs);
  const fallbackScene = scenes[0]!;

  if (!frame) {
    return {
      scene: fallbackScene,
      sceneIndex: 0,
      timing: {
        sceneElapsedMs: 0,
        sceneDurationMs: fallbackScene.durationMs ?? 1000,
      },
      subtitleDisplay: null,
    };
  }

  const scene = sceneById.get(frame.scene.id) ?? frame.scene;
  const timing: ExportFrameTiming = {
    sceneElapsedMs: frame.sceneElapsedMs,
    sceneDurationMs: frame.sceneDurationMs,
  };
  const subtitleDisplay = resolveExportSubtitleDisplayFromTimeline(
    scene,
    frame.subtitle,
    frame.captionAnimation,
    visualTimeMs,
    { defaultCaptionAnimation },
  );

  return {
    scene,
    sceneIndex: frame.sceneIndex,
    timing,
    subtitleDisplay,
  };
}

function resolveExportFrameTiming(
  masterTimeline: MasterTimeline,
  scenes: ExportScene[],
  sceneById: Map<string, ExportScene>,
  currentTimeMs: number,
  defaultCaptionAnimation?: FootieScript["defaultCaptionAnimation"],
): ExportFrameFromTimeline {
  return resolveExportFrameFromMasterTimeline(
    masterTimeline,
    scenes,
    sceneById,
    currentTimeMs,
    defaultCaptionAnimation,
  );
}

function drawSceneBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ExportScene,
  mediaCache: ExportMediaCache,
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
  sceneElapsedMs: number,
  sceneDurationMs: number,
  prepared: PrepareExportSceneMediaResult | undefined,
) {
  drawSceneMediaFrame({
    ctx,
    width,
    height,
    scene,
    cache: mediaCache,
    masterTimeline,
    currentTimeMs,
    sceneElapsedMs,
    sceneDurationMs,
    mediaReady: prepared?.ok !== false,
  });
}

function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  script: FootieScript,
  scene: ExportScene,
  mediaCache: ExportMediaCache,
  timing: ExportFrameTiming,
  subtitleDisplay: ExportSubtitleDisplay | null,
  transitionOverlay: TimelineTransitionOverlay | null,
  preparedBySceneId: Map<string, PrepareExportSceneMediaResult>,
  masterTimeline: MasterTimeline,
  currentTimeMs: number,
) {
  const visualTimeMs = resolveTimelineVisualTimeMs(masterTimeline, currentTimeMs);
  const scale = width / 1080;
  const padX = 72 * scale;
  const titleY = 180 * scale;

  resetExportCanvasDrawState(ctx);
  ctx.clearRect(0, 0, width, height);

  // ── Background ─────────────────────────────────────────────────────────────
  if (transitionOverlay) {
    const fromScene = transitionOverlay.fromScene as ExportScene;
    const toScene = transitionOverlay.toScene as ExportScene;
    const fromPrepared = preparedBySceneId.get(fromScene.id);
    const toPrepared = preparedBySceneId.get(toScene.id);
    const fromTiming = {
      sceneElapsedMs: Math.max(
        0,
        Math.min(
          visualTimeMs - (fromScene.startMs ?? 0),
          fromScene.durationMs ?? timing.sceneDurationMs,
        ),
      ),
      sceneDurationMs: fromScene.durationMs ?? timing.sceneDurationMs,
    };
    const toTiming = {
      sceneElapsedMs: Math.max(
        0,
        Math.min(
          visualTimeMs - (toScene.startMs ?? 0),
          toScene.durationMs ?? timing.sceneDurationMs,
        ),
      ),
      sceneDurationMs: toScene.durationMs ?? timing.sceneDurationMs,
    };

    drawExportTransitionBackgrounds(ctx, width, height, {
      effect: transitionOverlay.effect,
      transitionState: transitionOverlay.transitionState,
      drawFromBackground: (layerCtx, layerWidth, layerHeight) => {
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          fromScene,
          mediaCache,
          masterTimeline,
          visualTimeMs,
          fromTiming.sceneElapsedMs,
          fromTiming.sceneDurationMs,
          fromPrepared,
        );
      },
      drawToBackground: (layerCtx, layerWidth, layerHeight) => {
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          toScene,
          mediaCache,
          masterTimeline,
          visualTimeMs,
          toTiming.sceneElapsedMs,
          toTiming.sceneDurationMs,
          toPrepared,
        );
      },
    });
  } else {
    drawSceneBackground(
      ctx,
      width,
      height,
      scene,
      mediaCache,
      masterTimeline,
      visualTimeMs,
      timing.sceneElapsedMs,
      timing.sceneDurationMs,
      preparedBySceneId.get(scene.id),
    );
  }

  // Gradient overlay for text legibility.
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,0.60)");
  overlay.addColorStop(0.35, "rgba(0,0,0,0.15)");
  overlay.addColorStop(1, "rgba(0,0,0,0.90)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  // ── Branding ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `bold ${36 * scale}px Arial, Helvetica, sans-serif`;
  ctx.fillText("FOOTIEBITZ", padX, 116 * scale);

  // ── Title ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${48 * scale}px Arial, Helvetica, sans-serif`;
  wrapText(ctx, script.title, padX, titleY, width - padX * 2, 58 * scale);

  // ── Scene type label on placeholder (no media) ─────────────────────────────
  if (
    !exportSceneHasDrawableMedia(mediaCache, scene) &&
    !transitionOverlay &&
    scene.sceneType
  ) {
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.font = `bold ${32 * scale}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(scene.sceneType.toUpperCase(), width / 2, height / 2);
    ctx.textAlign = "left";
  }

  // ── On-screen caption (generated or timed narration subtitles) ───────────
  // Hidden during transition overlay — matches preview behavior.
  if (transitionOverlay) {
    return;
  }

  const captionTiming = timing;

  if (normalizeCaptionMode(scene.captionMode) === "subtitles") {
    if (subtitleDisplay) {
      drawExportSubtitlesCaption({
        ctx,
        width,
        height,
        scale,
        display: subtitleDisplay,
        scene,
        script,
      });
    }
  } else {
    const captionLines = getExportSceneCaptionLines(scene, captionTiming).filter(
      (line) => !isTransitionVideoContent(line),
    );
    if (captionLines.length > 0) {
      drawExportGeneratedCaption(ctx, captionLines, width, height, scale, scene, script);
    }
  }
}

export async function exportSilentVideoBlob(
  script: FootieScript,
  qualityPreset: ExportQualityPreset,
  masterTimeline: MasterTimeline,
  onProgress?: (progress: ExportProgress) => void,
  payloadOverride?: FootieExportPayload,
  exportDurationMs?: number,
): Promise<Blob> {
  assertBrowserExportEnvironment();

  const payload = payloadOverride ?? buildFootieExportPayload(script);
  assertExportPayload(payload);

  // Tail-of-scene transition overlays use timeline metadata; transition items are
  // never rendered as standalone video segments.
  const scenes = getRenderableScenesFromPayload(payload);
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  if (scenes.length === 0) {
    throw new Error("Add scenes to your storyboard before exporting.");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const { width, height, fps, bitrate } = qualityPreset;

  onProgress?.({
    status: "preparing",
    progress: 0,
    message: "Preparing your video...",
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not supported");
  }

  const mediaCache = createExportMediaCache();
  resetExportVideoSamplingState();
  let capture: ReturnType<typeof createManualCanvasFrameCapture> | null = null;
  const wallClockStartedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    await preloadExportStoryMedia(scenes, mediaCache);

    const mimeType = getSupportedMimeType();
    // Manual capture only — never captureStream(fps), which duplicates frames during seeks.
    try {
      capture = createManualCanvasFrameCapture(canvas, { strict: process.env.NODE_ENV !== "production" });
    } catch (error) {
      if (error instanceof ManualCanvasCaptureError) {
        throw error;
      }
      throw new ManualCanvasCaptureError(
        "Manual canvas frame capture is required for export and is not supported in this browser.",
      );
    }

    const stream = capture.stream;
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const renderDurationMs = Math.max(
      exportDurationMs ?? masterTimeline.renderDurationMs,
      1,
    );
    const totalFrames = resolveTimelineFrameCount(renderDurationMs, fps);
    let drawnFrames = 0;

    onProgress?.({ status: "rendering", progress: 2, message: "Drawing your scenes..." });
    await startExportMediaRecorder(recorder);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      // Frame-center sample aligns discrete frames with continuous voiceover/captions.
      const currentTimeMs = resolveTimelineFrameSampleTimeMs(frameIndex, fps);
      const { scene, sceneIndex, timing, subtitleDisplay } = resolveExportFrameTiming(
        masterTimeline,
        scenes,
        sceneById,
        currentTimeMs,
        script.defaultCaptionAnimation,
      );

      const visualTimeMs = resolveTimelineVisualTimeMs(masterTimeline, currentTimeMs);
      const transitionOverlay = resolveTimelineTransitionOverlay(
        masterTimeline,
        scenes,
        currentTimeMs,
      );

      const preparedBySceneId = await prepareExportMediaForTimelineFrame({
        cache: mediaCache,
        scene,
        sceneElapsedMs: timing.sceneElapsedMs,
        sceneDurationMs: timing.sceneDurationMs,
        visualTimeMs,
        transitionFromScene: transitionOverlay?.fromScene ?? null,
        transitionToScene: transitionOverlay?.toScene ?? null,
        exportFps: fps,
      });

      drawSceneFrame(
        ctx,
        width,
        height,
        script,
        scene,
        mediaCache,
        timing,
        subtitleDisplay,
        transitionOverlay,
        preparedBySceneId,
        masterTimeline,
        currentTimeMs,
      );
      drawnFrames += 1;

      if (process.env.NODE_ENV !== "production") {
        const prepared = preparedBySceneId.get(scene.id);
        logExportFrameDiagnostics(
          buildExportFrameDiagnosticsSnapshot({
            frameIndex,
            fps,
            exportTimestampMs: currentTimeMs,
            scene,
            sceneElapsedMs: timing.sceneElapsedMs,
            sceneDurationMs: timing.sceneDurationMs,
            playback: prepared?.playback,
            subtitleDisplay,
            drawImage: resolveExportSceneMediaDrawImage(scene),
          }),
        );
      }

      // Exactly one capture after the complete frame is drawn — never during seek waits.
      await capture.requestFrame(frameIndex);

      const progress = Math.min(99, Math.round(((frameIndex + 1) / totalFrames) * 100));
      onProgress?.({
        status: "rendering",
        progress,
        message: `Drawing scene ${sceneIndex + 1} of ${scenes.length}...`,
      });
    }

    if (capture.capturedFrameCount() !== totalFrames || drawnFrames !== totalFrames) {
      throw new Error(
        `Export frame accounting mismatch: drawn=${drawnFrames}, captured=${capture.capturedFrameCount()}, expected=${totalFrames}`,
      );
    }

    onProgress?.({ status: "finalizing", progress: 99, message: "Almost done..." });

    await flushAndStopExportMediaRecorder(recorder);
    capture.cancel();
    stream.getTracks().forEach((track) => track.stop());

    if (chunks.length === 0) {
      throw new Error("Export produced no video data");
    }

    const silentBlobRaw = new Blob(chunks, { type: mimeType.split(";")[0] });
    const wallClockExportMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - wallClockStartedAt;
    const capturedFrameCount = capture.capturedFrameCount();
    const semanticFrameCount = capturedFrameCount > 0 ? capturedFrameCount : totalFrames;
    const expectedDurationSec = resolveExpectedSilentVisualDurationSec(
      semanticFrameCount,
      fps,
    );

    emitExportStageEvent({
      stage: "record-raw-webm",
      status: "success",
      startedAtMs: wallClockStartedAt,
      endedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      context: {
        chunkCount: chunks.length,
        rawWebmBytes: silentBlobRaw.size,
        mimeType: silentBlobRaw.type,
        capturedFrameCount,
        totalFrames,
        width,
        height,
        fps,
        heap: captureExportJsHeapSnapshot(),
      },
    });

    if (silentBlobRaw.size < 64) {
      throw new ExportPipelineError({
        stage: "record-raw-webm",
        code: "EXPORT_RAW_EMPTY",
        message: "The visual recording could not be completed. No file was downloaded.",
        detail: `Raw WebM too small: ${silentBlobRaw.size} bytes`,
        context: { size: silentBlobRaw.size, capturedFrameCount },
      });
    }

    const probedRawDurationSec = await probeBlobDurationSec(silentBlobRaw);
    const rawTiming = describeRawSilentTiming({
      capturedFrameCount: semanticFrameCount,
      rawDurationSec: probedRawDurationSec,
    });

    emitExportStageEvent({
      stage: "probe-raw-webm",
      status: "success",
      startedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      context: {
        rawTiming,
        viability: assessImageSequenceViability({
          width,
          height,
          frameCount: semanticFrameCount,
          rawWebmBytes: silentBlobRaw.size,
        }),
      },
    });

    // Raw MediaRecorder timestamps are never semantic. Always rebuild CFR
    // via image-sequence encode (frame index / requested FPS).
    onProgress?.({
      status: "finalizing",
      progress: 96,
      message: "Normalizing export timing...",
    });
    const { normalizeSilentVisualFrameTiming } = await import(
      "@/features/export/utils/ffmpeg.utils"
    );
    const normalizeStartedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const silentBlob = await normalizeSilentVisualFrameTiming(silentBlobRaw, {
      fps,
      frameCount: semanticFrameCount,
      durationSec: expectedDurationSec,
    });
    const normalizeWallClockMs = Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        normalizeStartedAt,
    );
    const timingNormalized = true;
    const actualDurationSec = await probeBlobDurationSec(silentBlob);

    emitExportStageEvent({
      stage: "probe-normalized-visual",
      status: actualDurationSec == null ? "failure" : "success",
      startedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      context: {
        actualDurationSec,
        expectedDurationSec,
        normalizedBytes: silentBlob.size,
      },
    });

    const durationToleranceSec = resolveNormalizedDurationToleranceSec(
      expectedDurationSec,
      fps,
    );
    const durationValidation = validateSilentVisualDuration({
      totalFrames: semanticFrameCount,
      fps,
      wallClockExportMs,
      actualDurationSec,
      toleranceSec: durationToleranceSec,
    });
    const fpsValidation =
      actualDurationSec == null
        ? null
        : validateEffectivePlaybackFps({
            capturedFrameCount: semanticFrameCount,
            encodedDurationSec: actualDurationSec,
            targetFps: fps,
          });

    const sampling = getExportVideoSamplingState();
    logExportPerformanceSummary({
      totalWallClockExportMs: Math.round(wallClockExportMs),
      semanticProjectDurationMs: renderDurationMs,
      realtimeFactor:
        renderDurationMs > 0 ? wallClockExportMs / renderDurationMs : null,
      totalFrames,
      fps,
      requestedFps: fps,
      capturedFrameCount,
      rawWebmDurationSec: rawTiming.rawDurationSec,
      rawEffectiveFps: rawTiming.rawEffectiveFps,
      rawTimingAvailable: rawTiming.rawTimingAvailable,
      rawTimingLabel: rawTiming.rawTimingLabel,
      expectedSilentDurationSec: expectedDurationSec,
      normalizedDurationSec: actualDurationSec,
      normalizedEffectiveFps: fpsValidation?.effectivePlaybackFps ?? null,
      actualSilentDurationSec: actualDurationSec,
      effectivePlaybackFps: fpsValidation?.effectivePlaybackFps ?? null,
      durationOk: durationValidation.ok,
      fpsOk: fpsValidation?.ok ?? null,
      timingNormalized,
      normalizationStrategy: SILENT_VISUAL_NORMALIZE_STRATEGY,
      normalizeWallClockMs,
      seekCount: sampling.seekCount,
      seekSkipCount: sampling.seekSkipCount,
      rvfcWaitCount: sampling.rvfcWaitCount,
      fallbackCount: sampling.fallbackCount,
      repeatedDecodedFrameWarnings: sampling.repeatedDecodedFrameWarnings,
    });

    if (actualDurationSec != null && (!durationValidation.ok || fpsValidation?.ok === false)) {
      const detail =
        `Unable to normalize silent visual timing: expected ${expectedDurationSec.toFixed(2)}s / ${fps}fps, ` +
        `received ${actualDurationSec.toFixed(2)}s / ${fpsValidation?.effectivePlaybackFps.toFixed(1) ?? "?"}fps. ` +
        rawTiming.rawTimingLabel;
      console.error("[ExportTiming]", detail);
      throw new ExportPipelineError({
        stage: "validate-normalized-visual",
        code: "EXPORT_NORMALIZE_TIMING_INVALID",
        message: EXPORT_TIMING_NORMALIZE_USER_ERROR,
        detail,
        context: {
          expectedDurationSec,
          actualDurationSec,
          fps,
          effectiveFps: fpsValidation?.effectivePlaybackFps ?? null,
        },
      });
    }

    return silentBlob;
  } finally {
    capture?.cancel();
    capture?.stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    disposeExportMediaCache(mediaCache);
    resetExportVideoSamplingState();
  }
}

type ExportResultKind = NonNullable<ExportProgress["resultKind"]>;

async function transcodeForMp4ExportPath(
  blob: Blob,
  hasAudio: boolean,
  onProgress: (update: ExportProgress) => void,
): Promise<Blob> {
  onProgress({
    status: "finalizing",
    progress: 90,
    message: "Converting to MP4 (0%)",
  });

  const { transcodeWebmToMp4 } = await import("@/features/export/utils/ffmpeg.utils");
  return transcodeWebmToMp4(blob, {
    hasAudio,
    onProgress: (transcodePercent) => {
      onProgress({
        status: "finalizing",
        progress: 90 + Math.round(transcodePercent * 0.1),
        message: `Converting to MP4 (${transcodePercent}%)`,
      });
    },
  });
}

async function finalizeBlobForExportPath(
  exportPath: ExportPath,
  blob: Blob,
  hasAudio: boolean,
  onProgress: (update: ExportProgress) => void,
): Promise<Blob> {
  if (isWebmExportPath(exportPath)) {
    return blob;
  }

  const { isMp4ExportBlob } = await import("@/features/export/utils/ffmpeg.utils");
  if (isMp4ExportBlob(blob)) {
    return blob;
  }

  return transcodeForMp4ExportPath(blob, hasAudio, onProgress);
}

export async function finishExportDownload(options: {
  exportPath: ExportPath;
  blob: Blob;
  exportSettings: ExportSettings;
  hasAudio: boolean;
  onProgress: (progress: ExportProgress) => void;
  message: string;
  warning?: string;
  resultKind?: ExportResultKind;
}): Promise<void> {
  const finalBlob = await finalizeBlobForExportPath(
    options.exportPath,
    options.blob,
    options.hasAudio,
    options.onProgress,
  );

  downloadBlob(
    finalBlob,
    buildExportDownloadFileName(options.exportSettings, options.exportPath),
  );

  options.onProgress({
    status: "done",
    progress: 100,
    message: options.message,
    warning: options.warning,
    resultKind: options.resultKind ?? "default",
  });
}

async function muxExportVideoWithVoiceover(
  silentBlob: Blob,
  voiceoverInput: ExportAudioInput,
  exportDurationSec: number,
  outputFormat: ExportAudioMuxOutputFormat,
  voiceGain: number,
  onMuxProgress?: (muxPercent: number) => void,
  applyPeakProtection?: boolean,
): Promise<Blob> {
  const { muxVideoWithAudio } = await import("@/features/export/utils/ffmpeg.utils");
  return muxVideoWithAudio(silentBlob, voiceoverInput, {
    videoDurationSec: exportDurationSec,
    outputFormat,
    voiceGain,
    applyPeakProtection,
    onProgress: onMuxProgress,
  });
}

export async function muxExportVideoWithAudioMix(options: {
  silentBlob: Blob;
  exportDurationSec: number;
  outputFormat: ExportAudioMuxOutputFormat;
  voiceoverInput?: ExportAudioInput;
  backgroundMusicInput?: ExportAudioInput;
  backgroundMusicMix?: ExportBackgroundMusicMixSettings;
  voiceGain: number;
  applyPeakProtection?: boolean;
  h264Crf?: number;
  onMuxProgress?: (muxPercent: number) => void;
}): Promise<Blob> {
  const { muxVideoWithExportAudio } = await import("@/features/export/utils/ffmpeg.utils");
  return muxVideoWithExportAudio(options.silentBlob, {
    videoDurationSec: options.exportDurationSec,
    outputFormat: options.outputFormat,
    voiceoverInput: options.voiceoverInput,
    backgroundMusicInput: options.backgroundMusicInput,
    backgroundMusicMix: options.backgroundMusicMix,
    voiceGain: options.voiceGain,
    applyPeakProtection: options.applyPeakProtection,
    h264Crf: options.h264Crf,
    onProgress: options.onMuxProgress,
  });
}

async function muxExportVideoWithStreamCopiedWebmAudio(
  silentBlob: Blob,
  preMixedAudioInput: ExportAudioInput,
  exportDurationSec: number,
  onMuxProgress?: (muxPercent: number) => void,
): Promise<Blob> {
  const { muxVideoWithStreamCopiedWebmAudio } = await import("@/features/export/utils/ffmpeg.utils");
  return muxVideoWithStreamCopiedWebmAudio(silentBlob, preMixedAudioInput, {
    videoDurationSec: exportDurationSec,
    outputFormat: "webm",
    onProgress: onMuxProgress,
  });
}

export async function muxWebmExportWithBrowserMixedAudio(options: {
  silentBlob: Blob;
  exportDurationSec: number;
  voiceoverInput: ExportAudioInput;
  backgroundMusicInput: ExportAudioInput;
  backgroundMusicMix: ExportBackgroundMusicMixSettings;
  onMuxProgress?: (muxPercent: number) => void;
}): Promise<Blob> {
  const { mixExportVoiceoverAndBackgroundMusic } = await import(
    "@/features/export/utils/export-browser-audio-mix.utils"
  );

  const mixedAudio = await mixExportVoiceoverAndBackgroundMusic({
    voiceoverInput: options.voiceoverInput,
    backgroundMusicInput: options.backgroundMusicInput,
    mixSettings: options.backgroundMusicMix,
  });

  return muxExportVideoWithStreamCopiedWebmAudio(
    options.silentBlob,
    {
      blob: mixedAudio.blob,
      fileName: mixedAudio.fileName,
      mimeType: mixedAudio.mimeType,
    },
    options.exportDurationSec,
    options.onMuxProgress,
  );
}

export async function runVoiceOnlyExportFallback(options: {
  silentBlob: Blob;
  voiceoverInput: ExportAudioInput;
  exportDurationSec: number;
  muxOutputFormat: ExportAudioMuxOutputFormat;
  voiceGain: number;
  applyPeakProtection?: boolean;
  onProgress: (progress: ExportProgress) => void;
  reportMuxProgress: (muxPercent: number, mixingMusic: boolean) => void;
}): Promise<Blob> {
  options.onProgress({
    status: "combining",
    progress: 78,
    message: "Combining voiceover (0%)",
  });

  const { resetFFmpeg, getFFmpeg } = await import("@/features/export/utils/ffmpeg.utils");
  await resetFFmpeg();
  await getFFmpeg();

  return muxExportVideoWithVoiceover(
    options.silentBlob,
    options.voiceoverInput,
    options.exportDurationSec,
    options.muxOutputFormat,
    options.voiceGain,
    (muxPercent) => options.reportMuxProgress(muxPercent, false),
    options.applyPeakProtection,
  );
}

/**
 * Public export entrypoint.
 *
 * Sprint 6B lifecycle: prepareExportRequest (manifest + preflight + renderer)
 * gates all renderer side effects. Blocked exports never reach preload/canvas/
 * MediaRecorder/FFmpeg.
 */
export async function exportFootieShort(
  script: FootieScript,
  onProgress: (progress: ExportProgress) => void,
  options: FootieExportOptions = {},
): Promise<void> {
  assertBrowserExportEnvironment();
  resetExportStageEvents();

  try {
    onProgress({
      status: "preparing",
      progress: 1,
      message: "Checking export...",
    });

    const prepared = await prepareExportRequest({
      story: script,
      options,
      throwIfBlocked: true,
      mixedMediaScenesEnabled: options.mixedMediaScenesEnabled === true,
      visualBeatDensityEnabled: options.visualBeatDensityEnabled === true,
      sourceQualityIntelligenceEnabled:
        options.sourceQualityIntelligenceEnabled === true,
      keyframedVisualEffectsEnabled:
        options.keyframedVisualEffectsEnabled === true,
      engagementOverlaysEnabled: options.engagementOverlaysEnabled === true,
      shortForgeBrandStingEnabled:
        options.shortForgeBrandStingEnabled === true,
      visualRetentionPresetsEnabled:
        options.visualRetentionPresetsEnabled === true,
      visualRetentionCapabilitiesReady:
        options.visualRetentionCapabilitiesReady === true,
      sourceQualityExportTarget: options.sourceQualityExportTarget,
    });

    await exportFootieShortFromManifest(prepared, onProgress, {
      audioFallback: options.audioFallback,
    });
  } catch (cause) {
    // Keep typed preflight errors distinct from renderer/pipeline failures.
    const { isExportPreflightError } = await import("@/features/export/domain");
    if (isExportPreflightError(cause)) {
      throw cause;
    }
    const { ExportFinalizationError } = await import("@/features/export/formats");
    if (cause instanceof ExportFinalizationError) {
      throw cause;
    }
    throw toExportPipelineError(cause, "cleanup");
  }
}

/**
 * Manifest-driven export entry (Sprint 6C).
 * Creates ExportRenderContext and renders from ExportManifest only.
 * Does not receive StoryDocument / FootieScript for rendering.
 */
export async function exportFootieShortFromManifest(
  request: PrepareExportRequestResult,
  onProgress: (progress: ExportProgress) => void,
  renderOptions: { audioFallback?: "voice-only" | "silent" | "webm" } = {},
): Promise<void> {
  if (request.renderer !== "browser") {
    const { ExportPreflightError } = await import("@/features/export/domain");
    throw new ExportPreflightError(request.preflight, request.manifest.fingerprint);
  }

  const { createExportRenderContext, disposeExportRenderContext, renderExport } =
    await import("@/features/export/runtime");

  const context = await createExportRenderContext(request.manifest, {
    width: request.manifest.output.width,
    height: request.manifest.output.height,
    environment: {
      supportsManualCanvasCapture:
        request.manifest.capabilities.environment.supportsManualCanvasFrameRequest,
      supportsMediaRecorder:
        request.manifest.capabilities.environment.supportsMediaRecorder,
      supportsRequestVideoFrameCallback:
        request.manifest.capabilities.environment.supportsRequestVideoFrameCallback,
      browserName: request.manifest.capabilities.environment.browserName,
    },
  });

  try {
    await renderExport(request.manifest, context, onProgress, {
      audioFallback: renderOptions.audioFallback,
    });
  } finally {
    await disposeExportRenderContext(context);
  }
}
