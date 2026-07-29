import type { AudioMix } from "@/features/audio";
import {
  resolveAudioMixerSettings,
  resolveMusicDuckingMultiplier,
  resolveMusicStemGain,
  resolvePeakProtectionFromMixer,
  resolveVoiceStemGain,
  type ResolvedAudioMixSettings,
} from "@/features/audio-mixer/headless-safe";
import type { FootieScript, StoryBackgroundMusic } from "@/features/story/types";
import { getStoryBackgroundMusic } from "@/features/story/utils/background-music.utils";
import { resolvePreviewBackgroundMusicUrl } from "@/features/preview/utils/preview-background-music.utils";
import {
  resolveExportMusicEnvelopeGainAtSec,
  toExportMusicEnvelopeInput,
} from "./export-music-envelope.utils";
import { buildExportMusicVolumeExpression } from "@/features/export/audio/build-export-music-volume-expression";

/** Attempt browser export mixing when background music is enabled. */
export const EXPORT_BACKGROUND_MUSIC_MIXING_ENABLED = true;

export const EXPORT_BACKGROUND_MUSIC_FALLBACK_WARNING =
  "Background music plays in preview but wasn't included in this WebM file. Try MP4 or turn off background music.";

/** @deprecated Use EXPORT_AUDIO_VOICE_ONLY_FALLBACK_MESSAGE */
export const EXPORT_BACKGROUND_MUSIC_PARTIAL_FALLBACK_WARNING =
  "Exported with narration only because background music could not be merged.";

export const EXPORT_AUDIO_FULL_SUCCESS_MESSAGE =
  "Your video is ready with narration and background music.";

export const EXPORT_AUDIO_VOICE_ONLY_FALLBACK_MESSAGE =
  "Exported with narration only because background music could not be merged.";

/** User-facing warning when export falls back to voiceover-only after music merge failure. */
export const EXPORT_AUDIO_VOICE_ONLY_FALLBACK_WARNING =
  EXPORT_AUDIO_VOICE_ONLY_FALLBACK_MESSAGE;

export const EXPORT_AUDIO_SILENT_FALLBACK_MESSAGE =
  "Exported without audio. Something went wrong while adding sound to your video.";

export interface ExportBackgroundMusicMixSettings {
  /** Normalized export timeline length from prepareStoryForExport. */
  exportDurationMs: number;
  /** Music stem gain — `music.volume * master.volume`. */
  volume: number;
  voiceGain: number;
  musicGain: number;
  fadeIn: boolean;
  fadeOut: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  duckingEnabled: boolean;
  duckingStrength: number;
  /** Voiceover duration in seconds — ducking applies over [0, voiceoverDurationSec). */
  voiceoverDurationSec: number;
  /** True when narration is included and ducking should attenuate music under voice. */
  applyDucking: boolean;
  /** True when export should apply peak limiter (flags or stem gain above unity). */
  applyPeakProtection: boolean;
}

/** Music gain during voiceover when export ducking is active — matches preview multiplier. */
export function resolveExportDuckedMusicGain(
  musicGain: number,
  duckingStrength: number,
): number {
  return Math.max(0, musicGain * duckingStrength);
}

/**
 * Resolves music gain at a timeline second for export.
 * Delegates to the Phase 2.1 canonical multiplicative envelope authority.
 */
export function resolveExportMusicGainAtSec(
  settings: ExportBackgroundMusicMixSettings,
  timeSec: number,
): number {
  return resolveExportMusicEnvelopeGainAtSec(
    toExportMusicEnvelopeInput(settings),
    timeSec,
  );
}

/** Preview-aligned ducking multiplier for export when voiceover is present. */
export function resolveExportMusicDuckingMultiplier(
  mixer: ResolvedAudioMixSettings,
  applyDucking: boolean,
): number {
  return resolveMusicDuckingMultiplier(mixer, applyDucking);
}

function resolveVoiceoverDurationMs(
  script: FootieScript,
  includeNarration: boolean,
  voiceoverDurationMs?: number,
): number {
  if (!includeNarration) {
    return 0;
  }

  return Math.max(0, voiceoverDurationMs ?? script.voiceoverDurationMs ?? 0);
}

/** Converts preflight export duration to seconds for FFmpeg/browser mix. */
export function resolveExportBackgroundMusicDurationSec(exportDurationMs: number): number {
  return Math.max(0.001, exportDurationMs / 1000);
}

export function isExportBackgroundMusicActive(
  script: Parameters<typeof getStoryBackgroundMusic>[0],
): boolean {
  return Boolean(resolvePreviewBackgroundMusicUrl(script));
}

/** True when the normalized audio mix includes playable background music. */
export function isExportBackgroundMusicActiveFromMix(audioMix: AudioMix): boolean {
  return Boolean(audioMix.background?.src && audioMix.background.enabled);
}

