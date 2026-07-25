/**
 * Sprint 11E Phase 2E.2D.8B.1 — read-only consumer safety for job-create probe.
 * Fail closed before Neon/R2 mutation when hosted render dispatch sweepers are active.
 */

import {
  classifyHeadlessFlyStagingRenderVmSpec,
  classifyHeadlessFlyStagingVerifyVmSpec,
  parseHeadlessFlyStagingDualMachineInventoryFromListJson,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-render-machine-authority";

export const JOB_CREATE_PROBE_CONSUMER_SAFETY_STAGE_IDS = Object.freeze([
  "consumer_safety_precheck",
] as const);

export type JobCreateProbeConsumerSafetyStageId =
  (typeof JOB_CREATE_PROBE_CONSUMER_SAFETY_STAGE_IDS)[number];

export const JOB_CREATE_PROBE_CONSUMER_SAFETY_REASON_IDS = Object.freeze([
  "active_staging_consumers_block_mutation",
  "consumer_topology_unavailable",
] as const);

export type JobCreateProbeConsumerSafetyReasonId =
  (typeof JOB_CREATE_PROBE_CONSUMER_SAFETY_REASON_IDS)[number];

export type JobCreateProbeConsumerTopologyMode =
  | "zero_consumer"
  | "active_staging_consumers";

export type JobCreateProbeConsumerSafetyAssessment = {
  readonly mode: JobCreateProbeConsumerTopologyMode;
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly renderOperational: boolean;
  readonly verifyOperational: boolean;
};

const SAFETY_STAGE_SET = new Set<string>(JOB_CREATE_PROBE_CONSUMER_SAFETY_STAGE_IDS);
const SAFETY_REASON_SET = new Set<string>(
  JOB_CREATE_PROBE_CONSUMER_SAFETY_REASON_IDS,
);

export function isJobCreateProbeConsumerSafetyStageId(
  value: unknown,
): value is JobCreateProbeConsumerSafetyStageId {
  return typeof value === "string" && SAFETY_STAGE_SET.has(value);
}

export function isJobCreateProbeConsumerSafetyReasonId(
  value: unknown,
): value is JobCreateProbeConsumerSafetyReasonId {
  return typeof value === "string" && SAFETY_REASON_SET.has(value);
}

function machineOperational(state: string | null | undefined): boolean {
  return state === "started" || state === "running";
}

/**
 * Classify staging consumer topology from read-only Fly machine inventory.
 * Active consumers: verify=1, render=1, both operational — dispatch sweepers may run.
 */
export function classifyJobCreateProbeConsumerTopology(input: {
  readonly verifyCount: number;
  readonly renderCount: number;
  readonly otherCount: number;
  readonly verifyMachineState?: string | null;
  readonly renderMachineState?: string | null;
  readonly verifyRegion?: string | null;
  readonly renderRegion?: string | null;
  readonly verifyCpuKind?: string | null;
  readonly renderCpuKind?: string | null;
  readonly verifyCpus?: number | null;
  readonly renderCpus?: number | null;
  readonly verifyMemoryMb?: number | null;
  readonly renderMemoryMb?: number | null;
  readonly verifyMachineId?: string | null;
  readonly renderMachineId?: string | null;
}): JobCreateProbeConsumerSafetyAssessment | { readonly ok: false } {
  try {
    if (input.otherCount !== 0) {
      return { ok: false };
    }
    const verifyOperational = machineOperational(input.verifyMachineState ?? null);
    const renderOperational = machineOperational(input.renderMachineState ?? null);

    if (
      input.verifyCount === 1 &&
      input.renderCount === 1 &&
      verifyOperational &&
      renderOperational
    ) {
      const verifySpec = classifyHeadlessFlyStagingVerifyVmSpec({
        processGroup: "verify",
        region: input.verifyRegion ?? "",
        cpuKind: input.verifyCpuKind ?? "",
        cpus: input.verifyCpus ?? 0,
        memoryMb: input.verifyMemoryMb ?? 0,
        machineId: input.verifyMachineId ?? "",
        imageDigestSha256: null,
      });
      const renderSpec = classifyHeadlessFlyStagingRenderVmSpec({
        processGroup: "render",
        region: input.renderRegion ?? "",
        cpuKind: input.renderCpuKind ?? "",
        cpus: input.renderCpus ?? 0,
        memoryMb: input.renderMemoryMb ?? 0,
        machineId: input.renderMachineId ?? "",
        imageDigestSha256: null,
      });
      if (verifySpec.status !== "ok" || renderSpec.status !== "ok") {
        return { ok: false };
      }
      return {
        mode: "active_staging_consumers",
        verifyCount: input.verifyCount,
        renderCount: input.renderCount,
        renderOperational: true,
        verifyOperational: true,
      };
    }

    return {
      mode: "zero_consumer",
      verifyCount: input.verifyCount,
      renderCount: input.renderCount,
      renderOperational,
      verifyOperational,
    };
  } catch {
    return { ok: false };
  }
}

export function parseJobCreateProbeConsumerTopologyFromFlyListJson(
  json: unknown,
): JobCreateProbeConsumerSafetyAssessment | { readonly ok: false } {
  const inv = parseHeadlessFlyStagingDualMachineInventoryFromListJson(json);
  return classifyJobCreateProbeConsumerTopology({
    verifyCount: inv.verifyCount,
    renderCount: inv.renderCount,
    otherCount: inv.otherCount,
    verifyMachineState: readMachineStateFromFlyListJson(
      json,
      inv.verify?.machineId ?? null,
    ),
    renderMachineState: readMachineStateFromFlyListJson(
      json,
      inv.render?.machineId ?? null,
    ),
    verifyRegion: inv.verify?.region ?? null,
    renderRegion: inv.render?.region ?? null,
    verifyCpuKind: inv.verify?.cpuKind ?? null,
    renderCpuKind: inv.render?.cpuKind ?? null,
    verifyCpus: inv.verify?.cpus ?? null,
    renderCpus: inv.render?.cpus ?? null,
    verifyMemoryMb: inv.verify?.memoryMb ?? null,
    renderMemoryMb: inv.render?.memoryMb ?? null,
    verifyMachineId: inv.verify?.machineId ?? null,
    renderMachineId: inv.render?.machineId ?? null,
  });
}

function readMachineStateFromFlyListJson(
  json: unknown,
  machineId: string | null,
): string | null {
  if (machineId == null || !Array.isArray(json)) return null;
  for (const row of json) {
    if (row == null || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    if (typeof m.id !== "string" || m.id !== machineId) continue;
    return typeof m.state === "string" ? m.state : null;
  }
  return null;
}

export function jobCreateProbeRequiresMutationBlock(
  assessment: JobCreateProbeConsumerSafetyAssessment,
): boolean {
  return assessment.mode === "active_staging_consumers";
}
