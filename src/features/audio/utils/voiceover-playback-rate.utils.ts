/**
 * Preview playback rate for canonical voiceover MP3.
 *
 * Story speed is encoded once in the canonical generated MP3. It may be native,
 * pitch-preserved, or a provider fallback. Preview must never apply a second
 * `HTMLAudioElement.playbackRate` transform.
 */
export const VOICEOVER_SPEED_ENCODED_IN_CANONICAL_AUDIO = true;
/** @deprecated Compatibility name; speed may now be locally pitch-preserved. */
export const VOICEOVER_SPEED_BAKED_BY_TTS_PROVIDER =
  VOICEOVER_SPEED_ENCODED_IN_CANONICAL_AUDIO;

export interface ResolvePreviewVoiceoverPlaybackRateOptions {
  /** Nominal story speed from voice settings / audio track metadata (UI + stale detection). */
  nominalSpeed?: number;
  /**
   * When true, speed is already encoded in the MP3 and preview playbackRate must be 1.
   * Defaults to {@link VOICEOVER_SPEED_BAKED_BY_TTS_PROVIDER} for OpenAI-generated voiceovers.
   */
  speedAppliedByProvider?: boolean;
}

/** Whether canonical-audio speed should suppress preview playbackRate adjustment. */
export function isVoiceoverSpeedAppliedByProvider(
  speedAppliedByProvider?: boolean,
): boolean {
  return speedAppliedByProvider ?? VOICEOVER_SPEED_BAKED_BY_TTS_PROVIDER;
}

/**
 * Resolves HTMLAudioElement.playbackRate for preview narration playback.
 * Browser speechSynthesis fallback uses utterance.rate separately — not this helper.
 */
export function resolvePreviewVoiceoverPlaybackRate(
  options: ResolvePreviewVoiceoverPlaybackRateOptions = {},
): number {
  if (isVoiceoverSpeedAppliedByProvider(options.speedAppliedByProvider)) {
    return 1;
  }

  const nominalSpeed = options.nominalSpeed;
  if (nominalSpeed != null && Number.isFinite(nominalSpeed) && nominalSpeed > 0) {
    return nominalSpeed;
  }

  return 1;
}
