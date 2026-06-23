import type { FootieScript } from "@/features/story/types";

/** Normalized voiceover source resolved from canonical and legacy story fields. */
export interface CanonicalVoiceover {
  url: string;
  durationMs?: number;
}

type LegacyVoiceoverCarrier = FootieScript & {
  /** Denormalized draft/editor slice — `{ url, durationMs }`. */
  voiceover?: unknown;
  /** Audio-first pipeline URL before client materialization. */
  audioUrl?: unknown;
  /** Legacy alias for narration audio URL. */
  voiceoverAudio?: unknown;
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

/**
 * Resolves the playable voiceover URL and duration from canonical and legacy story fields.
 * Priority: `voiceoverUrl` → `voiceover` → `audioUrl` → `voiceoverAudio`.
 */
export function getCanonicalVoiceover(
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
    return storyDurationMs != null ? { url: audioUrl, durationMs: storyDurationMs } : { url: audioUrl };
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
