/**
 * MP4 format adapter (Sprint 6E).
 * Video: libx264 (single-pass mux or final transcode). Audio: AAC.
 * Fast-start: movflags +faststart.
 */

import {
  buildExportAudioFilterGraph,
  prepareExportAudio,
  type PreparedExportAudio,
} from "@/features/export/audio";
import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import type { ExportRenderContext } from "@/features/export/runtime/export-render-context.types";
import { resolveExportRenderEndMs } from "@/features/export/timing";
import { validateFinalExportArtifact } from "@/features/export/validation";
import type { ExportBackgroundMusicMixSettings } from "@/features/export/utils/export-background-music.utils";

import type {
  ExportFormatAdapter,
  ExportFormatArtifact,
  ExportFormatCodecPolicy,
  ExportMuxInput,
} from "./export-format-adapter.types";
import { ExportFinalizationError } from "./export-format-adapter.types";
import {
  getCachedExportRuntimeCodecProbe,
  isMp4ExportRuntimeAvailable,
} from "./export-runtime-codec-probe";

export const MP4_CODEC_POLICY: ExportFormatCodecPolicy = {
  container: "mp4",
  extension: ".mp4",
  mimeType: "video/mp4",
  videoCodec: "libx264",
  audioCodec: "aac",
  preferVideoStreamCopy: false,
  movFlagsFaststart: true,
};

/**
 * @deprecated Sprint 6F — use isMp4ExportRuntimeAvailable() / probeExportMp4Runtime().
 * Kept as a sync fallback for legacy format-resolve tests when probe cache is warm
 * or Node verification defaults apply via prepareExportRequest.
 */
export const MP4_ENCODER_ASSUMED_AVAILABLE = true;

function buildMusicMixFromManifest(
  manifest: ExportManifest,
  prepared: PreparedExportAudio,
): ExportBackgroundMusicMixSettings | null {
  const music = manifest.audio.music;
  if (!prepared.music || !music) return null;
  const voiceMs = prepared.voiceover?.sourceDurationMs ?? 0;
  return {
    exportDurationMs: prepared.durationMs,
    volume: music.volume,
    voiceGain: prepared.voiceover?.volume ?? 1,
    musicGain: music.volume,
    fadeIn: music.fadeInMs > 0,
    fadeOut: music.fadeOutMs > 0,
    fadeInSec: music.fadeInMs / 1000,
    fadeOutSec: music.fadeOutMs / 1000,
    duckingEnabled: music.duckingEnabled,
    duckingStrength: music.duckingStrength,
    voiceoverDurationSec: voiceMs / 1000,
    applyDucking:
      Boolean(prepared.voiceover) && music.duckingEnabled && voiceMs > 0,
    applyPeakProtection: manifest.audio.applyPeakProtection,
  };
}

