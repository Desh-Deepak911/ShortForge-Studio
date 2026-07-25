/**
 * Sprint 11E Phase 2E.2D.8K.4.1 — in-process Node /proc sampler core.
 * No per-sample shell subprocesses. Privacy-safe cadence distribution only.
 */

import {
  classifyHosted4kSamplingCompleteness,
  classifyHosted4kWorkerTreeCorrelation,
  HOSTED_4K_PROCESS_TREE_REQUESTED_INTERVAL_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
  type Hosted4kProcessTreeSamplingCompletenessClass,
  type Hosted4kProcessTreeWorkerCorrelationClass,
} from "./hosted-render-machine-process-tree-cadence";

export const HOSTED_4K_NODE_SAMPLER_MECHANISM =
  "node_persistent_in_process_proc_walk" as const;

export const HOSTED_4K_SHELL_SAMPLER_MECHANISM =
  "shell_subprocess_per_sample_loop" as const;

export const HOSTED_4K_SAMPLER_OBSERVATION_WINDOW_STARTUP_EXCLUSION_MS = 2_000 as const;

export type Hosted4kMaxGapContextClass =
  | "startup_excluded"
  | "in_window_peak_load"
  | "profile_transition"
  | "stop_request"
  | "summary_finalization_excluded"
  | "unknown";

export type Hosted4kCgroupReconciliationClass =
  | "reconciled"
  | "unavailable"
  | "irreconcilable";

export type Hosted4kCadenceDistribution = {
  readonly intervalP50Ms: number | null;
  readonly intervalP95Ms: number | null;
  readonly intervalP99Ms: number | null;
  readonly gapsOver400Ms: number;
  readonly gapsOver1000Ms: number;
  readonly maximumGapMs: number | null;
};

export type Hosted4kNodeSamplerTickResult = {
  readonly workerRootFound: boolean;
  readonly observerExcluded: boolean;
  readonly summedKb: number;
  readonly treeCount: number;
  readonly gapMs: number | null;
  readonly windowActive: boolean;
};

export type Hosted4kNodeSamplerState = {
  readonly observerPid: number;
  readonly requestedIntervalMs: number;
  readonly startupExclusionMs: number;
  startMonoMs: number;
  sampleCount: number;
  peakKb: number;
  lastKb: number;
  malformed: number;
  workerMiss: number;
  workerTreeSeen: boolean;
  windowOpen: boolean;
  windowOpenedMonoMs: number | null;
  lastSampleMonoMs: number | null;
  inWindowGaps: number[];
  maxGapMs: number;
  maxGapIndex: number | null;
  rssBeforeMaxGapKb: number | null;
  rssAfterMaxGapKb: number | null;
  lastSummedKbBeforeGap: number | null;
  stopRequested: boolean;
};

export type Hosted4kNodeSamplerSummaryPayload = {
  readonly finalized: true;
  readonly summary_version: 2;
  readonly measurement_class: "process_tree_memory";
  readonly completeness_class: Hosted4kProcessTreeSamplingCompletenessClass;
  readonly requested_interval_ms: number;
  readonly sample_count: number;
  readonly observation_duration_ms: number;
  readonly observation_window_sample_count: number;
  readonly average_interval_ms: number | null;
  readonly maximum_observed_gap_ms: number | null;
  readonly interval_p50_ms: number | null;
  readonly interval_p95_ms: number | null;
  readonly interval_p99_ms: number | null;
  readonly gaps_over_400_ms: number;
  readonly gaps_over_1000_ms: number;
  readonly peak_summed_rss_bytes: number;
  readonly last_summed_rss_bytes: number;
  readonly malformed_sample_count: number;
  readonly worker_tree_correlation_class: Hosted4kProcessTreeWorkerCorrelationClass;
  readonly observer_excluded: boolean;
  readonly oom_or_restart_observed: boolean;
  readonly worker_root_miss_count: number;
  readonly max_gap_context_class: Hosted4kMaxGapContextClass;
  readonly rss_bytes_before_max_gap: number | null;
  readonly rss_bytes_after_max_gap: number | null;
  readonly cgroup_peak_bytes: number | null;
  readonly cgroup_measurement_class: "cgroup_v2_memory_peak_corroborating" | null;
  readonly cgroup_reconciliation_class: Hosted4kCgroupReconciliationClass;
  readonly sampler_mechanism: typeof HOSTED_4K_NODE_SAMPLER_MECHANISM;
};

