import type { FootieScene, FootieScript } from "@/types/footiebitz";

export type ExportQualityId = "720p" | "1080p" | "1440p" | "4k";

export interface ExportQualityPreset {
  id: ExportQualityId;
  label: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

export const EXPORT_QUALITY_PRESETS: ExportQualityPreset[] = [
  {
    id: "720p",
    label: "720p vertical",
    width: 720,
    height: 1280,
    fps: 30,
    bitrate: 4_000_000,
  },
  {
    id: "1080p",
    label: "1080p vertical",
    width: 1080,
    height: 1920,
    fps: 30,
    bitrate: 8_000_000,
  },
  {
    id: "1440p",
    label: "1440p vertical",
    width: 1440,
    height: 2560,
    fps: 30,
    bitrate: 12_000_000,
  },
  {
    id: "4k",
    label: "4K vertical",
    width: 2160,
    height: 3840,
    fps: 30,
    bitrate: 20_000_000,
  },
];

export const DEFAULT_EXPORT_QUALITY: ExportQualityId = "1080p";

export function getExportQualityPreset(id: ExportQualityId): ExportQualityPreset {
  return (
    EXPORT_QUALITY_PRESETS.find((preset) => preset.id === id) ??
    EXPORT_QUALITY_PRESETS.find((preset) => preset.id === DEFAULT_EXPORT_QUALITY)!
  );
}

export function isExportQualityId(value: string): value is ExportQualityId {
  return EXPORT_QUALITY_PRESETS.some((preset) => preset.id === value);
}

export interface ExportProgress {
  status: "preparing" | "rendering" | "finalizing" | "done" | "error";
  progress: number;
  message: string;
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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
) {
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;

  if (imgRatio > canvasRatio) {
    sh = img.height;
    sw = sh * canvasRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
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
  const hookY = 300 * scale;
  const subtitleY = height - 320 * scale;

  if (image) {
    drawCoverImage(ctx, image, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#064e3b");
    gradient.addColorStop(0.45, "#18181b");
    gradient.addColorStop(1, "#000000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, "rgba(0,0,0,0.55)");
  overlay.addColorStop(0.35, "rgba(0,0,0,0.15)");
  overlay.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#34d399";
  ctx.font = `bold ${40 * scale}px Arial, Helvetica, sans-serif`;
  ctx.fillText("FOOTIEBITZ", padX, 120 * scale);

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${48 * scale}px Arial, Helvetica, sans-serif`;
  wrapText(ctx, script.title, padX, titleY, width - padX * 2, 58 * scale);

  if (script.hook) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `400 ${36 * scale}px Arial, Helvetica, sans-serif`;
    wrapText(ctx, script.hook, padX, hookY, width - padX * 2, 46 * scale);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${64 * scale}px Arial, Helvetica, sans-serif`;
  wrapText(
    ctx,
    scene.subtitle,
    width / 2,
    subtitleY,
    width - 120 * scale,
    76 * scale,
    "center",
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportFootieShort(
  script: FootieScript,
  onProgress: (progress: ExportProgress) => void,
  qualityId: ExportQualityId = DEFAULT_EXPORT_QUALITY,
): Promise<void> {
  if (script.scenes.length === 0) {
    throw new Error("No scenes to export");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  const quality = getExportQualityPreset(qualityId);
  const { width, height, fps, bitrate } = quality;

  onProgress({
    status: "preparing",
    progress: 0,
    message: `Preparing ${quality.label} export (${width}×${height} @ ${fps}fps)...`,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not supported");
  }

  const imageCache = new Map<string, HTMLImageElement>();
  for (const scene of script.scenes) {
    if (scene.uploadedImage) {
      try {
        const img = await loadImage(scene.uploadedImage);
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

  const totalFrames = script.scenes.reduce(
    (sum, scene) => sum + Math.round(scene.duration * fps),
    0,
  );
  const frameMs = 1000 / fps;
  let renderedFrames = 0;

  onProgress({ status: "rendering", progress: 2, message: "Recording video..." });
  recorder.start(250);

  for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
    const scene = script.scenes[sceneIndex];
    const image = imageCache.get(scene.id) ?? null;
    const framesInScene = Math.round(scene.duration * fps);

    for (let frame = 0; frame < framesInScene; frame++) {
      drawSceneFrame(ctx, width, height, script, scene, image);
      renderedFrames++;
      const progress = Math.min(99, Math.round((renderedFrames / totalFrames) * 100));
      onProgress({
        status: "rendering",
        progress,
        message: `Rendering scene ${sceneIndex + 1} of ${script.scenes.length} at ${quality.label}...`,
      });
      await sleep(frameMs);
    }
  }

  onProgress({ status: "finalizing", progress: 99, message: "Finalizing video..." });

  await new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("Recording failed"));
    recorder.stop();
  });

  if (chunks.length === 0) {
    throw new Error("Export produced no video data");
  }

  const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
  const filename = `footiebitz-${quality.id}.webm`;
  downloadBlob(blob, filename);

  onProgress({
    status: "done",
    progress: 100,
    message: `Downloaded ${filename} (${width}×${height})`,
  });
}
