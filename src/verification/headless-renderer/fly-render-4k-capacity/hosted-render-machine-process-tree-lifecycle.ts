/**
 * Sprint 11E Phase 2E.2D.8K.3.1 — detached Machine-local sampler lifecycle.
 *
 * Remote sampler runs detached with a private mode-0700 state directory.
 * The controlling harness uses bounded exact-Machine exec operations only.
 * Never uses a long-running local Fly CLI child as evidence transport.
 */

import { randomBytes } from "node:crypto";

import {
  buildHosted4kProcessTreeSamplingCadenceEvidence,
  evaluateHosted4kSamplerPreflightCadenceAcceptance,
  type Hosted4kProcessTreeSamplingCompletenessClass,
  type Hosted4kProcessTreeWorkerCorrelationClass,
} from "./hosted-render-machine-process-tree-cadence";
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import {
  hosted4kProcessTreeMemoryScope,
  type Hosted4kProcessTreeMemoryObservation,
} from "./hosted-4k-process-tree-memory-observer";
import {
  buildHosted4kProcessTreeWalkHelpersExport,
  HOSTED_4K_RENDER_MACHINE_ID,
} from "./hosted-render-machine-process-tree-remote";
import type { FlySpawnFn, FlySpawnResult } from "./hosted-render-machine-fly-spawn";
import { runFlySpawnDefault } from "./hosted-render-machine-fly-spawn";
import { buildHosted4kNodeSamplerEmbeddedScript } from "./hosted-render-machine-node-sampler-script";
import { HOSTED_4K_NODE_SAMPLER_MECHANISM } from "./hosted-render-machine-node-sampler-core";

export { HOSTED_4K_RENDER_MACHINE_ID };
export { HOSTED_4K_NODE_SAMPLER_MECHANISM };

export const HOSTED_4K_SAMPLER_STATE_ROOT =
  "/tmp/shortforge-4k-proctree-sampler" as const;

export const HOSTED_4K_SAMPLER_RUN_TOKEN_BYTES = 8 as const;

export const HOSTED_4K_SAMPLER_SUMMARY_VERSION = 2 as const;

export const HOSTED_4K_SAMPLER_SCRIPT_FILENAME = "sampler.cjs" as const;

export const ABORT_BASED_LOCAL_FLY_CHILD_SHUTDOWN_MECHANISM =
  "abort_local_fly_child_for_summary" as const;

export const MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM =
  "detached_machine_local_state_directory_lifecycle" as const;

export const MACHINE_LOCAL_NODE_SAMPLER_MECHANISM =
  HOSTED_4K_NODE_SAMPLER_MECHANISM;

export type Hosted4kSamplerLifecycleFailClass =
  | "invalid_run_token"
  | "conflicting_state"
  | "duplicate_start"
  | "missing_ready_marker"
  | "missing_sampler_process"
  | "sampler_start_failed"
  | "duplicate_stop"
  | "summary_before_stop"
  | "stop_timeout"
  | "missing_summary"
  | "malformed_summary"
  | "partial_summary_not_finalized"
  | "foreign_run_token"
  | "cleanup_refused_sampler_live"
  | "remote_exec_failed"
  | "spawn_unavailable";

export type Hosted4kDetachedSamplerSummary = {
  readonly finalized: true;
  readonly summaryVersion: typeof HOSTED_4K_SAMPLER_SUMMARY_VERSION;
  readonly measurementClass: "process_tree_memory";
  readonly completenessClass: Hosted4kProcessTreeSamplingCompletenessClass;
  readonly requestedIntervalMs: number;
  readonly sampleCount: number;
  readonly observationDurationMs: number;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly peakSummedRssBytes: number;
  readonly lastSummedRssBytes: number;
  readonly malformedSampleCount: number;
  readonly workerTreeCorrelationClass: Hosted4kProcessTreeWorkerCorrelationClass;
  readonly observerExcluded: boolean;
  readonly oomOrRestartObserved: boolean;
  readonly workerRootMissCount: number;
};

const RUN_TOKEN_RE = /^[a-f0-9]{16}$/;

export function validateHosted4kSamplerRunToken(
  runToken: string,
): runToken is string {
  return RUN_TOKEN_RE.test(runToken);
}

export function generateHosted4kSamplerRunToken(): string {
  return randomBytes(HOSTED_4K_SAMPLER_RUN_TOKEN_BYTES).toString("hex");
}

