/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — fail-closed fixtures for Machine-local sampler cadence.
 */

import {
  buildHosted4kProcessTreeSamplingCadenceEvidence,
  classifyHosted4kSamplingCompleteness,
  evaluateHosted4kSamplerPreflightCadenceAcceptance,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
} from "./hosted-render-machine-process-tree-cadence";
import {
  classifyHosted4kRemoteExecResult,
  LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM,
  MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
  MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM,
  parseHosted4kMachineLocalProcessTreeSummaryStdout,
  parseHosted4kRemoteProcessTreeSampleStdout,
  type Hosted4kRemoteSampleExitClass,
} from "./hosted-render-machine-process-tree-remote";
import {
  classifyLegacyWrongFlyMachineExecSyntax,
  HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS,
} from "./hosted-render-machine-process-tree-sampler";
import { hosted4kProcessTreeMemoryScope } from "./hosted-4k-process-tree-memory-observer";

export type Capacity4kSamplerFixtureVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

function gapsEvery(intervalMs: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count - 1) }, () => intervalMs);
}

function fixtureValidWorkerChromiumFfmpegTree(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout(
    '{"summed_kb":524288,"tree_count":4,"worker_root_found":true,"observer_excluded":true}\n',
  );
  if (!parsed.ok || parsed.sample.treeCount < 2) {
    return { ok: false, failClass: "valid_tree_fixture_rejected" };
  }
  return { ok: true };
}

function fixtureIdleWorkerOnlyTree(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout(
    '{"summed_kb":65536,"tree_count":1,"worker_root_found":true,"observer_excluded":true}\n',
  );
  if (!parsed.ok || parsed.sample.treeCount !== 1) {
    return { ok: false, failClass: "idle_worker_fixture_rejected" };
  }
  return { ok: true };
}

function fixtureObserverExclusion(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout(
    '{"err":"observer_only_tree"}\n',
  );
  if (parsed.ok || parsed.exitClass !== "observer_only_tree") {
    return { ok: false, failClass: "observer_only_wrong_class" };
  }
  return { ok: true };
}

function fixtureNestedDescendants(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout(
    '{"summed_kb":1048576,"tree_count":6,"worker_root_found":true,"observer_excluded":true}\n',
  );
  if (!parsed.ok || parsed.sample.treeCount < 3) {
    return { ok: false, failClass: "nested_descendants_fixture_rejected" };
  }
  return { ok: true };
}

function fixturePermissionErrors(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout('{"err":"proc_permission"}\n');
  if (parsed.ok || parsed.exitClass !== "proc_permission_failure") {
    return { ok: false, failClass: "permission_error_wrong_class" };
  }
  return { ok: true };
}

function fixtureMalformedRemoteOutput(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout("not-json\n");
  if (parsed.ok || parsed.exitClass !== "stdout_framing_parser_failure") {
    return { ok: false, failClass: "malformed_output_wrong_class" };
  }
  return { ok: true };
}

function fixtureWrongMachine(): Capacity4kSamplerFixtureVerdict {
  const exitClass = classifyHosted4kRemoteExecResult({
    spawnError: false,
    usedWrongCliSyntax: false,
    machineId: "wrong-machine",
    expectedMachineId: "d895d16f264918",
    exitCode: 1,
    stdout: "",
  });
  if (exitClass !== "machine_selection_failure") {
    return { ok: false, failClass: "wrong_machine_wrong_class" };
  }
  return { ok: true };
}

function fixtureWrongFlyCliSyntax(): Capacity4kSamplerFixtureVerdict {
  if (classifyLegacyWrongFlyMachineExecSyntax() !== "wrong_fly_cli_syntax") {
    return { ok: false, failClass: "legacy_syntax_class_wrong" };
  }
  return { ok: true };
}

function fixtureWorkerRootAbsent(): Capacity4kSamplerFixtureVerdict {
  const parsed = parseHosted4kRemoteProcessTreeSampleStdout(
    '{"err":"worker_root_absent"}\n',
  );
  if (parsed.ok || parsed.exitClass !== "worker_root_absent") {
    return { ok: false, failClass: "worker_root_absent_wrong_class" };
  }
  return { ok: true };
}

