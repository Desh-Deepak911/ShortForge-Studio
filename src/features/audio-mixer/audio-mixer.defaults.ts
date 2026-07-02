import type {
  MasterMixSettings,
  MusicMixSettings,
  ProjectAudioMixerSettings,
  VoiceMixSettings,
} from "./audio-mixer.types";

/** Matches `DEFAULT_BACKGROUND_MUSIC_VOLUME` — kept local to avoid story ↔ mixer cycles. */
export const DEFAULT_MUSIC_MIX_VOLUME = 0.18;

/** Matches preview ducking multiplier (`PREVIEW_MUSIC_DUCKING_MULTIPLIER`). */
export const DEFAULT_DUCKING_STRENGTH = 0.35;

/** Matches preview/export fade duration constants (2 seconds). */
export const DEFAULT_FADE_IN_MS = 2000;
export const DEFAULT_FADE_OUT_MS = 2000;

export const DEFAULT_VOICE_MIX_VOLUME = 1;
export const DEFAULT_MASTER_MIX_VOLUME = 1;

export const MIN_MIX_VOLUME = 0;
export const MAX_MIX_VOLUME = 2;

export const MIN_DUCKING_STRENGTH = 0;
export const MAX_DUCKING_STRENGTH = 1;

export const DEFAULT_VOICE_MIX_SETTINGS: VoiceMixSettings = {
  volume: DEFAULT_VOICE_MIX_VOLUME,
  normalize: false,
};

export const DEFAULT_MUSIC_MIX_SETTINGS: Required<MusicMixSettings> = {
  volume: DEFAULT_MUSIC_MIX_VOLUME,
  normalize: false,
  duckingEnabled: true,
  duckingStrength: DEFAULT_DUCKING_STRENGTH,
  fadeInMs: DEFAULT_FADE_IN_MS,
  fadeOutMs: DEFAULT_FADE_OUT_MS,
};

export const DEFAULT_MASTER_MIX_SETTINGS: MasterMixSettings = {
  volume: DEFAULT_MASTER_MIX_VOLUME,
  limiterEnabled: false,
  peakProtection: false,
};

/** Creates a normalized default mixer settings object for new stories. */
export function createDefaultAudioMixerSettings(): ProjectAudioMixerSettings {
  return {
    voice: { ...DEFAULT_VOICE_MIX_SETTINGS },
    music: { ...DEFAULT_MUSIC_MIX_SETTINGS },
    master: { ...DEFAULT_MASTER_MIX_SETTINGS },
  };
}
