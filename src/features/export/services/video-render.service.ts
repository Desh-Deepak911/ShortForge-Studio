"use client";

import type { FootieScript, SceneType, TimelineItem } from "@/features/story/types";

import {
  assertExportPayload,
  buildFootieExportPayload,
  countExportTransitions,
  formatExportSceneTiming,
  getExportTotalDurationSec,
  getRenderableScenesFromPayload,
  isTransitionVideoContent,
  type ExportScene,
  type FootieExportPayload,
} from "./export-payload.service";
import { buildAudioMixFromStory, logAudioEngineState } from "@/features/audio";
import type { ExportAudioInput } from "@/features/export/utils/export-audio-input.utils";
import { downloadBlob } from "@/features/export/utils/download.utils";
import {
  EXPORT_AUDIO_FULL_SUCCESS_MESSAGE,
  EXPORT_AUDIO_SILENT_FALLBACK_MESSAGE,
  EXPORT_AUDIO_VOICE_ONLY_FALLBACK_WARNING,
  EXPORT_BACKGROUND_MUSIC_FALLBACK_WARNING,
  EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED,
  isExportBackgroundMusicActiveFromMix,
  resolveExportBackgroundMusicMixSettingsFromMix,
  type ExportBackgroundMusicMixSettings,
} from "@/features/export/utils/export-background-music.utils";
import {
  type ExportProgress,
  type ExportQualityPreset,
  type FootieExportOptions,
} from "@/features/export/utils/export-quality.utils";
import {
  buildExportDownloadFileName,
  resolveExportRenderPreset,
  resolveExportSettings,
  type ExportSettings,
} from "@/features/export/utils/export-settings.utils";
import {
  isWebmExportPath,
  resolveExportPath,
  resolveWebmBackgroundMusicExportNotice,
  type ExportPath,
} from "@/features/export/utils/export-path.utils";
import type { ExportAudioMuxOutputFormat } from "@/features/export/utils/ffmpeg.utils";
import {
  drawExportGeneratedCaption,
  drawExportSubtitlesCaption,
  resetExportCanvasDrawState,
} from "@/features/export/utils/export-caption-canvas.utils";
import { drawExportTransitionBackgrounds } from "@/features/export/utils/export-transition-canvas.utils";
import { resolveExportSubtitleDisplay } from "@/features/export/utils/export-subtitle.utils";
import { resolveSceneTransitionOverlay } from "@/features/story/utils/transition-overlay.utils";
import type { SceneTransitionOverlay } from "@/features/story/utils/transition-overlay.utils";
import {
  getExportSceneCaptionLines,
  getSceneDurationMs,
  getSceneTimingAtGlobalTime,
  normalizeCaptionMode,
  resolveStoryDurationSec,
  drawSceneImageInFrame,
  getSceneImageUrl,
  resolveExportSceneImage,
  resolveSceneImageMotionProgress,
  resolveSceneImageMotionScale,
} from "@/features/story/utils";

function assertBrowserExportEnvironment(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Video export is only available in the browser");
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function requestCanvasCaptureFrame(stream: MediaStream): void {
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  track.requestFrame?.();
}

function getSupportedMimeType(): string {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load scene image"));
    img.src = src;
  });
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

// Per-scene-type top colour for the placeholder gradient.
const SCENE_TYPE_TOP_COLOR: Record<SceneType, string> = {
  intro:      "#0c1a2e", // dark navy
  context:    "#1a1400", // dark amber-brown
  match:      "#0a0f18", // near-black blue
  transition: "#120c1e", // dark violet
  ending:     "#0f0f0f", // near-black neutral
};

const DEFAULT_TOP_COLOR = "#0a0f18";

function drawPlaceholderBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneType: SceneType | undefined,
) {
  const topColor = sceneType ? SCENE_TYPE_TOP_COLOR[sceneType] : DEFAULT_TOP_COLOR;
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(0.5, "#18181b");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export interface ExportFrameTiming {
  sceneElapsedMs: number;
  sceneDurationMs: number;
}

function resolveExportFrameTiming(
  scenes: ExportScene[],
  timeSec: number,
): { scene: ExportScene; sceneIndex: number; timing: ExportFrameTiming } {
  const timingAt = getSceneTimingAtGlobalTime(scenes, timeSec * 1000);
  const sceneIndex = timingAt?.slot.index ?? 0;
  const scene = scenes[sceneIndex] ?? scenes[0]!;

  return {
    scene,
    sceneIndex,
    timing: {
      sceneElapsedMs: timingAt?.sceneElapsedMs ?? 0,
      sceneDurationMs: timingAt?.sceneDurationMs ?? getSceneDurationMs(scene),
    },
  };
}

function drawSceneBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ExportScene,
  image: HTMLImageElement | null,
  motionProgress = 0,
) {
  if (image) {
    const sceneImage = resolveExportSceneImage(scene);
    const motionScale = resolveSceneImageMotionScale(sceneImage?.imageMotion, motionProgress);

    if (sceneImage) {
      drawSceneImageInFrame(
        ctx,
        image,
        width,
        height,
        sceneImage,
        image.naturalWidth,
        image.naturalHeight,
        motionScale,
      );
    } else {
      ctx.drawImage(image, 0, 0, width, height);
    }
  } else {
    drawPlaceholderBackground(ctx, width, height, scene.sceneType);
  }
}

function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  script: FootieScript,
  scene: ExportScene,
  image: HTMLImageElement | null,
  timing: ExportFrameTiming,
  transitionOverlay: SceneTransitionOverlay | null,
  transitionImages: { from: HTMLImageElement | null; to: HTMLImageElement | null } | null,
) {
  const scale = width / 1080;
  const padX = 72 * scale;
  const titleY = 180 * scale;
  const subtitleY = height - 320 * scale;

  resetExportCanvasDrawState(ctx);
  ctx.clearRect(0, 0, width, height);

  const sceneMotionProgress = resolveSceneImageMotionProgress(
    timing.sceneElapsedMs,
    timing.sceneDurationMs,
  );

  // ── Background ─────────────────────────────────────────────────────────────
  if (transitionOverlay && transitionImages) {
    drawExportTransitionBackgrounds(ctx, width, height, {
      effect: transitionOverlay.effect,
      progress: transitionOverlay.progress,
      drawFromBackground: (layerCtx, layerWidth, layerHeight) => {
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          transitionOverlay.fromScene as ExportScene,
          transitionImages.from,
          sceneMotionProgress,
        );
      },
      drawToBackground: (layerCtx, layerWidth, layerHeight) => {
        drawSceneBackground(
          layerCtx,
          layerWidth,
          layerHeight,
          transitionOverlay.toScene as ExportScene,
          transitionImages.to,
          0,
        );
      },
    });
  } else {
    drawSceneBackground(ctx, width, height, scene, image, sceneMotionProgress);
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

  // ── Scene type label on placeholder (no image) ─────────────────────────────
  if (!image && !transitionOverlay && scene.sceneType) {
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
    const subtitleDisplay = resolveExportSubtitleDisplay(scene, captionTiming);
    if (subtitleDisplay) {
      drawExportSubtitlesCaption({
        ctx,
        width,
        height,
        subtitleY,
        scale,
        display: subtitleDisplay,
      });
    }
  } else {
    const captionLines = getExportSceneCaptionLines(scene, captionTiming).filter(
      (line) => !isTransitionVideoContent(line),
    );
    if (captionLines.length > 0) {
      drawExportGeneratedCaption(ctx, captionLines, width, height, subtitleY, scale);
    }
  }
}

function mapRenderingProgress(
  progress: ExportProgress,
  hasVoiceover: boolean,
): ExportProgress {
  if (!hasVoiceover) {
    return progress;
  }

  if (progress.status === "rendering" || progress.status === "preparing") {
    return {
      ...progress,
      progress: Math.min(70, Math.round(progress.progress * 0.7)),
      message:
        progress.status === "preparing"
          ? progress.message
          : progress.message.replace(/^Recording video\.\.\.$/, "Rendering video"),
    };
  }

  if (progress.status === "finalizing") {
    return {
      status: "rendering",
      progress: 70,
      message: "Rendering video",
    };
  }

  return progress;
}

