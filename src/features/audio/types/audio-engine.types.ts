import type { StoryBackgroundMusic, StoryVoiceSettings } from "@/features/story/types";
import type { VoiceoverSpeedOption } from "@/lib/voiceoverOptions";

/** Resolved voiceover track — mirrors FootieScript voice fields. */
export interface VoiceoverTrack {
  url: string;
  durationMs?: number;
  voice: string;
  speed: VoiceoverSpeedOption;
  /** Stable cache key: url + normalized voice settings. */
  cacheKey: string;
}

/** Resolved background music track — mirrors FootieScript.backgroundMusic URLs. */
export interface BackgroundMusicTrack {
  url: string;
  settings: StoryBackgroundMusic;
  cacheKey: string;
}

/** Single read-only snapshot of all story audio used by preview and export. */
export interface AudioEngineSnapshot {
  voiceover: VoiceoverTrack | null;
  backgroundMusic: BackgroundMusicTrack | null;
  voiceSettings: StoryVoiceSettings;
}

export interface VoiceoverBlobMaterialization {
  url: string;
}
