/**
 * Chunk / segment validation helpers (Sprint 6D).
 */

import type {
  EncodedExportChunk,
  ExportChunkDescriptor,
  ExportChunkValidationResult,
} from "./export-chunk.types";

const MIN_SEGMENT_BYTES = 256;

export function resolveChunkExpectedDurationSec(
  frameCount: number,
  fps: number,
): number {
  const safeFps = fps > 0 && Number.isFinite(fps) ? fps : 30;
  return Math.max(0, Math.floor(frameCount)) / safeFps;
}

export function validateEncodedExportChunk(input: {
  readonly descriptor: ExportChunkDescriptor;
  readonly byteSize: number;
  readonly fps: number;
  readonly exists: boolean;
}): ExportChunkValidationResult {
  const expectedDurationSec = resolveChunkExpectedDurationSec(
    input.descriptor.frameCount,
    input.fps,
  );

  if (!input.exists) {
    return {
      ok: false,
      path: input.descriptor.outputPath,
      frameCount: input.descriptor.frameCount,
      expectedDurationSec,
      byteSize: 0,
      detail: `Segment missing: ${input.descriptor.outputPath}`,
    };
  }

  if (input.byteSize < MIN_SEGMENT_BYTES) {
    return {
      ok: false,
      path: input.descriptor.outputPath,
      frameCount: input.descriptor.frameCount,
      expectedDurationSec,
      byteSize: input.byteSize,
      detail: `Segment too small (${input.byteSize} bytes).`,
    };
  }

  if (input.descriptor.frameCount < 1) {
    return {
      ok: false,
      path: input.descriptor.outputPath,
      frameCount: input.descriptor.frameCount,
      expectedDurationSec,
      byteSize: input.byteSize,
      detail: "Chunk frame count must be >= 1.",
    };
  }

  return {
    ok: true,
    path: input.descriptor.outputPath,
    frameCount: input.descriptor.frameCount,
    expectedDurationSec,
    byteSize: input.byteSize,
  };
}

export function validateConcatenatedVisual(input: {
  readonly totalFrames: number;
  readonly fps: number;
  readonly byteSize: number;
  readonly segmentCount: number;
}): ExportChunkValidationResult {
  const expectedDurationSec = resolveChunkExpectedDurationSec(
    input.totalFrames,
    input.fps,
  );

  if (input.segmentCount < 1) {
    return {
      ok: false,
      path: "concatenated-visual.webm",
      frameCount: input.totalFrames,
      expectedDurationSec,
      byteSize: input.byteSize,
      detail: "No segments to concatenate.",
    };
  }

  if (input.byteSize < MIN_SEGMENT_BYTES) {
    return {
      ok: false,
      path: "concatenated-visual.webm",
      frameCount: input.totalFrames,
      expectedDurationSec,
      byteSize: input.byteSize,
      detail: "Concatenated visual too small.",
    };
  }

  return {
    ok: true,
    path: "concatenated-visual.webm",
    frameCount: input.totalFrames,
    expectedDurationSec,
    byteSize: input.byteSize,
  };
}

export function toEncodedExportChunk(
  descriptor: ExportChunkDescriptor,
  byteSize: number,
  fps: number,
): EncodedExportChunk {
  return {
    descriptor,
    path: descriptor.outputPath,
    frameCount: descriptor.frameCount,
    durationSec: resolveChunkExpectedDurationSec(descriptor.frameCount, fps),
    byteSize,
  };
}
