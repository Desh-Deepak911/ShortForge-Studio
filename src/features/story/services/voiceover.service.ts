import "server-only";

import type OpenAI from "openai";

import { getOpenAIClient } from "@/lib/ai";
import {
  DEFAULT_VOICEOVER_SPEED,
  DEFAULT_VOICEOVER_VOICE,
  resolveVoiceoverSpeed,
  resolveVoiceoverVoice,
} from "@/lib/utils/voiceoverOptions";
import type { StoryScript, VoiceoverResult } from "@/features/story/types";
import { adjustVoiceoverDurationForSpeed } from "@/features/story/utils/voiceover-duration.utils";
import { toVoiceoverResultFromMp3 } from "@/features/story/utils";

const TTS_MODEL = "tts-1";
const MAX_INPUT_LENGTH = 4096;

/** OpenAI TTS accepts a `speed` parameter on speech.create. */
const OPENAI_TTS_SUPPORTS_PLAYBACK_SPEED = true;

export { resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";

export interface GenerateVoiceoverInput {
  narration: string;
  voice?: unknown;
  speed?: unknown;
}

export interface GenerateVoiceoverFromScriptOptions {
  voice?: string;
  speed?: unknown;
}

export interface GenerateVoiceoverMp3Options {
  speed?: unknown;
  /** When false, TTS runs at default speed and duration is adjusted downstream. */
  applySpeed?: boolean;
}

export type GenerateVoiceoverOutput = VoiceoverResult & { audioBuffer: ArrayBuffer };

export async function generateVoiceoverMp3(
  text: string,
  voice?: string,
  options: GenerateVoiceoverMp3Options = {},
): Promise<ArrayBuffer> {
  const openai = getOpenAIClient();
  const resolvedVoice = resolveVoiceoverVoice(voice) as OpenAI.Audio.SpeechCreateParams["voice"];
  const applySpeed = options.applySpeed ?? OPENAI_TTS_SUPPORTS_PLAYBACK_SPEED;

  const speech = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: resolvedVoice,
    input: text.slice(0, MAX_INPUT_LENGTH),
    response_format: "mp3",
    ...(applySpeed ? { speed: resolveVoiceoverSpeed(options.speed) } : {}),
  });

  return speech.arrayBuffer();
}

/**
 * Generates voiceover audio from narration text and returns structured timing metadata.
 * Passes speed to the TTS provider when supported; otherwise adjusts duration after generation.
 */
export async function generateVoiceover(
  input: GenerateVoiceoverInput,
): Promise<GenerateVoiceoverOutput> {
  const narration = input.narration.trim();
  if (!narration) {
    throw new Error("Narration is required");
  }

  const resolvedVoice = resolveVoiceoverVoice(input.voice ?? DEFAULT_VOICEOVER_VOICE);
  const resolvedSpeed = resolveVoiceoverSpeed(input.speed ?? DEFAULT_VOICEOVER_SPEED);
  const speedAppliedByProvider = OPENAI_TTS_SUPPORTS_PLAYBACK_SPEED;

  const mp3 = await generateVoiceoverMp3(narration, resolvedVoice, {
    speed: resolvedSpeed,
    applySpeed: speedAppliedByProvider,
  });

  const base = toVoiceoverResultFromMp3(mp3, {
    voice: resolvedVoice,
    speed: resolvedSpeed,
    narration,
  });

  const durationMs = adjustVoiceoverDurationForSpeed(
    base.durationMs,
    resolvedSpeed,
    speedAppliedByProvider,
  );

  return {
    ...base,
    durationMs,
    audioBuffer: mp3,
    metadata: {
      ...base.metadata,
      speed: resolvedSpeed,
    },
  };
}

/**
 * Generates voiceover audio from a narration script and returns structured timing metadata.
 * Uses MP3 frame parsing for duration when available; falls back to word-count estimation.
 */
export async function generateVoiceoverFromScript(
  script: StoryScript,
  options: GenerateVoiceoverFromScriptOptions = {},
): Promise<VoiceoverResult> {
  const result = await generateVoiceover({
    narration: script.narration,
    voice: options.voice,
    speed: options.speed,
  });

  return {
    durationMs: result.durationMs,
    provider: result.provider,
    audioBase64: Buffer.from(result.audioBuffer).toString("base64"),
    metadata: result.metadata,
  };
}
