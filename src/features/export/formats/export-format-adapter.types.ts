/**
 * Format adapter types (Sprint 6E).
 */

import type { PreparedExportAudio } from "@/features/export/audio";
import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import type { ExportArtifactValidation } from "@/features/export/validation/export-artifact-validation.types";

export type ExportFormatId = "webm" | "mp4";

export interface ExportFormatCodecPolicy {
  readonly container: ExportFormatId;
  readonly extension: ".webm" | ".mp4";
  readonly mimeType: "video/webm" | "video/mp4";
  readonly videoCodec: "libvpx" | "libx264" | "copy";
  readonly audioCodec: "libopus" | "aac" | "copy" | "none";
  readonly preferVideoStreamCopy: boolean;
  readonly movFlagsFaststart: boolean;
}

export interface ExportMuxInput {
  readonly silentVisual: Blob;
  readonly preparedAudio: PreparedExportAudio;
  readonly expectedDurationMs: number;
  readonly hasAudio: boolean;
}

export interface ExportFormatArtifact {
  readonly blob: Blob;
  readonly format: ExportFormatId;
  readonly filename: string;
  readonly mimeType: string;
  readonly hasAudio: boolean;
  readonly resultKind: "default" | "audio-full" | "audio-voice-only" | "audio-silent";
  readonly warning?: string;
}

export interface ExportFormatAdapter {
  readonly format: ExportFormatId;
  readonly codecPolicy: ExportFormatCodecPolicy;

  prepareAudio(
    manifest: ExportManifest,
    context: ExportRenderContext,
  ): Promise<PreparedExportAudio>;

  mux(
    input: ExportMuxInput,
    context: ExportRenderContext,
    onMuxProgress?: (percent: number) => void,
  ): Promise<ExportFormatArtifact>;

  validate(
    artifact: ExportFormatArtifact,
    manifest: ExportManifest,
    context: ExportRenderContext,
  ): Promise<ExportArtifactValidation>;
}

export type ExportFallbackChoice =
  | "retry"
  | "voice-only"
  | "silent"
  | "webm";

export class ExportFinalizationError extends Error {
  readonly code = "EXPORT_FINALIZATION_FAILED" as const;
  readonly availableFallbacks: readonly ExportFallbackChoice[];

  constructor(
    message: string,
    options?: {
      cause?: unknown;
      availableFallbacks?: readonly ExportFallbackChoice[];
    },
  ) {
    super(message);
    this.name = "ExportFinalizationError";
    this.availableFallbacks = options?.availableFallbacks ?? ["retry"];
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface FinalArtifactDurationPolicy {
  readonly expectedDurationMs: number;
  readonly toleranceMs: number;
  readonly allowAudioShorter: boolean;
  readonly allowAudioLonger: boolean;
}

export function resolveFinalArtifactDurationPolicy(
  expectedDurationMs: number,
): FinalArtifactDurationPolicy {
  const fps = 30;
  const frameMs = 1000 / fps;
  return {
    expectedDurationMs,
    toleranceMs: Math.max(2 * frameMs, expectedDurationMs * 0.01, 50),
    allowAudioShorter: true,
    allowAudioLonger: false,
  };
}
