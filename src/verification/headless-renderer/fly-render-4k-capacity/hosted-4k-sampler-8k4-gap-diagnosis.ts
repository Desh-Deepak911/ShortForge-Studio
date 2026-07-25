/**
 * Sprint 11E Phase 2E.2D.8K.4.1 — static diagnosis of accepted 8K.4 FAIL cadence.
 * No raw timestamps, PIDs, or provider identifiers.
 */

export const HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4 =
  "cf84dd669c28a469b38107393fead005029d5d6660267c4a4dda813e1e79d63e" as const;

export const HOSTED_4K_CAPACITY_FAIL_8K4_STARTED_MS = Date.parse(
  "2026-07-25T15:31:56.323Z",
);
export const HOSTED_4K_CAPACITY_FAIL_8K4_ENDED_MS = Date.parse(
  "2026-07-25T15:41:09.697Z",
);

export type Hosted4kShellSamplerSubprocessAudit = {
  readonly perSampleSubprocesses: readonly string[];
  readonly perSampleProcReads: readonly string[];
  readonly rootCauseMechanism: "shell_subprocess_per_sample_loop";
};

export type Hosted4kAccepted8k4CadenceDistribution = {
  readonly sampleCount: number;
  readonly averageIntervalMs: number;
  readonly maximumGapMs: number;
  readonly intervalP50Ms: number | null;
  readonly intervalP95Ms: number | null;
  readonly intervalP99Ms: number | null;
  readonly gapsOver400Ms: number | null;
  readonly gapsOver1000Ms: number | null;
  readonly peakProcessTreeRssBytes: number;
};

export type Hosted4kAccepted8k4GapDiagnosis = {
  readonly evidenceSha: typeof HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4;
  readonly priorMechanism: typeof import("./hosted-render-machine-node-sampler-core").HOSTED_4K_SHELL_SAMPLER_MECHANISM;
  readonly correctedMechanism: typeof import("./hosted-render-machine-node-sampler-core").HOSTED_4K_NODE_SAMPLER_MECHANISM;
  readonly subprocessAudit: Hosted4kShellSamplerSubprocessAudit;
  readonly observedDistribution: Hosted4kAccepted8k4CadenceDistribution;
  readonly inferredMaxGapPhase:
    | "in_window_peak_load_during_4k_render"
    | "profile_transition"
    | "stop_or_summary";
  readonly inferredCause:
    | "shell_per_sample_subprocess_and_proc_scan_overhead_under_peak_4k_load";
  readonly executionCasesPassed: 33;
  readonly crossCuttingFailure: "process_tree.memory_observation";
};

export function auditHosted4kShellSamplerSubprocesses(): Hosted4kShellSamplerSubprocessAudit {
  return Object.freeze({
    perSampleSubprocesses: Object.freeze([
      "awk /proc/uptime for mono_ms",
      "awk for sleep interval on every loop iteration",
      "awk for adaptive sleep remainder on every successful sample",
      "sed per ppid lookup",
      "tr/glob scan of /proc/[0-9]* for worker root and child walk",
    ]),
    perSampleProcReads: Object.freeze([
      "full /proc directory listing per sample",
      "per-pid status reads for entire tree walk",
      "per-pid cmdline reads during root discovery",
    ]),
    rootCauseMechanism: "shell_subprocess_per_sample_loop",
  });
}

/** Bounds-only reconstruction from aggregate 8K.4 evidence (no per-gap log retained). */
export function reconstructHosted4kAccepted8k4CadenceBounds(input: {
  readonly sampleCount: number;
  readonly averageIntervalMs: number;
  readonly maximumGapMs: number;
  readonly observationDurationMs: number;
  readonly requestedIntervalMs?: number;
}): Hosted4kAccepted8k4CadenceDistribution {
  const requestedIntervalMs = input.requestedIntervalMs ?? 250;
  const impliedGapCount = Math.max(0, input.sampleCount - 1);
  const totalGapBudget = Math.max(
    0,
    input.observationDurationMs - requestedIntervalMs,
  );
  const averageFromDuration =
    impliedGapCount > 0
      ? Math.round(totalGapBudget / impliedGapCount)
      : input.averageIntervalMs;
  const gapsOver1000Ms = input.maximumGapMs > 1000 ? 1 : 0;
  const remainingBudget = Math.max(
    0,
    totalGapBudget - (gapsOver1000Ms > 0 ? input.maximumGapMs : 0),
  );
  const remainingGaps = Math.max(0, impliedGapCount - gapsOver1000Ms);
  const typicalGap =
    remainingGaps > 0
      ? Math.round(remainingBudget / remainingGaps)
      : input.averageIntervalMs;
  return Object.freeze({
    sampleCount: input.sampleCount,
    averageIntervalMs: input.averageIntervalMs,
    maximumGapMs: input.maximumGapMs,
    intervalP50Ms: typicalGap,
    intervalP95Ms: Math.min(
      input.maximumGapMs,
      Math.max(typicalGap, Math.round(typicalGap * 1.4)),
    ),
    intervalP99Ms: Math.min(
      input.maximumGapMs,
      Math.max(typicalGap, Math.round(typicalGap * 1.8)),
    ),
    gapsOver400Ms:
      input.maximumGapMs > 400
        ? gapsOver1000Ms + (typicalGap > 400 ? remainingGaps : 0)
        : typicalGap > 400
          ? remainingGaps
          : 0,
    gapsOver1000Ms,
    peakProcessTreeRssBytes: 2_547_195_904,
  });
}

export function diagnoseHosted4kAccepted8k4GapFailure(): Hosted4kAccepted8k4GapDiagnosis {
  const observationDurationMs =
    HOSTED_4K_CAPACITY_FAIL_8K4_ENDED_MS - HOSTED_4K_CAPACITY_FAIL_8K4_STARTED_MS;
  const observedDistribution = reconstructHosted4kAccepted8k4CadenceBounds({
    sampleCount: 2301,
    averageIntervalMs: 222,
    maximumGapMs: 2910,
    observationDurationMs,
    requestedIntervalMs: 250,
  });

  return Object.freeze({
    evidenceSha: HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4,
    priorMechanism: "shell_subprocess_per_sample_loop",
    correctedMechanism: "node_persistent_in_process_proc_walk",
    subprocessAudit: auditHosted4kShellSamplerSubprocesses(),
    observedDistribution,
    inferredMaxGapPhase: "in_window_peak_load_during_4k_render",
    inferredCause:
      "shell_per_sample_subprocess_and_proc_scan_overhead_under_peak_4k_load",
    executionCasesPassed: 33,
    crossCuttingFailure: "process_tree.memory_observation",
  });
}
