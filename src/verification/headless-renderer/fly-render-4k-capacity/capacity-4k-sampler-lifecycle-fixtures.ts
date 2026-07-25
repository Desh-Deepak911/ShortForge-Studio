/**
 * Sprint 11E Phase 2E.2D.8K.3.1 — detached sampler lifecycle fixtures.
 */

import {
  buildHosted4kDetachedSamplerCleanupCommand,
  buildHosted4kDetachedSamplerStartCommand,
  buildHosted4kDetachedSamplerCleanupScriptBody,
  buildHosted4kDetachedSamplerStartScriptBody,
  buildHosted4kDetachedSamplerStopRequestScriptBody,
  buildHosted4kDetachedSamplerSummaryPollScriptBody,
  buildHosted4kDetachedSamplerStopRequestCommand,
  buildHosted4kDetachedSamplerSummaryPollCommand,
  cleanupHosted4kDetachedSamplerState,
  generateHosted4kSamplerRunToken,
  parseHosted4kDetachedSamplerSummaryJson,
  requestHosted4kDetachedSamplerStop,
  startHosted4kDetachedSamplerRemote,
  validateHosted4kSamplerRunToken,
  waitHosted4kDetachedSamplerSummary,
  type Hosted4kDetachedSamplerSummary,
  type Hosted4kSamplerLifecycleFailClass,
} from "./hosted-render-machine-process-tree-lifecycle";
import { buildHosted4kNodeSamplerEmbeddedScript } from "./hosted-render-machine-node-sampler-script";
import type { FlySpawnFn, FlySpawnResult } from "./hosted-render-machine-fly-spawn";

export type Capacity4kSamplerLifecycleFixtureVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: string };

type MockSamplerState = {
  readonly runToken: string;
  ready: boolean;
  stopRequested: boolean;
  summaryFinalized: boolean;
  samplerAlive: boolean;
  cleaned: boolean;
  peakSummedRssBytes: number;
  sampleCount: number;
};

function buildMockSummary(state: MockSamplerState): string {
  return JSON.stringify({
    finalized: true,
    summary_version: 1,
    measurement_class: "process_tree_memory",
    completeness_class: "complete",
    requested_interval_ms: 250,
    sample_count: state.sampleCount,
    observation_duration_ms: 10_000,
    average_interval_ms: 250,
    maximum_observed_gap_ms: 300,
    peak_summed_rss_bytes: state.peakSummedRssBytes,
    last_summed_rss_bytes: 160_000_000,
    malformed_sample_count: 0,
    worker_tree_correlation_class: "worker_tree_correlated",
    observer_excluded: true,
    oom_or_restart_observed: false,
    worker_root_miss_count: 0,
  });
}

function decodeWrappedBase64FlyCommand(command: string): string {
  const match = command.match(/echo ([A-Za-z0-9+/=]+) \| base64 -d \| sh/);
  if (match == null) return command;
  try {
    return Buffer.from(match[1]!, "base64").toString("utf8");
  } catch {
    return command;
  }
}

function createMockSpawn(
  states: Map<string, MockSamplerState>,
): FlySpawnFn {
  return async ({ args }) => {
    const rawCommand = args[args.length - 1] ?? "";
    const command = decodeWrappedBase64FlyCommand(rawCommand);
    if (command.includes('printf \'{"ready":true') || command.includes('touch "$STATE_DIR/ready"') || command.includes("sampler.cjs")) {
      for (const [token, state] of states) {
        if (command.includes(token)) {
          if (state.ready && state.samplerAlive) {
            return { exitCode: 3, stdout: '{"err":"duplicate_start"}\n', spawnError: false };
          }
          state.ready = true;
          state.samplerAlive = true;
          return {
            exitCode: 0,
            stdout: `{"ready":true,"run_token":"${token}"}\n`,
            spawnError: false,
          };
        }
      }
    }
    if (command.includes('touch "$STATE_DIR/stop.requested"')) {
      for (const [token, state] of states) {
        if (!command.includes(token)) continue;
        if (!state.ready) {
          return { exitCode: 2, stdout: '{"err":"missing_ready_marker"}\n', spawnError: false };
        }
        if (state.stopRequested) {
          return { exitCode: 4, stdout: '{"err":"duplicate_stop"}\n', spawnError: false };
        }
        if (state.summaryFinalized) {
          return { exitCode: 5, stdout: '{"err":"summary_before_stop"}\n', spawnError: false };
        }
        if (!state.samplerAlive) {
          return { exitCode: 3, stdout: '{"err":"missing_sampler_process"}\n', spawnError: false };
        }
        state.stopRequested = true;
        state.summaryFinalized = true;
        state.samplerAlive = false;
        return { exitCode: 0, stdout: '{"stop_requested":true}\n', spawnError: false };
      }
      return { exitCode: 2, stdout: '{"err":"foreign_run_token"}\n', spawnError: false };
    }
    if (
      command.includes('"pending":true') ||
      (command.includes("summary.json") && command.includes('"finalized":true'))
    ) {
      for (const [token, state] of states) {
        if (!command.includes(token)) continue;
        if (!state.ready) {
          return { exitCode: 2, stdout: '{"err":"foreign_run_token"}\n', spawnError: false };
        }
        if (!state.summaryFinalized) {
          return { exitCode: 0, stdout: '{"pending":true}\n', spawnError: false };
        }
        return { exitCode: 0, stdout: `${buildMockSummary(state)}\n`, spawnError: false };
      }
      return { exitCode: 2, stdout: '{"err":"foreign_run_token"}\n', spawnError: false };
    }
    if (command.includes('rm -rf "$STATE_DIR"')) {
      for (const [token, state] of states) {
        if (!command.includes(token)) continue;
        if (state.samplerAlive) {
          return { exitCode: 5, stdout: '{"err":"cleanup_refused_sampler_live"}\n', spawnError: false };
        }
        state.cleaned = true;
        states.delete(token);
        return { exitCode: 0, stdout: '{"cleaned":true}\n', spawnError: false };
      }
      return { exitCode: 0, stdout: '{"cleaned":true,"absent":true}\n', spawnError: false };
    }
    return { exitCode: 0, stdout: "", spawnError: false };
  };
}

