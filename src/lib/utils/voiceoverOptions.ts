export const VOICEOVER_VOICE_OPTIONS = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

export type VoiceoverVoiceOption = (typeof VOICEOVER_VOICE_OPTIONS)[number];

export const DEFAULT_VOICEOVER_VOICE: VoiceoverVoiceOption = "alloy";

const VALID_VOICES = new Set<string>([
  ...VOICEOVER_VOICE_OPTIONS,
  "ash",
  "ballad",
  "coral",
  "sage",
  "verse",
  "marin",
  "cedar",
]);

export function resolveVoiceoverVoice(voice: unknown): string {
  if (typeof voice === "string") {
    const normalized = voice.trim().toLowerCase();
    if (VALID_VOICES.has(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_VOICEOVER_VOICE;
}

/** Supported TTS speed presets for story voice settings. */
export const VOICEOVER_SPEED_OPTIONS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.4] as const;

export type VoiceoverSpeedOption = (typeof VOICEOVER_SPEED_OPTIONS)[number];

export const VOICE_SPEED_LABELS: Record<VoiceoverSpeedOption, string> = {
  0.75: "0.75x",
  0.9: "0.9x",
  1: "1.0x",
  1.1: "1.1x",
  1.25: "1.25x",
  1.4: "1.4x",
};

export const DEFAULT_VOICEOVER_SPEED: VoiceoverSpeedOption = 1;

export function resolveVoiceoverSpeed(speed: unknown): VoiceoverSpeedOption {
  const numeric =
    typeof speed === "number"
      ? speed
      : typeof speed === "string"
        ? Number.parseFloat(speed)
        : DEFAULT_VOICEOVER_SPEED;

  if (!Number.isFinite(numeric)) {
    return DEFAULT_VOICEOVER_SPEED;
  }

  if (VOICEOVER_SPEED_OPTIONS.includes(numeric as VoiceoverSpeedOption)) {
    return numeric as VoiceoverSpeedOption;
  }

  let nearest: VoiceoverSpeedOption = DEFAULT_VOICEOVER_SPEED;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const option of VOICEOVER_SPEED_OPTIONS) {
    const distance = Math.abs(option - numeric);
    if (distance < nearestDistance) {
      nearest = option;
      nearestDistance = distance;
    }
  }

  return nearest;
}