export type Hosted4kProcFsPort = {
  readonly observerPid: number;
  monoMs(): number;
  listPids(): readonly number[];
  ppidOf(pid: number): number;
  rssKb(pid: number): number;
  cmdline(pid: number): string;
  readCgroupPeakBytes(): number | null;
};

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export function computeHosted4kCadenceDistribution(
  gaps: readonly number[],
): Hosted4kCadenceDistribution {
  if (gaps.length === 0) {
    return Object.freeze({
      intervalP50Ms: null,
      intervalP95Ms: null,
      intervalP99Ms: null,
      gapsOver400Ms: 0,
      gapsOver1000Ms: 0,
      maximumGapMs: null,
    });
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  return Object.freeze({
    intervalP50Ms: percentile(sorted, 50),
    intervalP95Ms: percentile(sorted, 95),
    intervalP99Ms: percentile(sorted, 99),
    gapsOver400Ms: gaps.filter((g) => g > 400).length,
    gapsOver1000Ms: gaps.filter((g) => g > 1000).length,
    maximumGapMs: sorted[sorted.length - 1] ?? null,
  });
}

export function createHosted4kNodeSamplerState(input: {
  readonly observerPid: number;
  readonly requestedIntervalMs?: number;
  readonly startupExclusionMs?: number;
  readonly startMonoMs: number;
}): Hosted4kNodeSamplerState {
  return {
    observerPid: input.observerPid,
    requestedIntervalMs:
      input.requestedIntervalMs ?? HOSTED_4K_PROCESS_TREE_REQUESTED_INTERVAL_MS,
    startupExclusionMs:
      input.startupExclusionMs ??
      HOSTED_4K_SAMPLER_OBSERVATION_WINDOW_STARTUP_EXCLUSION_MS,
    startMonoMs: input.startMonoMs,
    sampleCount: 0,
    peakKb: 0,
    lastKb: 0,
    malformed: 0,
    workerMiss: 0,
    workerTreeSeen: false,
    windowOpen: false,
    windowOpenedMonoMs: null,
    lastSampleMonoMs: null,
    inWindowGaps: [],
    maxGapMs: 0,
    maxGapIndex: null,
    rssBeforeMaxGapKb: null,
    rssAfterMaxGapKb: null,
    lastSummedKbBeforeGap: null,
    stopRequested: false,
  };
}

function inObserverTree(
  pid: number,
  observerPid: number,
  ppidOf: (p: number) => number,
): boolean {
  let current = pid;
  while (current > 0) {
    if (current === observerPid) return true;
    current = ppidOf(current);
  }
  return false;
}

export function findHosted4kWorkerRoot(proc: Hosted4kProcFsPort): number {
  for (const pid of proc.listPids()) {
    if (pid === proc.observerPid) continue;
    const cmd = proc.cmdline(pid);
    if (cmd.includes("hosted-worker") || cmd.includes("headless-worker")) {
      return pid;
    }
  }
  for (const pid of proc.listPids()) {
    if (proc.ppidOf(pid) !== 1) continue;
    const cmd = proc.cmdline(pid);
    if (cmd.includes("node")) return pid;
  }
  return 0;
}

export function sumHosted4kWorkerTree(
  root: number,
  proc: Hosted4kProcFsPort,
): { readonly summedKb: number; readonly treeCount: number } {
  if (root <= 0) return { summedKb: 0, treeCount: 0 };
  const ppidMap = new Map<number, number>();
  for (const pid of proc.listPids()) {
    ppidMap.set(pid, proc.ppidOf(pid));
  }
  const children = new Map<number, number[]>();
  for (const [pid, ppid] of ppidMap) {
    const list = children.get(ppid);
    if (list != null) list.push(pid);
    else children.set(ppid, [pid]);
  }
  let summed = 0;
  let count = 0;
  const seen = new Set<number>();
  const stack = [root];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    if (inObserverTree(pid, proc.observerPid, (p) => ppidMap.get(p) ?? 0)) {
      continue;
    }
    const kb = proc.rssKb(pid);
    if (kb > 0) {
      summed += kb;
      count += 1;
    }
    for (const child of children.get(pid) ?? []) {
      if (!seen.has(child)) stack.push(child);
    }
  }
  return { summedKb: summed, treeCount: count };
}

