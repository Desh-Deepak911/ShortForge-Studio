/**
 * Sprint 11E Phase 2E.2D.8K.2.1 — Machine-local persistent /proc sampler script and parser.
 *
 * One Fly exec/SSH round trip launches a loop inside the render Machine.
 * Privacy: never retain PIDs, argv, environment values, or raw timestamps.
 */

export const HOSTED_4K_RENDER_MACHINE_ID =
  "d895d16f264918" as const;

export type Hosted4kRemoteSampleExitClass =
  | "ok"
  | "command_unavailable"
  | "wrong_fly_cli_syntax"
  | "machine_selection_failure"
  | "shell_quoting_failure"
  | "remote_command_non_zero"
  | "stdout_framing_parser_failure"
  | "proc_permission_failure"
  | "worker_root_absent"
  | "observer_only_tree"
  | "malformed_remote_output"
  | "zero_samples"
  | "sampling_window_incomplete";

export type Hosted4kRemoteProcessTreeSampleLine = {
  readonly summedKb: number;
  readonly treeCount: number;
  readonly workerRootFound: boolean;
  readonly observerExcluded: boolean;
};

export type Hosted4kMachineLocalProcessTreeSummary = {
  readonly requestedIntervalMs: number;
  readonly sampleCount: number;
  readonly observationDurationMs: number;
  readonly averageIntervalMs: number | null;
  readonly maximumObservedGapMs: number | null;
  readonly peakSummedKb: number;
  readonly lastSummedKb: number;
  readonly malformedSampleCount: number;
  readonly workerRootFound: boolean;
  readonly observerExcluded: boolean;
  readonly gapMs: readonly number[];
  readonly workerRootMissCount: number;
};

export type Hosted4kRemoteProcessTreeSampleParseResult =
  | { readonly ok: true; readonly sample: Hosted4kRemoteProcessTreeSampleLine }
  | {
      readonly ok: false;
      readonly exitClass: Hosted4kRemoteSampleExitClass;
    };

/** Shared /proc tree-walk helpers used by single-shot and persistent sampler scripts. */
export function buildHosted4kProcessTreeWalkHelpersExport(): string {
  return buildHosted4kProcessTreeWalkHelpersBody();
}

function buildHosted4kProcessTreeWalkHelpers(): string {
  return buildHosted4kProcessTreeWalkHelpersBody();
}

