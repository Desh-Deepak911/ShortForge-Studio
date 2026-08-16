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
import {
  renderPitchPreservedVoiceSpeed,
  shouldRenderPitchPreservedVoiceSpeed,
} from "@/features/voice-quality/server/render-pitch-preserved-voice-speed";

/** Clarity-first default; `tts-1` is latency-oriented and failed the voice A/B. */
const TTS_MODEL = "tts-1-hd";
const MAX_INPUT_LENGTH = 4096;

export { TTS_MODEL };

export { resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";

export type VoiceSpeedRendering =
  | "native"
  | "pitch_preserved"
  | "provider_fallback";

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

export interface GenerateVoiceoverMp3Result {
  readonly audioBuffer: ArrayBuffer;
  readonly speedRendering: VoiceSpeedRendering;
}

export type GenerateVoiceoverOutput = VoiceoverResult & { audioBuffer: ArrayBuffer };

export async function generateVoiceoverMp3(
  text: string,
  voice?: string,
  options: GenerateVoiceoverMp3Options = {},
): Promise<ArrayBuffer> {
  return (await generateVoiceoverMp3WithRendering(text, voice, options))
    .audioBuffer;
}

async function requestOpenAiSpeech(input: {
  readonly text: string;
  readonly voice?: string;
  readonly speed: number;
  readonly model: string;
  readonly instructions?: string;
  readonly responseFormat: "mp3" | "wav";
}): Promise<ArrayBuffer> {
  const openai = getOpenAIClient();
  const resolvedVoice = resolveVoiceoverVoice(input.voice) as OpenAI.Audio.SpeechCreateParams["voice"];

  const speech = await openai.audio.speech.create({
    model: input.model,
    voice: resolvedVoice,
    input: input.text.slice(0, MAX_INPUT_LENGTH),
    response_format: input.responseFormat,
    speed: input.speed,
    ...(input.instructions ? { instructions: input.instructions } : {}),
  });

  return speech.arrayBuffer();
}

/**
 * Produces one canonical MP3 at the requested pace. Non-1 speeds start from a
 * lossless normal-speed render, then use pitch-preserving tempo conversion.
 * A provider-baked retry keeps voice creation available if local conversion
 * is unexpectedly unavailable.
 */
export async function generateVoiceoverMp3WithRendering(
  text: string,
  voice?: string,
  options: GenerateVoiceoverMp3Options = {},
): Promise<GenerateVoiceoverMp3Result> {
  const speed = resolveVoiceoverSpeed(options.speed);
  const model = options.model ?? TTS_MODEL;
  const applySpeed = options.applySpeed ?? true;

  if (!applySpeed || !shouldRenderPitchPreservedVoiceSpeed(speed)) {
    return {
      audioBuffer: await requestOpenAiSpeech({
        text,
        voice,
        speed: applySpeed ? speed : 1,
        model,
        instructions: options.instructions,
        responseFormat: "mp3",
      }),
      speedRendering: "native",
    };
  }

  try {
    const cleanAudio = await requestOpenAiSpeech({
      text,
      voice,
      speed: 1,
      model,
      instructions: options.instructions,
      responseFormat: "wav",
    });
    return {
      audioBuffer: await renderPitchPreservedVoiceSpeed({
        losslessAudio: cleanAudio,
        speed,
      }),
      speedRendering: "pitch_preserved",
    };
  } catch (error) {
    console.warn("Pitch-preserved voice speed unavailable; using provider fallback.", {
      speed,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return {
      audioBuffer: await requestOpenAiSpeech({
        text,
        voice,
        speed,
        model,
        instructions: options.instructions,
        responseFormat: "mp3",
      }),
      speedRendering: "provider_fallback",
    };
  }
}

/**
 * Generates voiceover audio from narration text and returns structured timing metadata.
 * Encodes the selected pace once in the canonical MP3. Non-1 speeds use a
 * lossless normal-speed source plus pitch-preserving tempo conversion.
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
  const style = resolveSpeechStyleInstructionsForVoice(
    resolvedVoice,
    input.stylePreset,
    input.expressiveDelivery,
  );

  const spokenNarration = prepareNarrationForVoiceCadence(
    narration,
    resolvedSpeed,
  );
  const rendered = await generateVoiceoverMp3WithRendering(spokenNarration, resolvedVoice, {
    speed: resolvedSpeed,
    model: style.model,
    instructions: prepareVoiceCadenceInstructions({
      model: style.model,
      speed: resolvedSpeed,
      instructions: style.instructions,
    }),
  });
  const mp3 = rendered.audioBuffer;

  const base = toVoiceoverResultFromMp3(mp3, {
    voice: resolvedVoice,
    speed: resolvedSpeed,
    narration,
    metadata: {
      ...(style.useInstructionTts || voiceRequiresGpt4oMiniTts(resolvedVoice)
        ? { model: style.model }
        : {}),
      speedRendering: rendered.speedRendering,
    },
  });

  const durationMs = adjustVoiceoverDurationForSpeed(
    base.durationMs,
    resolvedSpeed,
    true,
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
