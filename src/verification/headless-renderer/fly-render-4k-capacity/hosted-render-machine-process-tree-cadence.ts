/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — cadence evidence and acceptance thresholds.
 * Never retains raw timestamps, PIDs, argv, or environment values.
 */

export const HOSTED_4K_PROCESS_TREE_REQUESTED_INTERVAL_MS = 250 as const;

export const HOSTED_4K_SAMPLER_PREFLIGHT_DURATION_MS = 10_000 as const;
export const HOSTED_4K_SAMPLER_PREFLIGHT_TARGET_SAMPLES = 40 as const;
export const HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES = 30 as const;
export const HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS = 400 as const;
export const HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS = 1_000 as const;

export type Hosted4kProcessTreeSamplingCompletenessClass =
  | "complete"
  | "insufficient_sample_count"
  | "excessive_average_interval"
  | "excessive_maximum_gap"
  | "early_termination"
  | "worker_root_absent"
  | "observer_only_tree"
  | "malformed_samples"
  | "measurement_incomplete";

export type Hosted4kProcessTreeWorkerCorrelationClass =
  | "worker_tree_correlated"
  | "worker_root_absent"
  | "observer_only_tree"
  | "temporarily_uncorrelated";

export type Hosted4kProcessTreeSamplingCadenceEvidence = {
  readonly requestedIntervalMs: number;
  readonly observedSampleCount: number;
  readonly observationDurationMs: number;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly samplingCompletenessClass: Hosted4kProcessTreeSamplingCompletenessClass;
  readonly workerTreeCorrelationClass: Hosted4kProcessTreeWorkerCorrelationClass;
  readonly malformedSampleCount: number;
};

export function classifyHosted4kWorkerTreeCorrelation(input: {
  readonly workerRootFound: boolean;
  readonly observerExcluded: boolean;
  readonly temporarilyUncorrelated?: boolean;
}): Hosted4kProcessTreeWorkerCorrelationClass {
  if (!input.workerRootFound) return "worker_root_absent";
  if (!input.observerExcluded) return "observer_only_tree";
  if (input.temporarilyUncorrelated === true) return "temporarily_uncorrelated";
  return "worker_tree_correlated";
}

export function classifyHosted4kSamplingCompleteness(input: {
  readonly sampleCount: number;
  readonly observationDurationMs: number;
  readonly requestedDurationMs: number;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly malformedSampleCount: number;
  readonly workerTreeCorrelationClass: Hosted4kProcessTreeWorkerCorrelationClass;
  readonly minSamples?: number;
  readonly maxAverageIntervalMs?: number;
  readonly maxGapMs?: number;
}): Hosted4kProcessTreeSamplingCompletenessClass {
  if (input.malformedSampleCount > 0) return "malformed_samples";
  if (input.workerTreeCorrelationClass === "worker_root_absent") {
    return "worker_root_absent";
  }
  if (input.workerTreeCorrelationClass === "observer_only_tree") {
    return "observer_only_tree";
  }
  const minSamples = input.minSamples ?? 1;
  if (input.sampleCount < minSamples) return "insufficient_sample_count";
  if (
    input.averageIntervalMs != null &&
    input.maxAverageIntervalMs != null &&
    input.averageIntervalMs > input.maxAverageIntervalMs
  ) {
    return "excessive_average_interval";
  }
  if (
    input.maximumObservedGapMs != null &&
    input.maxGapMs != null &&
    input.maximumObservedGapMs > input.maxGapMs
  ) {
    return "excessive_maximum_gap";
  }
  if (input.observationDurationMs + 250 < input.requestedDurationMs) {
    return "early_termination";
  }
  if (input.workerTreeCorrelationClass === "temporarily_uncorrelated") {
    return "measurement_incomplete";
  }
  return "complete";
}

