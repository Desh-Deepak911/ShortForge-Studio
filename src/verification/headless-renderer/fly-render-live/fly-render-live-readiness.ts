/**
 * Sprint 11E Phase 2E.2D.8A / 8F.7.2B / 8F.7.2D — Amended read-only Fly render readiness authority.
 * Paths: startup_direct, operational_heartbeat, operational_dispatch_sweep.
 */

import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-verify-first-pass-evidence";
import { HEADLESS_FLY_STAGING_TOPOLOGY } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";
import type { HeadlessFlyStagingSecretLedgerParse } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";
import {
  classifyHeadlessFlyStagingRenderVmSpec,
  classifyHeadlessFlyStagingVerifyVmSpec,
  parseHeadlessFlyStagingDualMachineInventoryFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";

import { HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT } from "./hosted-worker-startup-ordering";
import { parseFlyVerifyLogHostedEvents } from "../fly-verify-live/fly-verify-live-readiness";
import type { ParsedFlyVerifyLogHostedEvent } from "../fly-verify-live/fly-verify-live-readiness";

export type ParsedFlyRenderLogHostedEvent = ParsedFlyVerifyLogHostedEvent;

export const FLY_RENDER_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS = 5_000;
export const FLY_RENDER_LIVE_READINESS_OBSERVATION_WINDOW_MS = 180_000;
export const FLY_RENDER_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS = 120_000;
export const FLY_RENDER_LIVE_READINESS_MIN_DISPATCH_SWEEP_COUNT = 2;

export type FlyRenderLiveReadinessPath =
  | "startup_direct"
  | "operational_heartbeat"
  | "operational_dispatch_sweep";

export type FlyRenderLiveSchemaReadiness =
  | "direct_log"
  | "implied_by_gated_startup";

export type FlyRenderLiveReadinessAttribution = {
  readonly readiness_path: FlyRenderLiveReadinessPath;
  readonly loop_readiness:
    | "startup_direct"
    | "operational_heartbeat"
    | "operational_dispatch_sweep";
  readonly schema_readiness: FlyRenderLiveSchemaReadiness;
  readonly startup_log_retention: "present" | "expired";
  readonly machine_correlation: "exact";
  readonly image_correlation: "exact";
  readonly sweep_sequence: "monotonic" | "none";
  readonly fatal_window: "clear" | "blocked";
  readonly machine_partition?: "exact";
  readonly render_events_considered?: number;
  readonly verify_events_ignored?: number;
  readonly unknown_events_rejected?: number;
};

export type FlyRenderLiveReadinessReport = {
  readonly ok: true;
  readonly path: FlyRenderLiveReadinessPath;
  readonly loopReadiness:
    | "startup_direct"
    | "operational_heartbeat"
    | "operational_dispatch_sweep";
  readonly schemaReadiness: FlyRenderLiveSchemaReadiness;
  readonly startupLogRetention: "present" | "expired";
  readonly verifyMachineId: string;
  readonly renderMachineId: string;
  readonly attribution: FlyRenderLiveReadinessAttribution;
};

export type FlyRenderLiveReadinessResult =
  | FlyRenderLiveReadinessReport
  | { readonly ok: false; readonly failClass: string };

export type FlyRenderLiveReadinessMachineInput = {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly otherCount: number;
  readonly verifyRegion: string;
  readonly renderRegion: string;
  readonly verifyCpuKind: string;
  readonly verifyCpus: number;
  readonly verifyMemoryMb: number;
  readonly renderCpuKind: string;
  readonly renderCpus: number;
  readonly renderMemoryMb: number;
  readonly verifyImageDigestSha256: string | null;
  readonly renderImageDigestSha256: string | null;
  readonly verifyMachineId: string;
  readonly renderMachineId: string;
  readonly verifyMachineState: string;
  readonly renderMachineState: string;
};

const FORBIDDEN_EVENT_NAMES = new Set([
  "hosted.process.exit",
  "hosted.loop.fatal",
]);

const SUCCESSFUL_RENDER_HEARTBEAT_ACTIONS = new Set([
  "dispatch_sweep",
  "claimed_and_acked",
  "render_complete",
  "acked_duplicate_live",
]);

export function parseFlyRenderLogHostedEvents(
  logsText: string,
): readonly ParsedFlyRenderLogHostedEvent[] {
  return parseFlyVerifyLogHostedEvents(logsText);
}

function resolveObservationTimestampMs(
  event: ParsedFlyRenderLogHostedEvent,
  fallbackNowMs: number,
): number | null {
  if (event.logTimestampMs != null) {
    return Number.isFinite(event.logTimestampMs) ? event.logTimestampMs : null;
  }
  if (event.atMs != null) {
    return Number.isFinite(event.atMs) ? event.atMs : null;
  }
  return fallbackNowMs;
}

function eventTimestampMs(
  event: ParsedFlyRenderLogHostedEvent,
  fallbackNowMs: number,
): number {
  return resolveObservationTimestampMs(event, fallbackNowMs) ?? fallbackNowMs;
}

function buildAttribution(
  report: Omit<FlyRenderLiveReadinessReport, "attribution"> & {
    readonly sweepSequence?: "monotonic" | "none";
    readonly partitionStats?: {
      readonly renderEventsConsidered: number;
      readonly verifyEventsIgnored: number;
      readonly unknownEventsRejected: number;
    };
  },
): FlyRenderLiveReadinessAttribution {
  const partitionStats = report.partitionStats;
  return Object.freeze({
    readiness_path: report.path,
    loop_readiness: report.loopReadiness,
    schema_readiness: report.schemaReadiness,
    startup_log_retention: report.startupLogRetention,
    machine_correlation: "exact",
    image_correlation: "exact",
    sweep_sequence: report.sweepSequence ?? "none",
    fatal_window: "clear",
    ...(partitionStats
      ? {
          machine_partition: "exact" as const,
          render_events_considered: partitionStats.renderEventsConsidered,
          verify_events_ignored: partitionStats.verifyEventsIgnored,
          unknown_events_rejected: partitionStats.unknownEventsRejected,
        }
      : {}),
  });
}

function successReport(
  report: Omit<FlyRenderLiveReadinessReport, "attribution"> & {
    readonly sweepSequence?: "monotonic" | "none";
    readonly partitionStats?: {
      readonly renderEventsConsidered: number;
      readonly verifyEventsIgnored: number;
      readonly unknownEventsRejected: number;
    };
  },
): FlyRenderLiveReadinessReport {
  return Object.freeze({
    ...report,
    attribution: buildAttribution(report),
  });
}

function isSchemaPreflightPass(event: ParsedFlyRenderLogHostedEvent): boolean {
  return (
    event.name === "hosted.schema.preflight" &&
    event.status === "ok" &&
    event.reasonId === "schema_preflight_ok"
  );
}

function isLoopStarted(event: ParsedFlyRenderLogHostedEvent): boolean {
  return event.name === "hosted.loop.started" && event.status === "ok";
}

function isForbiddenObservationEvent(
  event: ParsedFlyRenderLogHostedEvent,
): boolean {
  if (FORBIDDEN_EVENT_NAMES.has(event.name)) return true;
  if (
    event.name === "hosted.schema.preflight" &&
    event.status === "failed"
  ) {
    return true;
  }
  if (
    event.name === "hosted.loop.delivery" &&
    (event.action === "dispatch_failed" ||
      event.reasonId === "dispatch_outbox_sweep_failed")
  ) {
    return true;
  }
  return false;
}

function isHostedLoopDelivery(event: ParsedFlyRenderLogHostedEvent): boolean {
  return event.name === "hosted.loop.delivery";
}

function isRenderDispatchSweepCandidate(
  event: ParsedFlyRenderLogHostedEvent,
): boolean {
  return (
    isHostedLoopDelivery(event) &&
    event.mode === "render" &&
    event.action === "dispatch_sweep"
  );
}

function isRenderDispatchSweep(
  event: ParsedFlyRenderLogHostedEvent,
  renderMachineId: string,
): boolean {
  if (!isRenderDispatchSweepCandidate(event)) return false;
  return event.machineId === renderMachineId;
}

function resolveSharedLogMachinePartition(input: {
  readonly event: ParsedFlyRenderLogHostedEvent;
  readonly renderMachineId: string;
  readonly verifyMachineId: string;
}):
  | "render"
  | "verify"
  | "unknown"
  | "non_hosted" {
  if (!input.event.name.startsWith("hosted.")) {
    return "non_hosted";
  }
  const machineId = input.event.machineId;
  if (machineId === input.renderMachineId) return "render";
  if (machineId === input.verifyMachineId) return "verify";
  if (machineId == null) return "unknown";
  return "unknown";
}

export function deriveFlyRenderRolloutObservationBoundaryMs(input: {
  readonly machinesJson: string;
  readonly expectedImageDigestSha256: string;
}): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.machinesJson.trim());
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  let maxUpdatedMs: number | null = null;
  for (const row of parsed) {
    if (row == null || typeof row !== "object") continue;
    const record = row as {
      updated_at?: string;
      config?: { image?: string; metadata?: { fly_process_group?: string } };
    };
    const group = record.config?.metadata?.fly_process_group;
    if (group !== "verify" && group !== "render") continue;
    const image = record.config?.image ?? "";
    const digestMatch = /@sha256:([a-f0-9]{64})/i.exec(image);
    const digest = digestMatch?.[1]?.toLowerCase() ?? null;
    if (digest !== input.expectedImageDigestSha256.toLowerCase()) {
      continue;
    }
    if (typeof record.updated_at !== "string") continue;
    const updatedMs = Date.parse(record.updated_at);
    if (!Number.isFinite(updatedMs)) continue;
    maxUpdatedMs =
      maxUpdatedMs == null ? updatedMs : Math.max(maxUpdatedMs, updatedMs);
  }
  return maxUpdatedMs;
}

