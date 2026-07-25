/**
 * Sprint 11E Phase 2E.2D.8K.3.1 — detached Machine-local process-tree sampler controller.
 *
 * Uses bounded exact-Machine exec operations and a remote state directory.
 * Never terminates a long-running local Fly CLI child to obtain summary evidence.
 */

import {
  hosted4kProcessTreeMemoryScope,
  type Hosted4kProcessTreeMemoryObservation,
} from "./hosted-4k-process-tree-memory-observer";
import {
  runFlySpawnDefault,
  type FlySpawnFn,
  type FlySpawnResult,
} from "./hosted-render-machine-fly-spawn";
import { HOSTED_4K_PROCESS_TREE_REQUESTED_INTERVAL_MS } from "./hosted-render-machine-process-tree-cadence";
import {
  buildHosted4kMachineLocalProcessTreeSamplerCommand,
  classifyHosted4kRemoteExecResult,
  hosted4kRemoteSampleBytesFromKb,
  HOSTED_4K_RENDER_MACHINE_ID,
  LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM,
  MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
  MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM,
  parseHosted4kMachineLocalProcessTreeSummaryStdout,
  type Hosted4kRemoteSampleExitClass,
} from "./hosted-render-machine-process-tree-remote";
import {
  buildHosted4kProcessTreeSamplingCadenceEvidence,
} from "./hosted-render-machine-process-tree-cadence";
import {
  ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM,
  completeHosted4kDetachedSamplerLifecycle,
  generateHosted4kSamplerRunToken,
  startHosted4kDetachedSamplerRemote,
  type Hosted4kSamplerLifecycleFailClass,
} from "./hosted-render-machine-process-tree-lifecycle";

export {
  HOSTED_4K_RENDER_MACHINE_ID,
  LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM,
  MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM,
  MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM,
  ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM,
};

export const HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS =
  HOSTED_4K_PROCESS_TREE_REQUESTED_INTERVAL_MS;

export const HOSTED_4K_RENDER_MACHINE_MAX_OBSERVATION_MS = 20 * 60 * 1000;

export type Hosted4kRenderMachineProcessTreeSamplerHandle = {
  readonly stop: () => Promise<Hosted4kProcessTreeMemoryObservation>;
  readonly runToken: string | null;
};

export { runFlySpawnDefault, type FlySpawnFn, type FlySpawnResult };

function flyMachineExecTimeoutSeconds(durationMs: number): string {
  return String(Math.max(30, Math.ceil(durationMs / 1000) + 20));
}

function buildObservationFromMachineLocalSummary(input: {
  readonly sampleIntervalMs: number;
  readonly minObservationMs: number;
  readonly stdout: string;
  readonly exitCode: number | null;
  readonly spawnError: boolean;
  readonly renderMachineId: string;
  readonly requestedDurationMs: number;
}): Hosted4kProcessTreeMemoryObservation {
  const scope = hosted4kProcessTreeMemoryScope();
  const exitClass = classifyHosted4kRemoteExecResult({
    spawnError: input.spawnError,
    usedWrongCliSyntax: false,
    machineId: input.renderMachineId,
    expectedMachineId: input.renderMachineId,
    exitCode: input.exitCode,
    stdout: input.stdout,
  });
  const parsed = parseHosted4kMachineLocalProcessTreeSummaryStdout(input.stdout);
  if (!parsed.ok) {
    return Object.freeze({
      scope,
      sampleIntervalMs: input.sampleIntervalMs,
      sampleCount: 0,
      summedProcessTreeRssBytes: null,
      peakProcessTreeRssBytes: null,
      observationDurationMs: null,
      samplingComplete: false,
      oomOrRestartObserved: false,
      unavailableReason:
        exitClass === "ok"
          ? "remote_sample_unreadable"
          : `remote_sample_${parsed.exitClass}`,
      cadence: null,
    });
  }
  const summary = parsed.summary;
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: summary.requestedIntervalMs,
    sampleCount: summary.sampleCount,
    observationDurationMs: summary.observationDurationMs,
    gapMs: summary.gapMs,
    observedAverageIntervalMs: summary.averageIntervalMs,
    observedMaximumGapMs: summary.maximumObservedGapMs,
    malformedSampleCount: summary.malformedSampleCount,
    workerRootFound: summary.workerRootFound,
    observerExcluded: summary.observerExcluded,
    temporarilyUncorrelated: summary.workerRootMissCount > 0,
    requestedDurationMs: input.requestedDurationMs,
  });
  const peakBytes = hosted4kRemoteSampleBytesFromKb(summary.peakSummedKb);
  const lastBytes = hosted4kRemoteSampleBytesFromKb(summary.lastSummedKb);
  const samplingComplete =
    cadence.samplingCompletenessClass === "complete" &&
    summary.sampleCount > 0 &&
    peakBytes > 0 &&
    summary.observationDurationMs >= input.minObservationMs;
  return Object.freeze({
    scope,
    sampleIntervalMs: input.sampleIntervalMs,
    sampleCount: summary.sampleCount,
    summedProcessTreeRssBytes: lastBytes,
    peakProcessTreeRssBytes: peakBytes,
    observationDurationMs: summary.observationDurationMs,
    samplingComplete,
    oomOrRestartObserved: false,
    unavailableReason: samplingComplete
      ? null
      : `cadence_${cadence.samplingCompletenessClass}`,
    cadence,
  });
}