function buildHosted4kProcessTreeWalkHelpersBody(): string {
  return [
    "OBS=$$",
    "ppid_of(){ sed -n 's/^PPid:[[:space:]]*\\([0-9]*\\).*/\\1/p' \"/proc/$1/status\" 2>/dev/null | head -1; }",
    "in_obs_tree(){ p=$1; while [ -n \"$p\" ] && [ \"$p\" != \"0\" ]; do [ \"$p\" = \"$OBS\" ] && return 0; p=$(ppid_of \"$p\"); done; return 1; }",
    "rss_kb(){ awk '/^VmRSS:/{print $2; exit}' \"/proc/$1/status\" 2>/dev/null; }",
    "mono_ms(){ awk '{printf \"%d\\n\", $1*1000}' /proc/uptime 2>/dev/null | head -1; }",
    "find_worker_root(){",
    "  root=",
    "  for d in /proc/[0-9]*; do",
    "    pid=${d#/proc/}",
    "    case \"$pid\" in *[!0-9]*) continue;; esac",
    "    [ \"$pid\" = \"$OBS\" ] && continue",
    "    cmd=$(tr '\\0' ' ' < \"$d/cmdline\" 2>/dev/null) || continue",
    "    case \"$cmd\" in *hosted-worker*|*headless-worker*) root=$pid; break;; esac",
    "  done",
    "  if [ -z \"$root\" ]; then",
    "    for d in /proc/[0-9]*; do",
    "      pid=${d#/proc/}",
    "      case \"$pid\" in *[!0-9]*) continue;; esac",
    "      pp=$(ppid_of \"$pid\")",
    "      [ \"$pp\" = \"1\" ] || continue",
    "      cmd=$(tr '\\0' ' ' < \"$d/cmdline\" 2>/dev/null) || continue",
    "      case \"$cmd\" in *node*) root=$pid; break;; esac",
    "    done",
    "  fi",
    "  printf '%s' \"$root\"",
    "}",
    "sum_worker_tree(){",
    "  root=$1",
    "  if [ -z \"$root\" ]; then echo 0 0; return 1; fi",
    "  summed=0",
    "  count=0",
    "  stack=\"$root\"",
    "  seen=\" \"",
    "  while [ -n \"$stack\" ]; do",
    "    pid=${stack%% *}",
    "    rest=${stack#* }",
    "    [ \"$stack\" = \"$rest\" ] && rest=",
    "    stack=\"$rest\"",
    "    case \"$seen\" in *\" $pid \"*) continue;; esac",
    "    seen=\"$seen$pid \"",
    "    in_obs_tree \"$pid\" && continue",
    "    kb=$(rss_kb \"$pid\")",
    "    if [ -n \"$kb\" ]; then summed=$((summed+kb)); count=$((count+1)); fi",
    "    for d in /proc/[0-9]*; do",
    "      cp=${d#/proc/}",
    "      case \"$cp\" in *[!0-9]*) continue;; esac",
    "      [ \"$(ppid_of \"$cp\")\" = \"$pid\" ] || continue",
    "      case \"$seen\" in *\" $cp \"*) continue;; esac",
    "      stack=\"$stack $cp\"",
    "    done",
    "  done",
    "  echo \"$summed $count\"",
    "}",
  ].join("\n");
}

/** Legacy single-shot sample — retained for parser/fixture compatibility only. */
export function buildHosted4kRemoteProcessTreeSampleScript(): string {
  return [
    buildHosted4kProcessTreeWalkHelpers(),
    "root=$(find_worker_root)",
    "if [ -z \"$root\" ]; then echo '{\"err\":\"worker_root_absent\"}'; exit 2; fi",
    "set -- $(sum_worker_tree \"$root\")",
    "summed=$1",
    "count=$2",
    "if [ \"$count\" -eq 0 ]; then echo '{\"err\":\"observer_only_tree\"}'; exit 3; fi",
    "printf '{\"summed_kb\":%s,\"tree_count\":%s,\"worker_root_found\":true,\"observer_excluded\":true}\\n' \"$summed\" \"$count\"",
  ].join("\n");
}

/**
 * Persistent Machine-local sampler — one process, monotonic /proc/uptime clock,
 * 250 ms cadence loop, peak RSS tracked locally, final privacy-safe summary JSONL.
 */
export function buildHosted4kMachineLocalProcessTreeSamplerScript(input: {
  readonly intervalMs: number;
  readonly durationMs: number;
}): string {
  return [
    buildHosted4kProcessTreeWalkHelpers(),
    `INTERVAL_MS=${input.intervalMs}`,
    `DURATION_MS=${input.durationMs}`,
    "sample_count=0",
    "peak_kb=0",
    "last_kb=0",
    "max_gap=0",
    "malformed=0",
    "worker_miss=0",
    "last_sample_mono=",
    "start_mono=$(mono_ms)",
    "end_mono=$((start_mono + DURATION_MS))",
    "emit_summary(){",
    "  obs_ms=$(($(mono_ms) - start_mono))",
    "  avg_ms=0",
    "  if [ \"$sample_count\" -gt 1 ] && [ \"$obs_ms\" -gt 0 ]; then",
    "    avg_ms=$((obs_ms / (sample_count - 1)))",
    "  fi",
    "  printf '{\"summary\":true,\"requested_interval_ms\":%s,\"sample_count\":%s,\"observation_duration_ms\":%s,\"average_interval_ms\":%s,\"maximum_observed_gap_ms\":%s,\"peak_summed_kb\":%s,\"last_summed_kb\":%s,\"malformed_sample_count\":%s,\"worker_root_found\":%s,\"observer_excluded\":true,\"worker_root_miss_count\":%s}\\n' \\",
    "    \"$INTERVAL_MS\" \"$sample_count\" \"$obs_ms\" \"$avg_ms\" \"$max_gap\" \"$peak_kb\" \"$last_kb\" \"$malformed\" \\",
    "    \"$([ \"$worker_miss\" -eq 0 ] && echo true || echo false)\" \"$worker_miss\"",
    "}",
    "trap 'emit_summary; exit 0' TERM INT",
    "while :; do",
    "  loop_mono=$(mono_ms)",
    "  [ \"$loop_mono\" -ge \"$end_mono\" ] && break",
    "  root=$(find_worker_root)",
    "  if [ -z \"$root\" ]; then",
    "    worker_miss=$((worker_miss+1))",
    "    sleep $(awk \"BEGIN{printf \\\"%.3f\\\", $INTERVAL_MS/1000}\")",
    "    continue",
    "  fi",
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
  ].join("\n");
}

