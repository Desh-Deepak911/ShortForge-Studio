import type { FootieScript } from "@/features/story/types";
import { getStoryBackgroundMusic } from "@/features/story/utils";

import {
  DEFAULT_DUCKING_STRENGTH,
  DEFAULT_FADE_IN_MS,
  DEFAULT_FADE_OUT_MS,
  DEFAULT_MASTER_MIX_SETTINGS,
  DEFAULT_MUSIC_MIX_SETTINGS,
  DEFAULT_VOICE_MIX_SETTINGS,
  MAX_DUCKING_STRENGTH,
  MAX_MIX_VOLUME,
  MIN_DUCKING_STRENGTH,
  MIN_MIX_VOLUME,
} from "./audio-mixer.defaults";
import type {
  MasterMixSettings,
  MusicMixSettings,
  ProjectAudioMixerSettings,
  ResolvedAudioMixSettings,
  VoiceMixSettings,
} from "./audio-mixer.types";

export { createDefaultAudioMixerSettings } from "./audio-mixer.defaults";

function clampMixVolume(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_MIX_VOLUME, Math.max(MIN_MIX_VOLUME, parsed));
}

function clampDuckingStrength(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(MAX_DUCKING_STRENGTH, Math.max(MIN_DUCKING_STRENGTH, parsed));
}

function clampNonNegativeMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, parsed);
}

function resolveBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function resolveFadeMsFromLegacyFlag(enabled: boolean, durationMs: number): number {
  return enabled ? durationMs : 0;
}

function resolveVoiceMixSettings(
  partial: ProjectAudioMixerSettings["voice"],
): VoiceMixSettings {
  return {
    volume: clampMixVolume(partial?.volume, DEFAULT_VOICE_MIX_SETTINGS.volume),
    normalize: resolveBoolean(partial?.normalize, DEFAULT_VOICE_MIX_SETTINGS.normalize),
    ...(partial?.targetLufs != null && Number.isFinite(partial.targetLufs)
      ? { targetLufs: partial.targetLufs }
      : {}),
    ...(partial?.boost != null && Number.isFinite(partial.boost) ? { boost: partial.boost } : {}),
  };
}

function resolveMusicMixSettings(
  script: FootieScript,
  partial: ProjectAudioMixerSettings["music"],
): Required<MusicMixSettings> {
  const backgroundMusic = getStoryBackgroundMusic(script);

  const legacyFadeInMs = resolveFadeMsFromLegacyFlag(backgroundMusic.fadeIn, DEFAULT_FADE_IN_MS);
  const legacyFadeOutMs = resolveFadeMsFromLegacyFlag(backgroundMusic.fadeOut, DEFAULT_FADE_OUT_MS);

  const volumeFallback = clampMixVolume(backgroundMusic.volume, DEFAULT_MUSIC_MIX_SETTINGS.volume);

  return {
    volume: clampMixVolume(partial?.volume ?? backgroundMusic.volume, volumeFallback),
    normalize: resolveBoolean(partial?.normalize, DEFAULT_MUSIC_MIX_SETTINGS.normalize),
    duckingEnabled: resolveBoolean(
      partial?.duckingEnabled ?? backgroundMusic.duckingEnabled,
      DEFAULT_MUSIC_MIX_SETTINGS.duckingEnabled,
    ),
    duckingStrength: clampDuckingStrength(
      partial?.duckingStrength,
      DEFAULT_DUCKING_STRENGTH,
    ),
    fadeInMs: clampNonNegativeMs(
      partial?.fadeInMs ?? legacyFadeInMs,
      legacyFadeInMs,
    ),
    fadeOutMs: clampNonNegativeMs(
      partial?.fadeOutMs ?? legacyFadeOutMs,
      legacyFadeOutMs,
    ),
  };
}

function resolveMasterMixSettings(
  partial: ProjectAudioMixerSettings["master"],
): MasterMixSettings {
  return {
    volume: clampMixVolume(partial?.volume, DEFAULT_MASTER_MIX_SETTINGS.volume),
    limiterEnabled: resolveBoolean(
      partial?.limiterEnabled,
      DEFAULT_MASTER_MIX_SETTINGS.limiterEnabled,
    ),
    peakProtection: resolveBoolean(
      partial?.peakProtection,
      DEFAULT_MASTER_MIX_SETTINGS.peakProtection,
    ),
  };
}

