import type { MasterMixSettings, ResolvedAudioMixSettings } from "./audio-mixer.types";

/** Stem gain above unity triggers automatic peak protection (v1). */
export const PEAK_PROTECTION_GAIN_THRESHOLD = 1;

/** Target ceiling for FFmpeg alimiter and preview compressor (linear ~ -0.17 dB). */
export const PEAK_PROTECTION_OUTPUT_CEILING = 0.98;

/** FFmpeg alimiter filter applied when peak protection is active. */
export const EXPORT_FFMPEG_PEAK_LIMITER_FILTER = `alimiter=limit=${PEAK_PROTECTION_OUTPUT_CEILING}:attack=5:release=50:level=false`;

export interface PeakProtectionContext {
  master: MasterMixSettings;
  voiceStemGain: number;
  musicStemGain: number;
}

/** True when preview/export should apply peak protection/limiting. */
export function shouldApplyPeakProtection(context: PeakProtectionContext): boolean {
  return (
    context.master.peakProtection ||
    context.master.limiterEnabled ||
    context.voiceStemGain > PEAK_PROTECTION_GAIN_THRESHOLD ||
    context.musicStemGain > PEAK_PROTECTION_GAIN_THRESHOLD
  );
}

export function resolvePeakProtectionFromMixer(
  mixer: ResolvedAudioMixSettings,
  voiceStemGain: number,
  musicStemGain: number,
): boolean {
  return shouldApplyPeakProtection({
    master: mixer.master,
    voiceStemGain,
    musicStemGain,
  });
}

/** Builds FFmpeg filter segment: `[input]alimiter...[output]`. */
export function buildExportFfmpegPeakLimiterFilterChain(
  inputLabel: string,
  outputLabel: string,
): string {
  return `[${inputLabel}]${EXPORT_FFMPEG_PEAK_LIMITER_FILTER}[${outputLabel}]`;
}

/** Fallback when limiter unavailable — caps linear gain (does not prevent inter-sample peaks). */
export function buildExportFfmpegPeakVolumeCapFilterChain(
  inputLabel: string,
  outputLabel: string,
  cap = PEAK_PROTECTION_OUTPUT_CEILING,
): string {
  return `[${inputLabel}]volume=${cap.toFixed(4)}[${outputLabel}]`;
}

/** Configures a Web Audio dynamics compressor for safe preview output limiting. */
export function configurePreviewPeakProtectionCompressor(
  compressor: DynamicsCompressorNode,
): void {
  compressor.threshold.value = -6;
  compressor.knee.value = 3;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
}

export interface PreviewSafeOutputGainReport {
  stemGain: number;
  peakProtectionActive: boolean;
  /** Approximate linear output ceiling when protection is active. */
  safeOutputCeiling: number | null;
}

/** Describes preview voice output — stem gain is unchanged; limiter caps peaks when active. */
export function resolvePreviewSafeVoiceOutputGain(
  stemGain: number,
  peakProtectionActive: boolean,
): PreviewSafeOutputGainReport {
  return {
    stemGain,
    peakProtectionActive,
    safeOutputCeiling: peakProtectionActive ? PEAK_PROTECTION_OUTPUT_CEILING : null,
  };
}