export function hosted4kSamplerStateDirForRunToken(runToken: string): string {
  if (!validateHosted4kSamplerRunToken(runToken)) {
    throw new Error("invalid_run_token");
  }
  return `${HOSTED_4K_SAMPLER_STATE_ROOT}/${runToken}`;
}

function encodeScript(script: string): string {
  return Buffer.from(script, "utf8").toString("base64");
}

function wrapBase64Script(script: string): string {
  const encoded = encodeScript(script);
  return `sh -c 'echo ${encoded} | base64 -d | sh'`;
}

export function buildHosted4kDetachedSamplerLoopScript(): string {
  return [
    buildHosted4kProcessTreeWalkHelpersExport(),
    'STATE_DIR="${STATE_DIR:?}"',
    'INTERVAL_MS="${INTERVAL_MS:-250}"',
    "sample_count=0",
    "peak_kb=0",
    "last_kb=0",
    "max_gap=0",
    "malformed=0",
    "worker_miss=0",
    "last_sample_mono=",
    "start_mono=$(mono_ms)",
    "worker_tree_seen=0",
    "emit_summary(){",
    "  obs_ms=$(($(mono_ms) - start_mono))",
    "  avg_ms=0",
    "  if [ \"$sample_count\" -gt 1 ] && [ \"$obs_ms\" -gt 0 ]; then",
    "    avg_ms=$((obs_ms / (sample_count - 1)))",
    "  fi",
    "  if [ \"$worker_miss\" -gt 0 ] && [ \"$sample_count\" -gt 0 ]; then",
    "    corr=\"temporarily_uncorrelated\"",
    "  elif [ \"$worker_tree_seen\" -eq 1 ]; then",
    "    corr=\"worker_tree_correlated\"",
    "  else",
    "    corr=\"worker_root_absent\"",
    "  fi",
    "  if [ \"$sample_count\" -lt 30 ]; then comp=\"insufficient_sample_count\"",
    "  elif [ \"$avg_ms\" -gt 400 ]; then comp=\"excessive_average_interval\"",
    "  elif [ \"$max_gap\" -gt 1000 ]; then comp=\"excessive_maximum_gap\"",
    "  elif [ \"$malformed\" -gt 0 ]; then comp=\"malformed_samples\"",
    "  elif [ \"$corr\" = \"worker_root_absent\" ]; then comp=\"worker_root_absent\"",
    "  else comp=\"complete\"; fi",
    "  tmp=\"$STATE_DIR/summary.json.partial\"",
    "  final=\"$STATE_DIR/summary.json\"",
    "  peak_b=$((peak_kb * 1024))",
    "  last_b=$((last_kb * 1024))",
    "  printf '{\"finalized\":true,\"summary_version\":1,\"measurement_class\":\"process_tree_memory\",\"completeness_class\":\"%s\",\"requested_interval_ms\":%s,\"sample_count\":%s,\"observation_duration_ms\":%s,\"average_interval_ms\":%s,\"maximum_observed_gap_ms\":%s,\"peak_summed_rss_bytes\":%s,\"last_summed_rss_bytes\":%s,\"malformed_sample_count\":%s,\"worker_tree_correlation_class\":\"%s\",\"observer_excluded\":true,\"oom_or_restart_observed\":false,\"worker_root_miss_count\":%s}\\n' \\",
    "    \"$comp\" \"$INTERVAL_MS\" \"$sample_count\" \"$obs_ms\" \"$avg_ms\" \"$max_gap\" \"$peak_b\" \"$last_b\" \"$malformed\" \"$corr\" \"$worker_miss\" > \"$tmp\"",
    "  mv \"$tmp\" \"$final\"",
    "}",
    "while [ ! -f \"$STATE_DIR/stop.requested\" ]; do",
    "  loop_mono=$(mono_ms)",
    "  root=$(find_worker_root)",
    "  if [ -z \"$root\" ]; then",
    "    worker_miss=$((worker_miss+1))",
    "    sleep $(awk \"BEGIN{printf \\\"%.3f\\\", $INTERVAL_MS/1000}\")",
    "    continue",
    "  fi",
    "  worker_tree_seen=1",
    "  set -- $(sum_worker_tree \"$root\")",
    "  summed=$1",
    "  count=$2",
    "  if [ \"$count\" -eq 0 ]; then",
    "    worker_miss=$((worker_miss+1))",
    "    sleep $(awk \"BEGIN{printf \\\"%.3f\\\", $INTERVAL_MS/1000}\")",
    "    continue",
    "  fi",
    "  if [ -n \"$last_sample_mono\" ]; then",
    "    gap=$((loop_mono - last_sample_mono))",
    "    [ \"$gap\" -gt \"$max_gap\" ] && max_gap=$gap",
    "  fi",
    "  last_sample_mono=$loop_mono",
    "  sample_count=$((sample_count+1))",
    "  last_kb=$summed",
    "  [ \"$summed\" -gt \"$peak_kb\" ] && peak_kb=$summed",
    "  now_mono=$(mono_ms)",
    "  sleep_ms=$((INTERVAL_MS - (now_mono - loop_mono)))",
    "  if [ \"$sleep_ms\" -gt 0 ]; then",
    "    sleep $(awk \"BEGIN{printf \\\"%.3f\\\", sleep_ms/1000}\")",
    "  fi",
    "done",
    "emit_summary",
    "rm -f \"$STATE_DIR/sampler.pid\"",
  ].join("\n");
}

