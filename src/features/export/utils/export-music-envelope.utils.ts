/** Deterministic duck release ramp — avoids step discontinuity at voice end. */
export const EXPORT_DUCKING_RELEASE_MS = 50 as const;

/**
 * Canonical export music-envelope authority (Sprint 11D Phase 2.1).
 *
 * Decision: multiplicative model
 *   gain(t) = baseDuck(t) × fadeInMul(t) × fadeOutMul(t)
 *
 * This matches historical `resolveExportMusicGainAtSec` and the FFmpeg wasm
 * volume expression. The OfflineAudioContext path previously used discrete
 * Web Audio automation (`applyMusicFadeEnvelope`) that diverged when fade-out
 * overlapped an active duck window (fade-out forced fullGain, then voice-end
 * could re-assert full mid-ramp). That edge case is treated as a bug; both
 * browser and headless now sample this pure authority.
 *
 * Typical creator timelines (voice ends before fade-out) were already identical.
 */

/** Minimal envelope inputs shared by browser, headless, and tests. */
export interface ExportMusicEnvelopeInput {
  readonly exportDurationMs: number;
  readonly musicGain: number;
  readonly fadeIn: boolean;
  readonly fadeOut: boolean;
  readonly fadeInSec: number;
  readonly fadeOutSec: number;
  readonly duckingEnabled: boolean;
  readonly duckingStrength: number;
  readonly voiceoverDurationSec: number;
  readonly applyDucking: boolean;
}

function envelopeDurationSec(exportDurationMs: number): number {
  return Math.max(0.001, exportDurationMs / 1000);
}

function duckedGain(musicGain: number, duckingStrength: number): number {
  return Math.max(0, musicGain * duckingStrength);
}

export function toExportMusicEnvelopeInput(settings: {
  readonly exportDurationMs: number;
  readonly musicGain: number;
  readonly fadeIn: boolean;
  readonly fadeOut: boolean;
  readonly fadeInSec: number;
  readonly fadeOutSec: number;
  readonly duckingEnabled: boolean;
  readonly duckingStrength: number;
  readonly voiceoverDurationSec: number;
  readonly applyDucking: boolean;
}): ExportMusicEnvelopeInput {
  return {
    exportDurationMs: settings.exportDurationMs,
    musicGain: settings.musicGain,
    fadeIn: settings.fadeIn,
    fadeOut: settings.fadeOut,
    fadeInSec: settings.fadeInSec,
    fadeOutSec: settings.fadeOutSec,
    duckingEnabled: settings.duckingEnabled,
    duckingStrength: settings.duckingStrength,
    voiceoverDurationSec: settings.voiceoverDurationSec,
    applyDucking: settings.applyDucking,
  };
}

/**
 * Canonical music gain at timeline second `timeSec`.
 * Finite, clamped to [0, duration]; never negative.
 */
export function resolveExportMusicEnvelopeGainAtSec(
  settings: ExportMusicEnvelopeInput,
  timeSec: number,
): number {
  const durationSec = envelopeDurationSec(settings.exportDurationMs);
  if (!Number.isFinite(timeSec)) return 0;
  const clampedTime = Math.min(Math.max(0, timeSec), durationSec);
  const fullGain = Math.max(0, settings.musicGain);

  let baseGain = fullGain;
  if (settings.applyDucking && settings.duckingEnabled && settings.voiceoverDurationSec > 0) {
    const ducked = duckedGain(fullGain, settings.duckingStrength);
    const voiceEnd = Math.min(settings.voiceoverDurationSec, durationSec);
    const rampSec = EXPORT_DUCKING_RELEASE_MS / 1000;
    const releaseStart = Math.max(0, voiceEnd - rampSec);
    if (clampedTime < releaseStart) {
      baseGain = ducked;
    } else if (clampedTime < voiceEnd) {
      const rampProgress = rampSec > 0 ? (clampedTime - releaseStart) / rampSec : 1;
      baseGain = ducked + (fullGain - ducked) * Math.min(1, Math.max(0, rampProgress));
    } else {
      baseGain = fullGain;
    }
  }

  let fadeMultiplier = 1;
  if (settings.fadeIn && settings.fadeInSec > 0 && clampedTime < settings.fadeInSec) {
    fadeMultiplier *= clampedTime / settings.fadeInSec;
  }

  if (settings.fadeOut && settings.fadeOutSec > 0 && durationSec > settings.fadeOutSec) {
    const fadeOutStart = durationSec - settings.fadeOutSec;
    if (clampedTime > fadeOutStart) {
      fadeMultiplier *= Math.max(0, (durationSec - clampedTime) / settings.fadeOutSec);
    }
  }

  const gain = baseGain * fadeMultiplier;
  return Number.isFinite(gain) ? Math.max(0, gain) : 0;
}

/** Dense sample curve for OfflineAudioContext `setValueCurveAtTime`. */
export function sampleExportMusicEnvelopeCurve(
  settings: ExportMusicEnvelopeInput,
  sampleCount: number,
): Float32Array {
  const n = Math.max(2, Math.floor(sampleCount));
  const durationSec = envelopeDurationSec(settings.exportDurationMs);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = (i / (n - 1)) * durationSec;
    curve[i] = resolveExportMusicEnvelopeGainAtSec(settings, t);
  }
  return curve;
}

/** Checkpoint times used by parity fixtures. */
export function exportMusicEnvelopeCheckpointTimesSec(
  settings: ExportMusicEnvelopeInput,
): {
  readonly t0: number;
  readonly fadeInMid: number;
  readonly fadeInEnd: number;
  readonly beforeVoiceEnd: number;
  readonly afterVoiceEnd: number;
  readonly fadeOutStart: number;
  readonly fadeOutMid: number;
  readonly fadeOutEnd: number;
} {
  const durationSec = envelopeDurationSec(settings.exportDurationMs);
  const fadeInSec = settings.fadeIn && settings.fadeInSec > 0 ? settings.fadeInSec : 0;
  const fadeOutSec =
    settings.fadeOut && settings.fadeOutSec > 0 && durationSec > settings.fadeOutSec
      ? settings.fadeOutSec
      : 0;
  const fadeOutStart = fadeOutSec > 0 ? durationSec - fadeOutSec : durationSec;
  const voiceEnd = Math.min(Math.max(0, settings.voiceoverDurationSec), durationSec);
  return {
    t0: 0,
    fadeInMid: fadeInSec > 0 ? fadeInSec / 2 : 0,
    fadeInEnd: fadeInSec,
    beforeVoiceEnd: Math.max(0, voiceEnd - 0.001),
    afterVoiceEnd: Math.min(durationSec, voiceEnd + 0.001),
    fadeOutStart,
    fadeOutMid: fadeOutSec > 0 ? fadeOutStart + fadeOutSec / 2 : durationSec,
    fadeOutEnd: durationSec,
  };
}
