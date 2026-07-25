/**
 * Sprint 11E Phase 2E.2D.8K.4.1 — cadence boundary and load fixtures.
 */

import {
  computeHosted4kCadenceDistribution,
  createHosted4kNodeSamplerState,
  finalizeHosted4kNodeSamplerSummary,
  markHosted4kNodeSamplerStopRequested,
  reconcileHosted4kCgroupPeak,
  tickHosted4kNodeSampler,
  type Hosted4kProcFsPort,
} from "./hosted-render-machine-node-sampler-core";
import {
  auditHosted4kShellSamplerSubprocesses,
  diagnoseHosted4kAccepted8k4GapFailure,
  HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4,
} from "./hosted-4k-sampler-8k4-gap-diagnosis";
import { buildHosted4kNodeSamplerEmbeddedScript } from "./hosted-render-machine-node-sampler-script";
import {
  buildHosted4kDetachedSamplerStartScriptBody,
  HOSTED_4K_SAMPLER_SUMMARY_VERSION,
} from "./hosted-render-machine-process-tree-lifecycle";
import { evaluateHosted4kSamplerPreflightCadenceAcceptance } from "./hosted-render-machine-process-tree-cadence";
import { buildHosted4kProcessTreeSamplingCadenceEvidence } from "./hosted-render-machine-process-tree-cadence";

export type Capacity4kSamplerCadenceFixtureVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

function createMockProc(input: {
  readonly observerPid?: number;
  readonly startMonoMs?: number;
  readonly workerRoot?: number;
  readonly workerRssKb?: number;
  readonly monoAdvanceMs?: number;
  readonly delayEveryNTicks?: number;
  readonly delayMs?: number;
}): { proc: Hosted4kProcFsPort; advance: () => void } {
  let mono = input.startMonoMs ?? 1_000;
  let tick = 0;
  const workerRoot = input.workerRoot ?? 100;
  const workerRssKb = input.workerRssKb ?? 120_000;
  const proc: Hosted4kProcFsPort = {
    observerPid: input.observerPid ?? 999,
    monoMs: () => mono,
    listPids: () => [proc.observerPid, workerRoot],
    ppidOf: (pid) => (pid === workerRoot ? 1 : 0),
    rssKb: (pid) => (pid === workerRoot ? workerRssKb : 0),
    cmdline: (pid) =>
      pid === workerRoot ? "node hosted-worker.js" : "node sampler.cjs",
    readCgroupPeakBytes: () => workerRssKb * 1024 * 2,
  };
  return {
    proc,
    advance: () => {
      tick += 1;
      const extra =
        input.delayEveryNTicks != null &&
        input.delayMs != null &&
        tick % input.delayEveryNTicks === 0
          ? input.delayMs
          : 0;
      mono += (input.monoAdvanceMs ?? 250) + extra;
    },
  };
}

function fixture8k4GapDiagnosis(): Capacity4kSamplerCadenceFixtureVerdict {
  const d = diagnoseHosted4kAccepted8k4GapFailure();
  if (d.evidenceSha !== HOSTED_4K_CAPACITY_FAIL_EVIDENCE_SHA_8K4) {
    return { ok: false, failClass: "8k4_evidence_sha_mismatch" };
  }
  if (d.observedDistribution.maximumGapMs !== 2910) {
    return { ok: false, failClass: "8k4_max_gap_mismatch" };
  }
  if (d.inferredCause !== "shell_per_sample_subprocess_and_proc_scan_overhead_under_peak_4k_load") {
    return { ok: false, failClass: "8k4_root_cause_mismatch" };
  }
  if (d.subprocessAudit.perSampleSubprocesses.length < 3) {
    return { ok: false, failClass: "subprocess_audit_incomplete" };
  }
  return { ok: true };
}

function fixtureStartupExcludedFromWindow(): Capacity4kSamplerCadenceFixtureVerdict {
  const { proc, advance } = createMockProc({ monoAdvanceMs: 250 });
  const state = createHosted4kNodeSamplerState({
    observerPid: proc.observerPid,
    startMonoMs: 1_000,
    startupExclusionMs: 2_000,
  });
  tickHosted4kNodeSampler({ state, proc });
  advance();
  tickHosted4kNodeSampler({ state, proc });
  if (state.inWindowGaps.length !== 0) {
    return { ok: false, failClass: "startup_gap_not_excluded" };
  }
  while (proc.monoMs() - state.startMonoMs < 2_500) advance();
  tickHosted4kNodeSampler({ state, proc });
  advance();
  tickHosted4kNodeSampler({ state, proc });
  if (state.inWindowGaps.length < 1) {
    return { ok: false, failClass: "post_startup_gap_missing" };
  }
  return { ok: true };
}

function fixtureStopOutsideWindowExcluded(): Capacity4kSamplerCadenceFixtureVerdict {
  const { proc, advance } = createMockProc({ monoAdvanceMs: 250 });
  const state = createHosted4kNodeSamplerState({
    observerPid: proc.observerPid,
    startMonoMs: 1_000,
    startupExclusionMs: 0,
  });
  for (let i = 0; i < 40; i++) {
    tickHosted4kNodeSampler({ state, proc });
    advance();
  }
  markHosted4kNodeSamplerStopRequested(state);
  const summary = finalizeHosted4kNodeSamplerSummary({
    state,
    endMonoMs: proc.monoMs() + 2_000,
  });
  if (summary.completeness_class !== "complete") {
    return { ok: false, failClass: "stop_window_summary_not_complete" };
  }
  return { ok: true };
}