export async function exportSilentVideoBlob(
  script: FootieScript,
  qualityPreset: ExportQualityPreset,
  onProgress?: (progress: ExportProgress) => void,
  payloadOverride?: FootieExportPayload,
): Promise<Blob> {
  assertBrowserExportEnvironment();

  const payload = payloadOverride ?? buildFootieExportPayload(script);
  assertExportPayload(payload);

  // Tail-of-scene transition overlays use timeline metadata; transition items are
  // never rendered as standalone video segments.
  const scenes = getRenderableScenesFromPayload(payload);
  const transitionCount = countExportTransitions(payload);

  if (scenes.length === 0) {
    throw new Error("No scenes to export");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const { width, height, fps, bitrate, label } = qualityPreset;

  onProgress?.({
    status: "preparing",
    progress: 0,
    message:
      transitionCount > 0
        ? `Preparing ${label} export (${width}×${height} @ ${fps}fps) · ${transitionCount} transitions queued`
        : `Preparing ${label} export (${width}×${height} @ ${fps}fps)...`,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not supported");
  }

  const imageCache = new Map<string, HTMLImageElement>();
  for (const scene of scenes) {
    const imageUrl = getSceneImageUrl(scene);
    if (imageUrl) {
      try {
        const img = await loadImage(imageUrl);
        imageCache.set(scene.id, img);
      } catch {
        // Fall back to gradient placeholder for this scene.
      }
    }
  }

  const mimeType = getSupportedMimeType();
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const totalDurationSec = Math.max(
    getExportTotalDurationSec(payload),
    resolveStoryDurationSec(script),
    0.001,
  );
  const totalFrames = Math.max(1, Math.round(totalDurationSec * fps));
  const frameMs = 1000 / fps;
  let renderedFrames = 0;

  onProgress?.({ status: "rendering", progress: 2, message: "Rendering video" });
  recorder.start(250);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const timeSec = frameIndex / fps;
    const { scene, sceneIndex, timing } = resolveExportFrameTiming(scenes, timeSec);

    const image = imageCache.get(scene.id) ?? null;
    const transitionOverlay = resolveSceneTransitionOverlay(
      scenes,
      payload.timelineItems as TimelineItem[],
      sceneIndex,
      timing.sceneElapsedMs,
      timing.sceneDurationMs,
    );
    const transitionImages = transitionOverlay
      ? {
          from: imageCache.get(transitionOverlay.fromScene.id) ?? null,
          to: imageCache.get(transitionOverlay.toScene.id) ?? null,
        }
      : null;

    drawSceneFrame(
      ctx,
      width,
      height,
      script,
      scene,
      image,
      timing,
      transitionOverlay,
      transitionImages,
    );
    requestCanvasCaptureFrame(stream);
    renderedFrames++;
    const progress = Math.min(99, Math.round((renderedFrames / totalFrames) * 100));
    onProgress?.({
      status: "rendering",
      progress,
      message: `Rendering scene ${sceneIndex + 1} (${formatExportSceneTiming(scene)}) at ${label}...`,
    });
    await sleep(frameMs);
  }

  onProgress?.({ status: "finalizing", progress: 99, message: "Finalizing video..." });

  await new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.stop();
  });

  stream.getTracks().forEach((track) => track.stop());

  if (chunks.length === 0) {
    throw new Error("Export produced no video data");
  }

  return new Blob(chunks, { type: mimeType.split(";")[0] });
}

type ExportResultKind = NonNullable<ExportProgress["resultKind"]>;

function resolveMuxOutputFormat(exportPath: ExportPath): ExportAudioMuxOutputFormat {
  return exportPath === "mp4" ? "mp4" : "webm";
}

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

