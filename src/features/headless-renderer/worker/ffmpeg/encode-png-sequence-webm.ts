/**
 * Backward-compatible WebM encode entry — delegates to profile-driven encoder.
 */

import { HEADLESS_OUTPUT_PROFILES } from "../runtime/output-profiles";
import { encodePngSequence } from "./encode-png-sequence";

export async function encodePngSequenceToWebm(input: {
  ffmpegExecutable: string;
  framesDir: string;
  framePattern: string;
  frameCount: number;
  fps: number;
  outputPath: string;
  timeoutMs: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
  processGraceMs?: number;
  maxOutputBytes: number;
  audioPlan: Parameters<typeof encodePngSequence>[0]["audioPlan"];
  voiceoverPath?: string | null;
  musicPath?: string | null;
}): Promise<Awaited<ReturnType<typeof encodePngSequence>>> {
  return encodePngSequence({
    ...input,
    outputProfile: HEADLESS_OUTPUT_PROFILES["720p-webm-30"],
  });
}
