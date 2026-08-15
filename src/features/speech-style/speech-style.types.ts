export type SpeechStylePreset =
  | "neutral"
  | "documentary"
  | "sports_hype"
  | "cinematic"
  | "news"
  | "calm_storytelling"
  | "debate"
  | "countdown";

export interface SpeechStylePresetConfig {
  id: SpeechStylePreset;
  label: string;
  description: string;
  toneTags: string[];
  recommendedFor: string[];
  /** Empty for neutral — delivery instructions for gpt-4o-mini-tts only. */
  instructionText: string;
}

export interface SpeechStyleInstructionResult {
  preset: SpeechStylePreset;
  expressiveDelivery: boolean;
  useInstructionTts: boolean;
  model: "tts-1-hd" | "gpt-4o-mini-tts";
  instructions?: string;
}