export function buildHosted4kDetachedSamplerStartScriptBody(input: {
  readonly runToken: string;
  readonly intervalMs: number;
}): string {
  if (!validateHosted4kSamplerRunToken(input.runToken)) {
    throw new Error("invalid_run_token");
  }
  const stateDir = hosted4kSamplerStateDirForRunToken(input.runToken);
  const samplerEncoded = encodeScript(buildHosted4kNodeSamplerEmbeddedScript());
  return [
    `RUN_TOKEN=${input.runToken}`,
    `STATE_DIR=${stateDir}`,
    `STATE_ROOT=${HOSTED_4K_SAMPLER_STATE_ROOT}`,
    `INTERVAL_MS=${input.intervalMs}`,
    'case "$RUN_TOKEN" in [a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9]) ;; *) echo \'{"err":"invalid_run_token"}\'; exit 2;; esac',
    'if [ -d "$STATE_DIR" ] && [ -f "$STATE_DIR/ready" ] && [ -f "$STATE_DIR/sampler.pid" ]; then',
    '  spid=$(cat "$STATE_DIR/sampler.pid" 2>/dev/null || echo "")',
    '  if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then',
    '    echo \'{"err":"duplicate_start"}\'; exit 3',
    "  fi",
    "fi",
    'if [ -d "$STATE_DIR" ]; then rm -rf "$STATE_DIR"; fi',
    'mkdir -p "$STATE_DIR"',
    'chmod 700 "$STATE_DIR"',
    `echo ${samplerEncoded} | base64 -d > "$STATE_DIR/${HOSTED_4K_SAMPLER_SCRIPT_FILENAME}"`,
    `( export STATE_DIR INTERVAL_MS; node "$STATE_DIR/${HOSTED_4K_SAMPLER_SCRIPT_FILENAME}" ) >/dev/null 2>&1 &`,
    'echo $! > "$STATE_DIR/sampler.pid"',
    "sleep 0.3",
    'spid=$(cat "$STATE_DIR/sampler.pid" 2>/dev/null || echo "")',
    'if [ -z "$spid" ] || ! kill -0 "$spid" 2>/dev/null; then',
    '  echo \'{"err":"sampler_start_failed"}\'; exit 4',
    "fi",
    'touch "$STATE_DIR/ready"',
    'printf \'{"ready":true,"run_token":"%s"}\\n\' "$RUN_TOKEN"',
  ].join("\n");
}

export function buildHosted4kDetachedSamplerStartCommand(input: {
  readonly runToken: string;
  readonly intervalMs: number;
}): string {
  return wrapBase64Script(
    buildHosted4kDetachedSamplerStartScriptBody(input),
  );
}

export function buildHosted4kDetachedSamplerStopRequestScriptBody(
  runToken: string,
): string {
  const stateDir = hosted4kSamplerStateDirForRunToken(runToken);
  return [
    `STATE_DIR=${stateDir}`,
    'if [ ! -d "$STATE_DIR" ]; then echo \'{"err":"foreign_run_token"}\'; exit 2; fi',
    'if [ ! -f "$STATE_DIR/ready" ]; then echo \'{"err":"missing_ready_marker"}\'; exit 2; fi',
    'if [ -f "$STATE_DIR/stop.requested" ]; then echo \'{"err":"duplicate_stop"}\'; exit 4; fi',
    'if [ -f "$STATE_DIR/summary.json" ]; then echo \'{"err":"summary_before_stop"}\'; exit 5; fi',
    'if [ ! -f "$STATE_DIR/sampler.pid" ]; then echo \'{"err":"missing_sampler_process"}\'; exit 3; fi',
    'if [ ! -s "$STATE_DIR/sampler.pid" ] || ! kill -0 "$(cat "$STATE_DIR/sampler.pid")" 2>/dev/null; then echo \'{"err":"missing_sampler_process"}\'; exit 3; fi',
    'touch "$STATE_DIR/stop.requested"',
    'echo \'{"stop_requested":true}\'',
  ].join("\n");
}