/** One blocking Machine-local observation — exactly one Fly round trip. */
export async function runHosted4kMachineLocalProcessTreeObservation(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly durationMs: number;
  readonly sampleIntervalMs?: number;
  readonly minObservationMs?: number;
  readonly spawn?: FlySpawnFn;
}): Promise<Hosted4kProcessTreeMemoryObservation> {
  const sampleIntervalMs =
    input.sampleIntervalMs ?? HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS;
  const minObservationMs = input.minObservationMs ?? sampleIntervalMs;
  const spawnFn = input.spawn ?? runFlySpawnDefault;
  const command = buildHosted4kMachineLocalProcessTreeSamplerCommand({
    intervalMs: sampleIntervalMs,
    durationMs: input.durationMs,
  });

  const exec = await spawnFn({
    args: [
      "machine",
      "exec",
      input.renderMachineId,
      "-a",
      input.flyAppName,
      "--timeout",
      flyMachineExecTimeoutSeconds(input.durationMs),
      command,
    ],
  });
  if (!exec.spawnError && exec.exitCode !== 0) {
    const ssh = await spawnFn({
      args: [
        "ssh",
        "console",
        "-a",
        input.flyAppName,
        "--machine",
        input.renderMachineId,
        "-q",
        "-C",
        command,
      ],
    });
    return buildObservationFromMachineLocalSummary({
      sampleIntervalMs,
      minObservationMs,
      stdout: ssh.stdout,
      exitCode: ssh.exitCode,
      spawnError: ssh.spawnError,
      renderMachineId: input.renderMachineId,
      requestedDurationMs: input.durationMs,
    });
  }
  return buildObservationFromMachineLocalSummary({
    sampleIntervalMs,
    minObservationMs,
    stdout: exec.stdout,
    exitCode: exec.exitCode,
    spawnError: exec.spawnError,
    renderMachineId: input.renderMachineId,
    requestedDurationMs: input.durationMs,
  });
}

function unavailableObservation(input: {
  readonly sampleIntervalMs: number;
  readonly reason: string;
}): Hosted4kProcessTreeMemoryObservation {
  return Object.freeze({
    scope: hosted4kProcessTreeMemoryScope(),
    sampleIntervalMs: input.sampleIntervalMs,
    sampleCount: 0,
    summedProcessTreeRssBytes: null,
    peakProcessTreeRssBytes: null,
    observationDurationMs: null,
    samplingComplete: false,
    oomOrRestartObserved: false,
    unavailableReason: input.reason,
    cadence: null,
  });
}

/**
 * Start a detached Machine-local sampler via bounded start exec.
 * `stop()` requests graceful shutdown via stop marker and retrieves summary.
 */
export function startHosted4kRenderMachineProcessTreeSampler(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string | null;
  readonly sampleIntervalMs?: number;
  readonly minObservationMs?: number;
  readonly runToken?: string;
  readonly spawn?: FlySpawnFn;
  readonly startRemote?: typeof startHosted4kDetachedSamplerRemote;
  readonly completeLifecycle?: typeof completeHosted4kDetachedSamplerLifecycle;
}): Hosted4kRenderMachineProcessTreeSamplerHandle {
  const sampleIntervalMs =
    input.sampleIntervalMs ?? HOSTED_4K_RENDER_MACHINE_SAMPLE_INTERVAL_MS;
  const minObservationMs = input.minObservationMs ?? sampleIntervalMs;

  if (input.renderMachineId == null) {
    const unavailable = unavailableObservation({
      sampleIntervalMs,
      reason: "render_machine_id_unavailable",
    });
    return Object.freeze({
      runToken: null,
      stop: async () => unavailable,
    });
  }

  const runToken = input.runToken ?? generateHosted4kSamplerRunToken();
  const startRemote = input.startRemote ?? startHosted4kDetachedSamplerRemote;
  const completeLifecycle =
    input.completeLifecycle ?? completeHosted4kDetachedSamplerLifecycle;
  let finalizedObservation: Hosted4kProcessTreeMemoryObservation | null = null;
  let startFailClass: Hosted4kSamplerLifecycleFailClass | null = null;
  const startPromise = startRemote({
    flyAppName: input.flyAppName,
    renderMachineId: input.renderMachineId,
    runToken,
    intervalMs: sampleIntervalMs,
    spawn: input.spawn,
  }).then((result) => {
    if (!result.ok) startFailClass = result.failClass;
  });

  async function stop(): Promise<Hosted4kProcessTreeMemoryObservation> {
    if (finalizedObservation != null) return finalizedObservation;
    await startPromise;
    if (startFailClass != null) {
      finalizedObservation = unavailableObservation({
        sampleIntervalMs,
        reason: `lifecycle_${startFailClass}`,
      });
      return finalizedObservation;
    }
    const completed = await completeLifecycle({
      flyAppName: input.flyAppName,
      renderMachineId: input.renderMachineId!,
      runToken,
      sampleIntervalMs,
      minObservationMs,
      spawn: input.spawn,
    });
    if (!completed.ok) {
      finalizedObservation = unavailableObservation({
        sampleIntervalMs,
        reason: `lifecycle_${completed.failClass}`,
      });
      return finalizedObservation;
    }
    finalizedObservation = completed.observation;
    return finalizedObservation;
  }

  return Object.freeze({ runToken, stop });
}

export function classifyLegacyWrongFlyMachineExecSyntax(): Hosted4kRemoteSampleExitClass {
  return "wrong_fly_cli_syntax";
}

export async function runHosted4kRemoteProcessTreeSample(): Promise<never> {
  throw new Error("per_sample_round_trip_removed_in_8k2_1");
}
