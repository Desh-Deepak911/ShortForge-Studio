/**
 * Prepare export audio from frozen ExportManifest (Sprint 6E).
 */

import type { ExportManifest } from "@/features/export/domain/export-manifest.types";
import { resolveExportRenderEndMs } from "@/features/export/timing";

import type {
  ExportAudioOutputCodec,
  PreparedAudioTrack,
  PreparedExportAudio,
  ProbedExportAudioDurations,
} from "./export-audio.types";
import { resolveExportAudioEndPolicy } from "./resolve-export-audio-end-policy";

export interface PrepareExportAudioOptions {
  readonly outputFormat: "webm" | "mp4";
  readonly probed?: ProbedExportAudioDurations;
}

function resolveOutputCodec(
  mode: PreparedExportAudio["mode"],
  format: "webm" | "mp4",
): ExportAudioOutputCodec {
  if (mode === "silent") return "none";
  return format === "mp4" ? "aac" : "opus";
}

function prepareVoiceTrack(
  manifest: ExportManifest,
  projectEndMs: number,
): PreparedAudioTrack | null {
  const voice = manifest.audio.voiceover;
  if (!voice?.source) return null;
  return {
    source: voice.source,
    sourceDurationMs: voice.durationMs,
    targetDurationMs: projectEndMs,
    volume: voice.volume,
    generatedPlaybackRate: 1,
    sourceVoiceSpeed: voice.sourceVoiceSpeed,
    ...(voice.masteringProfile ? { masteringProfile: voice.masteringProfile } : {}),
  };
}

function prepareMusicTrack(
  manifest: ExportManifest,
  projectEndMs: number,
): PreparedAudioTrack | null {
  const music = manifest.audio.music;
  if (!music?.source) return null;
  return {
    source: music.source,
    sourceDurationMs: projectEndMs,
    targetDurationMs: projectEndMs,
    volume: music.volume,
    generatedPlaybackRate: 1,
    sourceVoiceSpeed: 1,
  };
}

export function prepareExportAudio(
  manifest: ExportManifest,
  options: PrepareExportAudioOptions,
): PreparedExportAudio {
  const durationMs = resolveExportRenderEndMs(manifest);
  const mode = manifest.audio.mode;
  const endPolicy = resolveExportAudioEndPolicy(manifest, options.probed);

  if (endPolicy.voiceover.action === "block") {
    throw new Error(endPolicy.voiceover.detail ?? "Voiceover end policy blocked export.");
  }

  const voiceover =
    mode === "voice" || mode === "voice-with-music"
      ? prepareVoiceTrack(manifest, durationMs)
      : null;
  const music =
    mode === "voice-with-music" ? prepareMusicTrack(manifest, durationMs) : null;

  return {
    mode,
    durationMs,
    voiceover,
    music,
    outputCodec: resolveOutputCodec(mode, options.outputFormat),
    endPolicy,
    sourceVideoAudioMuted: true,
  };
}

export function validatePreparedExportAudio(
  prepared: PreparedExportAudio,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (prepared.durationMs <= 0) {
    errors.push("Prepared audio duration must be > 0.");
  }
  if (
    (prepared.mode === "voice" || prepared.mode === "voice-with-music") &&
    !prepared.voiceover
  ) {
    errors.push("Voice mode requires a prepared voiceover track.");
  }
  if (prepared.mode === "voice-with-music" && !prepared.music) {
    errors.push("Voice + music mode requires a prepared music track.");
  }
  if (prepared.voiceover && prepared.voiceover.generatedPlaybackRate !== 1) {
    errors.push("Voiceover generatedPlaybackRate must be 1 (Model A).");
  }
  if (!prepared.sourceVideoAudioMuted) {
    errors.push("Source video audio must remain muted.");
  }
  return { ok: errors.length === 0, errors };
}
