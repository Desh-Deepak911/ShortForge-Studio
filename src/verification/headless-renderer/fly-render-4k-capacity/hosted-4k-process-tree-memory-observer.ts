/**
 * Sprint 11E Phase 2E.2D.8K — hosted Linux process-tree memory observer for 4K capacity.
 *
 * Measures worker coordinator + Chromium + FFmpeg + render descendants via Machine-local
 * /proc data. Never substitutes Node-only RSS, local macOS RSS, or Fly billing memory.
 */

import { readdirSync, readFileSync } from "node:fs";

import { HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS } from "../fly-render-live/process-tree-peak-memory";
import type { Hosted4kProcessTreeSamplingCadenceEvidence } from "./hosted-render-machine-process-tree-cadence";

export type Hosted4kProcessTreeMemoryScope = {
  readonly measurement: "process_tree_peak_rss_bytes";
  readonly authority: "hosted_4k_capacity";
  readonly includes: readonly [
    "worker_coordinator",
    "chromium",
    "ffmpeg",
    "render_descendants",
  ];
  readonly excludes: readonly [
    "observer_process",
    "ssh_session",
    "foreign_processes",
    "host_outside_render_machine",
  ];
  readonly notNodeRssAlone: true;
  readonly notFlyBillingMemory: true;
  readonly notLocalMacosRss: true;
  readonly is4kCapacityAuthority: true;
};

export type Hosted4kProcessTreeMemoryObservation = {
  readonly scope: Hosted4kProcessTreeMemoryScope;
  readonly sampleIntervalMs: number;
  readonly sampleCount: number;
  readonly summedProcessTreeRssBytes: number | null;
  readonly peakProcessTreeRssBytes: number | null;
  readonly observationDurationMs: number | null;
  readonly samplingComplete: boolean;
  readonly oomOrRestartObserved: boolean;
  readonly unavailableReason: string | null;
  readonly cadence: Hosted4kProcessTreeSamplingCadenceEvidence | null;
};

export function hosted4kProcessTreeMemoryScope(): Hosted4kProcessTreeMemoryScope {
  return Object.freeze({
    measurement: "process_tree_peak_rss_bytes",
    authority: "hosted_4k_capacity",
    includes: Object.freeze([
      "worker_coordinator",
      "chromium",
      "ffmpeg",
      "render_descendants",
    ] as const),
    excludes: Object.freeze([
      "observer_process",
      "ssh_session",
      "foreign_processes",
      "host_outside_render_machine",
    ] as const),
    notNodeRssAlone: true,
    notFlyBillingMemory: true,
    notLocalMacosRss: true,
    is4kCapacityAuthority: true,
  });
}

function readLinuxProcessRssBytes(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
    if (match == null) return null;
    const kb = Number(match[1]);
    if (!Number.isFinite(kb) || kb < 0) return null;
    return Math.round(kb * 1024);
  } catch {
    return null;
  }
}

function listChildPids(parentPid: number): number[] {
  const out: number[] = [];
  try {
    for (const entry of readdirSync("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = Number(entry);
      if (!Number.isSafeInteger(pid) || pid <= 0) continue;
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const after = stat.slice(stat.indexOf(")") + 2);
        const ppid = Number(after.split(" ")[1]);
        if (ppid === parentPid) out.push(pid);
      } catch {
        // skip unreadable process
      }
    }
  } catch {
    return [];
  }
  return out;
}

function collectProcessTreePids(
  rootPid: number,
  excludePids: ReadonlySet<number>,
): number[] {
  const seen = new Set<number>();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop()!;
    if (excludePids.has(pid) || seen.has(pid)) continue;
    seen.add(pid);
    for (const child of listChildPids(pid)) {
      if (!seen.has(child)) stack.push(child);
    }
  }
  return [...seen];
}

