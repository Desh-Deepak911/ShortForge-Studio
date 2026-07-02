import {
  clampHtmlMediaElementVolume,
  resolveAudioMixerSettings,
  resolveMusicStemGain,
} from "@/features/audio-mixer";
import type { FootieScript } from "@/features/story/types";
import { getStoryBackgroundMusic } from "@/features/story/utils";

/** @deprecated Use mixer-resolved ducking strength — kept for legacy tests. */
export const PREVIEW_MUSIC_DUCKING_MULTIPLIER = 0.35;
export const PREVIEW_BACKGROUND_MUSIC_FADE_IN_SEC = 2;
export const PREVIEW_BACKGROUND_MUSIC_FADE_OUT_SEC = 2;

export function resolvePreviewBackgroundMusicUrl(
  script: FootieScript | null | undefined,
): string | null {
  if (!script) {
    return null;
  }

  const music = getStoryBackgroundMusic(script);
  if (!music.enabled || music.source === "none") {
    return null;
  }

  const fileUrl = music.fileUrl?.trim();
  return fileUrl || null;
}

export function isPreviewBackgroundMusicActive(
  script: FootieScript | null | undefined,
): boolean {
  return Boolean(resolvePreviewBackgroundMusicUrl(script));
}

export function computePreviewBackgroundMusicFadeMultiplier(
  elapsedSec: number,
  totalDurationSec: number,
  fadeIn: boolean,
  fadeOut: boolean,
  fadeInSec = PREVIEW_BACKGROUND_MUSIC_FADE_IN_SEC,
  fadeOutSec = PREVIEW_BACKGROUND_MUSIC_FADE_OUT_SEC,
): number {
  let multiplier = 1;

  if (fadeIn && fadeInSec > 0) {
    multiplier *= Math.min(1, Math.max(0, elapsedSec / fadeInSec));
  }

  if (fadeOut && totalDurationSec > 0 && fadeOutSec > 0) {
    const remainingSec = totalDurationSec - elapsedSec;
    multiplier *= Math.min(1, Math.max(0, remainingSec / fadeOutSec));
  }

  return multiplier;
}

export function computePreviewBackgroundMusicVolume(options: {
  baseVolume: number;
  duckingEnabled: boolean;
  duckingStrength: number;
  voiceoverIsPlaying: boolean;
  fadeMultiplier: number;
}): number {
  const { baseVolume, duckingEnabled, duckingStrength, voiceoverIsPlaying, fadeMultiplier } =
    options;
  let volume = baseVolume;

  if (duckingEnabled && voiceoverIsPlaying) {
    volume *= duckingStrength;
  }

  return clampHtmlMediaElementVolume(volume * fadeMultiplier);
}

export function resolvePreviewBackgroundMusicPlaybackVolume(options: {
  script: FootieScript | null | undefined;
  elapsedSec: number;
  totalDurationSec: number;
  voiceoverIsPlaying: boolean;
}): number {
  const music = getStoryBackgroundMusic(options.script);
  if (!music.enabled || !resolvePreviewBackgroundMusicUrl(options.script)) {
    return 0;
  }

  const mixer = resolveAudioMixerSettings(options.script);
  const fadeInSec = mixer.music.fadeInMs / 1000;
  const fadeOutSec = mixer.music.fadeOutMs / 1000;

  const fadeMultiplier = computePreviewBackgroundMusicFadeMultiplier(
    options.elapsedSec,
    options.totalDurationSec,
    mixer.music.fadeInMs > 0,
    mixer.music.fadeOutMs > 0,
    fadeInSec,
    fadeOutSec,
  );

  return computePreviewBackgroundMusicVolume({
    baseVolume: resolveMusicStemGain(mixer),
    duckingEnabled: mixer.music.duckingEnabled,
    duckingStrength: mixer.music.duckingStrength,
    voiceoverIsPlaying: options.voiceoverIsPlaying,
    fadeMultiplier,
  });
}
