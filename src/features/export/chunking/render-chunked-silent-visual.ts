/**
 * Chunked silent-visual production path (Sprint 6D).
 *
 * Strategy: canvas.toBlob JPEG per global frame → encode one chunk → delete
 * frames → retain segment → concat → validate. Never residences the full JPEG
 * sequence in MEMFS.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { markExportFfmpegRuntimePoisoned } from "@/features/export/domain/export-environment.utils";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import { prepareExportFromManifest } from "@/features/export/runtime/prepare-export-from-manifest";
import {
  resolveExportTotalFrames,
} from "@/features/export/timing";
import { preloadExportManifestMedia } from "@/features/export/utils/export-media-cache.utils";
import {
  ExportPipelineError,
  emitExportStageEvent,
  isExportDebugEnabled,
} from "@/features/export/utils/export-pipeline-forensics.utils";
import type { ExportProgress } from "@/features/export/utils/export-quality.utils";
import { getFFmpeg, resetFFmpeg } from "@/features/export/utils/ffmpeg.utils";
import { throwIfExportFailureInjected } from "@/features/export/qa/export-failure-injection";

import {
  assertExportChunkPlanCoverage,
  buildExportChunkPlan,
} from "./build-export-chunk-plan";
import {
  cleanupExportChunkFiles,
  cleanupExportChunkFrames,
} from "./cleanup-export-chunk";
import {
  assertOrderedChunkSegments,
  buildExportChunkConcatArgs,
  buildExportChunkConcatList,
  CONCAT_LIST_FILENAME,
  CONCAT_OUTPUT_FILENAME,
} from "./concat-export-chunks";
import { buildExportSegmentEncodeArgs } from "./encode-export-chunk";
import {
  classifyExportFfmpegFailure,
  isExportFfmpegPoisonFailure,
} from "./export-ffmpeg-failure";
import type { EncodedExportChunk, ExportChunkPlan } from "./export-chunk.types";
import { renderExportChunkFrames } from "./render-export-chunk";
import {
  toEncodedExportChunk,
  validateConcatenatedVisual,
  validateEncodedExportChunk,
} from "./validate-export-chunk";

export interface ChunkedSilentVisualResult {
  readonly blob: Blob;
  readonly plan: ExportChunkPlan;
  readonly encodedChunks: readonly EncodedExportChunk[];
  readonly totalFrames: number;
  readonly expectedDurationSec: number;
  readonly finalSceneId: string;
  readonly finalCaptionCount: number;
}

function reportProgress(
  context: ExportRenderContext,
  onProgress: ((progress: ExportProgress) => void) | undefined,
  update: {
    stage: string;
    progress: number;
    message: string;
  },
): void {
  const stageMap: Record<string, ExportProgress["status"]> = {
    preparing: "preparing",
    preloading: "preparing",
    rendering: "rendering",
    encoding: "finalizing",
    validating: "finalizing",
    concatenating: "finalizing",
    normalizing: "finalizing",
  };
  context.progress.report({
    stage:
      update.stage === "encoding" ||
      update.stage === "concatenating" ||
      update.stage === "validating"
        ? update.stage === "encoding"
          ? "encoding"
          : update.stage === "concatenating"
            ? "encoding"
            : "validating"
        : update.stage === "preloading"
          ? "preloading"
          : update.stage === "rendering"
            ? "rendering"
            : "preparing",
    progress: update.progress,
    message: update.message,
  });
  onProgress?.({
    status: stageMap[update.stage] ?? "preparing",
    progress: update.progress,
    message: update.message,
  });
}

async function poisonAndReset(
  context: ExportRenderContext,
  error: unknown,
): Promise<never> {
  const code = classifyExportFfmpegFailure(error);
  context.ffmpeg.markPoisoned(
    error instanceof Error ? error.message : String(error),
  );
  markExportFfmpegRuntimePoisoned(true);
  if (isExportFfmpegPoisonFailure(code)) {
    try {
      await context.ffmpeg.reset();
    } catch {
      try {
        await resetFFmpeg();
      } catch {
        // ignore
      }
    }
  }
  throw error;
}

/**
 * Produce a CFR silent visual WebM via bounded chunk encode + concat.
 */
