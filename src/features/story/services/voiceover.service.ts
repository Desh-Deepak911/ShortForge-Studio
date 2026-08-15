import "server-only";

import type OpenAI from "openai";

import { resolveSpeechStyleInstructionsForVoice } from "@/features/speech-style";
import { getOpenAIClient } from "@/lib/ai";
import { voiceRequiresGpt4oMiniTts } from "@/lib/utils/tts-voice-compat.utils";
import {
  DEFAULT_VOICEOVER_SPEED,
  DEFAULT_VOICEOVER_VOICE,
  resolveVoiceoverSpeed,
  resolveVoiceoverVoice,
} from "@/lib/utils/voiceoverOptions";
import type { StoryScript, VoiceoverResult } from "@/features/story/types";
import { adjustVoiceoverDurationForSpeed } from "@/features/story/utils/voiceover-duration.utils";
import { toVoiceoverResultFromMp3 } from "@/features/story/utils";
import {
  prepareNarrationForVoiceCadence,
  prepareVoiceCadenceInstructions,
} from "@/features/voice-quality";

/** Clarity-first default; `tts-1` is latency-oriented and failed the voice A/B. */
const TTS_MODEL = "tts-1-hd";
const MAX_INPUT_LENGTH = 4096;

export { TTS_MODEL };

/** OpenAI TTS accepts a `speed` parameter on speech.create. */
const OPENAI_TTS_SUPPORTS_PLAYBACK_SPEED = true;

export { resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";

export interface GenerateVoiceoverInput {
  narration: string;
  voice?: unknown;
  speed?: unknown;
  stylePreset?: unknown;
  expressiveDelivery?: unknown;
}

export interface GenerateVoiceoverFromScriptOptions {
  voice?: string;
  speed?: unknown;
  stylePreset?: unknown;
  expressiveDelivery?: unknown;
}

export interface GenerateVoiceoverMp3Options {
  speed?: unknown;
  /** When false, TTS runs at default speed and duration is adjusted downstream. */
  applySpeed?: boolean;
  model?: string;
  instructions?: string;
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
  const model = options.model ?? TTS_MODEL;

  const speech = await openai.audio.speech.create({
    model,
    voice: resolvedVoice,
    input: text.slice(0, MAX_INPUT_LENGTH),
    response_format: "mp3",
    ...(applySpeed ? { speed: resolveVoiceoverSpeed(options.speed) } : {}),
    ...(options.instructions ? { instructions: options.instructions } : {}),
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
  const style = resolveSpeechStyleInstructionsForVoice(
    resolvedVoice,
    input.stylePreset,
    input.expressiveDelivery,
  );

  const spokenNarration = prepareNarrationForVoiceCadence(
    narration,
    resolvedSpeed,
  );
  const mp3 = await generateVoiceoverMp3(spokenNarration, resolvedVoice, {
    speed: resolvedSpeed,
    applySpeed: speedAppliedByProvider,
    model: style.model,
    instructions: prepareVoiceCadenceInstructions({
      model: style.model,
      speed: resolvedSpeed,
      instructions: style.instructions,
    }),
  });

  const base = toVoiceoverResultFromMp3(mp3, {
    voice: resolvedVoice,
    speed: resolvedSpeed,
    narration,
    metadata: {
      ...(style.useInstructionTts || voiceRequiresGpt4oMiniTts(resolvedVoice)
        ? { model: style.model }
        : {}),
    },
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
    stylePreset: options.stylePreset,
    expressiveDelivery: options.expressiveDelivery,
  });

  return {
    durationMs: result.durationMs,
    provider: result.provider,
    audioBase64: Buffer.from(result.audioBuffer).toString("base64"),
    metadata: result.metadata,
  };
}
