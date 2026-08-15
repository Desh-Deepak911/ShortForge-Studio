/**
 * WebM format adapter (Sprint 6E).
 * Video: stream-copy validated silent visual. Audio: Opus / browser-mix stream-copy.
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

export const WEBM_CODEC_POLICY: ExportFormatCodecPolicy = {
  container: "webm",
  extension: ".webm",
  mimeType: "video/webm",
  videoCodec: "copy",
  audioCodec: "libopus",
  preferVideoStreamCopy: true,
  movFlagsFaststart: false,
};

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

export async function muxWebmWithManifestAudio(options: {
  readonly manifest: ExportManifest;
  readonly silentVisual: Blob;
  readonly preparedAudio: PreparedExportAudio;
  readonly context: ExportRenderContext;
  readonly onMuxProgress?: (percent: number) => void;
  readonly requestedFallback?: "voice-only" | "silent";
}): Promise<ExportFormatArtifact> {
  const {
    manifest,
    silentVisual,
    preparedAudio,
    context,
    onMuxProgress,
    requestedFallback,
  } = options;
  const expectedDurationMs = resolveExportRenderEndMs(manifest);
  const exportDurationSec = expectedDurationMs / 1000;
  const filename = manifest.output.filename.toLowerCase().endsWith(".webm")
    ? manifest.output.filename
    : manifest.output.filename.replace(/\.(mp4|webm)$/i, "") + ".webm";

  if (preparedAudio.mode === "silent") {
    return {
      blob: silentVisual,
      format: "webm",
      filename,
      mimeType: "video/webm",
      hasAudio: false,
      resultKind: "default",
    };
  }

  const {
    muxExportVideoWithAudioMix,
    muxWebmExportWithBrowserMixedAudio,
    runVoiceOnlyExportFallback,
  } = await import("@/features/export/services/video-render.service");

  const voiceoverInput = preparedAudio.voiceover?.source;
  const backgroundMusicInput = preparedAudio.music?.source;
  const musicMix = buildMusicMixFromManifest(manifest, preparedAudio);

  if (requestedFallback === "silent") {
    return {
      blob: silentVisual,
      format: "webm",
      filename,
      mimeType: "video/webm",
      hasAudio: false,
      resultKind: "audio-silent",
      warning: "Exported without audio (user-selected fallback).",
    };
  }

  if (requestedFallback === "voice-only" && voiceoverInput) {
    const blob = await runVoiceOnlyExportFallback({
      silentBlob: silentVisual,
      voiceoverInput,
      exportDurationSec,
      muxOutputFormat: "webm",
      voiceGain: preparedAudio.voiceover?.volume ?? 1,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      voiceMasteringProfile: preparedAudio.voiceover?.masteringProfile,
      onProgress: () => undefined,
      reportMuxProgress: (p) => onMuxProgress?.(p),
    });
    return {
      blob,
      format: "webm",
      filename,
      mimeType: "video/webm",
      hasAudio: true,
      resultKind: "audio-voice-only",
      warning: "Exported with narration only (user-selected fallback).",
    };
  }

  context.cancellation.throwIfCancelled();

  if (voiceoverInput && backgroundMusicInput && musicMix) {
    try {
      const blob = await muxWebmExportWithBrowserMixedAudio({
        silentBlob: silentVisual,
        exportDurationSec,
        voiceoverInput,
        backgroundMusicInput,
        backgroundMusicMix: musicMix,
        voiceMasteringProfile: preparedAudio.voiceover?.masteringProfile,
        onMuxProgress,
      });
      return {
        blob,
        format: "webm",
        filename,
        mimeType: "video/webm",
        hasAudio: true,
        resultKind: "audio-full",
      };
    } catch (cause) {
      throw new ExportFinalizationError(
        "Could not merge narration and background music for WebM.",
        {
          cause,
          availableFallbacks: ["retry", "voice-only", "silent"],
        },
      );
    }
  }

  try {
    const blob = await muxExportVideoWithAudioMix({
      silentBlob: silentVisual,
      exportDurationSec,
      outputFormat: "webm",
      voiceoverInput,
      backgroundMusicInput,
      backgroundMusicMix: musicMix ?? undefined,
      voiceGain: preparedAudio.voiceover?.volume ?? 1,
      applyPeakProtection: manifest.audio.applyPeakProtection,
      voiceMasteringProfile: preparedAudio.voiceover?.masteringProfile,
      onMuxProgress,
    });
    return {
      blob,
      format: "webm",
      filename,
      mimeType: "video/webm",
      hasAudio: true,
      resultKind: preparedAudio.music ? "audio-full" : "audio-voice-only",
    };
  } catch (cause) {
    throw new ExportFinalizationError("WebM audio mux failed.", {
      cause,
      availableFallbacks: voiceoverInput
        ? ["retry", "voice-only", "silent"]
        : ["retry", "silent"],
    });
  }
}

export function createWebmExportFormatAdapter(
  manifest: ExportManifest,
): ExportFormatAdapter {
  return {
    format: "webm",
    codecPolicy: WEBM_CODEC_POLICY,

    async prepareAudio(m) {
      const prepared = prepareExportAudio(m, { outputFormat: "webm" });
      buildExportAudioFilterGraph(m, prepared);
      return prepared;
    },

    async mux(input: ExportMuxInput, context, onMuxProgress) {
      return muxWebmWithManifestAudio({
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