/** @deprecated Legacy bed volume without master bus — prefer mixer stem gains. */
export function resolveExportBackgroundMusicBedVolume(music: StoryBackgroundMusic): number {
  return Math.min(1, Math.max(0, music.volume));
}

function buildExportMixSettingsFromScript(
  script: FootieScript,
  exportDurationMs: number,
  includeNarration: boolean,
  voiceoverDurationMs?: number,
): ExportBackgroundMusicMixSettings {
  const mixer = resolveAudioMixerSettings(script);
  const musicGain = resolveMusicStemGain(mixer);
  const voiceGain = resolveVoiceStemGain(mixer);
  const resolvedVoiceoverMs = resolveVoiceoverDurationMs(
    script,
    includeNarration,
    voiceoverDurationMs,
  );
  const voiceoverDurationSec = resolvedVoiceoverMs / 1000;
  const applyDucking =
    includeNarration && mixer.music.duckingEnabled && resolvedVoiceoverMs > 0;
  const applyPeakProtection = resolvePeakProtectionFromMixer(mixer, voiceGain, musicGain);

  return {
    exportDurationMs: Math.max(0, Math.round(exportDurationMs)),
    volume: musicGain,
    voiceGain,
    musicGain,
    fadeIn: mixer.music.fadeInMs > 0,
    fadeOut: mixer.music.fadeOutMs > 0,
    fadeInSec: mixer.music.fadeInMs / 1000,
    fadeOutSec: mixer.music.fadeOutMs / 1000,
    duckingEnabled: mixer.music.duckingEnabled,
    duckingStrength: mixer.music.duckingStrength,
    voiceoverDurationSec,
    applyDucking,
    applyPeakProtection,
  };
}

export function resolveExportBackgroundMusicMixSettings(
  script: FootieScript,
  includeNarration: boolean,
  exportDurationMs: number,
  voiceoverDurationMs?: number,
): ExportBackgroundMusicMixSettings | null {
  if (!isExportBackgroundMusicActive(script)) {
    return null;
  }

  return buildExportMixSettingsFromScript(
    script,
    exportDurationMs,
    includeNarration,
    voiceoverDurationMs,
  );
}

/** Builds FFmpeg/browser mix settings from story mixer + audio mix activity. */
export function resolveExportBackgroundMusicMixSettingsFromMix(
  script: FootieScript,
  audioMix: AudioMix,
  includeNarration: boolean,
  exportDurationMs: number,
): ExportBackgroundMusicMixSettings | null {
  if (!isExportBackgroundMusicActiveFromMix(audioMix)) {
    return null;
  }

  return buildExportMixSettingsFromScript(
    script,
    exportDurationMs,
    includeNarration,
    audioMix.voiceover?.durationMs,
  );
}

/** Resolves voice stem gain for voice-only export mux paths. */
export function resolveExportVoiceStemGain(script: FootieScript): number {
  return resolveVoiceStemGain(resolveAudioMixerSettings(script));
}

/** Normalizes export audio streams to a common sample rate/layout before amix. */
export const EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS = [
  "aresample=48000",
  "aformat=sample_fmts=fltp:channel_layouts=stereo",
] as const;

export function buildExportBackgroundMusicFilterChain(
  inputIndex: number,
  settings: ExportBackgroundMusicMixSettings,
  outputLabel: string,
): string {
  const duration = resolveExportBackgroundMusicDurationSec(settings.exportDurationMs).toFixed(3);
  const musicGain = settings.musicGain;
  const filters = [
    ...EXPORT_FFMPEG_AUDIO_FORMAT_FILTERS,
    "aloop=loop=-1:size=2e+09",
    `atrim=0:${duration}`,
    "asetpts=PTS-STARTPTS",
  ];

  if (settings.applyDucking && settings.duckingEnabled && settings.voiceoverDurationSec > 0) {
    filters.push(
      `volume='${buildExportMusicVolumeExpression(toExportMusicEnvelopeInput(settings))}':eval=frame`,
    );
  } else if (settings.fadeIn || settings.fadeOut) {
    filters.push(
      `volume='${buildExportMusicVolumeExpression(toExportMusicEnvelopeInput(settings))}':eval=frame`,
    );
  } else {
    filters.push(`volume=${musicGain.toFixed(4)}`);
  }

  return `[${inputIndex}:a]${filters.join(",")}[${outputLabel}]`;
}

export function resolveBackgroundMusicInputFilename(
  blob: Blob,
  fileName?: string,
): string {
  const namedExtension = fileName?.match(/(\.[a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (namedExtension && [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"].includes(namedExtension)) {
    return `music${namedExtension}`;
  }

  if (blob.type.includes("wav")) return "music.wav";
  if (blob.type.includes("ogg")) return "music.ogg";
  if (blob.type.includes("mp4") || blob.type.includes("aac")) return "music.m4a";
  if (blob.type.includes("webm")) return "music.webm";

  return "music.mp3";
}
