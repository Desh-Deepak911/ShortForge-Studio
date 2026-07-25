/**
 * Process-tree peak memory measurement contract for hosted render live evidence.
 *
 * Measures container/process-tree RSS including Chromium and FFmpeg children —
 * not Node coordinator RSS alone.
 *
 * On Linux hosted workers: sum RSS of worker PID and all descendants via /proc.
 * Sampling interval matches worker run-metrics cadence (default 250ms).
 */

import { spawnSync } from "node:child_process";

export const HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS = 250 as const;

export type HostedRenderProcessTreeMemoryScope = {
  readonly measurement: "process_tree_peak_rss_bytes";
  readonly includes: readonly ["node_coordinator", "chromium", "ffmpeg", "child_processes"];
  readonly excludes: readonly ["foreign_processes", "host_outside_cgroup"];
  readonly notNodeRssAlone: true;
  readonly not4kCapacityAuthority: true;
};

export type HostedRenderProcessTreePeakObservation = {
  readonly scope: HostedRenderProcessTreeMemoryScope;
  readonly sampleIntervalMs: number;
  readonly peakProcessTreeRssBytes: number | null;
  readonly observationDurationMs: number | null;
  readonly unavailableReason: string | null;
};

export function hostedRenderProcessTreeMemoryScope(): HostedRenderProcessTreeMemoryScope {
  return Object.freeze({
    measurement: "process_tree_peak_rss_bytes",
    includes: Object.freeze([
      "node_coordinator",
      "chromium",
      "ffmpeg",
      "child_processes",
    ] as const),
    excludes: Object.freeze(["foreign_processes", "host_outside_cgroup"] as const),
    notNodeRssAlone: true,
    not4kCapacityAuthority: true,
  });
}

function listDescendantPids(rootPid: number): number[] {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return [];
  const result = spawnSync("ps", ["-o", "pid=", "--ppid", String(rootPid)], {
    encoding: "utf8",
  });
  if (result.status !== 0 || result.stdout == null) return [];
  const direct = result.stdout
    .split("\n")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  const all: number[] = [rootPid];
  for (const pid of direct) {
    all.push(pid, ...listDescendantPids(pid));
  }
  return [...new Set(all)];
}

function readProcessRssBytes(pid: number): number | null {
  if (process.platform !== "linux") return null;
  try {
    const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], {
      encoding: "utf8",
    });
    if (result.status !== 0) return null;
    const kb = Number(result.stdout.trim());
    if (!Number.isFinite(kb) || kb < 0) return null;
    return Math.round(kb * 1024);
  } catch {
    return null;
  }
}

/**
 * Sample peak process-tree RSS for the current Node process and descendants.
 * Returns null peak on non-Linux (local authority uses fixtures instead).
 */
export function sampleHostedRenderProcessTreePeakBytes(input: {
  readonly rootPid?: number;
  readonly startedAtMs?: number;
} = {}): HostedRenderProcessTreePeakObservation {
  const rootPid = input.rootPid ?? process.pid;
  const startedAtMs = input.startedAtMs ?? Date.now();
  const scope = hostedRenderProcessTreeMemoryScope();
  if (process.platform !== "linux") {
    return Object.freeze({
      scope,
      sampleIntervalMs: HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS,
      peakProcessTreeRssBytes: null,
      observationDurationMs: Date.now() - startedAtMs,
      unavailableReason: "non_linux_local_authority",
    });
  }
  const pids = listDescendantPids(rootPid);
  let peak: number | null = null;
  for (const pid of pids) {
    const rss = readProcessRssBytes(pid);
    if (rss == null) continue;
    if (peak == null || rss > peak) peak = rss;
  }
  return Object.freeze({
    scope,
    sampleIntervalMs: HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS,
    peakProcessTreeRssBytes: peak,
    observationDurationMs: Date.now() - startedAtMs,
    unavailableReason: peak == null ? "process_tree_unreadable" : null,
  });
}

export function validateHostedRenderResourceObservation(
  observation: HostedRenderProcessTreePeakObservation,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (observation.scope.notNodeRssAlone !== true) {
    return { ok: false, message: "Must not treat Node RSS as total authority." };
  }
  if (observation.scope.not4kCapacityAuthority !== true) {
    return { ok: false, message: "Must not claim 4K capacity from smoke observation." };
  }
  if (
    observation.peakProcessTreeRssBytes != null &&
    (!Number.isSafeInteger(observation.peakProcessTreeRssBytes) ||
      observation.peakProcessTreeRssBytes < 0)
  ) {
    return { ok: false, message: "Invalid peakProcessTreeRssBytes." };
  }
  return { ok: true };
}