function fixtureCorrect250msCadence(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 40,
    observationDurationMs: 10_000,
    gapMs: gapsEvery(250, 40),
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });
  if (cadence.samplingCompletenessClass !== "complete") {
    return { ok: false, failClass: "correct_cadence_not_complete" };
  }
  const acceptance = evaluateHosted4kSamplerPreflightCadenceAcceptance({
    cadence,
    peakProcessTreeRssBytes: 160_000_000,
  });
  if (!acceptance.ok) {
    return { ok: false, failClass: "correct_cadence_preflight_rejected" };
  }
  return { ok: true };
}

function fixtureInsufficientSampleCount(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 2,
    observationDurationMs: 10_000,
    gapMs: [4500, 4500],
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });
  if (cadence.samplingCompletenessClass !== "insufficient_sample_count") {
    return { ok: false, failClass: "insufficient_samples_not_detected" };
  }
  return { ok: true };
}

function fixtureExcessiveAverageInterval(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 35,
    observationDurationMs: 10_000,
    gapMs: gapsEvery(500, 35),
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });
  if (cadence.samplingCompletenessClass !== "excessive_average_interval") {
    return { ok: false, failClass: "excessive_average_not_detected" };
  }
  return { ok: true };
}

function fixtureExcessiveMaximumGap(): Capacity4kSamplerFixtureVerdict {
  const gaps = gapsEvery(250, 35);
  gaps[10] = 1500;
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 35,
    observationDurationMs: 10_000,
    gapMs: gaps,
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });
  if (cadence.samplingCompletenessClass !== "excessive_maximum_gap") {
    return { ok: false, failClass: "excessive_gap_not_detected" };
  }
  return { ok: true };
}

function fixtureDelayedFirstSample(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 35,
    observationDurationMs: 10_000,
    gapMs: [2000, ...gapsEvery(250, 34)],
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
    maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
    maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
  });
  if ((cadence.maximumObservedGapMs ?? 0) < 2000) {
    return { ok: false, failClass: "delayed_first_sample_gap_missing" };
  }
  return { ok: true };
}

function fixtureEarlyTermination(): Capacity4kSamplerFixtureVerdict {
  const complete = classifyHosted4kSamplingCompleteness({
    sampleCount: 20,
    observationDurationMs: 3_000,
    requestedDurationMs: 10_000,
    averageIntervalMs: 250,
    maximumObservedGapMs: 300,
    malformedSampleCount: 0,
    workerTreeCorrelationClass: "worker_tree_correlated",
  });
  if (complete !== "early_termination") {
    return { ok: false, failClass: "early_termination_not_detected" };
  }
  return { ok: true };
}

function fixtureProcessChurnDuringSampling(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 38,
    observationDurationMs: 10_000,
    gapMs: gapsEvery(260, 38),
    malformedSampleCount: 0,
    workerRootFound: true,
    observerExcluded: true,
    temporarilyUncorrelated: true,
    requestedDurationMs: 10_000,
  });
  if (cadence.workerTreeCorrelationClass !== "temporarily_uncorrelated") {
    return { ok: false, failClass: "process_churn_not_classified" };
  }
  return { ok: true };
}

function fixtureWorkerRootTemporarilyAbsent(): Capacity4kSamplerFixtureVerdict {
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: 250,
    sampleCount: 10,
    observationDurationMs: 10_000,
    gapMs: gapsEvery(900, 10),
    malformedSampleCount: 0,
    workerRootFound: false,
    observerExcluded: true,
    requestedDurationMs: 10_000,
    minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
  });
  if (cadence.workerTreeCorrelationClass !== "worker_root_absent") {
    return { ok: false, failClass: "temporary_worker_absence_not_detected" };
  }
  return { ok: true };
}

function fixturePeakPreservedAfterChildExit(): Capacity4kSamplerFixtureVerdict {
  const stdout =
    '{"summary":true,"requested_interval_ms":250,"sample_count":40,"observation_duration_ms":10000,"average_interval_ms":256,"maximum_observed_gap_ms":312,"peak_summed_kb":524288,"last_summed_kb":65536,"malformed_sample_count":0,"worker_root_found":true,"observer_excluded":true,"worker_root_miss_count":0}\n';
  const parsed = parseHosted4kMachineLocalProcessTreeSummaryStdout(stdout);
  if (!parsed.ok || parsed.summary.peakSummedKb <= parsed.summary.lastSummedKb) {
    return { ok: false, failClass: "peak_not_preserved_after_child_exit" };
  }
  return { ok: true };
}