function fixtureInWindowGapOver1000Rejected(): Capacity4kSamplerCadenceFixtureVerdict {
  const { proc, advance } = createMockProc({
    monoAdvanceMs: 250,
    delayEveryNTicks: 10,
    delayMs: 800,
  });
  const state = createHosted4kNodeSamplerState({
    observerPid: proc.observerPid,
    startMonoMs: 1_000,
    startupExclusionMs: 0,
  });
  for (let i = 0; i < 45; i++) {
    tickHosted4kNodeSampler({ state, proc });
    advance();
  }
  const summary = finalizeHosted4kNodeSamplerSummary({
    state,
    endMonoMs: proc.monoMs(),
  });
  if (summary.completeness_class !== "excessive_maximum_gap") {
    return { ok: false, failClass: "in_window_gap_not_rejected" };
  }
  return { ok: true };
}

function fixtureSustainedCadenceUnderLoad(): Capacity4kSamplerCadenceFixtureVerdict {
  const { proc, advance } = createMockProc({ monoAdvanceMs: 260 });
  const state = createHosted4kNodeSamplerState({
    observerPid: proc.observerPid,
    startMonoMs: 1_000,
    startupExclusionMs: 0,
  });
  for (let i = 0; i < 140; i++) {
    tickHosted4kNodeSampler({ state, proc });
    advance();
  }
  const summary = finalizeHosted4kNodeSamplerSummary({
    state,
    endMonoMs: proc.monoMs(),
    cgroupPeakBytes: state.peakKb * 1024 * 2,
  });
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: summary.sample_count,
    observationDurationMs: summary.observation_duration_ms,
    gapMs: state.inWindowGaps,
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
  });
  const acceptance = evaluateHosted4kSamplerPreflightCadenceAcceptance({
    cadence,
    peakProcessTreeRssBytes: summary.peak_summed_rss_bytes,
  });
  if (!acceptance.ok) {
    return { ok: false, failClass: `sustained_load_${acceptance.failClass}` };
  }
  if (summary.cgroup_reconciliation_class !== "reconciled") {
    return { ok: false, failClass: "cgroup_not_reconciled" };
  }
  return { ok: true };
}

function fixtureCgroupIrreconcilableFailsClosed(): Capacity4kSamplerCadenceFixtureVerdict {
  if (reconcileHosted4kCgroupPeak({ peakSummedRssBytes: 1_000_000, cgroupPeakBytes: 100 }) !== "irreconcilable") {
    return { ok: false, failClass: "cgroup_under_peak_not_irreconcilable" };
  }
  return { ok: true };
}

function fixtureNodeStartUsesPersistentProcess(): Capacity4kSamplerCadenceFixtureVerdict {
  const body = buildHosted4kDetachedSamplerStartScriptBody({
    runToken: "0123456789abcdef",
    intervalMs: 250,
  });
  const script = buildHosted4kNodeSamplerEmbeddedScript();
  if (!body.includes("sampler.cjs") || !body.includes('node "$STATE_DIR/sampler.cjs"')) {
    return { ok: false, failClass: "start_missing_node_sampler" };
  }
  if (script.includes("awk ") || script.includes("sleep $(awk")) {
    return { ok: false, failClass: "node_script_still_spawns_shell_tools" };
  }
  if (!script.includes("summary.json.partial")) {
    return { ok: false, failClass: "node_script_missing_atomic_summary" };
  }
  if (HOSTED_4K_SAMPLER_SUMMARY_VERSION !== 2) {
    return { ok: false, failClass: "summary_version_not_bumped" };
  }
  return { ok: true };
}

function fixtureDistributionPercentiles(): Capacity4kSamplerCadenceFixtureVerdict {
  const dist = computeHosted4kCadenceDistribution([
    240, 250, 260, 900, 250, 250,
  ]);
  if (dist.intervalP50Ms == null || dist.gapsOver400Ms !== 1 || dist.gapsOver1000Ms !== 0) {
    return { ok: false, failClass: "percentile_distribution_wrong" };
  }
  return { ok: true };
}

export function runAllCapacity4kSamplerCadenceSyncFixtures(): readonly Capacity4kSamplerCadenceFixtureVerdict[] {
  return Object.freeze([
    fixture8k4GapDiagnosis(),
    fixtureStartupExcludedFromWindow(),
    fixtureStopOutsideWindowExcluded(),
    fixtureInWindowGapOver1000Rejected(),
    fixtureSustainedCadenceUnderLoad(),
    fixtureCgroupIrreconcilableFailsClosed(),
    fixtureNodeStartUsesPersistentProcess(),
    fixtureDistributionPercentiles(),
    (() => {
      const audit = auditHosted4kShellSamplerSubprocesses();
      return audit.rootCauseMechanism === "shell_subprocess_per_sample_loop"
        ? { ok: true as const }
        : { ok: false as const, failClass: "shell_audit_mechanism" };
    })(),
  ]);
}