function fixtureRunTokenValidation(): Capacity4kSamplerLifecycleFixtureVerdict {
  if (!validateHosted4kSamplerRunToken(generateHosted4kSamplerRunToken())) {
    return { ok: false, failClass: "token_generation_invalid" };
  }
  if (validateHosted4kSamplerRunToken("bad-token")) {
    return { ok: false, failClass: "token_validation_too_loose" };
  }
  if (validateHosted4kSamplerRunToken("zzzzzzzzzzzzzzzz")) {
    return { ok: false, failClass: "token_validation_accepts_non_hex" };
  }
  return { ok: true };
}

function fixtureSummaryAtomicRename(): Capacity4kSamplerLifecycleFixtureVerdict {
  const partial =
    '{"finalized":false,"summary_version":1,"sample_count":1}\n';
  const parsedPartial = parseHosted4kDetachedSamplerSummaryJson(partial);
  if (parsedPartial.ok) {
    return { ok: false, failClass: "partial_summary_accepted" };
  }
  const final = buildMockSummary({
    runToken: "abcd",
    ready: true,
    stopRequested: true,
    summaryFinalized: true,
    samplerAlive: false,
    cleaned: false,
    peakSummedRssBytes: 524_288_000,
    sampleCount: 40,
  });
  const parsedFinal = parseHosted4kDetachedSamplerSummaryJson(final);
  if (!parsedFinal.ok) {
    return { ok: false, failClass: "final_summary_rejected" };
  }
  if (parsedFinal.summary.peakSummedRssBytes <= 160_000_000) {
    return { ok: false, failClass: "peak_not_preserved" };
  }
  return { ok: true };
}

function fixtureMalformedSummary(): Capacity4kSamplerLifecycleFixtureVerdict {
  const parsed = parseHosted4kDetachedSamplerSummaryJson("not-json");
  if (parsed.ok || parsed.failClass !== "missing_summary") {
    return { ok: false, failClass: "malformed_summary_wrong_class" };
  }
  return { ok: true };
}

function fixtureStartCommandsDoNotUseLongRunningLocalChild(): Capacity4kSamplerLifecycleFixtureVerdict {
  const token = generateHosted4kSamplerRunToken();
  const startBody = buildHosted4kDetachedSamplerStartScriptBody({
    runToken: token,
    intervalMs: 250,
  });
  const nodeBody = buildHosted4kNodeSamplerEmbeddedScript();
  if (
    !startBody.includes("chmod 700") ||
    !startBody.includes("sampler.cjs") ||
    !nodeBody.includes("summary.json.partial") ||
    !nodeBody.includes("renameSync(tmp,fin)")
  ) {
    return { ok: false, failClass: "start_script_missing_lifecycle_markers" };
  }
  const stopBody = buildHosted4kDetachedSamplerStopRequestScriptBody(token);
  if (!stopBody.includes("stop.requested")) {
    return { ok: false, failClass: "stop_script_missing_marker" };
  }
  const pollBody = buildHosted4kDetachedSamplerSummaryPollScriptBody(token);
  if (!pollBody.includes("summary.json")) {
    return { ok: false, failClass: "poll_script_missing_summary_path" };
  }
  const cleanupBody = buildHosted4kDetachedSamplerCleanupScriptBody(token);
  if (!cleanupBody.includes("cleanup_refused_sampler_live")) {
    return { ok: false, failClass: "cleanup_script_missing_live_refusal" };
  }
  return { ok: true };
}

