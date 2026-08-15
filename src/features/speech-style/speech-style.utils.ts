import { voiceRequiresGpt4oMiniTts } from "@/lib/utils/tts-voice-compat.utils";
import { resolveVoiceoverVoice } from "@/lib/utils/voiceoverOptions";

import { getSpeechStylePreset, SPEECH_STYLE_PRESET_ORDER } from "./speech-style.registry";
import type { SpeechStyleInstructionResult, SpeechStylePreset } from "./speech-style.types";

export const DEFAULT_SPEECH_STYLE_PRESET: SpeechStylePreset = "neutral";

export const TTS_MODEL_NEUTRAL = "tts-1-hd" as const;
export const TTS_MODEL_EXPRESSIVE = "gpt-4o-mini-tts" as const;

export { SPEECH_STYLE_PRESET_ORDER };

/** Resolves unknown values to a supported speech style preset. */
export function resolveSpeechStylePreset(value: unknown): SpeechStylePreset {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (SPEECH_STYLE_PRESET_ORDER.includes(normalized as SpeechStylePreset)) {
      return normalized as SpeechStylePreset;
    }
  }

  return DEFAULT_SPEECH_STYLE_PRESET;
}

/** Defaults expressive delivery to true for non-neutral presets. */
export function resolveExpressiveDelivery(
  preset: SpeechStylePreset,
  value: unknown,
): boolean {
  if (preset === DEFAULT_SPEECH_STYLE_PRESET) {
    return false;
  }

  if (value === false) {
    return false;
  }

  return true;
}

/** Resolves TTS model and optional instructions for the selected delivery style. */
export function resolveSpeechStyleInstructions(
  stylePreset: unknown,
  expressiveDelivery?: unknown,
): SpeechStyleInstructionResult {
  const preset = resolveSpeechStylePreset(stylePreset);
  const expressive = resolveExpressiveDelivery(preset, expressiveDelivery);
  const config = getSpeechStylePreset(preset);
  const instructionText = config?.instructionText?.trim() ?? "";
  const useInstructionTts = preset !== DEFAULT_SPEECH_STYLE_PRESET && expressive && instructionText.length > 0;

  if (!useInstructionTts) {
    return {
      preset,
      expressiveDelivery: expressive,
      useInstructionTts: false,
      model: TTS_MODEL_NEUTRAL,
    };
  }

  return {
    preset,
    expressiveDelivery: expressive,
    useInstructionTts: true,
    model: TTS_MODEL_EXPRESSIVE,
    instructions: instructionText,
  };
}

/** Resolves TTS model for a voice + delivery style — newer voices require gpt-4o-mini-tts. */
export function resolveTtsModelForVoice(
  voice: unknown,
): typeof TTS_MODEL_NEUTRAL | typeof TTS_MODEL_EXPRESSIVE {
  const normalizedVoice = resolveVoiceoverVoice(voice);
  if (voiceRequiresGpt4oMiniTts(normalizedVoice)) {
    return TTS_MODEL_EXPRESSIVE;
  }

  return TTS_MODEL_NEUTRAL;
}

/** Resolves model, instructions, and delivery flags for a concrete voice request. */
export function resolveSpeechStyleInstructionsForVoice(
  voice: unknown,
  stylePreset: unknown,
  expressiveDelivery?: unknown,
): SpeechStyleInstructionResult {
  const base = resolveSpeechStyleInstructions(stylePreset, expressiveDelivery);
  const model = resolveTtsModelForVoice(voice);

  return {
    ...base,
    model,
  };
}

/** True when instruction text avoids factual rewrite directives. */
export function speechStyleInstructionTextIsSafe(instructionText: string): boolean {
  const normalized = instructionText.toLowerCase();
  return (
    normalized.includes("do not add") &&
    normalized.includes("change any facts") &&
    !normalized.includes("rewrite the text") &&
    !normalized.includes("add new")
  );
}
