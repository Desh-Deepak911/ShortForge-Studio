/**
 * Manifest-only export renderer (Sprint 6C–6E).
 * Silent visual (6D chunked) → format adapter mux → final validation.
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { markExportFfmpegRuntimePoisoned } from "@/features/export/domain/export-environment.utils";
import {
  buildExportAudioFilterGraph,
  prepareExportAudio,
} from "@/features/export/audio";
import {
  ExportFinalizationError,
  assertExportEndBufferContract,
  muxMp4WithManifestAudio,
  muxWebmWithManifestAudio,
  resolveExportEndOfProjectSnapshot,
  resolveExportFormatId,
} from "@/features/export/formats";
import { validateFinalExportArtifact } from "@/features/export/validation";
import { renderChunkedSilentVisual } from "@/features/export/chunking";
import { resolveExportRenderEndMs } from "@/features/export/timing";
import {
  ExportPipelineError,
  isExportDebugEnabled,
  toExportPipelineError,
} from "@/features/export/utils/export-pipeline-forensics.utils";
import {
  EXPORT_AUDIO_FULL_SUCCESS_MESSAGE,
  EXPORT_BACKGROUND_MUSIC_FALLBACK_WARNING,
  EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED,
} from "@/features/export/utils/export-background-music.utils";
import {
  resolveExportPath,
  resolveWebmBackgroundMusicExportNotice,
} from "@/features/export/utils/export-path.utils";
import type { ExportProgress } from "@/features/export/utils/export-quality.utils";
import { EXPORT_NARRATION_UNAVAILABLE_WARNING } from "@/features/export/utils/export-narration-voiceover.utils";

import { throwIfExportFailureInjected } from "@/features/export/qa/export-failure-injection";

import type { ExportRenderContext } from "./export-render-context.types";

export type ExportResultKind = NonNullable<ExportProgress["resultKind"]>;

export interface ExportArtifact {
  readonly blob: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly resultKind: ExportResultKind;
  readonly warning?: string;
}

export interface RenderExportOptions {
  /** Explicit user-chosen fallback — never applied automatically. */
  readonly audioFallback?: "voice-only" | "silent" | "webm";
}

/**
 * Render silent visual WebM from ExportManifest + ExportRenderContext.
 */
export async function renderExportSilentVisual(
  manifest: ExportManifest,
  context: ExportRenderContext,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  const result = await renderChunkedSilentVisual(manifest, context, onProgress);
  return result.blob;
}

/**
 * Full browser export: silent visual + format-adapter mux + validation.
 */
