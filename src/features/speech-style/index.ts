export type {
  SpeechStyleInstructionResult,
  SpeechStylePreset,
  SpeechStylePresetConfig,
} from "./speech-style.types";

export {
  getSpeechStylePreset,
  getSpeechStylePresets,
  SPEECH_STYLE_PRESET_ORDER,
} from "./speech-style.registry";

export {
  DEFAULT_SPEECH_STYLE_PRESET,
  resolveExpressiveDelivery,
  resolveSpeechStyleInstructions,
  resolveSpeechStyleInstructionsForVoice,
  resolveSpeechStylePreset,
  resolveTtsModelForVoice,
  speechStyleInstructionTextIsSafe,
  TTS_MODEL_EXPRESSIVE,
  TTS_MODEL_NEUTRAL,
} from "./speech-style.utils";
