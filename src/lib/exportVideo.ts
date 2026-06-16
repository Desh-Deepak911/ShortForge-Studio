import type { FootieScene, FootieScript } from "@/types/footiebitz";

export const EXPORT_WIDTH = 1080;
export const EXPORT_HEIGHT = 1920;
export const EXPORT_FPS = 30;

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
    img.crossOrigin = "anonymous";
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
  ctx.font = "bold 40px Arial, Helvetica, sans-serif";
  ctx.fillText("FOOTIEBITZ", 72, 120);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 48px Arial, Helvetica, sans-serif";
  wrapText(ctx, script.title, 72, 180, width - 144, 58);

  if (script.hook) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "400 36px Arial, Helvetica, sans-serif";
    wrapText(ctx, script.hook, 72, 300, width - 144, 46);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Arial, Helvetica, sans-serif";
  wrapText(ctx, scene.subtitle, width / 2, height - 320, width - 120, 76, "center");
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
): Promise<void> {
  if (script.scenes.length === 0) {
    throw new Error("No scenes to export");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser");
  }

  onProgress({ status: "preparing", progress: 0, message: "Preparing export..." });

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
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
  const stream = canvas.captureStream(EXPORT_FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const totalFrames = script.scenes.reduce(
    (sum, scene) => sum + Math.round(scene.duration * EXPORT_FPS),
    0,
  );
  const frameMs = 1000 / EXPORT_FPS;
  let renderedFrames = 0;

  onProgress({ status: "rendering", progress: 2, message: "Recording video..." });
  recorder.start(250);

  for (let sceneIndex = 0; sceneIndex < script.scenes.length; sceneIndex++) {
    const scene = script.scenes[sceneIndex];
    const image = imageCache.get(scene.id) ?? null;
    const framesInScene = Math.round(scene.duration * EXPORT_FPS);

    for (let frame = 0; frame < framesInScene; frame++) {
      drawSceneFrame(ctx, EXPORT_WIDTH, EXPORT_HEIGHT, script, scene, image);
      renderedFrames++;
      const progress = Math.min(99, Math.round((renderedFrames / totalFrames) * 100));
      onProgress({
        status: "rendering",
        progress,
        message: `Rendering scene ${sceneIndex + 1} of ${script.scenes.length}...`,
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
  downloadBlob(blob, "footiebitz-short.webm");

  onProgress({ status: "done", progress: 100, message: "Downloaded footiebitz-short.webm" });
}
