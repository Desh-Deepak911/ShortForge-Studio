import type { FootieScene, TimelineItem } from "./story.types";

/** Narration script produced before or during audio-first timing. */
export interface StoryScript {
  id: string;
  title: string;
  narration: string;
  /** Target length from generation before voiceover measurement. */
  estimatedDurationMs?: number;
  /** Non-fatal length budget warning when compression or validation could not fully fit the target. */
  lengthWarning?: string;
}

export const VOICEOVER_PROVIDER_OPENAI = "openai" as const;

export type VoiceoverProvider = typeof VOICEOVER_PROVIDER_OPENAI | (string & {});

export type VoiceoverDurationSource = "measured" | "estimated";

export interface VoiceoverMetadata {
  voice?: string;
  speed?: number;
  model?: string;
  format?: "audio/mpeg";
  durationSource?: VoiceoverDurationSource;
  /** How the selected pace was encoded into the canonical audio file. */
  speedRendering?: "native" | "pitch_preserved" | "provider_fallback";
}

/**
 * Voiceover output from TTS. Uses `audioBase64` on the server response and
 * `audioUrl` after the client materializes a blob URL.
 */
export interface VoiceoverResult {
  durationMs: number;
  provider: VoiceoverProvider;
  audioBase64?: string;
  audioUrl?: string;
  metadata?: VoiceoverMetadata;
}

/** Full result of the audio-first generation pipeline. */
export interface AudioFirstGenerationResult {
  script: StoryScript;
  voiceover: VoiceoverResult | null;
  scenes: FootieScene[];
  timelineItems: TimelineItem[];
}
