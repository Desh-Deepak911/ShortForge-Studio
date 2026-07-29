/**
 * Normalized export audio mix plan (Sprint 11E 2G.24D).
 * Runtime-agnostic authority consumed by Browser and Headless adapters.
 */

export const EXPORT_AUDIO_MIX_TARGET_SAMPLE_RATE_HZ = 48_000 as const;
export const EXPORT_AUDIO_MIX_TARGET_CHANNELS = 2 as const;

export type ExportAudioMixCombination =
  | "silent"
  | "voiceover"
  | "music"
  | "voiceover+music";

export interface ExportAudioMixVoicePlan {
  readonly sourceTrimStartMs: number;
  readonly sourceTrimEndMs: number;
  readonly timelineStartMs: number;
  readonly requireDelayMs: number;
  readonly sourceDurationMs: number;
  readonly volumeGain: number;
  readonly padToOutputMs: number;
}

export interface ExportAudioMixMusicPlan {
  readonly timelineStartMs: number;
  readonly requireDelayMs: number;
  readonly looping: true;
  readonly loopUntilOutputMs: number;
  readonly volumeGain: number;
  readonly duckedVolumeGain: number;
  readonly applyDucking: boolean;
  readonly duckUntilMs: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

/** Deterministic mix authority — no FFmpeg/runtime specifics. */
export interface ExportAudioMixPlan {
  readonly combination: ExportAudioMixCombination;
  readonly outputDurationMs: number;
  readonly outputDurationSec: number;
  readonly sampleRateHz: typeof EXPORT_AUDIO_MIX_TARGET_SAMPLE_RATE_HZ;
  readonly channels: typeof EXPORT_AUDIO_MIX_TARGET_CHANNELS;
  readonly applyPeakProtection: boolean;
  readonly limiterRequired: boolean;
  readonly mixOrder: "amix-voice-first-duration-first";
  readonly voiceover: ExportAudioMixVoicePlan | null;
  readonly music: ExportAudioMixMusicPlan | null;
  /** Visual transitions and captions never alter this plan. */
  readonly captionsAffectMix: false;
}