export function buildHosted4kDetachedSamplerStopRequestCommand(
  runToken: string,
): string {
  return wrapBase64Script(
    buildHosted4kDetachedSamplerStopRequestScriptBody(runToken),
  );
}

export function buildHosted4kDetachedSamplerSummaryPollScriptBody(
  runToken: string,
): string {
  const stateDir = hosted4kSamplerStateDirForRunToken(runToken);
  return [
    `STATE_DIR=${stateDir}`,
    'if [ ! -d "$STATE_DIR" ]; then echo \'{"err":"foreign_run_token"}\'; exit 2; fi',
    'if [ -f "$STATE_DIR/summary.json" ]; then',
    '  grep -q \'"finalized":true\' "$STATE_DIR/summary.json" && cat "$STATE_DIR/summary.json" && exit 0',
    "fi",
    'echo \'{"pending":true}\'',
  ].join("\n");
}

export function buildHosted4kDetachedSamplerSummaryPollCommand(
  runToken: string,
): string {
  return wrapBase64Script(
    buildHosted4kDetachedSamplerSummaryPollScriptBody(runToken),
  );
}

export function buildHosted4kDetachedSamplerCleanupScriptBody(
  runToken: string,
): string {
  const stateDir = hosted4kSamplerStateDirForRunToken(runToken);
  return [
    `STATE_DIR=${stateDir}`,
    'if [ ! -d "$STATE_DIR" ]; then echo \'{"cleaned":true,"absent":true}\'; exit 0; fi',
    'if [ -f "$STATE_DIR/sampler.pid" ]; then',
    '  spid=$(cat "$STATE_DIR/sampler.pid" 2>/dev/null || echo "")',
    '  if [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null; then',
    '    echo \'{"err":"cleanup_refused_sampler_live"}\'; exit 5',
    "  fi",
    "fi",
    'rm -rf "$STATE_DIR"',
    'echo \'{"cleaned":true}\'',
  ].join("\n");
}

export function buildHosted4kDetachedSamplerCleanupCommand(
  runToken: string,
): string {
  return wrapBase64Script(
    buildHosted4kDetachedSamplerCleanupScriptBody(runToken),
  );
}

export function buildHosted4kDetachedSamplerRemoteStateProbeCommand(): string {
  const script = [
    `ROOT=${HOSTED_4K_SAMPLER_STATE_ROOT}`,
    'if [ ! -d "$ROOT" ]; then echo \'{"state_root_absent":true}\'; exit 0; fi',
    'count=$(find "$ROOT" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d " ")',
    'live=0',
    'for d in "$ROOT"/*; do',
    '  [ -d "$d" ] || continue',
    '  [ -f "$d/sampler.pid" ] || continue',
    '  spid=$(cat "$d/sampler.pid" 2>/dev/null || echo "")',
    '  [ -n "$spid" ] && kill -0 "$spid" 2>/dev/null && live=$((live+1))',
    "done",
    'printf \'{"state_dir_count":%s,"live_sampler_count":%s}\\n\' "$count" "$live"',
  ].join("\n");
  return wrapBase64Script(script);
}