function maybeOpenObservationWindow(
  state: Hosted4kNodeSamplerState,
  monoMs: number,
): void {
  if (state.windowOpen) return;
  if (monoMs - state.startMonoMs < state.startupExclusionMs) return;
  state.windowOpen = true;
  state.windowOpenedMonoMs = monoMs;
}

function recordInWindowGap(state: Hosted4kNodeSamplerState, gapMs: number): void {
  if (!state.windowOpen || state.stopRequested) return;
  state.inWindowGaps.push(gapMs);
  if (gapMs > state.maxGapMs) {
    state.maxGapMs = gapMs;
    state.maxGapIndex = state.inWindowGaps.length - 1;
    state.rssBeforeMaxGapKb = state.lastSummedKbBeforeGap;
    state.rssAfterMaxGapKb = state.lastKb;
  }
}

export function tickHosted4kNodeSampler(input: {
  readonly state: Hosted4kNodeSamplerState;
  readonly proc: Hosted4kProcFsPort;
}): Hosted4kNodeSamplerTickResult {
  const { state, proc } = input;
  const loopMono = proc.monoMs();
  maybeOpenObservationWindow(state, loopMono);

  const root = findHosted4kWorkerRoot(proc);
  if (root <= 0) {
    state.workerMiss += 1;
    return {
      workerRootFound: false,
      observerExcluded: true,
      summedKb: 0,
      treeCount: 0,
      gapMs: null,
      windowActive: state.windowOpen && !state.stopRequested,
    };
  }

  const tree = sumHosted4kWorkerTree(root, proc);
  if (tree.treeCount === 0) {
    state.workerMiss += 1;
    return {
      workerRootFound: true,
      observerExcluded: false,
      summedKb: 0,
      treeCount: 0,
      gapMs: null,
      windowActive: state.windowOpen && !state.stopRequested,
    };
  }

  state.workerTreeSeen = true;
  maybeOpenObservationWindow(state, loopMono);

  let gapMs: number | null = null;
  if (state.lastSampleMonoMs != null && state.windowOpen && !state.stopRequested) {
    gapMs = loopMono - state.lastSampleMonoMs;
    state.lastSummedKbBeforeGap = state.lastKb;
    recordInWindowGap(state, gapMs);
  }

  state.lastSampleMonoMs = loopMono;
  state.sampleCount += 1;
  state.lastKb = tree.summedKb;
  if (tree.summedKb > state.peakKb) state.peakKb = tree.summedKb;

  return {
    workerRootFound: true,
    observerExcluded: true,
    summedKb: tree.summedKb,
    treeCount: tree.treeCount,
    gapMs,
    windowActive: state.windowOpen && !state.stopRequested,
  };
}

export function markHosted4kNodeSamplerStopRequested(
  state: Hosted4kNodeSamplerState,
): void {
  state.stopRequested = true;
}

export function reconcileHosted4kCgroupPeak(input: {
  readonly peakSummedRssBytes: number;
  readonly cgroupPeakBytes: number | null;
}): Hosted4kCgroupReconciliationClass {
  if (input.cgroupPeakBytes == null || input.cgroupPeakBytes <= 0) {
    return "unavailable";
  }
  if (input.cgroupPeakBytes < input.peakSummedRssBytes) {
    return "irreconcilable";
  }
  if (input.cgroupPeakBytes > input.peakSummedRssBytes * 8) {
    return "irreconcilable";
  }
  return "reconciled";
}

export function classifyHosted4kMaxGapContext(input: {
  readonly maxGapMs: number | null;
  readonly maxGapIndex: number | null;
  readonly inWindowGapCount: number;
  readonly stopRequested: boolean;
  readonly windowOpened: boolean;
}): Hosted4kMaxGapContextClass {
  if (input.maxGapMs == null || input.maxGapIndex == null) return "unknown";
  if (!input.windowOpened) return "startup_excluded";
  if (input.stopRequested && input.maxGapIndex === input.inWindowGapCount - 1) {
    return "summary_finalization_excluded";
  }
  if (input.maxGapMs > 1000) return "in_window_peak_load";
  return "unknown";
}

