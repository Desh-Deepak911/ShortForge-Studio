import {
  DEFAULT_VOICEOVER_SPEED,
  resolveVoiceoverSpeed,
  resolveVoiceoverVoice,
} from "@/lib/utils/voiceoverOptions";
import type { FootieScript, StoryVoiceSettings } from "@/features/story/types";

type VoiceSettingsInput = Pick<FootieScript, "voiceSettings"> & {
  /** @deprecated Migrated into `voiceSettings.speed`. */
  voiceoverSpeed?: number;
};

/** Normalizes story voice settings with defaults and supported speed presets. */
export function normalizeStoryVoiceSettings(input: VoiceSettingsInput): StoryVoiceSettings {
  const speed = resolveVoiceoverSpeed(input.voiceSettings?.speed ?? input.voiceoverSpeed);
  const voice = input.voiceSettings?.voice;

  if (voice?.trim()) {
    return {
      voice: resolveVoiceoverVoice(voice),
      speed,
    };
  }

  return { speed };
}

/** Returns normalized voice settings, always with `speed` initialized. */
export function getStoryVoiceSettings(script: FootieScript | null | undefined): StoryVoiceSettings {
  if (!script) {
    return { speed: DEFAULT_VOICEOVER_SPEED };
  }

  return normalizeStoryVoiceSettings(script);
}
