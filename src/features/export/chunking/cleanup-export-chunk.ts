/**
 * Immediate per-chunk frame cleanup (Sprint 6D).
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";

import { buildChunkFrameFilename } from "./build-export-chunk-plan";
import type { ExportChunkCleanupReport, ExportChunkDescriptor } from "./export-chunk.types";

export async function cleanupExportChunkFrames(
  ffmpeg: FFmpeg,
  descriptor: ExportChunkDescriptor,
): Promise<ExportChunkCleanupReport> {
  let deletedFrameCount = 0;
  for (let local = 0; local < descriptor.frameCount; local++) {
    const name = buildChunkFrameFilename(local);
    try {
      await ffmpeg.deleteFile(name);
      deletedFrameCount += 1;
    } catch {
      // Missing file is fine during failure cleanup.
    }
  }
  return {
    deletedFrameCount,
    chunkIndex: descriptor.chunkIndex,
  };
}

export async function cleanupExportChunkFiles(
  ffmpeg: FFmpeg,
  files: readonly string[],
): Promise<number> {
  let deleted = 0;
  for (const file of files) {
    try {
      await ffmpeg.deleteFile(file);
      deleted += 1;
    } catch {
      // ignore
    }
  }
  return deleted;
}

export function listChunkFrameFilenames(frameCount: number): string[] {
  const count = Math.max(0, Math.floor(frameCount));
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(buildChunkFrameFilename(i));
  }
  return names;
}