export function runAllCapacity4kSamplerLifecycleSyncFixtures(): readonly Capacity4kSamplerLifecycleFixtureVerdict[] {
  return Object.freeze([
    fixtureRunTokenValidation(),
    fixtureSummaryAtomicRename(),
    fixtureMalformedSummary(),
    fixtureStartCommandsDoNotUseLongRunningLocalChild(),
  ]);
}

export async function runAllCapacity4kSamplerLifecycleAsyncFixtures(): Promise<
  readonly Capacity4kSamplerLifecycleFixtureVerdict[]
> {
  const states = new Map<string, MockSamplerState>();
  const spawn = createMockSpawn(states);
  const runToken = generateHosted4kSamplerRunToken();
  states.set(runToken, {
    runToken,
    ready: false,
    stopRequested: false,
    summaryFinalized: false,
    samplerAlive: false,
    cleaned: false,
    peakSummedRssBytes: 165_000_000,
    sampleCount: 42,
  });

  const results: Capacity4kSamplerLifecycleFixtureVerdict[] = [];

  const started = await startHosted4kDetachedSamplerRemote({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    spawn,
  });
  results.push(started.ok ? { ok: true } : { ok: false, failClass: "successful_start" });

  const duplicate = await startHosted4kDetachedSamplerRemote({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    spawn,
  });
  results.push(
    !duplicate.ok && duplicate.failClass === "duplicate_start"
      ? { ok: true }
      : { ok: false, failClass: "duplicate_start_not_refused" },
  );

  const missingReadyToken = generateHosted4kSamplerRunToken();
  const stopMissingReady = await requestHosted4kDetachedSamplerStop({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken: missingReadyToken,
    spawn,
  });
  results.push(
    !stopMissingReady.ok && stopMissingReady.failClass === "foreign_run_token"
      ? { ok: true }
      : { ok: false, failClass: "missing_ready_not_foreign_token" },
  );

  const stop1 = await requestHosted4kDetachedSamplerStop({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    spawn,
  });
  results.push(stop1.ok ? { ok: true } : { ok: false, failClass: "stop_marker" });

  const stop2 = await requestHosted4kDetachedSamplerStop({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    spawn,
  });
  results.push(
    !stop2.ok && stop2.failClass === "duplicate_stop"
      ? { ok: true }
      : { ok: false, failClass: "duplicate_stop_not_refused" },
  );

  const summary = await waitHosted4kDetachedSamplerSummary({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    timeoutMs: 1000,
    spawn,
  });
  results.push(summary.ok ? { ok: true } : { ok: false, failClass: "summary_retrieval" });

  const liveCleanup = await cleanupHosted4kDetachedSamplerState({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken: generateHosted4kSamplerRunToken(),
    spawn: async () =>
      ({
        exitCode: 5,
        stdout: '{"err":"cleanup_refused_sampler_live"}\n',
        spawnError: false,
      }) satisfies FlySpawnResult,
  });
  results.push(
    !liveCleanup.ok && liveCleanup.failClass === "cleanup_refused_sampler_live"
      ? { ok: true }
      : { ok: false, failClass: "cleanup_live_refusal" },
  );

  const cleanup = await cleanupHosted4kDetachedSamplerState({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken,
    spawn,
  });
  results.push(cleanup.ok ? { ok: true } : { ok: false, failClass: "cleanup" });

  const foreign = await requestHosted4kDetachedSamplerStop({
    flyAppName: "app",
    renderMachineId: "d895d16f264918",
    runToken: generateHosted4kSamplerRunToken(),
    spawn,
  });
  results.push(
    !foreign.ok && foreign.failClass === "foreign_run_token"
      ? { ok: true }
      : { ok: false, failClass: "foreign_token" },
  );

  return Object.freeze(results);
}

export function diagnoseHosted4kSamplerLifecycleFailureCause(): {
  readonly cause: Hosted4kSamplerLifecycleFailClass;
  readonly priorMechanism: "abort_local_fly_child_for_summary";
  readonly correctedMechanism: "detached_machine_local_state_directory_lifecycle";
} {
  return Object.freeze({
    cause: "stop_timeout",
    priorMechanism: "abort_local_fly_child_for_summary",
    correctedMechanism: "detached_machine_local_state_directory_lifecycle",
  });
}

export function buildFixtureDetachedSamplerSummary(): Hosted4kDetachedSamplerSummary {
  const parsed = parseHosted4kDetachedSamplerSummaryJson(
    buildMockSummary({
      runToken: "abcd",
      ready: true,
      stopRequested: true,
      summaryFinalized: true,
      samplerAlive: false,
      cleaned: true,
      peakSummedRssBytes: 170_000_000,
      sampleCount: 40,
    }),
  );
  if (!parsed.ok) throw new Error("fixture_summary_invalid");
  return parsed.summary;
}
