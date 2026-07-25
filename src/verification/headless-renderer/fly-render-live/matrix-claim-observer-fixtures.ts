/**
 * Sprint 11E Phase 2E.2D.8J.1 — matrix claim observer fixtures.
 */

import type { HostedRenderDeliveryEventObservation } from "./claim-correlation-authority";
import { emptyFlyRenderLiveSession } from "./types";

export const MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID =
  "d895d16f264918" as const;
export const MATRIX_CLAIM_OBSERVER_FOREIGN_MACHINE_ID =
  "d895d12a240938" as const;

export function build8JWorkerSuccessLogShape(): string {
  const renderMachine = MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID;
  const t0 = "2026-07-25T09:18:38.100Z";
  const t1 = "2026-07-25T09:18:38.500Z";
  const t2 = "2026-07-25T09:18:48.200Z";
  return [
    `${t0} app[${renderMachine}] {"name":"hosted.loop.delivery","atMs":${Date.parse(t0)},"mode":"render","action":"claimed_and_acked","reasonId":"claimed_and_acked"}`,
    `${t1} app[${renderMachine}] {"name":"hosted.loop.delivery","atMs":${Date.parse(t1)},"mode":"render","action":"succeeded","reasonId":"succeeded","facts":{"execution_substage":"terminal_success_cas","disposition_kind":"succeeded","durable_job_state_class":"succeeded","claim_token_coherence_class":"cleared_after_terminal","cleanup_scheduled_class":"scheduled","bounded_duration_class":"sub_second"}}`,
    `${t2} app[${renderMachine}] {"name":"hosted.loop.delivery","atMs":${Date.parse(t2)},"mode":"render","action":"dispatch_sweep","reasonId":"dispatch_sweep"}`,
  ].join("\n");
}

export function buildCurrentRunCorrelatedClaimSuccessEvents(input: {
  readonly boundaryMs: number;
  readonly ackMs: number;
  readonly terminalMs: number;
}): readonly HostedRenderDeliveryEventObservation[] {
  return Object.freeze([
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: input.ackMs,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "claimed_and_acked",
      reasonId: "claimed_and_acked",
    }),
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: input.terminalMs,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "succeeded",
      reasonId: "succeeded",
      facts: Object.freeze({
        execution_substage: "terminal_success_cas",
        disposition_kind: "succeeded",
        durable_job_state_class: "succeeded",
        claim_token_coherence_class: "cleared_after_terminal",
        cleanup_scheduled_class: "scheduled",
        bounded_duration_class: "sub_second",
      }),
    }),
  ]);
}

export function buildHistoricalClaimExcludedEvents(): readonly HostedRenderDeliveryEventObservation[] {
  return Object.freeze([
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 1_000,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "claimed_and_acked",
    }),
  ]);
}

export function buildForeignMachineRejectedEvents(): readonly HostedRenderDeliveryEventObservation[] {
  return Object.freeze([
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 5_100,
      machineId: MATRIX_CLAIM_OBSERVER_FOREIGN_MACHINE_ID,
      mode: "render",
      action: "claimed_and_acked",
    }),
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 5_200,
      machineId: MATRIX_CLAIM_OBSERVER_FOREIGN_MACHINE_ID,
      mode: "render",
      action: "succeeded",
    }),
  ]);
}

export function buildUnrelatedSecondDeliveryEvents(): readonly HostedRenderDeliveryEventObservation[] {
  return Object.freeze([
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 2_100,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "claimed_and_acked",
    }),
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 16_000,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "claimed_and_acked",
    }),
    Object.freeze({
      name: "hosted.loop.delivery" as const,
      atMs: 18_000,
      machineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
      mode: "render",
      action: "terminalized_render_failure",
    }),
  ]);
}

export function buildMatrixClaimObserverSession(
  overrides: Partial<ReturnType<typeof emptyFlyRenderLiveSession>> = {},
) {
  return {
    ...emptyFlyRenderLiveSession(),
    renderEnqueuedAtMs: 2_000,
    renderStartedAtMs: 2_000,
    probeObservationBoundaryMs: 2_000,
    initialStoreVersion: 1,
    baselineRenderMachineId: MATRIX_CLAIM_OBSERVER_RENDER_MACHINE_ID,
    ...overrides,
  };
}

export function buildTerminalSucceededJobWithoutClaimEvents() {
  return {
    stage: "canonical" as const,
    storeVersion: 2,
    claimToken: null,
    canonicalJob: {
      state: "succeeded",
      attempt: 1,
      jobId: "job",
    },
    jobId: "job",
    ownerId: "owner",
    operationId: "op",
  } as never;
}

export function buildTerminalFailedJobWithCorrelatedClaim() {
  return {
    stage: "canonical" as const,
    storeVersion: 2,
    claimToken: null,
    canonicalJob: {
      state: "failed",
      terminalReason: { reasonId: "WORKER_FAILED", retryable: true },
      attempt: 1,
      jobId: "job",
    },
    jobId: "job",
    ownerId: "owner",
    operationId: "op",
  } as never;
}

export function buildActiveClaimJob() {
  return {
    stage: "canonical" as const,
    storeVersion: 2,
    claimToken: "tok",
    canonicalJob: {
      state: "rendering",
      attempt: 1,
      jobId: "job",
    },
    jobId: "job",
    ownerId: "owner",
    operationId: "op",
  } as never;
}
