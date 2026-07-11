/**
 * Create ExportRenderContext after capability preflight (Sprint 6C).
 */

import { createExportMediaCache } from "@/features/export/utils/export-media-cache.utils";
import {
  isExportFfmpegRuntimePoisoned,
  markExportFfmpegRuntimePoisoned,
} from "@/features/export/domain/export-environment.utils";
import type { ExportManifest } from "@/features/export/domain/export-manifest.types";

import { createExportCancellationToken } from "./export-cancellation";
import { createExportProgressReporter } from "./export-progress";
import type {
  CreateExportRenderContextOptions,
  ExportDiagnostics,
  ExportFfmpegRuntime,
  ExportRenderContext,
  ExportTemporaryStorage,
} from "./export-render-context.types";

export async function createExportRenderContext(
  manifest: ExportManifest,
  options: CreateExportRenderContextOptions,
): Promise<ExportRenderContext> {
  if (typeof document === "undefined") {
    throw new Error("ExportRenderContext requires a browser document.");
  }

  const width = options.width || manifest.output.width;
  const height = options.height || manifest.output.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Canvas 2D context is not available.");
  }

  const diagnostics = createDiagnostics();
  const tempStorage = createTemporaryStorage();
  const mediaCache = createExportMediaCache();
  const cancellation = createExportCancellationToken(options.signal);
  const progress = createExportProgressReporter(options.onProgress);
  const ffmpeg = createFfmpegRuntime(diagnostics);

  const environment = {
    supportsManualCanvasCapture:
      options.environment?.supportsManualCanvasCapture ??
      manifest.capabilities.environment.supportsManualCanvasFrameRequest,
    supportsMediaRecorder:
      options.environment?.supportsMediaRecorder ??
      manifest.capabilities.environment.supportsMediaRecorder,
    supportsRequestVideoFrameCallback:
      options.environment?.supportsRequestVideoFrameCallback ??
      manifest.capabilities.environment.supportsRequestVideoFrameCallback,
    browserName:
      options.environment?.browserName ??
      manifest.capabilities.environment.browserName,
  };

  progress.report({
    stage: "preparing",
    progress: 1,
    message: "Preparing export runtime...",
  });

  return {
    canvas,
    canvasContext,
    ffmpeg,
    mediaCache,
    tempStorage,
    cancellation,
    progress,
    diagnostics,
    environment,
    width,
    height,
  };
}

function createDiagnostics(): ExportDiagnostics {
  const events: ExportDiagnostics["events"] = [];
  return {
    events,
    push(event) {
      events.push({
        ...event,
        atMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
      });
    },
  };
}

function createTemporaryStorage(): ExportTemporaryStorage {
  const objectUrls: string[] = [];
  return {
    objectUrls,
    trackObjectUrl(url) {
      objectUrls.push(url);
      return url;
    },
    revokeAll() {
      while (objectUrls.length > 0) {
        const url = objectUrls.pop();
        if (url?.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // ignore
          }
        }
      }
    },
  };
}

function createFfmpegRuntime(diagnostics: ExportDiagnostics): ExportFfmpegRuntime {
  let poisoned = isExportFfmpegRuntimePoisoned();

  return {
    get isPoisoned() {
      return poisoned || isExportFfmpegRuntimePoisoned();
    },
    markPoisoned(reason) {
      poisoned = true;
      markExportFfmpegRuntimePoisoned(true);
      diagnostics.push({
        code: "FFMPEG_POISONED",
        message: reason ?? "FFmpeg runtime marked poisoned.",
      });
    },
    async getInstance() {
      if (this.isPoisoned) {
        await this.reset();
      }
      const { getFFmpeg } = await import("@/features/export/utils/ffmpeg.utils");
      return getFFmpeg();
    },
    async reset() {
      const { resetFFmpeg } = await import("@/features/export/utils/ffmpeg.utils");
      await resetFFmpeg();
      poisoned = false;
      markExportFfmpegRuntimePoisoned(false);
      diagnostics.push({
        code: "FFMPEG_RESET",
        message: "FFmpeg runtime reset.",
      });
    },
  };
}
