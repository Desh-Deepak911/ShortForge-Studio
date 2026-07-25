/**
 * Sprint 11E Phase 2E.2D.7A — Amended read-only Fly verify readiness authority.
 * Rule A: direct startup log proof. Rule B: operational heartbeat proof.
 */

import {
  resolveCurrentFlyStagingAcceptedImageDigestSha256,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_TOPOLOGY } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-topology";
import type { HeadlessFlyStagingSecretLedgerParse } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";
import {
  parseHeadlessFlyStagingVerifyMachineFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-secret-activation";
import { parseHeadlessFlyStagingMachineListJson } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-machine-authority";

import { HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT } from "./hosted-worker-startup-ordering";

export const FLY_VERIFY_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS = 5_000;
export const FLY_VERIFY_LIVE_READINESS_OBSERVATION_WINDOW_MS = 180_000;
export const FLY_VERIFY_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS = 120_000;

export type FlyVerifyLiveReadinessPath =
  | "startup_direct"
  | "operational_heartbeat";

export type FlyVerifyLiveReadinessReport = {
  readonly ok: true;
  readonly path: FlyVerifyLiveReadinessPath;
  readonly loopReadiness:
    | "startup_direct"
    | "operational_heartbeat";
  readonly schemaReadiness:
    | "direct_log"
    | "implied_by_gated_startup";
  readonly startupLogRetention: "present" | "expired";
  readonly verifyMachineId: string;
};

export type FlyVerifyLiveReadinessResult =
  | FlyVerifyLiveReadinessReport
  | { readonly ok: false; readonly failClass: string };

export type ParsedFlyVerifyLogHostedEvent = {
  readonly name: string;
  readonly atMs: number | null;
  readonly logTimestampMs: number | null;
  readonly mode: string | null;
  readonly status: string | null;
  readonly reasonId: string | null;
  readonly action: string | null;
  readonly machineId: string | null;
};

export type FlyVerifyLiveReadinessMachineInput = {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly otherCount: number;
  readonly region: string;
  readonly cpuKind: string;
  readonly cpus: number;
  readonly memoryMb: number;
  readonly imageDigestSha256: string | null;
  readonly machineId: string;
  readonly machineState: string;
};

const FORBIDDEN_EVENT_NAMES = new Set([
  "hosted.process.exit",
  "hosted.loop.fatal",
]);

const SUCCESSFUL_VERIFY_HEARTBEAT_ACTIONS = new Set([
  "dispatch_sweep",
  "claimed_and_acked",
  "verified_waiting_for_coverage",
  "acked_duplicate_live",
  "verified_complete",
]);

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function parseFlyVerifyLogHostedEvents(
  logsText: string,
): readonly ParsedFlyVerifyLogHostedEvent[] {
  const out: ParsedFlyVerifyLogHostedEvent[] = [];
  for (const rawLine of logsText.split(/\r?\n/)) {
    const line = stripAnsi(rawLine.trim());
    if (line.length === 0) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    const machineMatch = /app\[([a-f0-9]+)\]/i.exec(line);
    const tsMatch = /^(\d{4}-\d{2}-\d{2}T[\d:+.Z-]+)/.exec(line);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof parsed.name !== "string") continue;
    out.push(
      Object.freeze({
        name: parsed.name,
        atMs: typeof parsed.atMs === "number" ? parsed.atMs : null,
        logTimestampMs:
          tsMatch != null ? Date.parse(tsMatch[1]!) : null,
        mode: typeof parsed.mode === "string" ? parsed.mode : null,
        status: typeof parsed.status === "string" ? parsed.status : null,
        reasonId:
          typeof parsed.reasonId === "string" ? parsed.reasonId : null,
        action: typeof parsed.action === "string" ? parsed.action : null,
        machineId: machineMatch?.[1] ?? null,
      }),
    );
  }
  return Object.freeze(out);
}

function eventTimestampMs(
  event: ParsedFlyVerifyLogHostedEvent,
  fallbackNowMs: number,
): number {
  if (
    event.logTimestampMs != null &&
    Number.isFinite(event.logTimestampMs)
  ) {
    return event.logTimestampMs;
  }
  if (event.atMs != null && Number.isFinite(event.atMs)) {
    return event.atMs;
  }
  return fallbackNowMs;
}