async function finishExportDownload(options: {
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
  onMuxProgress?: (muxPercent: number) => void,
): Promise<Blob> {
  const { muxVideoWithAudio } = await import("@/features/export/utils/ffmpeg.utils");
  return muxVideoWithAudio(silentBlob, voiceoverInput, {
    videoDurationSec: exportDurationSec,
    outputFormat,
    onProgress: onMuxProgress,
  });
}

async function muxExportVideoWithAudioMix(options: {
  silentBlob: Blob;
  exportDurationSec: number;
  outputFormat: ExportAudioMuxOutputFormat;
  voiceoverInput?: ExportAudioInput;
  backgroundMusicInput?: ExportAudioInput;
  backgroundMusicMix?: ExportBackgroundMusicMixSettings;
  onMuxProgress?: (muxPercent: number) => void;
}): Promise<Blob> {
  const { muxVideoWithExportAudio } = await import("@/features/export/utils/ffmpeg.utils");
  return muxVideoWithExportAudio(options.silentBlob, {
    videoDurationSec: options.exportDurationSec,
    outputFormat: options.outputFormat,
    voiceoverInput: options.voiceoverInput,
    backgroundMusicInput: options.backgroundMusicInput,
    backgroundMusicMix: options.backgroundMusicMix,
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

async function muxWebmExportWithBrowserMixedAudio(options: {
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
    durationSec: options.exportDurationSec,
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

async function runVoiceOnlyExportFallback(options: {
  silentBlob: Blob;
  voiceoverInput: ExportAudioInput;
  exportDurationSec: number;
  muxOutputFormat: ExportAudioMuxOutputFormat;
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
    (muxPercent) => options.reportMuxProgress(muxPercent, false),
  );
}

export async function exportFootieShort(
  script: FootieScript,
  onProgress: (progress: ExportProgress) => void,
  options: FootieExportOptions = {},
): Promise<void> {
  assertBrowserExportEnvironment();

  const exportSettings = resolveExportSettings(script, options);
  const exportPath = resolveExportPath(exportSettings);

  if (exportPath.blocked) {
    throw new Error(exportPath.blockReason ?? "Selected export format is unavailable.");
  }

  const payload = buildFootieExportPayload(script);
  const quality = resolveExportRenderPreset(script, options);
  const exportDurationSec = getExportTotalDurationSec(payload);
  const audioMix = buildAudioMixFromStory(script);
  logAudioEngineState(script, "export");
  const voiceoverSrc = audioMix.voiceover?.src;
  const backgroundTrack = audioMix.background;
  const backgroundMusicSrc =
    backgroundTrack?.enabled ? backgroundTrack.src : undefined;
  const includeNarration =
    options.audioMode === "with-voice" && Boolean(voiceoverSrc);

  const silentBlob = await exportSilentVideoBlob(script, quality, (update) => {
    onProgress(mapRenderingProgress(update, includeNarration));
  }, payload);

  let finalBlob = silentBlob;
  let musicWarning: string | undefined;
  const backgroundMusicActive = isExportBackgroundMusicActiveFromMix(audioMix);
  const webmBackgroundMusicNotice = resolveWebmBackgroundMusicExportNotice({
    exportPath: exportPath.path,
    backgroundMusicActive,
  });
  const musicMixSettings = backgroundMusicActive
    ? resolveExportBackgroundMusicMixSettingsFromMix(audioMix, includeNarration)
    : null;
  let audioMixed = false;
  let audioMergeResultKind: ExportResultKind = "default";

  if (backgroundMusicActive && !EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED) {
    musicWarning =
      webmBackgroundMusicNotice ?? EXPORT_BACKGROUND_MUSIC_FALLBACK_WARNING;
  }

  const shouldAttemptMusicMix =
    Boolean(
      backgroundMusicActive &&
        EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED &&
        musicMixSettings &&
        backgroundMusicSrc,
    );
  const includeBackgroundMusicMix = shouldAttemptMusicMix && Boolean(backgroundTrack);

  const shouldMuxAudio =
    Boolean(includeNarration && audioMix.voiceover) ||
    Boolean(includeBackgroundMusicMix);
  const muxOutputFormat = resolveMuxOutputFormat(exportPath.path);

  const reportMuxProgress = (muxPercent: number, mixingMusic: boolean) => {
    const mp4Suffix = muxOutputFormat === "mp4" ? " and converting to MP4" : "";
    onProgress({
      status: "combining",
      progress: 78 + Math.round(muxPercent * 0.12),
      message: mixingMusic
        ? `Mixing narration and background music${mp4Suffix} (${muxPercent}%)`
        : `Combining audio${mp4Suffix} (${muxPercent}%)`,
    });
  };

  if (shouldMuxAudio) {
    onProgress({
      status: "loading-voiceover",
      progress: 72,
      message: includeNarration ? "Loading narration" : "Preparing audio mix",
    });

    const voiceoverInput = includeNarration ? audioMix.voiceover : undefined;
    const backgroundMusicInput = includeBackgroundMusicMix ? backgroundTrack : undefined;
    const attemptedVoice = Boolean(voiceoverInput);
    const attemptedMusic = Boolean(backgroundMusicInput);

    onProgress({
      status: "combining",
      progress: 78,
      message: backgroundMusicInput
        ? "Mixing narration and background music (0%)"
        : "Combining audio (0%)",
    });

    const muxCombined = async () =>
      muxExportVideoWithAudioMix({
        silentBlob,
        exportDurationSec,
        outputFormat: muxOutputFormat,
        voiceoverInput,
        backgroundMusicInput,
        backgroundMusicMix: musicMixSettings ?? undefined,
        onMuxProgress: (muxPercent) => reportMuxProgress(muxPercent, attemptedMusic),
      });

    if (attemptedVoice && attemptedMusic) {
      if (muxOutputFormat === "webm") {
        try {
          onProgress({
            status: "combining",
            progress: 78,
            message: "Mixing narration and background music in browser",
          });

          finalBlob = await muxWebmExportWithBrowserMixedAudio({
            silentBlob,
            exportDurationSec,
            voiceoverInput: voiceoverInput!,
            backgroundMusicInput: backgroundMusicInput!,
            backgroundMusicMix: musicMixSettings!,
            onMuxProgress: (muxPercent) => reportMuxProgress(muxPercent, false),
          });
          audioMixed = true;
          audioMergeResultKind = "audio-full";
        } catch {
          try {
            finalBlob = await runVoiceOnlyExportFallback({
              silentBlob,
              voiceoverInput: voiceoverInput!,
              exportDurationSec,
              muxOutputFormat,
              onProgress,
              reportMuxProgress,
            });
            audioMixed = true;
            audioMergeResultKind = "audio-voice-only";
          } catch {
            await finishExportDownload({
              exportPath: exportPath.path,
              blob: silentBlob,
              exportSettings,
              hasAudio: false,
              onProgress,
              message: EXPORT_AUDIO_SILENT_FALLBACK_MESSAGE,
              warning: musicWarning,
              resultKind: "audio-silent",
            });
            return;
          }
        }
      } else {
        try {
          finalBlob = await muxCombined();
          audioMixed = true;
          audioMergeResultKind = "audio-full";
        } catch {
          try {
            finalBlob = await runVoiceOnlyExportFallback({
              silentBlob,
              voiceoverInput: voiceoverInput!,
              exportDurationSec,
              muxOutputFormat,
              onProgress,
              reportMuxProgress,
            });
            audioMixed = true;
            audioMergeResultKind = "audio-voice-only";
          } catch {
            await finishExportDownload({
              exportPath: exportPath.path,
              blob: silentBlob,
              exportSettings,
              hasAudio: false,
              onProgress,
              message: EXPORT_AUDIO_SILENT_FALLBACK_MESSAGE,
              warning: musicWarning,
              resultKind: "audio-silent",
            });
            return;
          }
        }
      }
    } else {
      try {
        finalBlob = await muxCombined();
        audioMixed = true;
      } catch {
        await finishExportDownload({
          exportPath: exportPath.path,
          blob: silentBlob,
          exportSettings,
          hasAudio: false,
          onProgress,
          message: EXPORT_AUDIO_SILENT_FALLBACK_MESSAGE,
          warning: musicWarning,
          resultKind: "audio-silent",
        });
        return;
      }
    }
  }

  const exportHasAudio = audioMixed && (includeNarration || includeBackgroundMusicMix);

  let doneMessage: string;
  if (audioMergeResultKind === "audio-full") {
    doneMessage = EXPORT_AUDIO_FULL_SUCCESS_MESSAGE;
  } else if (audioMergeResultKind === "audio-voice-only") {
    doneMessage = `Download ready — ${buildExportDownloadFileName(
      exportSettings,
      exportPath.path,
    )}`;
  } else {
    doneMessage = `Download ready — ${buildExportDownloadFileName(
      exportSettings,
      exportPath.path,
    )}`;
  }

  const combinedWarning =
    audioMergeResultKind === "audio-voice-only"
      ? EXPORT_AUDIO_VOICE_ONLY_FALLBACK_WARNING
      : musicWarning;

  await finishExportDownload({
    exportPath: exportPath.path,
    blob: finalBlob,
    exportSettings,
    hasAudio: exportHasAudio,
    onProgress,
    message: doneMessage,
    warning: combinedWarning,
    resultKind: audioMergeResultKind,
  });
}
