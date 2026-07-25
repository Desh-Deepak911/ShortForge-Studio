/**
 * Browser-side render context for the private Chromium page.
 * No FFmpeg.wasm, MediaRecorder, or download authority.
 */

import type { ExportManifest } from "@/features/export/domain/headless-safe";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import { createExportMediaCache } from "@/features/export/utils/export-media-cache.utils";

export function createHeadlessPageRenderContext(
  manifest: ExportManifest,
  targetPixels: { readonly width: number; readonly height: number },
): ExportRenderContext {
  // Canvas size follows HeadlessRenderTarget — not frozen ExportManifest.output.
  const width = targetPixels.width;
  const height = targetPixels.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Canvas 2D unavailable in headless page.");
  }
  document.body.appendChild(canvas);

  let cancelled = false;
  return {
    canvas,
    canvasContext,
    ffmpeg: {
      async getInstance() {
        throw new Error("FFmpeg.wasm is forbidden in headless worker page.");
      },
      async reset() {},
      markPoisoned() {},
      get isPoisoned() {
        return true;
      },
    },
    mediaCache: createExportMediaCache(),
    tempStorage: {
      objectUrls: [],
      trackObjectUrl(url: string) {
        this.objectUrls.push(url);
        return url;
      },
      revokeAll() {
        for (const url of this.objectUrls) {
          try {
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
        }
        this.objectUrls.length = 0;
      },
    },
    cancellation: {
      get isCancelled() {
        return cancelled;
      },
      throwIfCancelled() {
        if (cancelled) throw new Error("cancelled");
      },
      cancel() {
        cancelled = true;
      },
    },
    progress: { report() {} },
    diagnostics: {
      events: [],
      push() {},
    },
    environment: {
      supportsManualCanvasCapture: false,
      supportsMediaRecorder: false,
      supportsRequestVideoFrameCallback: true,
      browserName: "headless-chrome",
    },
    width,
    height,
  };
}
