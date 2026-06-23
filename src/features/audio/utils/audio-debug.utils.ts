import type { FootieScript } from "@/features/story/types";

import { buildAudioMixFromStory } from "../services/audio-engine.service";
import type { AudioMix } from "../types/audio.types";

export function isAudioDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUDIO_DEBUG === "true";
}

export interface AudioEngineDebugState {
  voiceoverExists: boolean;
  voiceoverSrcType: string;
  voiceoverDurationMs?: number;
  backgroundMusicEnabled: boolean;
  backgroundMusicExists: boolean;
  masterDurationMs: number;
  exportAudioSource: string;
}

function hasPersistedVoiceoverBase64(story: FootieScript): boolean {
  const value = (story as { voiceoverAudioBase64?: unknown }).voiceoverAudioBase64;
  return typeof value === "string" && value.length > 0;
}

function hasPersistedBackgroundBase64(story: FootieScript): boolean {
  const music = story.backgroundMusic as { fileDataBase64?: unknown } | undefined;
  return typeof music?.fileDataBase64 === "string" && music.fileDataBase64.length > 0;
}

/** Classifies an audio reference without logging URL or payload content. */
export function classifyAudioSrcType(src: string | undefined): string {
  if (!src?.trim()) {
    return "missing";
  }

  const trimmed = src.trim();
  if (trimmed.startsWith("blob:")) {
    return "blob";
  }
  if (trimmed.startsWith("data:")) {
    return "data-url";
  }
  if (trimmed.startsWith("https://")) {
    return "https";
  }
  if (trimmed.startsWith("http://")) {
    return "http";
  }

  return "other";
}

function resolveVoiceoverSrcType(story: FootieScript, mix: AudioMix): string {
  const srcType = classifyAudioSrcType(mix.voiceover?.src);
  if (srcType !== "missing") {
    return srcType;
  }

  if (hasPersistedVoiceoverBase64(story)) {
    return "persisted-base64";
  }

  return "missing";
}

function resolveBackgroundSrcType(story: FootieScript, mix: AudioMix): string {
  const srcType = classifyAudioSrcType(mix.background?.src);
  if (srcType !== "missing") {
    return srcType;
  }

  if (hasPersistedBackgroundBase64(story)) {
    return "persisted-base64";
  }

  return "missing";
}

export function resolveExportAudioSource(mix: AudioMix): string {
  const hasVoiceover = Boolean(mix.voiceover?.src);
  const hasBackground = Boolean(mix.background?.src && mix.background.enabled);

  if (hasVoiceover && hasBackground) {
    return "voiceover+background";
  }
  if (hasVoiceover) {
    return "voiceover";
  }
  if (hasBackground) {
    return "background";
  }

  return "none";
}

export function getAudioEngineDebugState(
  story: FootieScript | null | undefined,
): AudioEngineDebugState | null {
  if (!story) {
    return null;
  }

  const mix = buildAudioMixFromStory(story);
  const voiceoverSrcType = resolveVoiceoverSrcType(story, mix);
  const backgroundSrcType = resolveBackgroundSrcType(story, mix);
  const backgroundMusicEnabled = Boolean(mix.background?.enabled);

  return {
    voiceoverExists: voiceoverSrcType !== "missing",
    voiceoverSrcType,
    voiceoverDurationMs: mix.voiceover?.durationMs,
    backgroundMusicEnabled,
    backgroundMusicExists:
      backgroundMusicEnabled && backgroundSrcType !== "missing",
    masterDurationMs: mix.masterDurationMs,
    exportAudioSource: resolveExportAudioSource(mix),
  };
}

/** Logs normalized audio mix state when `NEXT_PUBLIC_AUDIO_DEBUG=true`. */
export function logAudioEngineState(
  story: FootieScript | null | undefined,
  context?: string,
): void {
  if (!isAudioDebugEnabled()) {
    return;
  }

  const state = getAudioEngineDebugState(story);
  if (!state) {
    return;
  }

  if (context) {
    console.info("[AudioEngine]", context, state);
    return;
  }

  console.info("[AudioEngine]", state);
}