export async function renderExport(
  manifest: ExportManifest,
  context: ExportRenderContext,
  onProgress: (progress: ExportProgress) => void = () => undefined,
  options: RenderExportOptions = {},
): Promise<ExportArtifact> {
  assertExportEndBufferContract(manifest);

  const exportDurationMs = resolveExportRenderEndMs(manifest);
  const exportSettings = {
    fileName: manifest.output.filename.replace(/\.(mp4|webm)$/i, ""),
    format: manifest.output.format,
    quality: manifest.output.quality,
    resolution:
      manifest.output.resolution === "720p"
        ? ("720x1280" as const)
        : ("1080x1920" as const),
  };
  const exportPath = resolveExportPath(exportSettings);
  if (exportPath.blocked) {
    throw new ExportPipelineError({
      stage: "prepare-story",
      code: "EXPORT_PREPARE_FAILED",
      message: exportPath.blockReason ?? "Selected export format is unavailable.",
    });
  }

  if (
    (manifest.audio.mode === "voice" || manifest.audio.mode === "voice-with-music") &&
    !manifest.audio.voiceover?.source
  ) {
    throw new ExportPipelineError({
      stage: "prepare-audio",
      code: "EXPORT_PREPARE_FAILED",
      message: EXPORT_NARRATION_UNAVAILABLE_WARNING,
    });
  }

  if (manifest.audio.mode === "voice-with-music" && !manifest.audio.music?.source) {
    throw new ExportPipelineError({
      stage: "prepare-audio",
      code: "EXPORT_PREPARE_FAILED",
      message: "Background music was requested but no music track is available.",
    });
  }

  const formatId = resolveExportFormatId(manifest);
  const preparedAudio = prepareExportAudio(manifest, { outputFormat: formatId });
  const audioGraph = buildExportAudioFilterGraph(manifest, preparedAudio);
  const endSnapshot = resolveExportEndOfProjectSnapshot(manifest);

  if (isExportDebugEnabled()) {
    console.info("[ExportFinalization]", {
      fingerprint: manifest.fingerprint,
      format: formatId,
      audioMode: preparedAudio.mode,
      projectDurationMs: exportDurationMs,
      endBufferMs: endSnapshot.endBufferMs,
      finalSceneId: endSnapshot.finalSceneId,
      finalCaptionId: endSnapshot.finalCaptionId,
      audioGraph: audioGraph.description,
      endPolicy: preparedAudio.endPolicy,
    });
  }

  context.cancellation.throwIfCancelled();
  throwIfExportFailureInjected("cancellation");
  const silentBlob = await renderExportSilentVisual(manifest, context, onProgress);
  context.cancellation.throwIfCancelled();

  let musicWarning: string | undefined;
  const musicActive = Boolean(manifest.audio.music?.source);
  if (musicActive && !EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED) {
    musicWarning =
      resolveWebmBackgroundMusicExportNotice({
        exportPath: exportPath.path,
        backgroundMusicActive: musicActive,
      }) ?? EXPORT_BACKGROUND_MUSIC_FALLBACK_WARNING;
  }

  const shouldMuxAudio =
    preparedAudio.mode === "voice" ||
    (preparedAudio.mode === "voice-with-music" &&
      EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED);

  const reportMuxProgress = (muxPercent: number) => {
    const mp4Suffix = formatId === "mp4" ? " and converting to MP4" : "";
    onProgress({
      status: "combining",
      progress: 78 + Math.round(muxPercent * 0.12),
      message: preparedAudio.music
        ? `Adding narration and background music${mp4Suffix} (${muxPercent}%)`
        : `Adding audio to your video${mp4Suffix} (${muxPercent}%)`,
    });
  };

  let formatArtifact;
  try {
    throwIfExportFailureInjected("audio-mux");
    if (!shouldMuxAudio && preparedAudio.mode === "silent") {
      if (formatId === "mp4") {
        formatArtifact = await muxMp4WithManifestAudio({
          manifest,
          silentVisual: silentBlob,
          preparedAudio,
          context,
          onMuxProgress: reportMuxProgress,
          requestedFallback: options.audioFallback,
        });
      } else {
        formatArtifact = await muxWebmWithManifestAudio({
          manifest,
          silentVisual: silentBlob,
          preparedAudio,
          context,
          onMuxProgress: reportMuxProgress,
          requestedFallback:
            options.audioFallback === "webm" ? undefined : options.audioFallback,
        });
      }
    } else if (shouldMuxAudio) {
      onProgress({
        status: "loading-voiceover",
        progress: 72,
        message: preparedAudio.voiceover ? "Adding narration..." : "Preparing audio...",
      });
      context.cancellation.throwIfCancelled();

      if (formatId === "mp4") {
        formatArtifact = await muxMp4WithManifestAudio({
          manifest,
          silentVisual: silentBlob,
          preparedAudio,
          context,
          onMuxProgress: reportMuxProgress,
          requestedFallback: options.audioFallback,
        });
      } else {
        formatArtifact = await muxWebmWithManifestAudio({
          manifest,
          silentVisual: silentBlob,
          preparedAudio,
          context,
          onMuxProgress: reportMuxProgress,
          requestedFallback:
            options.audioFallback === "webm" ? undefined : options.audioFallback,
        });
      }
    } else {
      // Music mixing disabled — keep voice if present; drop music stem only.
      const voiceOnlyPrepared = {
        ...preparedAudio,
        mode: (preparedAudio.voiceover ? "voice" : "silent") as
          | "voice"
          | "silent",
        music: null,
      };
      const voiceOnlyManifest = {
        ...manifest,
        audio: {
          ...manifest.audio,
          mode: voiceOnlyPrepared.mode,
          music: null,
        },
      };
      if (formatId === "mp4") {
        formatArtifact = await muxMp4WithManifestAudio({
          manifest: voiceOnlyManifest,
          silentVisual: silentBlob,
          preparedAudio: voiceOnlyPrepared,
          context,
          onMuxProgress: reportMuxProgress,
        });
      } else {
        formatArtifact = await muxWebmWithManifestAudio({
          manifest: voiceOnlyManifest,
          silentVisual: silentBlob,
          preparedAudio: voiceOnlyPrepared,
          context,
          onMuxProgress: reportMuxProgress,
        });
      }
    }
  } catch (error) {
    if (error instanceof ExportFinalizationError) {
      context.ffmpeg.markPoisoned(error.message);
      markExportFfmpegRuntimePoisoned(true);
      try {
        await context.ffmpeg.reset();
      } catch {
        // ignore
      }
      throw error;
    }
    context.ffmpeg.markPoisoned(
      error instanceof Error ? error.message : "Audio mux failed",
    );
    markExportFfmpegRuntimePoisoned(true);
    try {
      await context.ffmpeg.reset();
    } catch {
      // ignore
    }
    throw toExportPipelineError(error, "mux-audio");
  }

  context.cancellation.throwIfCancelled();

  throwIfExportFailureInjected("artifact-validation");
  const validation = validateFinalExportArtifact({
    artifact: formatArtifact,
    manifest,
    finalFrameRendered: true,
    probedHasVideo: true,
    probedHasAudio: formatArtifact.hasAudio,
  });

  if (!validation.valid) {
    throw new ExportFinalizationError(
      validation.errors[0]?.message ?? "Final export artifact failed validation.",
      {
        availableFallbacks: ["retry"],
      },
    );
  }

  if (isExportDebugEnabled()) {
    console.info("[ExportFinalization]", {
      validation,
      resultKind: formatArtifact.resultKind,
      byteSize: formatArtifact.blob.size,
    });
  }

  const { finishExportDownload } = await import(
    "@/features/export/services/video-render.service"
  );

  const successMessage =
    formatArtifact.resultKind === "audio-full"
      ? EXPORT_AUDIO_FULL_SUCCESS_MESSAGE
      : undefined;

  const combinedWarning = [musicWarning, formatArtifact.warning]
    .filter(Boolean)
    .join(" ")
    .trim() || undefined;

  // finishExportDownload may transcode WebM→MP4 for silent path leftovers;
  // adapters already produce correct containers when possible.
  await finishExportDownload({
    exportPath: exportPath.path,
    blob: formatArtifact.blob,
    exportSettings,
    hasAudio: formatArtifact.hasAudio,
    onProgress,
    message: successMessage ?? "Your video is ready.",
    warning: combinedWarning,
    resultKind: formatArtifact.resultKind,
  });

  return {
    blob: formatArtifact.blob,
    filename: formatArtifact.filename,
    mimeType: formatArtifact.mimeType,
    resultKind: formatArtifact.resultKind,
    warning: combinedWarning,
  };
}
