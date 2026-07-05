import type { FootieScript } from "@/features/story/types";
import { createVoiceoverBlobUrl } from "@/lib/utils/voiceover";

import {
  hasPlayableVoiceoverSource,
  materializePlayableVoiceoverFromBase64,
} from "./playable-voiceover-src.utils";

/** Normalized voiceover source resolved from canonical and legacy story fields. */
export interface CanonicalVoiceover {
  url: string;
  durationMs?: number;
}

/** Identifies which story field supplied the resolved voiceover. */
export type VoiceoverSource =
  | "voiceoverUrl"
  | "voiceover-object"
  | "audioUrl"
  | "voiceoverAudio"
  | "voiceoverAudioBase64"
  | "draft-voiceover-audioBase64"
  | "none";

/** Export-time voiceover availability without materializing blob URLs. */
export interface VoiceoverAvailability {
  hasCanonicalVoiceover: boolean;
  hasPlayableVoiceover: boolean;
  hasVoiceoverUrl: boolean;
  hasVoiceoverBase64: boolean;
  voiceoverSource: VoiceoverSource;
}

type LegacyVoiceoverCarrier = FootieScript & {
  /** Denormalized draft/editor slice — `{ url, durationMs, audioBase64 }`. */
  voiceover?: unknown;
  /** Audio-first pipeline URL before client materialization. */
  audioUrl?: unknown;
  /** Legacy alias for narration audio URL. */
  voiceoverAudio?: unknown;
  /** Persisted MP3 payload — restored to a blob URL on load/export. */
  voiceoverAudioBase64?: unknown;
};

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.round(value);
}

function readUrlFromRecord(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return (
    readTrimmedString(record.url) ??
    readTrimmedString(record.src) ??
    readTrimmedString(record.audioUrl)
  );
}

function readUrlFromUnknown(value: unknown): string | undefined {
  return readTrimmedString(value) ?? readUrlFromRecord(value);
}

function readDurationFromUnknown(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return readDurationMs((value as Record<string, unknown>).durationMs);
}

function resolveStoryDurationMs(story: FootieScript): number | undefined {
  return readDurationMs(story.voiceoverDurationMs);
}

function readBase64FromRecord(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return readTrimmedString((value as Record<string, unknown>).audioBase64);
}

/** Reads persisted voiceover base64 from script and denormalized draft slices. */
export function readVoiceoverAudioBase64(
  story: FootieScript | null | undefined,
): string | undefined {
  if (!story) {
    return undefined;
  }

  const legacy = story as LegacyVoiceoverCarrier;
  return (
    readTrimmedString(legacy.voiceoverAudioBase64) ??
    readBase64FromRecord(legacy.voiceover)
  );
}

export function resolveVoiceoverSourceFromUrlFields(
  story: FootieScript,
): VoiceoverSource {
  const legacy = story as LegacyVoiceoverCarrier;

  if (readTrimmedString(story.voiceoverUrl)) {
    return "voiceoverUrl";
  }
  if (readUrlFromUnknown(legacy.voiceover)) {
    return "voiceover-object";
  }
  if (readTrimmedString(legacy.audioUrl)) {
    return "audioUrl";
  }
  if (readUrlFromUnknown(legacy.voiceoverAudio)) {
    return "voiceoverAudio";
  }

  const base64 = readVoiceoverAudioBase64(story);
  if (base64) {
    if (readBase64FromRecord(legacy.voiceover)) {
      return "draft-voiceover-audioBase64";
    }
    return "voiceoverAudioBase64";
  }

  return "none";
}

/**
 * Resolves voiceover URL fields only — does not materialize persisted base64.
 * Priority: `voiceoverUrl` → `voiceover` → `audioUrl` → `voiceoverAudio`.
 */