export function parseHosted4kDetachedSamplerSummaryJson(
  raw: string,
): { readonly ok: true; readonly summary: Hosted4kDetachedSamplerSummary } | {
  readonly ok: false;
  readonly failClass: Hosted4kSamplerLifecycleFailClass;
} {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") && l.includes('"finalized"'));
  if (line == null) {
    return { ok: false, failClass: "missing_summary" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, failClass: "malformed_summary" };
  }
  if (parsed == null || typeof parsed !== "object") {
    return { ok: false, failClass: "malformed_summary" };
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.finalized !== true) {
    return { ok: false, failClass: "partial_summary_not_finalized" };
  }
  if (
    rec.summary_version !== HOSTED_4K_SAMPLER_SUMMARY_VERSION &&
    rec.summary_version !== 1
  ) {
    return { ok: false, failClass: "malformed_summary" };
  }
  if (rec.measurement_class !== "process_tree_memory") {
    return { ok: false, failClass: "malformed_summary" };
  }
  const sampleCount = Number(rec.sample_count);
  const observationDurationMs = Number(rec.observation_duration_ms);
  const peakSummedRssBytes = Number(rec.peak_summed_rss_bytes);
  const lastSummedRssBytes = Number(rec.last_summed_rss_bytes);
  const requestedIntervalMs = Number(rec.requested_interval_ms);
  const averageIntervalMs =
    rec.average_interval_ms == null ? null : Number(rec.average_interval_ms);
  const maximumObservedGapMs =
    rec.maximum_observed_gap_ms == null
      ? null
      : Number(rec.maximum_observed_gap_ms);
  const malformedSampleCount = Number(rec.malformed_sample_count ?? 0);
  const workerRootMissCount = Number(rec.worker_root_miss_count ?? 0);
  const completenessClass = rec.completeness_class;
  const workerTreeCorrelationClass = rec.worker_tree_correlation_class;
  if (
    typeof completenessClass !== "string" ||
    typeof workerTreeCorrelationClass !== "string" ||
    !Number.isInteger(sampleCount) ||
    sampleCount < 0 ||
    !Number.isFinite(observationDurationMs) ||
    observationDurationMs < 0 ||
    !Number.isFinite(peakSummedRssBytes) ||
    peakSummedRssBytes < 0 ||
    !Number.isFinite(lastSummedRssBytes) ||
    lastSummedRssBytes < 0 ||
    !Number.isFinite(requestedIntervalMs) ||
    requestedIntervalMs <= 0 ||
    rec.observer_excluded !== true
  ) {
    return { ok: false, failClass: "malformed_summary" };
  }
  if (sampleCount === 0) {
    return { ok: false, failClass: "malformed_summary" };
  }
  return {
    ok: true,
    summary: Object.freeze({
      finalized: true,
      summaryVersion: HOSTED_4K_SAMPLER_SUMMARY_VERSION,
      measurementClass: "process_tree_memory",
      completenessClass:
        completenessClass as Hosted4kProcessTreeSamplingCompletenessClass,
      requestedIntervalMs: Math.round(requestedIntervalMs),
      sampleCount,
      observationDurationMs: Math.round(observationDurationMs),
      averageIntervalMs:
        averageIntervalMs != null && Number.isFinite(averageIntervalMs)
          ? Math.round(averageIntervalMs)
          : null,
      maximumObservedGapMs:
        maximumObservedGapMs != null && Number.isFinite(maximumObservedGapMs)
          ? Math.round(maximumObservedGapMs)
          : null,
      peakSummedRssBytes: Math.round(peakSummedRssBytes),
      lastSummedRssBytes: Math.round(lastSummedRssBytes),
      malformedSampleCount: Number.isFinite(malformedSampleCount)
        ? Math.round(malformedSampleCount)
        : 0,
      workerTreeCorrelationClass:
        workerTreeCorrelationClass as Hosted4kProcessTreeWorkerCorrelationClass,
      observerExcluded: true,
      oomOrRestartObserved: rec.oom_or_restart_observed === true,
      workerRootMissCount: Number.isFinite(workerRootMissCount)
        ? Math.round(workerRootMissCount)
        : 0,
    }),
  };
}

export function buildObservationFromDetachedSamplerSummary(input: {
  readonly summary: Hosted4kDetachedSamplerSummary;
  readonly sampleIntervalMs: number;
  readonly minObservationMs: number;
}): Hosted4kProcessTreeMemoryObservation {
  const scope = hosted4kProcessTreeMemoryScope();
  const cadence = buildHosted4kProcessTreeSamplingCadenceEvidence({
    requestedIntervalMs: input.summary.requestedIntervalMs,
    sampleCount: input.summary.sampleCount,
    observationDurationMs: input.summary.observationDurationMs,
    gapMs: Object.freeze([]),
    observedAverageIntervalMs: input.summary.averageIntervalMs,
    observedMaximumGapMs: input.summary.maximumObservedGapMs,
    malformedSampleCount: input.summary.malformedSampleCount,
    workerRootFound:
      input.summary.workerTreeCorrelationClass !== "worker_root_absent",
    observerExcluded: input.summary.observerExcluded,
    temporarilyUncorrelated:
      input.summary.workerTreeCorrelationClass === "temporarily_uncorrelated",
    requestedDurationMs: input.summary.observationDurationMs,
    minSamples: 30,
    maxAverageIntervalMs: 400,
    maxGapMs: 1000,
  });
  const samplingComplete =
    input.summary.completenessClass === "complete" &&
    cadence.samplingCompletenessClass === "complete" &&
    input.summary.sampleCount > 0 &&
    input.summary.peakSummedRssBytes > 0 &&
    input.summary.observationDurationMs >= input.minObservationMs;
  return Object.freeze({
    scope,
    sampleIntervalMs: input.sampleIntervalMs,
    sampleCount: input.summary.sampleCount,
    summedProcessTreeRssBytes: input.summary.lastSummedRssBytes,
    peakProcessTreeRssBytes: input.summary.peakSummedRssBytes,
    observationDurationMs: input.summary.observationDurationMs,
    samplingComplete,
    oomOrRestartObserved: input.summary.oomOrRestartObserved,
    unavailableReason: samplingComplete
      ? null
      : `lifecycle_${input.summary.completenessClass}`,
    cadence,
  });
}

