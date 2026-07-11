/**
 * Dispose ExportRenderContext — always run in finally (Sprint 6C).
 */

import { disposeExportMediaCache } from "@/features/export/utils/export-media-cache.utils";

import type { ExportRenderContext } from "./export-render-context.types";

export async function disposeExportRenderContext(
  context: ExportRenderContext,
): Promise<void> {
  try {
    context.tempStorage.revokeAll();
  } catch {
    // ignore
  }

  try {
    disposeExportMediaCache(context.mediaCache);
  } catch {
    // ignore
  }

  try {
    const stream = (context.canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    }).captureStream?.(0);
    stream?.getTracks().forEach((track) => track.stop());
  } catch {
    // ignore — canvas may not support captureStream
  }

  try {
    context.canvas.width = 0;
    context.canvas.height = 0;
  } catch {
    // ignore
  }

  if (context.ffmpeg.isPoisoned) {
    try {
      await context.ffmpeg.reset();
    } catch {
      // ignore — next export will attempt fresh load
    }
  }
}