function isSchemaPreflightPass(event: ParsedFlyVerifyLogHostedEvent): boolean {
  return (
    event.name === "hosted.schema.preflight" &&
    event.status === "ok" &&
    event.reasonId === "schema_preflight_ok"
  );
}

function isLoopStarted(event: ParsedFlyVerifyLogHostedEvent): boolean {
  return event.name === "hosted.loop.started" && event.status === "ok";
}

function isForbiddenObservationEvent(
  event: ParsedFlyVerifyLogHostedEvent,
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

function isSuccessfulVerifyHeartbeat(
  event: ParsedFlyVerifyLogHostedEvent,
  verifyMachineId: string,
): boolean {
  if (event.name !== "hosted.loop.delivery") return false;
  if (event.mode !== "verify") return false;
  if (event.machineId != null && event.machineId !== verifyMachineId) {
    return false;
  }
  if (event.action == null) return false;
  if (event.action === "dispatch_failed" || event.action === "left_pending") {
    return false;
  }
  if (event.reasonId === "dispatch_outbox_sweep_failed") return false;
  return SUCCESSFUL_VERIFY_HEARTBEAT_ACTIONS.has(event.action);
}

export function classifyFlyVerifyLiveStartupDirectReadiness(input: {
  readonly events: readonly ParsedFlyVerifyLogHostedEvent[];
}): FlyVerifyLiveReadinessResult {
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
  return {
    ok: true,
    path: "startup_direct",
    loopReadiness: "startup_direct",
    schemaReadiness: "direct_log",
    startupLogRetention: "present",
    verifyMachineId: "",
  };
}

function validateMachineTopology(input: {
  readonly machinesJson: string;
  readonly expectedImageDigestSha256: string;
}):
  | { readonly ok: true; readonly machine: FlyVerifyLiveReadinessMachineInput }
  | { readonly ok: false; readonly failClass: string } {
  const inventory = parseHeadlessFlyStagingMachineListJson(input.machinesJson);
  if (
    inventory.status !== "ok" ||
    inventory.inventory == null ||
    inventory.inventory.verifyCount !== 1 ||
    inventory.inventory.renderCount !== 0 ||
    inventory.inventory.otherCount !== 0
  ) {
    return { ok: false, failClass: "topology_mismatch" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.machinesJson.trim());
  } catch {
    return { ok: false, failClass: "malformed_machines" };
  }

  const verifyMachine = parseHeadlessFlyStagingVerifyMachineFromListJson(parsed);
  if (verifyMachine == null) {
    return { ok: false, failClass: "verify_machine_parse_failed" };
  }

  const machineRow = Array.isArray(parsed) ? parsed[0] : null;
  const state =
    machineRow != null &&
    typeof machineRow === "object" &&
    typeof (machineRow as { state?: unknown }).state === "string"
      ? (machineRow as { state: string }).state
      : "";

  if (state !== "started" && state !== "running") {
    return { ok: false, failClass: "machine_not_started" };
  }
  if (verifyMachine.region !== "iad") {
    return { ok: false, failClass: "region_mismatch" };
  }
  if (
    verifyMachine.cpuKind !== HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpuKind ||
    verifyMachine.cpus !== HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.cpus ||
    verifyMachine.memoryMb !== HEADLESS_FLY_STAGING_TOPOLOGY.verifyVm.memoryMb
  ) {
    return { ok: false, failClass: "vm_spec_mismatch" };
  }
  if (
    verifyMachine.imageDigestSha256 !== input.expectedImageDigestSha256
  ) {
    return { ok: false, failClass: "image_digest_mismatch" };
  }

  return {
    ok: true,
    machine: {
      verifyCount: 1,
      renderCount: 0,
      otherCount: 0,
      region: verifyMachine.region,
      cpuKind: verifyMachine.cpuKind,
      cpus: verifyMachine.cpus,
      memoryMb: verifyMachine.memoryMb,
      imageDigestSha256: verifyMachine.imageDigestSha256,
      machineId: verifyMachine.machineId,
      machineState: state,
    },
  };
}

export function classifyFlyVerifyLiveOperationalHeartbeatReadiness(input: {
  readonly events: readonly ParsedFlyVerifyLogHostedEvent[];
  readonly verifyMachineId: string;
  readonly nowMs: number;
  readonly observationWindowMs?: number;
  readonly minHeartbeatGapMs?: number;
  readonly maxLatestHeartbeatAgeMs?: number;
}): FlyVerifyLiveReadinessResult {
  if (!HOSTED_WORKER_DELIVERY_GATED_BY_SCHEMA_PREFLIGHT) {
    return { ok: false, failClass: "startup_ordering_contract_broken" };
  }

  const observationWindowMs =
    input.observationWindowMs ??
    FLY_VERIFY_LIVE_READINESS_OBSERVATION_WINDOW_MS;
  const minHeartbeatGapMs =
    input.minHeartbeatGapMs ?? FLY_VERIFY_LIVE_READINESS_HEARTBEAT_MIN_GAP_MS;
  const maxLatestHeartbeatAgeMs =
    input.maxLatestHeartbeatAgeMs ??
    FLY_VERIFY_LIVE_READINESS_MAX_LATEST_HEARTBEAT_AGE_MS;
  const windowStartMs = input.nowMs - observationWindowMs;

  for (const event of input.events) {
    const ts = eventTimestampMs(event, input.nowMs);
    if (ts < windowStartMs) continue;
    if (event.name === "hosted.loop.started") {
      return { ok: false, failClass: "restart_observed_in_window" };
    }
    if (isForbiddenObservationEvent(event)) {
      return { ok: false, failClass: "forbidden_event_in_window" };
    }
    if (
      event.machineId != null &&
      event.machineId !== input.verifyMachineId
    ) {
      return { ok: false, failClass: "foreign_machine_event" };
    }
  }

  const heartbeats = input.events
    .filter((event) =>
      isSuccessfulVerifyHeartbeat(event, input.verifyMachineId),
    )
    .map((event) => eventTimestampMs(event, input.nowMs))
    .filter((ts) => ts >= windowStartMs)
    .sort((a, b) => a - b);

  if (heartbeats.length < 2) {
    return { ok: false, failClass: "insufficient_heartbeats" };
  }

  let hasGap = false;
  for (let i = 1; i < heartbeats.length; i += 1) {
    if (heartbeats[i]! - heartbeats[i - 1]! >= minHeartbeatGapMs) {
      hasGap = true;
      break;
    }
  }
  if (!hasGap) {
    return { ok: false, failClass: "heartbeat_gap_too_short" };
  }

  const latest = heartbeats[heartbeats.length - 1]!;
  if (input.nowMs - latest > maxLatestHeartbeatAgeMs) {
    return { ok: false, failClass: "stale_latest_heartbeat" };
  }

  return {
    ok: true,
    path: "operational_heartbeat",
    loopReadiness: "operational_heartbeat",
    schemaReadiness: "implied_by_gated_startup",
    startupLogRetention: "expired",
    verifyMachineId: input.verifyMachineId,
  };
}

export function classifyFlyVerifyLiveAmendedReadiness(input: {
  readonly machinesJson: string;
  readonly servicesJson: string;
  readonly secretLedger: HeadlessFlyStagingSecretLedgerParse;
  readonly logsText: string;
  readonly nowMs: number;
  readonly expectedImageDigestSha256?: string;
}): FlyVerifyLiveReadinessResult {
  const expectedImageDigestSha256 =
    input.expectedImageDigestSha256 ??
    resolveCurrentFlyStagingAcceptedImageDigestSha256();

  const machine = validateMachineTopology({
    machinesJson: input.machinesJson,
    expectedImageDigestSha256,
  });
  if (!machine.ok) {
    return { ok: false, failClass: machine.failClass };
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

  const events = parseFlyVerifyLogHostedEvents(input.logsText);

  const startup = classifyFlyVerifyLiveStartupDirectReadiness({ events });
  if (startup.ok) {
    return {
      ...startup,
      verifyMachineId: machine.machine.machineId,
    };
  }

  const heartbeat = classifyFlyVerifyLiveOperationalHeartbeatReadiness({
    events,
    verifyMachineId: machine.machine.machineId,
    nowMs: input.nowMs,
  });
  if (heartbeat.ok) {
    return heartbeat;
  }

  return heartbeat;
}