export function finalizeHosted4kNodeSamplerSummary(input: {
  readonly state: Hosted4kNodeSamplerState;
  readonly endMonoMs: number;
  readonly cgroupPeakBytes?: number | null;
  readonly maxGapContextOverride?: Hosted4kMaxGapContextClass;
}): Hosted4kNodeSamplerSummaryPayload {
  const { state } = input;
  const observationDurationMs = Math.max(0, input.endMonoMs - state.startMonoMs);
  const dist = computeHosted4kCadenceDistribution(state.inWindowGaps);
  const averageIntervalMs =
    state.inWindowGaps.length > 0
      ? Math.round(
          state.inWindowGaps.reduce((a, b) => a + b, 0) / state.inWindowGaps.length,
        )
      : state.sampleCount > 1 && observationDurationMs > 0
        ? Math.round(observationDurationMs / (state.sampleCount - 1))
        : null;

  const workerTreeCorrelationClass = classifyHosted4kWorkerTreeCorrelation({
    workerRootFound: state.workerTreeSeen,
    observerExcluded: true,
    temporarilyUncorrelated: state.workerMiss > 0 && state.sampleCount > 0,
  });

  const completenessClass = classifyHosted4kSamplingCompleteness({
    sampleCount: state.sampleCount,
    observationDurationMs,
    requestedDurationMs: observationDurationMs,
    averageIntervalMs,
    maximumObservedGapMs: dist.maximumGapMs,
    malformedSampleCount: state.malformed,
    workerTreeCorrelationClass,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });

  const peakSummedRssBytes = state.peakKb * 1024;
  const cgroupPeakBytes = input.cgroupPeakBytes ?? null;
  const cgroupReconciliation = reconcileHosted4kCgroupPeak({
    peakSummedRssBytes,
    cgroupPeakBytes,
  });

  const maxGapContext =
    input.maxGapContextOverride ??
    classifyHosted4kMaxGapContext({
      maxGapMs: dist.maximumGapMs,
      maxGapIndex: state.maxGapIndex,
      inWindowGapCount: state.inWindowGaps.length,
      stopRequested: state.stopRequested,
      windowOpened: state.windowOpen,
    });

  return Object.freeze({
    finalized: true,
    summary_version: 2,
    measurement_class: "process_tree_memory",
    completeness_class: completenessClass,
    requested_interval_ms: state.requestedIntervalMs,
    sample_count: state.sampleCount,
    observation_duration_ms: observationDurationMs,
    observation_window_sample_count: state.inWindowGaps.length + 1,
    average_interval_ms: averageIntervalMs,
    maximum_observed_gap_ms: dist.maximumGapMs,
    interval_p50_ms: dist.intervalP50Ms,
    interval_p95_ms: dist.intervalP95Ms,
    interval_p99_ms: dist.intervalP99Ms,
    gaps_over_400_ms: dist.gapsOver400Ms,
    gaps_over_1000_ms: dist.gapsOver1000Ms,
    peak_summed_rss_bytes: peakSummedRssBytes,
    last_summed_rss_bytes: state.lastKb * 1024,
    malformed_sample_count: state.malformed,
    worker_tree_correlation_class: workerTreeCorrelationClass,
    observer_excluded: true,
    oom_or_restart_observed: false,
    worker_root_miss_count: state.workerMiss,
    max_gap_context_class: maxGapContext,
    rss_bytes_before_max_gap:
      state.rssBeforeMaxGapKb != null ? state.rssBeforeMaxGapKb * 1024 : null,
    rss_bytes_after_max_gap:
      state.rssAfterMaxGapKb != null ? state.rssAfterMaxGapKb * 1024 : null,
    cgroup_peak_bytes: cgroupPeakBytes,
    cgroup_measurement_class:
      cgroupPeakBytes != null ? "cgroup_v2_memory_peak_corroborating" : null,
    cgroup_reconciliation_class: cgroupReconciliation,
    sampler_mechanism: HOSTED_4K_NODE_SAMPLER_MECHANISM,
  });
}
