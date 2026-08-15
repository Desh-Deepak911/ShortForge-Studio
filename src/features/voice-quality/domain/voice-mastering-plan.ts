/** Shared, deterministic mastering contract for generated narration exports. */

export const GENERATED_SPEECH_MASTERING_PROFILE = "generated_speech_v1" as const;

export interface VoiceMasteringPlan {
  readonly profile: typeof GENERATED_SPEECH_MASTERING_PROFILE;
  readonly preGain: 3.2;
  readonly compressor: {
    readonly threshold: 0.25;
    readonly ratio: 3;
    readonly attackMs: 5;
    readonly releaseMs: 80;
    readonly makeupGain: 1.7;
  };
  readonly outputGain: 0.75;
  /** Mastering is presentation-only and never changes playback speed. */
  readonly playbackRate: 1;
}

export const GENERATED_SPEECH_MASTERING_PLAN: VoiceMasteringPlan = Object.freeze({
  profile: GENERATED_SPEECH_MASTERING_PROFILE,
  preGain: 3.2,
  compressor: Object.freeze({
    threshold: 0.25,
    ratio: 3,
    attackMs: 5,
    releaseMs: 80,
    makeupGain: 1.7,
  }),
  outputGain: 0.75,
  playbackRate: 1,
});

export function resolveVoiceMasteringPlan(
  profile: string | null | undefined,
): VoiceMasteringPlan | null {
  return profile === GENERATED_SPEECH_MASTERING_PROFILE
    ? GENERATED_SPEECH_MASTERING_PLAN
    : null;
}

/** FFmpeg filter fragment shared by Browser FFmpeg.wasm and native Headless. */
export function buildVoiceMasteringFfmpegFilters(
  plan: VoiceMasteringPlan,
): readonly string[] {
  return Object.freeze([
    `volume=${plan.preGain.toFixed(4)}`,
    `acompressor=threshold=${plan.compressor.threshold}:ratio=${plan.compressor.ratio}:attack=${plan.compressor.attackMs}:release=${plan.compressor.releaseMs}:makeup=${plan.compressor.makeupGain}:knee=1`,
    `volume=${plan.outputGain.toFixed(4)}`,
  ]);
}
