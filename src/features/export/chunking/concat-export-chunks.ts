/**
 * Stream-copy concatenation of encoded silent visual segments (Sprint 6D).
 */

import type { EncodedExportChunk } from "./export-chunk.types";

export const CONCAT_LIST_FILENAME = "chunk-concat-list.txt";
export const CONCAT_OUTPUT_FILENAME = "concatenated-visual.webm";

/**
 * Build FFmpeg concat demuxer list contents.
 * Paths are MEMFS-relative segment filenames.
 */
export function buildExportChunkConcatList(
  segments: readonly EncodedExportChunk[],
): string {
  return segments
    .map((segment) => `file '${segment.path.replace(/'/g, "'\\''")}'`)
    .join("\n");
}

export function buildExportChunkConcatArgs(options: {
  readonly listFile?: string;
  readonly outputFile?: string;
}): string[] {
  return [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    options.listFile ?? CONCAT_LIST_FILENAME,
    "-c",
    "copy",
    "-an",
    options.outputFile ?? CONCAT_OUTPUT_FILENAME,
  ];
}

export function assertOrderedChunkSegments(
  segments: readonly EncodedExportChunk[],
): void {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment.descriptor.chunkIndex !== i) {
      throw new Error(
        `Segment order mismatch at ${i}: got chunkIndex ${segment.descriptor.chunkIndex}`,
      );
    }
    if (i > 0) {
      const prev = segments[i - 1]!;
      if (
        segment.descriptor.globalStartFrame !==
        prev.descriptor.globalEndFrameExclusive
      ) {
        throw new Error(
          `Segment gap/overlap between chunk ${i - 1} and ${i}`,
        );
      }
    }
  }
}
