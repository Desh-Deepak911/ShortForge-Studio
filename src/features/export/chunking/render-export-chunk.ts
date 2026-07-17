/**
 * Render one export chunk: global-frame prepare/draw → JPEG → MEMFS (Sprint 6D / 6H).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportVisualQualityProfile } from "@/features/export/domain/export-visual-quality-profile";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import { drawPreparedExportFrame } from "@/features/export/runtime/draw-prepared-export-frame";
import { prepareExportFrame } from "@/features/export/runtime/prepare-export-frame";
import type { ExportRenderPlan } from "@/features/export/runtime/prepare-export-from-manifest";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

import { buildChunkFrameFilename } from "./build-export-chunk-plan";
import type { ExportChunkDescriptor } from "./export-chunk.types";

function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  jpegQuality: number,
): Promise<Uint8Array> {
  const quality =
    typeof jpegQuality === "number" && Number.isFinite(jpegQuality)
      ? Math.min(1, Math.max(0.5, jpegQuality))
      : 0.93;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("canvas.toBlob returned null"));
          return;
        }
        try {
          const buffer = await blob.arrayBuffer();
          resolve(new Uint8Array(buffer));
        } catch (error) {
          reject(error);
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

export interface RenderExportChunkResult {
  readonly descriptor: ExportChunkDescriptor;
  readonly writtenFrameFiles: readonly string[];
  /** Semantic metadata for seam / final-frame verification. */
  readonly firstGlobalFrame: number;
  readonly lastGlobalFrame: number;
  readonly lastSceneId: string;
  readonly lastCaptionCount: number;
}

/**
 * Draw and write exactly the frames in `descriptor` using global frame indexes.
 * Does not encode — caller encodes then deletes frame files.
 */
export async function renderExportChunkFrames(options: {
  readonly manifest: ExportManifest;
  readonly plan: ExportRenderPlan;
  readonly context: ExportRenderContext;
  readonly ffmpeg: FFmpeg;
  readonly descriptor: ExportChunkDescriptor;
  readonly onFrameProgress?: (localIndex: number, globalIndex: number) => void;
}): Promise<RenderExportChunkResult> {
  const { manifest, plan, context, ffmpeg, descriptor } = options;
  const qualityProfile = resolveExportVisualQualityProfile(manifest.output);
  const writtenFrameFiles: string[] = [];
  let lastSceneId = "";
  let lastCaptionCount = 0;

  for (let local = 0; local < descriptor.frameCount; local++) {
    context.cancellation.throwIfCancelled();
    const globalFrameIndex = descriptor.globalStartFrame + local;

    const { frame, preparedBySceneId, preparedByMediaKey } = await prepareExportFrame(
      manifest,
      plan,
      globalFrameIndex,
      context,
    );
    drawPreparedExportFrame(frame, context, preparedBySceneId, preparedByMediaKey);

    lastSceneId = frame.scene.scene.id;
    lastCaptionCount = frame.captions.length;

    context.cancellation.throwIfCancelled();
    const bytes = await canvasToJpegBytes(
      context.canvas,
      qualityProfile.frameIntermediateQuality,
    );
    const filename = buildChunkFrameFilename(local);
    await ffmpeg.writeFile(filename, bytes);
    writtenFrameFiles.push(filename);
    options.onFrameProgress?.(local, globalFrameIndex);
  }

  return {
    descriptor,
    writtenFrameFiles,
    firstGlobalFrame: descriptor.globalStartFrame,
    lastGlobalFrame: descriptor.globalEndFrameExclusive - 1,
    lastSceneId,
    lastCaptionCount,
  };
}