export function buildHosted4kRemoteProcessTreeSampleCommand(
  script: string = buildHosted4kRemoteProcessTreeSampleScript(),
): string {
  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `sh -c 'echo ${encoded} | base64 -d | sh'`;
}

export function buildHosted4kMachineLocalProcessTreeSamplerCommand(input: {
  readonly intervalMs: number;
  readonly durationMs: number;
}): string {
  return buildHosted4kRemoteProcessTreeSampleCommand(
    buildHosted4kMachineLocalProcessTreeSamplerScript(input),
  );
}

function parseJsonRecord(
  parsed: Record<string, unknown>,
): Hosted4kRemoteProcessTreeSampleParseResult | null {
  if (typeof parsed.err === "string") {
    if (parsed.err === "worker_root_absent") {
      return { ok: false, exitClass: "worker_root_absent" };
    }
    if (parsed.err === "observer_only_tree") {
      return { ok: false, exitClass: "observer_only_tree" };
    }
    if (parsed.err === "proc_permission") {
      return { ok: false, exitClass: "proc_permission_failure" };
    }
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  const summedKb = Number(parsed.summed_kb);
  const treeCount = Number(parsed.tree_count);
  if (
    !Number.isFinite(summedKb) ||
    summedKb < 0 ||
    !Number.isInteger(treeCount) ||
    treeCount <= 0
  ) {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  return {
    ok: true,
    sample: Object.freeze({
      summedKb: Math.round(summedKb),
      treeCount,
      workerRootFound: parsed.worker_root_found === true,
      observerExcluded: parsed.observer_excluded === true,
    }),
  };
}

export function parseHosted4kRemoteProcessTreeSampleStdout(
  stdout: string,
): Hosted4kRemoteProcessTreeSampleParseResult {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
  if (jsonLine == null) {
    return { ok: false, exitClass: "stdout_framing_parser_failure" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLine);
  } catch {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  if (parsed == null || typeof parsed !== "object") {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  return (
    parseJsonRecord(parsed as Record<string, unknown>) ?? {
      ok: false,
      exitClass: "malformed_remote_output",
    }
  );
}

export function parseHosted4kMachineLocalProcessTreeSummaryStdout(
  stdout: string,
): { readonly ok: true; readonly summary: Hosted4kMachineLocalProcessTreeSummary } | {
  readonly ok: false;
  readonly exitClass: Hosted4kRemoteSampleExitClass;
} {
  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));
  const summaryLine = [...lines]
    .reverse()
    .find((l) => l.includes('"summary":true') || l.includes('"summary": true'));
  if (summaryLine == null) {
    return { ok: false, exitClass: "stdout_framing_parser_failure" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(summaryLine);
  } catch {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  if (parsed == null || typeof parsed !== "object") {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.summary !== true) {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  const sampleCount = Number(rec.sample_count);
  const observationDurationMs = Number(rec.observation_duration_ms);
  const peakSummedKb = Number(rec.peak_summed_kb);
  const lastSummedKb = Number(rec.last_summed_kb);
  const requestedIntervalMs = Number(rec.requested_interval_ms);
  const averageIntervalMs =
    rec.average_interval_ms == null ? null : Number(rec.average_interval_ms);
  const maximumObservedGapMs =
    rec.maximum_observed_gap_ms == null
      ? null
      : Number(rec.maximum_observed_gap_ms);
  const malformedSampleCount = Number(rec.malformed_sample_count ?? 0);
  const workerRootMissCount = Number(rec.worker_root_miss_count ?? 0);
  if (
    !Number.isInteger(sampleCount) ||
    sampleCount < 0 ||
    !Number.isFinite(observationDurationMs) ||
    observationDurationMs < 0 ||
    !Number.isFinite(peakSummedKb) ||
    peakSummedKb < 0 ||
    !Number.isFinite(lastSummedKb) ||
    lastSummedKb < 0 ||
    !Number.isFinite(requestedIntervalMs) ||
    requestedIntervalMs <= 0
  ) {
    return { ok: false, exitClass: "malformed_remote_output" };
  }
  if (sampleCount === 0) {
    return { ok: false, exitClass: "zero_samples" };
  }
  return {
    ok: true,
    summary: Object.freeze({
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
      peakSummedKb: Math.round(peakSummedKb),
      lastSummedKb: Math.round(lastSummedKb),
      malformedSampleCount: Number.isFinite(malformedSampleCount)
        ? Math.round(malformedSampleCount)
        : 0,
      workerRootFound: rec.worker_root_found === true,
      observerExcluded: rec.observer_excluded === true,
      gapMs: Object.freeze([]),
      workerRootMissCount: Number.isFinite(workerRootMissCount)
        ? Math.round(workerRootMissCount)
        : 0,
    }),
  };
}

export function classifyHosted4kRemoteExecResult(input: {
  readonly spawnError: boolean;
  readonly usedWrongCliSyntax: boolean;
  readonly machineId: string | null;
  readonly expectedMachineId: string;
  readonly exitCode: number | null;
  readonly stdout: string;
}): Hosted4kRemoteSampleExitClass {
  if (input.spawnError) return "command_unavailable";
  if (input.usedWrongCliSyntax) return "wrong_fly_cli_syntax";
  if (
    input.machineId != null &&
    input.machineId !== input.expectedMachineId
  ) {
    return "machine_selection_failure";
  }
  if (input.exitCode == null) return "shell_quoting_failure";
  if (input.exitCode !== 0 && input.exitCode !== 143 && input.exitCode !== 130) {
    const errLine = input.stdout.includes('"err":"worker_root_absent"')
      ? "worker_root_absent"
      : input.stdout.includes('"err":"observer_only_tree"')
        ? "observer_only_tree"
        : input.stdout.includes('"err":"proc_permission"')
          ? "proc_permission_failure"
          : null;
    if (errLine != null) return errLine;
    return "remote_command_non_zero";
  }
  const parsed = parseHosted4kMachineLocalProcessTreeSummaryStdout(input.stdout);
  if (parsed.ok) return "ok";
  const legacy = parseHosted4kRemoteProcessTreeSampleStdout(input.stdout);
  if (legacy.ok) return "ok";
  return parsed.exitClass;
}

export function hosted4kRemoteSampleBytesFromKb(kb: number): number {
  return Math.round(kb * 1024);
}

export const LEGACY_PER_SAMPLE_FLY_ROUND_TRIP_MECHANISM =
  "one_fly_cli_round_trip_per_sample" as const;

export const MACHINE_LOCAL_PERSISTENT_SAMPLER_MECHANISM =
  "one_fly_exec_persistent_machine_local_loop" as const;

export const MACHINE_LOCAL_DETACHED_SAMPLER_LIFECYCLE_MECHANISM =
  "detached_machine_local_state_directory_lifecycle" as const;
