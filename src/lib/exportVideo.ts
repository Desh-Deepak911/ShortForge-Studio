"use client";

import type { FootieScene, FootieScript, SceneType } from "@/types/footiebitz";

export * from "@/lib/exportVideo.shared";
export * from "@/lib/exportPayload";

import { getSceneIndexForTime } from "@/lib/sceneTiming";
import { getDisplayCaptionLines } from "@/lib/displayCaption";
import { drawSceneImageInFrame, getSceneImageUrl, resolveExportSceneImage } from "@/lib/sceneImage";
import {
  assertExportPayload,
  buildFootieExportPayload,
  countExportTransitions,
  getRenderableScenesFromPayload,
  type FootieExportPayload,
} from "@/lib/exportPayload";

import {
  DEFAULT_EXPORT_QUALITY,
  getExportQualityPreset,
  type ExportProgress,
  type ExportQualityPreset,
  type FootieExportOptions,
} from "@/lib/exportVideo.shared";

function assertBrowserExportEnvironment(): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Video export is only available in the browser");
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
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

function drawSceneFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  script: FootieScript,
  scene: FootieScene,
  image: HTMLImageElement | null,
) {
  const scale = width / 1080;
  const padX = 72 * scale;
  const titleY = 180 * scale;
  const subtitleY = height - 320 * scale;

  // ── Background ─────────────────────────────────────────────────────────────
  if (image) {
    const sceneImage = resolveExportSceneImage(scene);

    if (sceneImage) {
      drawSceneImageInFrame(
        ctx,
        image,
        width,
        height,
        sceneImage,
        image.naturalWidth,
        image.naturalHeight,
      );
    } else {
      ctx.drawImage(image, 0, 0, width, height);
    }
  } else {
    drawPlaceholderBackground(ctx, width, height, scene.sceneType);
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
  if (!image && scene.sceneType) {
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.font = `bold ${32 * scale}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(scene.sceneType.toUpperCase(), width / 2, height / 2);
    ctx.textAlign = "left";
  }

  // ── On-screen caption (generated or narration subtitles) ─────────────────
  const captionLines = getDisplayCaptionLines(scene);
  if (captionLines.length > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${64 * scale}px Arial, Helvetica, sans-serif`;
    const lineHeight = 76 * scale;
    const blockHeight = captionLines.length * lineHeight;
    let lineY = subtitleY - blockHeight + lineHeight * 0.85;

    for (const line of captionLines) {
      wrapText(ctx, line, width / 2, lineY, width - 120 * scale, lineHeight, "center");
      lineY += lineHeight;
    }
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fetchNarrationBlob(voiceoverUrl: string): Promise<Blob> {
  const response = await fetch(voiceoverUrl);
  if (!response.ok) {
    throw new Error("Failed to load narration audio");
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("Narration audio is empty");
  }

  if (blob.type.includes("audio")) {
    return blob;
  }

  return new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });
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

  // Transitions are included in the payload for future renderers.
  // Scene-only export ignores them until renderTransitions is enabled.
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

  const totalDurationSec = payload.totalDuration;
  const totalFrames = Math.max(1, Math.round(totalDurationSec * fps));
  const frameMs = 1000 / fps;
  let renderedFrames = 0;

  onProgress?.({ status: "rendering", progress: 2, message: "Rendering video" });
  recorder.start(250);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const timeSec = frameIndex / fps;
    const sceneIndex = getSceneIndexForTime(timeSec, scenes);
    const scene = scenes[sceneIndex];
    const image = imageCache.get(scene.id) ?? null;

    drawSceneFrame(ctx, width, height, script, scene, image);
    renderedFrames++;
    const progress = Math.min(99, Math.round((renderedFrames / totalFrames) * 100));
    onProgress?.({
      status: "rendering",
      progress,
      message: `Rendering scene ${sceneIndex + 1} (${scene.start}s–${scene.end}s) at ${label}...`,
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

export async function exportFootieShort(
  script: FootieScript,
  onProgress: (progress: ExportProgress) => void,
  options: FootieExportOptions = {},
): Promise<void> {
  assertBrowserExportEnvironment();

  const payload = buildFootieExportPayload(script);
  const quality = getExportQualityPreset(options.qualityId ?? DEFAULT_EXPORT_QUALITY);
  const includeNarration =
    options.audioMode === "with-voice" && Boolean(payload.voiceoverUrl);

  const silentBlob = await exportSilentVideoBlob(script, quality, (update) => {
    onProgress(mapRenderingProgress(update, includeNarration));
  }, payload);

  let finalBlob = silentBlob;
  let filename = `footiebitz-${quality.id}.webm`;

  if (includeNarration && payload.voiceoverUrl) {
    onProgress({
      status: "loading-voiceover",
      progress: 72,
      message: "Loading narration",
    });

    const audioBlob = await fetchNarrationBlob(payload.voiceoverUrl);

    onProgress({
      status: "combining",
      progress: 78,
      message: "Combining audio (0%)",
    });

    try {
      const { muxVideoWithAudio } = await import("@/lib/ffmpegClient");
      finalBlob = await muxVideoWithAudio(silentBlob, audioBlob, {
        videoDurationSec: payload.totalDuration,
        onProgress: (muxPercent) => {
          onProgress({
            status: "combining",
            progress: 78 + Math.round(muxPercent * 0.2),
            message: `Combining audio (${muxPercent}%)`,
          });
        },
      });
      filename = "footiebitz-with-narration.webm";
    } catch (error) {
      const mergeError =
        error instanceof Error ? error.message : "Audio merge failed";
      filename = `footiebitz-${quality.id}.webm`;
      finalBlob = silentBlob;

      downloadBlob(finalBlob, filename);

      onProgress({
        status: "done",
        progress: 100,
        message: `Downloaded silent video (${filename}) — audio merge failed`,
        warning: mergeError,
      });
      return;
    }
  }

  downloadBlob(finalBlob, filename);

  onProgress({
    status: "done",
    progress: 100,
    message: includeNarration
      ? `Download ready — ${filename}`
      : `Download ready — ${filename} (${quality.width}×${quality.height})`,
  });
}