export function classifyFlyRenderLiveMachineReadiness(
  input: FlyRenderLiveReadinessMachineInput,
  acceptedImageDigestSha256: string = resolveCurrentFlyStagingAcceptedImageDigestSha256(),
): FlyRenderLiveReadinessResult {
  try {
    if (
      input.verifyCount !== 1 ||
      input.renderCount !== 1 ||
      input.otherCount !== 0
    ) {
      return { ok: false, failClass: "wrong_topology" };
    }
    const verifySpec = classifyHeadlessFlyStagingVerifyVmSpec({
      processGroup: "verify",
      region: input.verifyRegion,
      cpuKind: input.verifyCpuKind,
      cpus: input.verifyCpus,
      memoryMb: input.verifyMemoryMb,
      machineId: input.verifyMachineId,
      imageDigestSha256: input.verifyImageDigestSha256,
    });
    const renderSpec = classifyHeadlessFlyStagingRenderVmSpec({
      processGroup: "render",
      region: input.renderRegion,
      cpuKind: input.renderCpuKind,
      cpus: input.renderCpus,
      memoryMb: input.renderMemoryMb,
      machineId: input.renderMachineId,
      imageDigestSha256: input.renderImageDigestSha256,
    });
    if (verifySpec.status !== "ok" || renderSpec.status !== "ok") {
      return { ok: false, failClass: "vm_spec_invalid" };
    }
    if (
      input.verifyImageDigestSha256 !== acceptedImageDigestSha256 ||
      input.renderImageDigestSha256 !== acceptedImageDigestSha256
    ) {
      return { ok: false, failClass: "image_mismatch" };
    }
    if (
      input.verifyRegion !== HEADLESS_FLY_STAGING_TOPOLOGY.primaryRegion ||
      input.renderRegion !== HEADLESS_FLY_STAGING_TOPOLOGY.primaryRegion
    ) {
      return { ok: false, failClass: "wrong_region" };
    }
    const verifyHealthy =
      input.verifyMachineState === "started" ||
      input.verifyMachineState === "running";
    const renderHealthy =
      input.renderMachineState === "started" ||
      input.renderMachineState === "running";
    if (!verifyHealthy || !renderHealthy) {
      return { ok: false, failClass: "machine_not_healthy" };
    }
    return successReport({
      ok: true,
      path: "startup_direct",
      loopReadiness: "startup_direct",
      schemaReadiness: "direct_log",
      startupLogRetention: "present",
      verifyMachineId: input.verifyMachineId,
      renderMachineId: input.renderMachineId,
    });
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function classifyFlyRenderLiveStartupDirectReadiness(input: {
  readonly events: readonly ParsedFlyRenderLogHostedEvent[];
  readonly verifyMachineId: string;
  readonly renderMachineId: string;
}): FlyRenderLiveReadinessResult {
  let schemaPass = false;
  let loopStarted = false;
  for (const event of input.events) {
    if (isSchemaPreflightPass(event)) schemaPass = true;
    if (isLoopStarted(event)) loopStarted = true;
  }
  if (!schemaPass) {
    return { ok: false, failClass: "startup_schema_preflight_missing" };
  }
  if (!loopStarted) {
    return { ok: false, failClass: "startup_loop_not_started" };
  }
  return successReport({
    ok: true,
    path: "startup_direct",
    loopReadiness: "startup_direct",
    schemaReadiness: "direct_log",
    startupLogRetention: "present",
    verifyMachineId: input.verifyMachineId,
    renderMachineId: input.renderMachineId,
  });
}

export function classifyFlyRenderLiveOperationalHeartbeat(input: {
  readonly events: readonly {
    readonly name: string;
    readonly atMs: number | null;
    readonly action: string | null;
  }[];
  readonly nowMs: number;
  readonly startupLogRetention: "present" | "expired";
  readonly verifyMachineId: string;
  readonly renderMachineId: string;
}): FlyRenderLiveReadinessResult {
  try {
    for (const event of input.events) {
      if (FORBIDDEN_EVENT_NAMES.has(event.name)) {
        return { ok: false, failClass: "fatal_hosted_event" };
      }
    }
    const heartbeats = input.events.filter(
      (e) =>
        e.name === "hosted.loop.heartbeat" &&
        e.action != null &&
        SUCCESSFUL_RENDER_HEARTBEAT_ACTIONS.has(e.action),
    );
    if (heartbeats.length === 0) {
      if (
        input.startupLogRetention === "present" &&
        input.events.some((e) => e.name === "hosted.loop.started")
      ) {
        return successReport({
          ok: true,
          path: "startup_direct",
          loopReadiness: "startup_direct",
          schemaReadiness: "direct_log",
          startupLogRetention: "present",
          verifyMachineId: input.verifyMachineId,
          renderMachineId: input.renderMachineId,
        });
      }
      return { ok: false, failClass: "no_render_heartbeat" };
    }
    const latest = heartbeats.reduce((max, e) =>
      (e.atMs ?? 0) > (max.atMs ?? 0) ? e : max,
    );
    const age = input.nowMs - (latest.atMs ?? 0);
    if (age > FLY_RENDER_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS) {
      return { ok: false, failClass: "stale_heartbeat" };
    }
    return successReport({
      ok: true,
      path: "operational_heartbeat",
      loopReadiness: "operational_heartbeat",
      schemaReadiness: "implied_by_gated_startup",
      startupLogRetention: input.startupLogRetention,
      verifyMachineId: input.verifyMachineId,
      renderMachineId: input.renderMachineId,
    });
  } catch {
    return { ok: false, failClass: "hostile_input" };
  }
}

export function classifyFlyRenderLiveOperationalDispatchSweepReadiness(input: {
  readonly events: readonly ParsedFlyRenderLogHostedEvent[];
  readonly renderMachineId: string;
  readonly verifyMachineId: string;
  readonly nowMs: number;
  readonly rolloutObservationBoundaryMs: number;
  readonly observationWindowMs?: number;
  readonly minSweepGapMs?: number;
  readonly maxLatestSweepAgeMs?: number;
  readonly minSweepCount?: number;
}): FlyRenderLiveReadinessResult {
  if (!HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT) {
    return { ok: false, failClass: "startup_ordering_contract_broken" };
  }

  const observationWindowMs =
    input.observationWindowMs ?? FLY_RENDER_LIVE_READINESS_OBSERVATION_WINDOW_MS;
  const minSweepGapMs =
    input.minSweepGapMs ?? FLY_RENDER_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS;
  const maxLatestSweepAgeMs =
    input.maxLatestSweepAgeMs ??
    FLY_RENDER_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS;
  const minSweepCount =
    input.minSweepCount ?? FLY_RENDER_LIVE_READINESS_MIN_DISPATCH_SWEEP_COUNT;
  const windowStartMs = input.nowMs - observationWindowMs;

  let verifyEventsIgnored = 0;
  let renderEventsConsidered = 0;
  let unknownEventsRejected = 0;
  let sawVerifyDispatchSweepInWindow = false;

  for (const event of input.events) {
    const ts = eventTimestampMs(event, input.nowMs);
    if (ts < windowStartMs) continue;

    const partition = resolveSharedLogMachinePartition({
      event,
      renderMachineId: input.renderMachineId,
      verifyMachineId: input.verifyMachineId,
    });
    if (partition === "non_hosted") {
      continue;
    }

    if (isHostedLoopDelivery(event)) {
      if (
        event.machineId === input.renderMachineId &&
        event.mode === "verify"
      ) {
        return { ok: false, failClass: "cross_group_incoherence" };
      }
      if (
        event.machineId === input.verifyMachineId &&
        event.mode === "render"
      ) {
        return { ok: false, failClass: "cross_group_incoherence" };
      }
      if (
        event.machineId == null &&
        isRenderDispatchSweepCandidate(event)
      ) {
        return { ok: false, failClass: "missing_machine_attribution" };
      }
      if (
        partition === "unknown" &&
        isRenderDispatchSweepCandidate(event)
      ) {
        return { ok: false, failClass: "unknown_machine_render_sweep" };
      }
      if (partition === "unknown") {
        unknownEventsRejected += 1;
        continue;
      }
      if (partition === "verify") {
        verifyEventsIgnored += 1;
        if (event.action === "dispatch_sweep") {
          sawVerifyDispatchSweepInWindow = true;
        }
        continue;
      }
    }

    if (partition === "verify") {
      verifyEventsIgnored += 1;
      continue;
    }
    if (partition === "unknown") {
      unknownEventsRejected += 1;
      continue;
    }

    renderEventsConsidered += 1;
    if (event.name === "hosted.loop.started") {
      return { ok: false, failClass: "restart_observed_in_window" };
    }
  }

  const sweepTimestamps: number[] = [];
  for (const event of input.events) {
    if (!isRenderDispatchSweep(event, input.renderMachineId)) continue;
    const ts = resolveObservationTimestampMs(event, input.nowMs);
    if (ts == null || !Number.isFinite(ts)) {
      return { ok: false, failClass: "malformed_timestamp" };
    }
    if (ts <= input.rolloutObservationBoundaryMs) {
      continue;
    }
    if (ts < windowStartMs) {
      continue;
    }
    sweepTimestamps.push(ts);
  }

  sweepTimestamps.sort((a, b) => a - b);

  if (sweepTimestamps.length < minSweepCount) {
    if (sawVerifyDispatchSweepInWindow && sweepTimestamps.length === 0) {
      return { ok: false, failClass: "no_render_sweeps" };
    }
    return { ok: false, failClass: "insufficient_dispatch_sweeps" };
  }

  for (let i = 1; i < sweepTimestamps.length; i += 1) {
    if (sweepTimestamps[i]! <= sweepTimestamps[i - 1]!) {
      return { ok: false, failClass: "non_monotonic_sweeps" };
    }
  }

  let hasGap = false;
  for (let i = 1; i < sweepTimestamps.length; i += 1) {
    if (sweepTimestamps[i]! - sweepTimestamps[i - 1]! >= minSweepGapMs) {
      hasGap = true;
      break;
    }
  }
  if (!hasGap) {
    return { ok: false, failClass: "sweep_gap_too_short" };
  }

  const earliestAcceptedSweep = sweepTimestamps[0]!;
  for (const event of input.events) {
    if (event.machineId !== input.renderMachineId) continue;
    const ts = eventTimestampMs(event, input.nowMs);
    if (ts < earliestAcceptedSweep) continue;
    if (isForbiddenObservationEvent(event)) {
      return { ok: false, failClass: "fatal_after_sweep" };
    }
  }

  const latest = sweepTimestamps[sweepTimestamps.length - 1]!;
  if (input.nowMs - latest > maxLatestSweepAgeMs) {
    return { ok: false, failClass: "stale_latest_sweep" };
  }

  return successReport({
    ok: true,
    path: "operational_dispatch_sweep",
    loopReadiness: "operational_dispatch_sweep",
    schemaReadiness: "implied_by_gated_startup",
    startupLogRetention: "expired",
    verifyMachineId: input.verifyMachineId,
    renderMachineId: input.renderMachineId,
    sweepSequence: "monotonic",
    partitionStats: {
      renderEventsConsidered,
      verifyEventsIgnored,
      unknownEventsRejected,
    },
  });
}

function machineStatesFromListJson(machinesJson: string): {
  readonly verifyState: string;
  readonly renderState: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(machinesJson.trim());
  } catch {
    return { verifyState: "unknown", renderState: "unknown" };
  }
  if (!Array.isArray(parsed)) {
    return { verifyState: "unknown", renderState: "unknown" };
  }
  let verifyState = "unknown";
  let renderState = "unknown";
  for (const row of parsed) {
    if (row == null || typeof row !== "object") continue;
    const record = row as {
      state?: string;
      config?: { metadata?: { fly_process_group?: string } };
    };
    const group = record.config?.metadata?.fly_process_group;
    if (group === "verify") verifyState = record.state ?? "unknown";
    if (group === "render") renderState = record.state ?? "unknown";
  }
  return { verifyState, renderState };
}

export function classifyFlyRenderLiveAmendedReadiness(input: {
  readonly appName: string;
  readonly machinesJson: string;
  readonly servicesJson: string;
  readonly secretLedger: HeadlessFlyStagingSecretLedgerParse;
  readonly logsText: string;
  readonly nowMs: number;
  readonly expectedImageDigestSha256?: string;
  readonly rolloutObservationBoundaryMs?: number;
}): FlyRenderLiveReadinessResult {
  if (input.appName !== HEADLESS_FLY_STAGING_VERIFY_FIRST_PASS_APP) {
    return { ok: false, failClass: "unexpected_app" };
  }

  const expectedImageDigestSha256 =
    input.expectedImageDigestSha256 ??
    resolveCurrentFlyStagingAcceptedImageDigestSha256();

  let parsedMachines: unknown;
  try {
    parsedMachines = JSON.parse(input.machinesJson.trim());
  } catch {
    return { ok: false, failClass: "malformed_machines" };
  }

  const inventory = parseHeadlessFlyStagingDualMachineInventoryFromListJson(
    parsedMachines,
  );
  if (inventory.verify == null || inventory.render == null) {
    return { ok: false, failClass: "topology_mismatch" };
  }

  const { verifyState, renderState } = machineStatesFromListJson(
    input.machinesJson,
  );

  const machine = classifyFlyRenderLiveMachineReadiness(
    {
      verifyCount: inventory.verifyCount,
      renderCount: inventory.renderCount,
      otherCount: inventory.otherCount,
      verifyRegion: inventory.verify.region,
      renderRegion: inventory.render.region,
      verifyCpuKind: inventory.verify.cpuKind,
      verifyCpus: inventory.verify.cpus,
      verifyMemoryMb: inventory.verify.memoryMb,
      renderCpuKind: inventory.render.cpuKind,
      renderCpus: inventory.render.cpus,
      renderMemoryMb: inventory.render.memoryMb,
      verifyImageDigestSha256: inventory.verify.imageDigestSha256,
      renderImageDigestSha256: inventory.render.imageDigestSha256,
      verifyMachineId: inventory.verify.machineId,
      renderMachineId: inventory.render.machineId,
      verifyMachineState: verifyState,
      renderMachineState: renderState,
    },
    expectedImageDigestSha256,
  );
  if (!machine.ok) {
    return machine;
  }

  if (
    input.secretLedger.status !== "ok" ||
    input.secretLedger.aggregateStatus !== "deployed" ||
    !input.secretLedger.runtimeReady
  ) {
    return { ok: false, failClass: "secrets_not_deployed" };
  }

  let services: unknown;
  try {
    services = JSON.parse(input.servicesJson.trim() || "[]");
  } catch {
    return { ok: false, failClass: "malformed_services" };
  }
  if (Array.isArray(services) && services.length > 0) {
    return { ok: false, failClass: "public_services_present" };
  }

  const events = parseFlyRenderLogHostedEvents(input.logsText);
  const verifyMachineId = inventory.verify.machineId;
  const renderMachineId = inventory.render.machineId;

  const startup = classifyFlyRenderLiveStartupDirectReadiness({
    events,
    verifyMachineId,
    renderMachineId,
  });
  if (startup.ok) {
    return startup;
  }

  const parsedHeartbeats = events.map((event) =>
    Object.freeze({
      name: event.name,
      atMs: eventTimestampMs(event, input.nowMs),
      action: event.action,
    }),
  );
  const heartbeat = classifyFlyRenderLiveOperationalHeartbeat({
    events: parsedHeartbeats,
    nowMs: input.nowMs,
    startupLogRetention: "expired",
    verifyMachineId,
    renderMachineId,
  });
  if (heartbeat.ok) {
    return heartbeat;
  }

  const rolloutBoundary =
    input.rolloutObservationBoundaryMs ??
    deriveFlyRenderRolloutObservationBoundaryMs({
      machinesJson: input.machinesJson,
      expectedImageDigestSha256,
    });
  if (rolloutBoundary == null || !Number.isFinite(rolloutBoundary)) {
    return { ok: false, failClass: "rollout_boundary_unknown" };
  }

  const dispatchSweep = classifyFlyRenderLiveOperationalDispatchSweepReadiness({
    events,
    renderMachineId,
    verifyMachineId,
    nowMs: input.nowMs,
    rolloutObservationBoundaryMs: rolloutBoundary,
  });
  if (dispatchSweep.ok) {
    return successReport({
      ...dispatchSweep,
      verifyMachineId,
      renderMachineId,
    });
  }

  return dispatchSweep;
}

export function renderReadinessAttributionToSafeFacts(
  attribution: FlyRenderLiveReadinessAttribution,
): Readonly<Record<string, string>> {
  const facts: Record<string, string> = {
    readiness_path: attribution.readiness_path,
    loop_readiness: attribution.loop_readiness,
    schema_readiness: attribution.schema_readiness,
    startup_log_retention: attribution.startup_log_retention,
    machine_correlation: attribution.machine_correlation,
    image_correlation: attribution.image_correlation,
    sweep_sequence: attribution.sweep_sequence,
    fatal_window: attribution.fatal_window,
  };
  if (attribution.machine_partition != null) {
    facts.machine_partition = attribution.machine_partition;
  }
  if (attribution.render_events_considered != null) {
    facts.render_events_considered = String(attribution.render_events_considered);
  }
  if (attribution.verify_events_ignored != null) {
    facts.verify_events_ignored = String(attribution.verify_events_ignored);
  }
  if (attribution.unknown_events_rejected != null) {
    facts.unknown_events_rejected = String(attribution.unknown_events_rejected);
  }
  return Object.freeze(facts);
}