function flyExecTimeoutSeconds(seconds: number): string {
  return String(Math.max(15, Math.ceil(seconds)));
}

async function runDefaultFlySpawn(input: {
  readonly args: readonly string[];
  readonly spawn?: FlySpawnFn;
}): Promise<FlySpawnResult> {
  const spawnFn = input.spawn ?? runFlySpawnDefault;
  return spawnFn({ args: input.args });
}

function parseFlyMachineExecRemoteExitCode(stdout: string): number | null {
  const match = stdout.match(/^Exit code:\s*(\d+)/m);
  if (match == null) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

function isFlyMachineExecRemoteFailure(exec: FlySpawnResult): boolean {
  if (exec.spawnError) return true;
  if (exec.exitCode !== 0 && exec.exitCode !== null) return true;
  const remoteExit = parseFlyMachineExecRemoteExitCode(exec.stdout);
  return remoteExit != null && remoteExit !== 0;
}

function parseRemoteErr(stdout: string): string | null {
  const line = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("{") && l.includes('"err"'));
  if (line == null) return null;
  try {
    const rec = JSON.parse(line) as Record<string, unknown>;
    return typeof rec.err === "string" ? rec.err : null;
  } catch {
    return null;
  }
}

export async function startHosted4kDetachedSamplerRemote(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly intervalMs?: number;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true; readonly runToken: string }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  if (!validateHosted4kSamplerRunToken(input.runToken)) {
    return { ok: false, failClass: "invalid_run_token" };
  }
  const command = buildHosted4kDetachedSamplerStartCommand({
    runToken: input.runToken,
    intervalMs: input.intervalMs ?? 250,
  });
  const exec = await runDefaultFlySpawn({
    args: [
      "machine",
      "exec",
      input.renderMachineId,
      "-a",
      input.flyAppName,
      "--timeout",
      flyExecTimeoutSeconds(30),
      command,
    ],
    spawn: input.spawn,
  });
  if (isFlyMachineExecRemoteFailure(exec)) {
    const err = parseRemoteErr(exec.stdout);
    if (err === "duplicate_start") return { ok: false, failClass: "duplicate_start" };
    if (err === "sampler_start_failed") {
      return { ok: false, failClass: "sampler_start_failed" };
    }
    return { ok: false, failClass: "remote_exec_failed" };
  }
  if (!exec.stdout.includes('"ready":true')) {
    return { ok: false, failClass: "missing_ready_marker" };
  }
  return { ok: true, runToken: input.runToken };
}

export async function requestHosted4kDetachedSamplerStop(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  const command = buildHosted4kDetachedSamplerStopRequestCommand(input.runToken);
  const exec = await runDefaultFlySpawn({
    args: [
      "machine",
      "exec",
      input.renderMachineId,
      "-a",
      input.flyAppName,
      "--timeout",
      flyExecTimeoutSeconds(20),
      command,
    ],
    spawn: input.spawn,
  });
  if (isFlyMachineExecRemoteFailure(exec)) {
    const err = parseRemoteErr(exec.stdout);
    if (err === "missing_ready_marker") {
      return { ok: false, failClass: "missing_ready_marker" };
    }
    if (err === "missing_sampler_process") {
      return { ok: false, failClass: "missing_sampler_process" };
    }
    if (err === "duplicate_stop") return { ok: false, failClass: "duplicate_stop" };
    if (err === "summary_before_stop") {
      return { ok: false, failClass: "summary_before_stop" };
    }
    if (err === "foreign_run_token") {
      return { ok: false, failClass: "foreign_run_token" };
    }
    return { ok: false, failClass: "remote_exec_failed" };
  }
  return { ok: true };
}