/**
 * Resolves unified mixer settings from optional `audioMixer` overrides and legacy
 * `backgroundMusic` fields. Does not mutate the input script.
 */
export function resolveAudioMixerSettings(
  script: FootieScript | null | undefined,
): ResolvedAudioMixSettings {
  if (!script) {
    return {
      voice: { ...DEFAULT_VOICE_MIX_SETTINGS },
      music: { ...DEFAULT_MUSIC_MIX_SETTINGS },
      master: { ...DEFAULT_MASTER_MIX_SETTINGS },
    };
  }

  const partial = script.audioMixer;

  return {
    voice: resolveVoiceMixSettings(partial?.voice),
    music: resolveMusicMixSettings(script, partial?.music),
    master: resolveMasterMixSettings(partial?.master),
  };
}

/** Voice bus gain before ducking/fades — `voice.volume * master.volume`. */
export function resolveVoiceStemGain(settings: ResolvedAudioMixSettings): number {
  return settings.voice.volume * settings.master.volume;
}

/** Music bus gain before ducking/fades — `music.volume * master.volume`. */
export function resolveMusicStemGain(settings: ResolvedAudioMixSettings): number {
  return settings.music.volume * settings.master.volume;
}

/** Ducking multiplier applied to music when voiceover is active. */
export function resolveMusicDuckingMultiplier(
  settings: ResolvedAudioMixSettings,
  voiceoverIsPlaying: boolean,
): number {
  if (!settings.music.duckingEnabled || !voiceoverIsPlaying) {
    return 1;
  }

  return settings.music.duckingStrength;
}

/** Clamps gain for HTMLMediaElement playback (`volume` is capped at 1). */
export function clampHtmlMediaElementVolume(gain: number): number {
  return Math.min(1, Math.max(0, gain));
}

/** Formats a 0–2 mixer volume as 0–200% for UI display. */
export function formatMixerVolumePercent(volume: number): string {
  return `${Math.round(Math.min(MAX_MIX_VOLUME, Math.max(MIN_MIX_VOLUME, volume)) * 100)}%`;
}

/** Formats ducking strength (0–1) as a percentage label. */
export function formatDuckingStrengthPercent(strength: number): string {
  return `${Math.round(Math.min(MAX_DUCKING_STRENGTH, Math.max(MIN_DUCKING_STRENGTH, strength)) * 100)}%`;
}

type MixerSectionPatch = {
  voice?: Partial<VoiceMixSettings>;
  music?: Partial<MusicMixSettings>;
  master?: Partial<MasterMixSettings>;
};

/**
 * Patches story-level mixer overrides. Creates `audioMixer` on first adjustment only.
 * Does not mutate the input script.
 */
export function applyStoryAudioMixer(
  script: FootieScript,
  patch: MixerSectionPatch,
): FootieScript {
  const current = script.audioMixer ?? {};

  const nextVoice = patch.voice
    ? {
        ...current.voice,
        ...patch.voice,
        ...(patch.voice.volume !== undefined
          ? { volume: clampMixVolume(patch.voice.volume, DEFAULT_VOICE_MIX_SETTINGS.volume) }
          : {}),
      }
    : current.voice;

  const nextMusic = patch.music
    ? {
        ...current.music,
        ...patch.music,
        ...(patch.music.volume !== undefined
          ? {
              volume: clampMixVolume(
                patch.music.volume,
                clampMixVolume(current.music?.volume, DEFAULT_MUSIC_MIX_SETTINGS.volume),
              ),
            }
          : {}),
        ...(patch.music.duckingStrength !== undefined
          ? {
              duckingStrength: clampDuckingStrength(
                patch.music.duckingStrength,
                DEFAULT_DUCKING_STRENGTH,
              ),
            }
          : {}),
      }
    : current.music;

  const nextMaster = patch.master
    ? {
        ...current.master,
        ...patch.master,
        ...(patch.master.volume !== undefined
          ? { volume: clampMixVolume(patch.master.volume, DEFAULT_MASTER_MIX_SETTINGS.volume) }
          : {}),
      }
    : current.master;

  const nextMixer: ProjectAudioMixerSettings = {
    ...current,
    ...(nextVoice ? { voice: nextVoice } : {}),
    ...(nextMusic ? { music: nextMusic } : {}),
    ...(nextMaster ? { master: nextMaster } : {}),
  };

  return {
    ...script,
    audioMixer: nextMixer,
  };
}