export async function muxMp4WithManifestAudio(options: {
  readonly manifest: ExportManifest;
  readonly silentVisual: Blob;
  readonly preparedAudio: PreparedExportAudio;
  readonly context: ExportRenderContext;
  readonly onMuxProgress?: (percent: number) => void;
  readonly requestedFallback?: "voice-only" | "silent" | "webm";
}): Promise<ExportFormatArtifact> {
  const {
    manifest,
    silentVisual,
    preparedAudio,
    context,
    onMuxProgress,
    requestedFallback,
  } = options;

  const probe = getCachedExportRuntimeCodecProbe();
  if (!isMp4ExportRuntimeAvailable() && probe?.mp4Available !== true) {
    // Allow Node/test paths that never ran the browser probe but set env.mp4EncoderAvailable.
    if (probe != null || typeof window !== "undefined") {
      throw new ExportFinalizationError(
        "MP4 blocked by preflight — H.264/AAC runtime probe unavailable.",
        { availableFallbacks: ["webm", "retry"] },
      );
    }
  }

  if (requestedFallback === "webm") {
    const { muxWebmWithManifestAudio } = await import(
      "./webm-export-format-adapter"
    );
    return muxWebmWithManifestAudio({
      manifest: {
        ...manifest,
        output: { ...manifest.output, format: "webm", mimeType: "video/webm" },
      },
      silentVisual,
      preparedAudio,
      context,
      onMuxProgress,
    });
  }

  const expectedDurationMs = resolveExportRenderEndMs(manifest);
  const exportDurationSec = expectedDurationMs / 1000;
  const filename = manifest.output.filename.toLowerCase().endsWith(".mp4")
    ? manifest.output.filename
    : manifest.output.filename.replace(/\.(mp4|webm)$/i, "") + ".mp4";

  const {
    muxExportVideoWithAudioMix,
    runVoiceOnlyExportFallback,
    finishExportDownload,
  } = await import("@/features/export/services/video-render.service");

  // Silent MP4: transcode visual only via finish path helpers.
  if (preparedAudio.mode === "silent" || requestedFallback === "silent") {
    const { transcodeWebmToMp4 } = await import(
      "@/features/export/utils/ffmpeg.utils"
    );
    context.cancellation.throwIfCancelled();
    try {
      const blob = await transcodeWebmToMp4(silentVisual, {
        hasAudio: false,
        onProgress: onMuxProgress,
      });
      if (blob.type.toLowerCase().includes("webm")) {
        throw new ExportFinalizationError(
          "MP4 conversion returned WebM content — refusing to rename as MP4.",
          { availableFallbacks: ["webm", "retry"] },
        );
      }
      return {
        blob,
        format: "mp4",
        filename,
        mimeType: "video/mp4",
        hasAudio: false,
        resultKind: requestedFallback === "silent" ? "audio-silent" : "default",
        warning:
          requestedFallback === "silent"
            ? "Exported without audio (user-selected fallback)."
            : undefined,
      };
    } catch (cause) {
      if (cause instanceof ExportFinalizationError) throw cause;
      throw new ExportFinalizationError("MP4 silent visual conversion failed.", {
        cause,
        availableFallbacks: ["webm", "retry"],
      });
    }
  }

  const voiceoverInput = preparedAudio.voiceover?.source;
  const backgroundMusicInput = preparedAudio.music?.source;
  const musicMix = buildMusicMixFromManifest(manifest, preparedAudio);

  if (requestedFallback === "voice-only" && voiceoverInput) {
    const blob = await runVoiceOnlyExportFallback({
      silentBlob: silentVisual,
      voiceoverInput,
      exportDurationSec,
      muxOutputFormat: "mp4",
      voiceGain: preparedAudio.voiceover?.volume ?? 1,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      onProgress: () => undefined,
      reportMuxProgress: (p) => onMuxProgress?.(p),
    });
    return {
      blob,
      format: "mp4",
      filename,
      mimeType: "video/mp4",
      hasAudio: true,
      resultKind: "audio-voice-only",
      warning: "Exported with narration only (user-selected fallback).",
    };
  }

  context.cancellation.throwIfCancelled();

  try {
    const blob = await muxExportVideoWithAudioMix({
      silentBlob: silentVisual,
      exportDurationSec,
      outputFormat: "mp4",
      voiceoverInput,
      backgroundMusicInput,
      backgroundMusicMix: musicMix ?? undefined,
      voiceGain: preparedAudio.voiceover?.volume ?? 1,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      onMuxProgress,
    });

    if (blob.type.toLowerCase().includes("webm")) {
      throw new ExportFinalizationError(
        "MP4 mux returned WebM content — refusing to rename as MP4.",
        { availableFallbacks: ["webm", "retry"] },
      );
    }

    return {
      blob,
      format: "mp4",
      filename,
      mimeType: "video/mp4",
      hasAudio: true,
      resultKind: preparedAudio.music ? "audio-full" : "audio-voice-only",
    };
  } catch (cause) {
    if (cause instanceof ExportFinalizationError) throw cause;
    throw new ExportFinalizationError("MP4 audio mux failed.", {
      cause,
      availableFallbacks: voiceoverInput
        ? ["retry", "voice-only", "silent", "webm"]
        : ["retry", "silent", "webm"],
    });
  } finally {
    void finishExportDownload;
  }
}

export function createMp4ExportFormatAdapter(
  manifest: ExportManifest,
): ExportFormatAdapter {
  return {
    format: "mp4",
    codecPolicy: MP4_CODEC_POLICY,

    async prepareAudio(m) {
      const prepared = prepareExportAudio(m, { outputFormat: "mp4" });
      buildExportAudioFilterGraph(m, prepared);
      return prepared;
    },

    async mux(input: ExportMuxInput, context, onMuxProgress) {
      return muxMp4WithManifestAudio({
        manifest,
        silentVisual: input.silentVisual,
        preparedAudio: input.preparedAudio,
        context,
        onMuxProgress,
      });
    },

    async validate(artifact, m) {
      return validateFinalExportArtifact({
        artifact,
        manifest: m,
        finalFrameRendered: true,
        probedHasVideo: true,
        probedHasAudio: artifact.hasAudio,
      });
    },
  };
}