export async function renderChunkedSilentVisual(
  manifest: ExportManifest,
  context: ExportRenderContext,
  onProgress?: (progress: ExportProgress) => void,
): Promise<ChunkedSilentVisualResult> {
  const drawPlan = prepareExportFromManifest(manifest);
  if (drawPlan.scenes.length === 0) {
    throw new Error("Add scenes to your storyboard before exporting.");
  }

  const totalFrames = resolveExportTotalFrames(manifest);
  const fps = manifest.output.fps;
  const chunkPlan = buildExportChunkPlan({
    totalFrames,
    fps,
    width: context.width || manifest.output.width,
    height: context.height || manifest.output.height,
  });
  assertExportChunkPlanCoverage(chunkPlan);

  if (isExportDebugEnabled()) {
    console.info("[ExportChunkPlan]", {
      rendererVersion: chunkPlan.rendererVersion,
      totalFrames: chunkPlan.totalFrames,
      chunkSizeFrames: chunkPlan.chunkSizeFrames,
      chunkCount: chunkPlan.chunks.length,
    });
  }

  reportProgress(context, onProgress, {
    stage: "preloading",
    progress: 2,
    message: "Loading media...",
  });
  context.cancellation.throwIfCancelled();
  await preloadExportManifestMedia(manifest.scenes, context.mediaCache);
  context.cancellation.throwIfCancelled();

  const ffmpeg = await getFFmpeg();
  const encodedChunks: EncodedExportChunk[] = [];
  const segmentPaths: string[] = [];
  let finalSceneId = "";
  let finalCaptionCount = 0;

  const chunkCount = chunkPlan.chunks.length;
  // Progress bands: render+encode chunks 5–85, concat 85–95, validate 95–99
  const chunkProgressSpan = 80;

  try {
    for (const descriptor of chunkPlan.chunks) {
      context.cancellation.throwIfCancelled();

      const chunkLabel = `${descriptor.chunkIndex + 1}/${chunkCount}`;
      const baseProgress =
        5 +
        Math.round((descriptor.chunkIndex / Math.max(1, chunkCount)) * chunkProgressSpan);

      reportProgress(context, onProgress, {
        stage: "rendering",
        progress: baseProgress,
        message: `Rendering chunk ${chunkLabel}...`,
      });

      emitExportStageEvent({
        stage: "encode-normalized-visual",
        status: "start",
        startedAtMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
        context: {
          mode: "chunked",
          chunkIndex: descriptor.chunkIndex,
          globalStartFrame: descriptor.globalStartFrame,
          frameCount: descriptor.frameCount,
        },
      });

      let writtenFrames: readonly string[] = [];
      try {
        const rendered = await renderExportChunkFrames({
          manifest,
          plan: drawPlan,
          context,
          ffmpeg,
          descriptor,
          onFrameProgress: (local, global) => {
            const localPct = (local + 1) / descriptor.frameCount;
            const progress =
              baseProgress +
              Math.round(
                (localPct * chunkProgressSpan) / Math.max(1, chunkCount) * 0.6,
              );
            reportProgress(context, onProgress, {
              stage: "rendering",
              progress: Math.min(84, progress),
              message: `Rendering chunk ${chunkLabel} (frame ${global + 1}/${totalFrames})...`,
            });
          },
        });
        writtenFrames = rendered.writtenFrameFiles;
        finalSceneId = rendered.lastSceneId;
        finalCaptionCount = rendered.lastCaptionCount;

        context.cancellation.throwIfCancelled();
        throwIfExportFailureInjected("frame-serialization");
        reportProgress(context, onProgress, {
          stage: "encoding",
          progress: Math.min(
            84,
            baseProgress +
              Math.round((chunkProgressSpan / Math.max(1, chunkCount)) * 0.7),
          ),
          message: `Encoding chunk ${chunkLabel}...`,
        });

        const encodeArgs = buildExportSegmentEncodeArgs({
          outputFile: descriptor.outputPath,
          fps,
          frameCount: descriptor.frameCount,
        });

        let encodeCode: number;
        try {
          throwIfExportFailureInjected("chunk-encode");
          throwIfExportFailureInjected("ffmpeg-worker-abort");
          encodeCode = await ffmpeg.exec(encodeArgs);
        } catch (cause) {
          throw new ExportPipelineError({
            stage: "encode-normalized-visual",
            code: "EXPORT_ENCODE_FAILED",
            message:
              "The video encoder could not finish this export. Try again or choose a lower resolution.",
            detail: `Chunk ${descriptor.chunkIndex} encode threw: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
            cause,
            context: {
              chunkIndex: descriptor.chunkIndex,
              failureCode: classifyExportFfmpegFailure(cause),
            },
          });
        }

        if (encodeCode !== 0) {
          throw new ExportPipelineError({
            stage: "encode-normalized-visual",
            code: "EXPORT_ENCODE_FAILED",
            message:
              "The video encoder could not finish this export. Try again or choose a lower resolution.",
            detail: `Chunk ${descriptor.chunkIndex} encode exit ${encodeCode}`,
            context: {
              chunkIndex: descriptor.chunkIndex,
              exitCode: encodeCode,
              failureCode: "FFMPEG_COMMAND_FAILED",
            },
          });
        }

        let data: Uint8Array | string;
        try {
          data = await ffmpeg.readFile(descriptor.outputPath);
        } catch (cause) {
          throw new ExportPipelineError({
            stage: "encode-normalized-visual",
            code: "EXPORT_ENCODE_FAILED",
            message:
              "The video encoder could not finish this export. Try again or choose a lower resolution.",
            detail: `Chunk ${descriptor.chunkIndex} output missing after encode`,
            cause,
            context: { failureCode: "FFMPEG_OUTPUT_MISSING" },
          });
        }

        if (typeof data === "string") {
          throw new ExportPipelineError({
            stage: "encode-normalized-visual",
            code: "EXPORT_ENCODE_FAILED",
            message:
              "The video encoder could not finish this export. Try again or choose a lower resolution.",
            detail: "Unexpected text segment output",
            context: { failureCode: "FFMPEG_OUTPUT_MISSING" },
          });
        }

        const validation = validateEncodedExportChunk({
          descriptor,
          byteSize: data.byteLength,
          fps,
          exists: true,
        });
        if (!validation.ok) {
          throw new ExportPipelineError({
            stage: "validate-extracted-frames",
            code: "EXPORT_ENCODE_FAILED",
            message:
              "A video segment failed validation. No file was downloaded.",
            detail: validation.detail,
            context: { chunkIndex: descriptor.chunkIndex },
          });
        }

        const encoded = toEncodedExportChunk(descriptor, data.byteLength, fps);
        encodedChunks.push(encoded);
        segmentPaths.push(descriptor.outputPath);

        // Immediate frame cleanup — only encoded segment retained.
        const cleanup = await cleanupExportChunkFrames(ffmpeg, descriptor);
        if (isExportDebugEnabled()) {
          console.info("[ExportChunkCleanup]", cleanup);
        }

        emitExportStageEvent({
          stage: "encode-normalized-visual",
          status: "success",
          startedAtMs: 0,
          context: {
            chunkIndex: descriptor.chunkIndex,
            byteSize: data.byteLength,
            deletedFrames: cleanup.deletedFrameCount,
          },
        });
      } catch (error) {
        await cleanupExportChunkFrames(ffmpeg, descriptor).catch(() => undefined);
        await cleanupExportChunkFiles(ffmpeg, [
          descriptor.outputPath,
          ...writtenFrames,
        ]).catch(() => undefined);
        const { ExportCancelledError } = await import(
          "@/features/export/runtime/export-cancellation"
        );
        if (error instanceof ExportCancelledError) {
          try {
            await resetFFmpeg();
          } catch {
            // ignore
          }
          throw error;
        }
        await poisonAndReset(context, error);
      }
    }

    context.cancellation.throwIfCancelled();
    assertOrderedChunkSegments(encodedChunks);

    reportProgress(context, onProgress, {
      stage: "concatenating",
      progress: 88,
      message: "Combining video segments...",
    });

    const listContents = buildExportChunkConcatList(encodedChunks);
    await ffmpeg.writeFile(CONCAT_LIST_FILENAME, listContents);

    const concatArgs = buildExportChunkConcatArgs({});
    let concatCode: number;
    try {
      throwIfExportFailureInjected("concat");
      concatCode = await ffmpeg.exec(concatArgs);
    } catch (cause) {
      await poisonAndReset(context, cause);
      throw cause; // unreachable — satisfies definite assignment
    }

    if (concatCode !== 0) {
      throw new ExportPipelineError({
        stage: "encode-normalized-visual",
        code: "EXPORT_ENCODE_FAILED",
        message:
          "The video encoder could not finish this export. Try again or choose a lower resolution.",
        detail: `Concat exit ${concatCode}`,
        context: { failureCode: "FFMPEG_COMMAND_FAILED" },
      });
    }

    let concatData: Uint8Array;
    try {
      const raw = await ffmpeg.readFile(CONCAT_OUTPUT_FILENAME);
      if (typeof raw === "string") {
        throw new ExportPipelineError({
          stage: "encode-normalized-visual",
          code: "EXPORT_ENCODE_FAILED",
          message:
            "The video encoder could not finish this export. Try again or choose a lower resolution.",
          detail: "Unexpected text concat output",
          context: { failureCode: "FFMPEG_OUTPUT_MISSING" },
        });
      }
      concatData = raw;
    } catch (cause) {
      if (cause instanceof ExportPipelineError) {
        await poisonAndReset(context, cause);
      }
      await poisonAndReset(
        context,
        new ExportPipelineError({
          stage: "encode-normalized-visual",
          code: "EXPORT_ENCODE_FAILED",
          message:
            "The video encoder could not finish this export. Try again or choose a lower resolution.",
          detail: "Concatenated visual missing",
          cause,
          context: { failureCode: "FFMPEG_OUTPUT_MISSING" },
        }),
      );
      throw cause; // unreachable
    }

    const finalValidation = validateConcatenatedVisual({
      totalFrames,
      fps,
      byteSize: concatData.byteLength,
      segmentCount: encodedChunks.length,
    });
    if (!finalValidation.ok) {
      throw new ExportPipelineError({
        stage: "validate-normalized-visual",
        code: "EXPORT_NORMALIZE_TIMING_INVALID",
        message:
          "Export timing could not be validated. Please retry the export.",
        detail: finalValidation.detail,
      });
    }

    reportProgress(context, onProgress, {
      stage: "validating",
      progress: 96,
      message: "Validating video...",
    });

    const blob = new Blob([new Uint8Array(concatData)], { type: "video/webm" });
    const expectedDurationSec = totalFrames / fps;

    // Cleanup segments + concat list after reading final blob.
    await cleanupExportChunkFiles(ffmpeg, [
      CONCAT_LIST_FILENAME,
      CONCAT_OUTPUT_FILENAME,
      ...segmentPaths,
    ]);

    return {
      blob,
      plan: chunkPlan,
      encodedChunks,
      totalFrames,
      expectedDurationSec,
      finalSceneId,
      finalCaptionCount,
    };
  } catch (error) {
    await cleanupExportChunkFiles(ffmpeg, [
      CONCAT_LIST_FILENAME,
      CONCAT_OUTPUT_FILENAME,
      ...segmentPaths,
      ...chunkPlan.chunks.flatMap((c) =>
        Array.from({ length: c.frameCount }, (_, i) =>
          `frame-${String(i).padStart(6, "0")}.jpg`,
        ),
      ),
    ]).catch(() => undefined);

    // Cancellation should not be reported as poison failure.
    const { ExportCancelledError } = await import(
      "@/features/export/runtime/export-cancellation"
    );
    if (error instanceof ExportCancelledError) {
      try {
        await resetFFmpeg();
      } catch {
        // ignore
      }
      throw error;
    }

    if (
      !(
        error instanceof ExportPipelineError &&
        String(error.context?.failureCode ?? "").startsWith("FFMPEG_")
      )
    ) {
      // Already poisoned in chunk loop for encode failures.
    }
    throw error;
  }
}
