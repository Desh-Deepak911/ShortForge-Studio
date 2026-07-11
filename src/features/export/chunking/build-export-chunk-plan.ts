/**
 * Deterministic export chunk plan (Sprint 6D).
 * Ranges are half-open [start, end) with no gaps or overlaps.
 */

import { resolveExportFrameTimestampMs } from "@/features/export/timing";

import { resolveExportChunkSizeFrames } from "./export-chunk-policy";
import {
  EXPORT_CHUNKED_RENDERER_VERSION,
  type BuildExportChunkPlanInput,
  type ExportChunkDescriptor,
  type ExportChunkPlan,
} from "./export-chunk.types";

export function buildSegmentOutputPath(chunkIndex: number): string {
  return `segment-${String(chunkIndex).padStart(3, "0")}.webm`;
}

export function buildChunkFrameFilename(localFrameIndex: number): string {
  return `frame-${String(Math.max(0, Math.floor(localFrameIndex))).padStart(6, "0")}.jpg`;
}

export function buildChunkFramePattern(): string {
  return "frame-%06d.jpg";
}

/**
 * Build a deterministic chunk plan for bounded MEMFS encoding.
 */
export function buildExportChunkPlan(
  input: BuildExportChunkPlanInput,
): ExportChunkPlan {
  const totalFrames = Math.max(0, Math.floor(input.totalFrames));
  const fps =
    input.fps > 0 && Number.isFinite(input.fps) ? input.fps : 30;
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));

  const chunkSizeFrames =
    typeof input.chunkSizeFrames === "number" && input.chunkSizeFrames > 0
      ? Math.floor(input.chunkSizeFrames)
      : resolveExportChunkSizeFrames({
          width,
          height,
          estimatedHeapLimitBytes: input.estimatedHeapLimitBytes,
          targetChunkDurationSec: input.targetChunkDurationSec,
          fps,
        });

  if (totalFrames === 0) {
    return {
      totalFrames: 0,
      chunkSizeFrames,
      fps,
      width,
      height,
      rendererVersion: EXPORT_CHUNKED_RENDERER_VERSION,
      chunks: [],
    };
  }

  const chunks: ExportChunkDescriptor[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < totalFrames) {
    const end = Math.min(start + chunkSizeFrames, totalFrames);
    const frameCount = end - start;
    const startTimestampMs = resolveExportFrameTimestampMs(start, fps);
    const endTimestampMs = resolveExportFrameTimestampMs(end - 1, fps);

    chunks.push({
      chunkIndex,
      globalStartFrame: start,
      globalEndFrameExclusive: end,
      frameCount,
      startTimestampMs,
      endTimestampMs,
      outputPath: buildSegmentOutputPath(chunkIndex),
    });

    start = end;
    chunkIndex += 1;
  }

  return {
    totalFrames,
    chunkSizeFrames,
    fps,
    width,
    height,
    rendererVersion: EXPORT_CHUNKED_RENDERER_VERSION,
    chunks,
  };
}

/** Assert plan covers every global frame exactly once. */
export function assertExportChunkPlanCoverage(plan: ExportChunkPlan): void {
  if (plan.totalFrames === 0) {
    if (plan.chunks.length !== 0) {
      throw new Error("Empty plan must have zero chunks.");
    }
    return;
  }

  let expectedStart = 0;
  for (const chunk of plan.chunks) {
    if (chunk.globalStartFrame !== expectedStart) {
      throw new Error(
        `Chunk gap/overlap at index ${chunk.chunkIndex}: expected start ${expectedStart}, got ${chunk.globalStartFrame}`,
      );
    }
    if (
      chunk.globalEndFrameExclusive - chunk.globalStartFrame !==
      chunk.frameCount
    ) {
      throw new Error(`Chunk ${chunk.chunkIndex} frameCount mismatch.`);
    }
    expectedStart = chunk.globalEndFrameExclusive;
  }

  if (expectedStart !== plan.totalFrames) {
    throw new Error(
      `Plan incomplete: covered ${expectedStart} of ${plan.totalFrames} frames.`,
    );
  }
}