export function resolveCanonicalVoiceoverFromUrlFields(
  story: FootieScript | null | undefined,
): CanonicalVoiceover | null {
  if (!story) {
    return null;
  }

  const legacy = story as LegacyVoiceoverCarrier;
  const storyDurationMs = resolveStoryDurationMs(story);

  const voiceoverUrl = readTrimmedString(story.voiceoverUrl);
  if (voiceoverUrl) {
    return storyDurationMs != null
      ? { url: voiceoverUrl, durationMs: storyDurationMs }
      : { url: voiceoverUrl };
  }

  const voiceoverObjectUrl = readUrlFromUnknown(legacy.voiceover);
  if (voiceoverObjectUrl) {
    const durationMs =
      readDurationFromUnknown(legacy.voiceover) ?? storyDurationMs;
    return durationMs != null
      ? { url: voiceoverObjectUrl, durationMs }
      : { url: voiceoverObjectUrl };
  }

  const audioUrl = readTrimmedString(legacy.audioUrl);
  if (audioUrl) {
    return storyDurationMs != null
      ? { url: audioUrl, durationMs: storyDurationMs }
      : { url: audioUrl };
  }

  const voiceoverAudioUrl = readUrlFromUnknown(legacy.voiceoverAudio);
  if (voiceoverAudioUrl) {
    const durationMs =
      readDurationFromUnknown(legacy.voiceoverAudio) ?? storyDurationMs;
    return durationMs != null
      ? { url: voiceoverAudioUrl, durationMs }
      : { url: voiceoverAudioUrl };
  }

  return null;
}

function materializeVoiceoverFromBase64(audioBase64: string): string {
  const materialized = materializePlayableVoiceoverFromBase64(audioBase64, {
    preferObjectUrl: true,
  });
  return materialized?.src ?? createVoiceoverBlobUrl(audioBase64);
}

function resolveVoiceoverFromPersistedBase64(
  story: FootieScript,
  durationMs?: number,
): CanonicalVoiceover | null {
  const base64 = readVoiceoverAudioBase64(story);
  if (!base64) {
    return null;
  }

  const resolvedDurationMs = durationMs ?? resolveStoryDurationMs(story);
  const url = materializeVoiceoverFromBase64(base64);
  return resolvedDurationMs != null ? { url, durationMs: resolvedDurationMs } : { url };
}

/**
 * Resolves the playable voiceover URL and duration from canonical and legacy story fields.
 * Falls back to persisted base64 when no URL field is present.
 * Prefers persisted base64 over ephemeral blob URLs so regeneration/reload cannot replay stale audio.
 */
export function getCanonicalVoiceover(
  story: FootieScript | null | undefined,
): CanonicalVoiceover | null {
  const base64 = readVoiceoverAudioBase64(story);
  const storyDurationMs = resolveStoryDurationMs(story ?? ({} as FootieScript));

  if (base64) {
    return resolveVoiceoverFromPersistedBase64(
      story ?? ({} as FootieScript),
      storyDurationMs,
    );
  }

  return resolveCanonicalVoiceoverFromUrlFields(story);
}

/** Non-destructive voiceover availability for export UI and diagnostics. */
export function getVoiceoverAvailability(
  story: FootieScript | null | undefined,
): VoiceoverAvailability {
  if (!story) {
    return {
      hasCanonicalVoiceover: false,
      hasPlayableVoiceover: false,
      hasVoiceoverUrl: false,
      hasVoiceoverBase64: false,
      voiceoverSource: "none",
    };
  }

  const hasVoiceoverBase64 = Boolean(readVoiceoverAudioBase64(story));
  const voiceoverSource = resolveVoiceoverSourceFromUrlFields(story);
  const hasVoiceoverUrl = Boolean(resolveCanonicalVoiceoverFromUrlFields(story)?.url);
  const hasPlayableVoiceover = hasPlayableVoiceoverSource(story);
  const hasCanonicalVoiceover = hasVoiceoverUrl || hasVoiceoverBase64;

  return {
    hasCanonicalVoiceover,
    hasPlayableVoiceover,
    hasVoiceoverUrl,
    hasVoiceoverBase64,
    voiceoverSource: hasCanonicalVoiceover ? voiceoverSource : "none",
  };
}