export function buildHosted4kProcessTreeSamplingCadenceEvidence(input: {
  readonly requestedIntervalMs: number;
  readonly sampleCount: number;
  readonly observationDurationMs: number;
  readonly gapMs: readonly number[];
  readonly observedAverageIntervalMs?: number | null;
  readonly observedMaximumGapMs?: number | null;
  readonly malformedSampleCount: number;
  readonly workerRootFound: boolean;
  readonly observerExcluded: boolean;
  readonly temporarilyUncorrelated?: boolean;
  readonly requestedDurationMs?: number;
  readonly minSamples?: number;
  readonly maxAverageIntervalMs?: number;
  readonly maxGapMs?: number;
}): Hosted4kProcessTreeSamplingCadenceEvidence {
  const averageIntervalMs =
    input.gapMs.length > 0
      ? Math.round(
          input.gapMs.reduce((a, b) => a + b, 0) / input.gapMs.length,
        )
      : input.observedAverageIntervalMs != null &&
          Number.isFinite(input.observedAverageIntervalMs)
        ? Math.round(input.observedAverageIntervalMs)
        : input.sampleCount > 1 && input.observationDurationMs > 0
          ? Math.round(input.observationDurationMs / (input.sampleCount - 1))
          : null;
  const maximumObservedGapMs =
    input.gapMs.length > 0
      ? Math.max(...input.gapMs)
      : input.observedMaximumGapMs != null &&
          Number.isFinite(input.observedMaximumGapMs)
        ? Math.round(input.observedMaximumGapMs)
        : null;
  const workerTreeCorrelationClass = classifyHosted4kWorkerTreeCorrelation({
    workerRootFound: input.workerRootFound,
    observerExcluded: input.observerExcluded,
    temporarilyUncorrelated: input.temporarilyUncorrelated,
  });
  const samplingCompletenessClass = classifyHosted4kSamplingCompleteness({
    sampleCount: input.sampleCount,
    observationDurationMs: input.observationDurationMs,
    requestedDurationMs:
      input.requestedDurationMs ?? input.observationDurationMs,
    averageIntervalMs,
    maximumObservedGapMs,
    malformedSampleCount: input.malformedSampleCount,
    workerTreeCorrelationClass,
    minSamples: input.minSamples,
    maxAverageIntervalMs: input.maxAverageIntervalMs,
    maxGapMs: input.maxGapMs,
  });
  return Object.freeze({
    requestedIntervalMs: input.requestedIntervalMs,
    observedSampleCount: input.sampleCount,
    observationDurationMs: input.observationDurationMs,
    averageIntervalMs,
    maximumObservedGapMs,
    samplingCompletenessClass,
    workerTreeCorrelationClass,
    malformedSampleCount: input.malformedSampleCount,
  });
}

export function evaluateHosted4kSamplerPreflightCadenceAcceptance(input: {
  readonly cadence: Hosted4kProcessTreeSamplingCadenceEvidence;
  readonly peakProcessTreeRssBytes: number | null;
}): { readonly ok: true } | { readonly ok: false; readonly failClass: string } {
  const c = input.cadence;
  if (c.observedSampleCount < HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES) {
    return { ok: false, failClass: "preflight_insufficient_sample_count" };
  }
  if (
    c.averageIntervalMs != null &&
    c.averageIntervalMs > HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS
  ) {
    return { ok: false, failClass: "preflight_excessive_average_interval" };
  }
  if (
    c.maximumObservedGapMs != null &&
    c.maximumObservedGapMs > HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS
  ) {
    return { ok: false, failClass: "preflight_excessive_maximum_gap" };
  }
  if (c.workerTreeCorrelationClass !== "worker_tree_correlated") {
    return { ok: false, failClass: "preflight_worker_tree_not_correlated" };
  }
  if (c.samplingCompletenessClass !== "complete") {
    return { ok: false, failClass: `preflight_${c.samplingCompletenessClass}` };
  }
  if (c.malformedSampleCount !== 0) {
    return { ok: false, failClass: "preflight_malformed_samples" };
  }
  if (
    input.peakProcessTreeRssBytes == null ||
    input.peakProcessTreeRssBytes <= 0
  ) {
    return { ok: false, failClass: "preflight_peak_rss_unreadable" };
  }
  return { ok: true };
}
