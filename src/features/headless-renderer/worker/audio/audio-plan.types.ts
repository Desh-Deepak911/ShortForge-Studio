/**
 * Pure validated headless audio plan — never raw/unchecked manifest → FFmpeg argv.
 * Every timing field here is consumed by the native filter builder.
 */

export const HEADLESS_AUDIO_TARGET_SAMPLE_RATE_HZ = 48_000 as const;
export const HEADLESS_AUDIO_TARGET_CHANNELS = 2 as const;
export const HEADLESS_AUDIO_OUTPUT_CODEC = "opus" as const;

/** Mux combinations the native encoder can produce. */
export type HeadlessAudioCombination =
  | "silent"
  | "voiceover"
  | "music"
  | "voiceover+music";

export type HeadlessAudioMixPolicy =
  | "none"
  | "voice-only"
  | "music-only"
  | "amix-voice-music";

export interface HeadlessVoiceoverPlan {
  /** Source-local trim window start (ms). */
  readonly sourceTrimStartMs: number;
  /** Source-local trim end (ms) — never plays beyond this. */
  readonly sourceTrimEndMs: number;
  /** Timeline placement of the trimmed stem start (ms). */
  readonly timelineStartMs: number;
  /** Delay applied after trim (= timelineStartMs for frozen manifests). */
  readonly requireDelayMs: number;
  /** Frozen voiceover.durationMs (authority for trim end). */
  readonly sourceDurationMs: number;
  readonly volumeGain: number;
  /** Silence pad needed after trimmed(+delayed) stem to reach output. */
  readonly padToOutputMs: number;
  readonly masteringProfile?: "generated_speech_v1";
}

export interface HeadlessMusicPlan {
  /** Timeline placement of music start (ms). */
  readonly timelineStartMs: number;
  /** Delay applied after loop/trim (= timelineStartMs for frozen manifests). */
  readonly requireDelayMs: number;
  readonly looping: true;
  /** Loop+trim end on the output timeline (ms). */
  readonly loopUntilOutputMs: number;
  readonly volumeGain: number;
  readonly duckedVolumeGain: number;
  readonly applyDucking: boolean;
  readonly duckUntilMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export interface HeadlessAudioPlan {
  readonly combination: HeadlessAudioCombination;
  readonly mixPolicy: HeadlessAudioMixPolicy;
  readonly outputDurationMs: number;
  readonly outputDurationSec: number;
  readonly sampleRateHz: typeof HEADLESS_AUDIO_TARGET_SAMPLE_RATE_HZ;
  readonly channels: typeof HEADLESS_AUDIO_TARGET_CHANNELS;
  readonly outputCodec: typeof HEADLESS_AUDIO_OUTPUT_CODEC;
  readonly applyPeakProtection: boolean;
  readonly voiceover: HeadlessVoiceoverPlan | null;
  readonly music: HeadlessMusicPlan | null;
  /** Captions are visual-only and never appear in this plan. */
  readonly captionsAffectMix: false;
}
