/** Voice bus settings for the unified project audio mixer. */
export interface VoiceMixSettings {
  volume: number;
  normalize: boolean;
  /** Target integrated loudness — applied when normalize is enabled (future). */
  targetLufs?: number;
  /** Post-normalize gain offset in dB (future). */
  boost?: number;
}

/** Background music bus settings for the unified project audio mixer. */
export interface MusicMixSettings {
  volume: number;
  normalize: boolean;
  duckingEnabled: boolean;
  duckingStrength: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

/** Master output bus settings for the unified project audio mixer. */
export interface MasterMixSettings {
  volume: number;
  limiterEnabled: boolean;
  peakProtection: boolean;
}

/** Optional story-level mixer overrides — partial sections merge with legacy music fields. */
export interface ProjectAudioMixerSettings {
  voice?: Partial<VoiceMixSettings>;
  music?: Partial<MusicMixSettings>;
  master?: Partial<MasterMixSettings>;
}

/** Fully resolved mixer snapshot — safe for preview/export consumers (future phases). */
export interface ResolvedAudioMixSettings {
  voice: VoiceMixSettings;
  music: Required<MusicMixSettings>;
  master: MasterMixSettings;
}