export async function pollHosted4kDetachedSamplerSummary(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  const command = buildHosted4kDetachedSamplerSummaryPollCommand(input.runToken);
  const exec = await runDefaultFlySpawn({
    args: [
      "machine",
      "exec",
      input.renderMachineId,
      "-a",
      input.flyAppName,
      "--timeout",
      flyExecTimeoutSeconds(15),
      command,
    ],
    spawn: input.spawn,
  });
  if (isFlyMachineExecRemoteFailure(exec)) {
    const err = parseRemoteErr(exec.stdout);
    if (err === "foreign_run_token") {
      return { ok: false, failClass: "foreign_run_token" };
    }
    return { ok: false, failClass: "remote_exec_failed" };
  }
  if (exec.stdout.includes('"pending":true')) {
    return { ok: false, failClass: "missing_summary" };
  }
  if (exec.stdout.includes('"finalized":true')) {
    return { ok: true, stdout: exec.stdout };
  }
  return { ok: false, failClass: "missing_summary" };
}

export async function waitHosted4kDetachedSamplerSummary(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true; readonly summary: Hosted4kDetachedSamplerSummary }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const pollIntervalMs = input.pollIntervalMs ?? 500;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const poll = await pollHosted4kDetachedSamplerSummary(input);
    if (poll.ok) {
      const parsed = parseHosted4kDetachedSamplerSummaryJson(poll.stdout);
      if (parsed.ok) return { ok: true, summary: parsed.summary };
      return { ok: false, failClass: parsed.failClass };
    }
    if (poll.failClass !== "missing_summary") {
      return { ok: false, failClass: poll.failClass };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  return { ok: false, failClass: "stop_timeout" };
}

export async function cleanupHosted4kDetachedSamplerState(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  const command = buildHosted4kDetachedSamplerCleanupCommand(input.runToken);
  const exec = await runDefaultFlySpawn({
    args: [
      "machine",
      "exec",
      input.renderMachineId,
      "-a",
      input.flyAppName,
      "--timeout",
      flyExecTimeoutSeconds(15),
      command,
    ],
    spawn: input.spawn,
  });
  if (isFlyMachineExecRemoteFailure(exec)) {
    const err = parseRemoteErr(exec.stdout);
    if (err === "cleanup_refused_sampler_live") {
      return { ok: false, failClass: "cleanup_refused_sampler_live" };
    }
    return { ok: false, failClass: "remote_exec_failed" };
  }
  return { ok: true };
}

export async function completeHosted4kDetachedSamplerLifecycle(input: {
  readonly flyAppName: string;
  readonly renderMachineId: string;
  readonly runToken: string;
  readonly sampleIntervalMs?: number;
  readonly minObservationMs?: number;
  readonly summaryTimeoutMs?: number;
  readonly spawn?: FlySpawnFn;
}): Promise<
  | { readonly ok: true; readonly observation: Hosted4kProcessTreeMemoryObservation }
  | { readonly ok: false; readonly failClass: Hosted4kSamplerLifecycleFailClass }
> {
  const stop = await requestHosted4kDetachedSamplerStop(input);
  if (!stop.ok) return stop;
  const summary = await waitHosted4kDetachedSamplerSummary({
    ...input,
    timeoutMs: input.summaryTimeoutMs ?? 30_000,
  });
  if (!summary.ok) return summary;
  await cleanupHosted4kDetachedSamplerState(input);
  const observation = buildObservationFromDetachedSamplerSummary({
    summary: summary.summary,
    sampleIntervalMs: input.sampleIntervalMs ?? 250,
    minObservationMs: input.minObservationMs ?? 9500,
  });
  return { ok: true, observation };
}

export const HEADLESS_FLY_RENDER_4K_SAMPLER_LIFECYCLE_PREFLIGHT_GATE_ENV =
  "HEADLESS_FLY_RENDER_4K_SAMPLER_LIFECYCLE_PREFLIGHT" as const;

export function isFlyRender4kSamplerLifecyclePreflightGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  try {
    return (
      (env as Record<string, unknown>)[
        HEADLESS_FLY_RENDER_4K_SAMPLER_LIFECYCLE_PREFLIGHT_GATE_ENV
      ] === "1"
    );
  } catch {
    return false;
  }
}

