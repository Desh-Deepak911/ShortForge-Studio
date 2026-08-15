/**
 * Provider-free voice export quality assessment.
 *
 * This contract is advisory by design: weak audio must remain exportable while
 * creator-facing diagnostics distinguish mastering, cadence, and transport
 * failures. It does not select a provider, voice, topic, or narration style.
 */

export const VOICE_EXPORT_TARGET_LUFS = -16;
export const VOICE_EXPORT_READY_MIN_LUFS = -18;
export const VOICE_EXPORT_READY_MAX_LUFS = -14;
export const VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP = -1;
export const VOICE_EXPORT_TRANSPORT_GAP_MS = 5;

const PAUSE_HEAVY_SILENCE_SHARE = 0.18;
const PAUSE_HEAVY_LONGEST_SILENCE_MS = 400;
const PAUSE_HEAVY_MIN_SILENCE_COUNT = 3;
const FAST_VOICE_SPEED = 1.2;

export type VoiceLoudnessClass =
  | "unknown"
  | "too_quiet"
  | "creator_ready"
  | "too_hot";

export type VoiceTransportClass =
  | "unknown"
  | "continuous"
  | "packet_gap";

export type VoiceCadenceClass =
  | "unknown"
  | "continuous"
  | "pause_heavy";

export interface VoiceExportQualityMetrics {
  readonly integratedLufs?: number | null;
  readonly truePeakDbtp?: number | null;
  readonly durationSec?: number | null;
  readonly maximumPacketGapMs?: number | null;
  readonly detectedSilenceCount?: number | null;
  readonly detectedSilenceDurationSec?: number | null;
  readonly longestDetectedSilenceMs?: number | null;
  readonly sourceVoiceSpeed?: number | null;
}

export type VoiceExportQualityReason =
  | "integrated_loudness_below_creator_range"
  | "integrated_loudness_above_creator_range"
  | "true_peak_above_safe_ceiling"
  | "transport_packet_gap"
  | "pause_heavy_cadence"
  | "fast_speed_with_pause_heavy_cadence";

export interface VoiceExportQualityAssessment {
  readonly loudnessClass: VoiceLoudnessClass;
  readonly transportClass: VoiceTransportClass;
  readonly cadenceClass: VoiceCadenceClass;
  readonly reasons: readonly VoiceExportQualityReason[];
  readonly silenceShare: number | null;
  readonly targetIntegratedLufs: typeof VOICE_EXPORT_TARGET_LUFS;
  readonly truePeakCeilingDbtp: typeof VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP;
  /** Audio quality never becomes an export terminal in this contract. */
  readonly blocksExport: false;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function classifyLoudness(value: number | null | undefined): VoiceLoudnessClass {
  if (!finite(value)) return "unknown";
  if (value < VOICE_EXPORT_READY_MIN_LUFS) return "too_quiet";
  if (value > VOICE_EXPORT_READY_MAX_LUFS) return "too_hot";
  return "creator_ready";
}

function classifyTransport(value: number | null | undefined): VoiceTransportClass {
  if (!finite(value)) return "unknown";
  return value > VOICE_EXPORT_TRANSPORT_GAP_MS ? "packet_gap" : "continuous";
}

function resolveSilenceShare(metrics: VoiceExportQualityMetrics): number | null {
  if (
    !finite(metrics.durationSec) ||
    metrics.durationSec <= 0 ||
    !finite(metrics.detectedSilenceDurationSec) ||
    metrics.detectedSilenceDurationSec < 0
  ) {
    return null;
  }
  return Math.min(1, metrics.detectedSilenceDurationSec / metrics.durationSec);
}

function classifyCadence(
  metrics: VoiceExportQualityMetrics,
  silenceShare: number | null,
): VoiceCadenceClass {
  if (
    silenceShare == null ||
    !finite(metrics.detectedSilenceCount) ||
    !finite(metrics.longestDetectedSilenceMs)
  ) {
    return "unknown";
  }

  return silenceShare >= PAUSE_HEAVY_SILENCE_SHARE &&
    metrics.detectedSilenceCount >= PAUSE_HEAVY_MIN_SILENCE_COUNT &&
    metrics.longestDetectedSilenceMs >= PAUSE_HEAVY_LONGEST_SILENCE_MS
    ? "pause_heavy"
    : "continuous";
}

/** Classify measured output without rejecting generation or export. */
export function assessVoiceExportQuality(
  metrics: VoiceExportQualityMetrics,
): VoiceExportQualityAssessment {
  const loudnessClass = classifyLoudness(metrics.integratedLufs);
  const transportClass = classifyTransport(metrics.maximumPacketGapMs);
  const silenceShare = resolveSilenceShare(metrics);
  const cadenceClass = classifyCadence(metrics, silenceShare);
  const reasons: VoiceExportQualityReason[] = [];

  if (loudnessClass === "too_quiet") {
    reasons.push("integrated_loudness_below_creator_range");
  } else if (loudnessClass === "too_hot") {
    reasons.push("integrated_loudness_above_creator_range");
  }
  if (
    finite(metrics.truePeakDbtp) &&
    metrics.truePeakDbtp > VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP
  ) {
    reasons.push("true_peak_above_safe_ceiling");
  }
  if (transportClass === "packet_gap") {
    reasons.push("transport_packet_gap");
  }
  if (cadenceClass === "pause_heavy") {
    reasons.push("pause_heavy_cadence");
    if (finite(metrics.sourceVoiceSpeed) && metrics.sourceVoiceSpeed >= FAST_VOICE_SPEED) {
      reasons.push("fast_speed_with_pause_heavy_cadence");
    }
  }

  return {
    loudnessClass,
    transportClass,
    cadenceClass,
    reasons,
    silenceShare,
    targetIntegratedLufs: VOICE_EXPORT_TARGET_LUFS,
    truePeakCeilingDbtp: VOICE_EXPORT_TRUE_PEAK_CEILING_DBTP,
    blocksExport: false,
  };
}