function fixturePersistentSamplerMechanism(): Capacity4kSamplerFixtureVerdict {
  if (
    MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM !==
    "detached_machine_local_state_directory_lifecycle"
  ) {
    return { ok: false, failClass: "lifecycle_mechanism_missing" };
  }
  if (MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM !== "one_fly_exec_persistent_machine_local_loop") {
    return { ok: false, failClass: "persistent_mechanism_missing" };
  }
  if (LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM !== "one_fly_cli_round_trip_per_sample") {
    return { ok: false, failClass: "legacy_mechanism_missing" };
  }
  if (HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS !== 250) {
    return { ok: false, failClass: "requested_interval_not_250ms" };
  }
  return { ok: true };
}

export function runAllCapacity4kSamplerSyncFixtures(): readonly Capacity4kSamplerFixtureVerdict[] {
  return Object.freeze([
    fixtureValidWorkerChromiumFfmpegTree(),
    fixtureIdleWorkerOnlyTree(),
    fixtureObserverExclusion(),
    fixtureNestedDescendants(),
    fixturePermissionErrors(),
    fixtureMalformedRemoteOutput(),
    fixtureWrongMachine(),
    fixtureWrongFlyCliSyntax(),
    fixtureWorkerRootAbsent(),
    fixtureCorrect250msCadence(),
    fixtureInsufficientSampleCount(),
    fixtureExcessiveAverageInterval(),
    fixtureExcessiveMaximumGap(),
    fixtureDelayedFirstSample(),
    fixtureEarlyTermination(),
    fixtureProcessChurnDuringSampling(),
    fixtureWorkerRootTemporarilyAbsent(),
    fixturePeakPreservedAfterChildExit(),
    fixturePersistentSamplerMechanism(),
  ]);
}

export async function runAllCapacity4kSamplerAsyncFixtures(): Promise<
  readonly Capacity4kSamplerFixtureVerdict[]
> {
  return Object.freeze([]);
}

export function diagnoseHosted4kSamplerFailureCause(): {
  readonly cause: Hosted4kRemoteSampleExitClass;
  readonly mechanism: "shell_subprocess_per_sample_loop";
  readonly correctedMechanism: "node_persistent_in_process_proc_walk";
  readonly priorUnavailableReason: "lifecycle_excessive_maximum_gap";
  readonly priorEffectiveAverageIntervalMs: number;
  readonly priorMaximumGapMs: number;
} {
  return Object.freeze({
    cause: "stdout_framing_parser_failure",
    mechanism: "shell_subprocess_per_sample_loop",
    correctedMechanism: "node_persistent_in_process_proc_walk",
    priorUnavailableReason: "lifecycle_excessive_maximum_gap",
    priorEffectiveAverageIntervalMs: 222,
    priorMaximumGapMs: 2910,
  });
}

export function buildFixtureMachineLocalSummaryObservation() {
  return Object.freeze({
    scope: hosted4kProcessTreeMemoryScope(),
    sampleIntervalMs: 250,
    sampleCount: 40,
    summedProcessTreeRssBytes: 160_000_000,
    peakProcessTreeRssBytes: 165_000_000,
    observationDurationMs: 10_000,
    samplingComplete: true,
    oomOrRestartObserved: false,
    unavailableReason: null,
    cadence: buildHosted4kProcessTreeSamplingCadenceEvidence({
      requestedIntervalMs: 250,
      sampleCount: 40,
      observationDurationMs: 10_000,
      gapMs: gapsEvery(250, 40),
      malformedSampleCount: 0,
      workerRootFound: true,
      observerExcluded: true,
      requestedDurationMs: 10_000,
      minSamples: HOSTED_4K_SAMPLER_PREFLIGHT_MIN_SAMPLES,
      maxAverageIntervalMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_AVERAGE_INTERVAL_MS,
      maxGapMs: HOSTED_4K_SAMPLER_PREFLIGHT_MAX_GAP_MS,
    }),
  });
}