export function sampleHosted4kProcessTreeMemory(input: {
  readonly rootPid?: number;
  readonly excludePids?: readonly number[];
  readonly startedAtMs?: number;
  readonly endedAtMs?: number;
  readonly sampleCount?: number;
  readonly oomOrRestartObserved?: boolean;
} = {}): Hosted4kProcessTreeMemoryObservation {
  const scope = hosted4kProcessTreeMemoryScope();
  const startedAtMs = input.startedAtMs ?? Date.now();
  const endedAtMs = input.endedAtMs ?? Date.now();
  const exclude = new Set<number>([
    process.pid,
    ...(input.excludePids ?? []),
  ]);

  if (process.platform !== "linux") {
    return Object.freeze({
      scope,
      sampleIntervalMs: HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS,
      sampleCount: 0,
      summedProcessTreeRssBytes: null,
      peakProcessTreeRssBytes: null,
      observationDurationMs: endedAtMs - startedAtMs,
      samplingComplete: false,
      oomOrRestartObserved: input.oomOrRestartObserved === true,
      unavailableReason: "non_linux_local_authority",
      cadence: null,
    });
  }

  const rootPid = input.rootPid ?? process.pid;
  const pids = collectProcessTreePids(rootPid, exclude);
  const rssValues: number[] = [];
  for (const pid of pids) {
    const rss = readLinuxProcessRssBytes(pid);
    if (rss != null) rssValues.push(rss);
  }
  const summed =
    rssValues.length > 0
      ? rssValues.reduce((a, b) => a + b, 0)
      : null;
  const peak =
    rssValues.length > 0 ? Math.max(...rssValues) : null;
  const sampleCount = input.sampleCount ?? (rssValues.length > 0 ? 1 : 0);

  return Object.freeze({
    scope,
    sampleIntervalMs: HEADLESS_FLY_RENDER_PROCESS_TREE_SAMPLE_INTERVAL_MS,
    sampleCount,
    summedProcessTreeRssBytes: summed,
    peakProcessTreeRssBytes: peak,
    observationDurationMs: endedAtMs - startedAtMs,
    samplingComplete: sampleCount > 0 && peak != null,
    oomOrRestartObserved: input.oomOrRestartObserved === true,
    unavailableReason:
      peak == null ? "process_tree_unreadable_or_empty" : null,
    cadence: null,
  });
}

export function validateHosted4kProcessTreeMemoryObservation(
  observation: Hosted4kProcessTreeMemoryObservation,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (observation.scope.is4kCapacityAuthority !== true) {
    return { ok: false, message: "Observation scope is not 4K capacity authority." };
  }
  if (observation.scope.notNodeRssAlone !== true) {
    return { ok: false, message: "Must not treat Node RSS as total authority." };
  }
  if (observation.scope.notFlyBillingMemory !== true) {
    return { ok: false, message: "Must not substitute Fly billing memory." };
  }
  if (observation.scope.notLocalMacosRss !== true) {
    return { ok: false, message: "Must not substitute local macOS RSS." };
  }
  if (
    observation.peakProcessTreeRssBytes != null &&
    (!Number.isSafeInteger(observation.peakProcessTreeRssBytes) ||
      observation.peakProcessTreeRssBytes < 0)
  ) {
    return { ok: false, message: "Invalid peakProcessTreeRssBytes." };
  }
  if (
    observation.summedProcessTreeRssBytes != null &&
    (!Number.isSafeInteger(observation.summedProcessTreeRssBytes) ||
      observation.summedProcessTreeRssBytes < 0)
  ) {
    return { ok: false, message: "Invalid summedProcessTreeRssBytes." };
  }
  if (!Number.isSafeInteger(observation.sampleCount) || observation.sampleCount < 0) {
    return { ok: false, message: "Invalid sampleCount." };
  }
  if (observation.cadence != null) {
    if (
      !Number.isSafeInteger(observation.cadence.requestedIntervalMs) ||
      observation.cadence.requestedIntervalMs <= 0
    ) {
      return { ok: false, message: "Invalid cadence.requestedIntervalMs." };
    }
    if (
      observation.cadence.averageIntervalMs != null &&
      (!Number.isSafeInteger(observation.cadence.averageIntervalMs) ||
        observation.cadence.averageIntervalMs < 0)
    ) {
      return { ok: false, message: "Invalid cadence.averageIntervalMs." };
    }
  }
  return { ok: true };
}

export function detectNodeOnlyRssSubstitution(input: {
  readonly nodeRssBytes: number;
  readonly reportedPeakBytes: number;
}): boolean {
  return (
    Number.isSafeInteger(input.nodeRssBytes) &&
    Number.isSafeInteger(input.reportedPeakBytes) &&
    input.reportedPeakBytes === input.nodeRssBytes
  );
}

export function assertIncomplete4kProcessTreeSamplingFailsClosed(
  observation: Hosted4kProcessTreeMemoryObservation,
): { readonly ok: true } | { readonly ok: false; readonly failClass: string } {
  if (observation.samplingComplete && observation.peakProcessTreeRssBytes != null) {
    return { ok: true };
  }
  return { ok: false, failClass: "incomplete_process_tree_sampling" };
}

export function refuseNonProcMemoryAuthority(): boolean {
  return process.platform !== "linux";
}