export type FlyRender4kSamplerLifecyclePreflightResult = {
  readonly exitCode: number;
  readonly overall: "NOT_TESTED" | "PASS" | "FAIL";
  readonly sampleCount: number;
  readonly observationDurationMs: number | null;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly peakProcessTreeRssBytes: number | null;
  readonly samplingCompletenessClass: string | null;
  readonly workerTreeCorrelationClass: string | null;
  readonly unavailableReason: string | null;
  readonly renderMachineId: string;
  readonly failClass: string | null;
};

export async function runHosted4kDetachedSamplerLifecyclePreflight(
  deps: {
    readonly env?: NodeJS.ProcessEnv | Record<string, unknown>;
    readonly forceGateOn?: boolean;
    readonly flyAppName?: string;
    readonly renderMachineId?: string;
    readonly sampleDurationMs?: number;
    readonly spawn?: FlySpawnFn;
  } = {},
): Promise<FlyRender4kSamplerLifecyclePreflightResult> {
  const env = deps.env ?? process.env;
  const gateOn =
    deps.forceGateOn === true || isFlyRender4kSamplerLifecyclePreflightGateOn(env);
  const renderMachineId = deps.renderMachineId ?? HOSTED_4K_RENDER_MACHINE_ID;
  const flyAppName =
    deps.flyAppName ?? HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP;

  if (!gateOn) {
    return {
      exitCode: 0,
      overall: "NOT_TESTED",
      sampleCount: 0,
      observationDurationMs: null,
      averageIntervalMs: null,
      maximumObservedGapMs: null,
      peakProcessTreeRssBytes: null,
      samplingCompletenessClass: null,
      workerTreeCorrelationClass: null,
      unavailableReason: null,
      renderMachineId,
      failClass: null,
    };
  }

  const runToken = generateHosted4kSamplerRunToken();
  const sampleDurationMs = deps.sampleDurationMs ?? 12_000;
  const started = await startHosted4kDetachedSamplerRemote({
    flyAppName,
    renderMachineId,
    runToken,
    spawn: deps.spawn,
  });
  if (!started.ok) {
    return {
      exitCode: 1,
      overall: "FAIL",
      sampleCount: 0,
      observationDurationMs: null,
      averageIntervalMs: null,
      maximumObservedGapMs: null,
      peakProcessTreeRssBytes: null,
      samplingCompletenessClass: null,
      workerTreeCorrelationClass: null,
      unavailableReason: `lifecycle_${started.failClass}`,
      renderMachineId,
      failClass: started.failClass,
    };
  }

  await new Promise((r) => setTimeout(r, sampleDurationMs));

  const completed = await completeHosted4kDetachedSamplerLifecycle({
    flyAppName,
    renderMachineId,
    runToken,
    minObservationMs: 9500,
    spawn: deps.spawn,
  });

  if (!completed.ok) {
    return {
      exitCode: 1,
      overall: "FAIL",
      sampleCount: 0,
      observationDurationMs: null,
      averageIntervalMs: null,
      maximumObservedGapMs: null,
      peakProcessTreeRssBytes: null,
      samplingCompletenessClass: null,
      workerTreeCorrelationClass: null,
      unavailableReason: `lifecycle_${completed.failClass}`,
      renderMachineId,
      failClass: completed.failClass,
    };
  }

  const observation = completed.observation;
  const cadence = observation.cadence;
  const acceptance =
    cadence != null
      ? evaluateHosted4kSamplerPreflightCadenceAcceptance({
          cadence,
          peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
        })
      : { ok: false as const, failClass: "preflight_cadence_missing" };
  const pass = acceptance.ok;

  return {
    exitCode: pass ? 0 : 1,
    overall: pass ? "PASS" : "FAIL",
    sampleCount: observation.sampleCount,
    observationDurationMs: observation.observationDurationMs,
    averageIntervalMs: cadence?.averageIntervalMs ?? null,
    maximumObservedGapMs: cadence?.maximumObservedGapMs ?? null,
    peakProcessTreeRssBytes: observation.peakProcessTreeRssBytes,
    samplingCompletenessClass: cadence?.samplingCompletenessClass ?? null,
    workerTreeCorrelationClass: cadence?.workerTreeCorrelationClass ?? null,
    unavailableReason: observation.unavailableReason,
    renderMachineId,
    failClass: pass ? null : acceptance.failClass,
  };
}
