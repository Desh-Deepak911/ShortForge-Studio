/**
 * Sprint 11E Phase 2E.2D.8I.6D — authoritative success attribution for execution probe.
 * Never manufactures succeeded disposition from stage booleans alone.
 */

import { evaluateArtifactObjectBindingCoherence } from "@/features/headless-renderer/control-plane/services/evaluate-artifact-object-binding-coherence";
import type { HeadlessCanonicalStoredJobRecord } from "@/features/headless-renderer/control-plane/types/stored-job-record";
import type { HeadlessRenderJobRequestV1 } from "@/features/headless-renderer/domain/headless-render.types";
import type { HeadlessObjectMetadata } from "@/features/headless-renderer/control-plane/ports/storage.port";
import {
  classifyOwningBoundaryTerminalBranch,
  isOwningBoundaryEventId,
  resolveBranchAwareMissingNextBoundary,
  type OwningBoundaryEventId,
} from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import {
  sanitizeClaimedRenderExecutionAttributionSnapshot,
  type FlyRenderClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";

import {
  buildAttributionFromTerminalJob,
  type HostedRenderDeliveryEventObservation,
} from "./claim-correlation-authority";
import { executionProbeSuccessAttributionIsAuthoritative } from "./claimed-render-execution-probe-evidence";
import type {
  ExecutionProbeStageEvidence,
  ExecutionProbeStageId,
} from "./claimed-render-execution-probe-runner";
import type { FlyRenderLiveCaseEvidence } from "./evidence";
import type { IngestOwningBoundaryEvidenceResult } from "./owning-boundary-probe-authority";
import type { FlyRenderLiveMatrixContext } from "./types";

export const EXECUTION_PROBE_SUCCESS_ATTRIBUTION_FAILURE_CATEGORIES = Object.freeze([
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_STAGE_INCOMPLETE",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_CLEANUP_FAILED",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_PRE_CLEANUP_UNREADABLE",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_DURABLE_JOB_NOT_SUCCEEDED",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BINDING_INCOHERENT",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_INGESTION_FAILED",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_SEQUENCE_INCOHERENT",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_SUCCEEDED_CAS_NOT_PROVEN",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BINDING_VALIDATION_NOT_PROVEN",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_DELIVERY_DISPOSITION_NOT_SUCCEEDED",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_TERMINAL_DISGUISED",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_INCOMPLETE",
  "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_FALSE_PASS_REJECTED",
] as const);

export type ExecutionProbeSuccessAttributionFailureCategory =
  (typeof EXECUTION_PROBE_SUCCESS_ATTRIBUTION_FAILURE_CATEGORIES)[number];

export type ExecutionProbePreCleanupSuccessSignals = {
  readonly job: HeadlessCanonicalStoredJobRecord;
  readonly deliveryEvents: readonly HostedRenderDeliveryEventObservation[];
  readonly bindingCoherent: boolean;
  readonly finalizedArtifactPresent: boolean;
  readonly renderStartedAtMs: number;
  readonly initialStoreVersion: number | null;
};

export type DeriveExecutionProbeSuccessAttributionInput = {
  readonly stageIds: readonly ExecutionProbeStageId[];
  readonly stages: readonly ExecutionProbeStageEvidence[];
  readonly cleanupStatus: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly stageAttribution: FlyRenderClaimedRenderExecutionAttributionSnapshot | null;
  readonly preCleanupSignals: ExecutionProbePreCleanupSuccessSignals | null;
  readonly owningBoundaryEvidence: {
    readonly observedSequence: readonly OwningBoundaryEventId[];
    readonly sequenceCoherence: { readonly ok: boolean };
    readonly lastObservedBoundary?: OwningBoundaryEventId | null;
  } | null;
  readonly owningBoundaryIngestion: IngestOwningBoundaryEvidenceResult | null;
};

export type DeriveExecutionProbeSuccessAttributionResult =
  | {
      readonly ok: true;
      readonly attribution: FlyRenderClaimedRenderExecutionAttributionSnapshot;
    }
  | {
      readonly ok: false;
      readonly failureCategory: ExecutionProbeSuccessAttributionFailureCategory;
    };

function ownedRecordToFinalizedMetadata(input: {
  readonly ownerId: string;
  readonly projectId: string;
  readonly storeId: string;
  readonly objectKey: string;
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly expiresAtMs: number;
}): HeadlessObjectMetadata {
  return Object.freeze({
    finalized: true,
    purpose: "artifact",
    ownerId: input.ownerId,
    projectId: input.projectId,
    locator: Object.freeze({
      kind: "object_storage",
      storeId: input.storeId as "assets" | "artifacts",
      objectKey: input.objectKey,
    }),
    contentDigest: input.contentDigest,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    expiresAtMs: input.expiresAtMs,
  });
}

function allCanonicalStagesPass(
  stageIds: readonly ExecutionProbeStageId[],
  stages: readonly ExecutionProbeStageEvidence[],
): boolean {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  return stageIds.every((stageId) => byId.get(stageId)?.status === "PASS");
}

function findSucceededDeliveryEvent(
  events: readonly HostedRenderDeliveryEventObservation[],
  renderStartedAtMs: number,
): HostedRenderDeliveryEventObservation | null {
  const candidates = [...events]
    .filter(
      (event) =>
        event.atMs >= renderStartedAtMs &&
        event.action === "succeeded" &&
        event.facts?.disposition_kind === "succeeded",
    )
    .sort((a, b) => b.atMs - a.atMs);
  return candidates[0] ?? null;
}

function boundarySequenceProvesSuccess(
  evidence: NonNullable<DeriveExecutionProbeSuccessAttributionInput["owningBoundaryEvidence"]>,
): boolean {
  const observed = evidence.observedSequence;
  if (!evidence.sequenceCoherence.ok) return false;
  if (!observed.includes("artifact_binding_validation_completed")) return false;
  if (!observed.includes("job_succeeded_cas_completed")) return false;
  if (observed.includes("terminal_failure_cas_started")) return false;
  if (
    classifyOwningBoundaryTerminalBranch({ observedSequence: observed }) !==
    "success"
  ) {
    return false;
  }
  const missingNext = resolveBranchAwareMissingNextBoundary({
    observedSequence: observed,
    lastObservedBoundary:
      evidence.lastObservedBoundary ?? "job_succeeded_cas_completed",
  });
  return missingNext !== "terminal_failure_cas_started";
}

export async function captureExecutionProbePreCleanupSuccessSignals(
  ctx: FlyRenderLiveMatrixContext,
  deliveryEvents: readonly HostedRenderDeliveryEventObservation[],
): Promise<ExecutionProbePreCleanupSuccessSignals | null> {
  if (ctx.session.jobId == null) return null;
  const jobResult = await ctx.jobStore.getByJobIdAndOwner(
    ctx.session.jobId,
    ctx.ownerId,
  );
  if (!jobResult.ok || jobResult.value.stage !== "canonical") return null;

  const listed = await ctx.ownedObjectStore.listByJobIdAndOwner({
    jobId: ctx.session.jobId,
    ownerId: ctx.ownerId,
  });
  if (!listed.ok) {
    return Object.freeze({
      job: jobResult.value,
      deliveryEvents,
      bindingCoherent: false,
      finalizedArtifactPresent: false,
      renderStartedAtMs: ctx.session.renderStartedAtMs ?? Date.now(),
      initialStoreVersion: ctx.session.initialStoreVersion,
    });
  }

  const jobRecord = jobResult.value;
  const binding = jobRecord.artifactObjectBinding;
  const canonicalJob = jobRecord.canonicalJob;
  const artifact = canonicalJob.artifact;
  const request = jobRecord.canonicalRequest as HeadlessRenderJobRequestV1 | null;

  let bindingCoherent = false;
  let finalizedArtifactPresent = false;

  if (
    binding != null &&
    artifact != null &&
    request != null &&
    canonicalJob.state === "succeeded"
  ) {
    const artifactEntry = listed.value.find(
      (entry) =>
        entry.record.purpose === "artifact" &&
        entry.record.stage === "finalized" &&
        entry.record.objectKey === binding.storageLocator.objectKey,
    );
    const record = artifactEntry?.record ?? null;
    if (record != null) {
      finalizedArtifactPresent = true;
      if (
        record.contentDigest == null ||
        record.byteLength == null ||
        record.mimeType == null ||
        record.expiresAtMs == null
      ) {
        bindingCoherent = false;
      } else {
        const evaluation = evaluateArtifactObjectBindingCoherence({
          job: canonicalJob,
          request,
          artifact,
          finalized: ownedRecordToFinalizedMetadata({
            ownerId: record.ownerId,
            projectId: record.projectId,
            storeId: record.storeId,
            objectKey: record.objectKey,
            contentDigest: record.contentDigest,
            byteLength: record.byteLength,
            mimeType: record.mimeType,
            expiresAtMs: record.expiresAtMs,
          }),
          storeVersion: jobRecord.storeVersion,
        });
        bindingCoherent = evaluation.ok;
      }
    }
  }

  return Object.freeze({
    job: jobRecord,
    deliveryEvents,
    bindingCoherent,
    finalizedArtifactPresent,
    renderStartedAtMs: ctx.session.renderStartedAtMs ?? Date.now(),
    initialStoreVersion: ctx.session.initialStoreVersion,
  });
}

export function extractExecutionAttributionFromStageCases(
  cases: readonly FlyRenderLiveCaseEvidence[],
): FlyRenderClaimedRenderExecutionAttributionSnapshot | null {
  for (let i = cases.length - 1; i >= 0; i -= 1) {
    const attribution = cases[i]?.executionAttribution;
    if (attribution != null) return attribution;
  }
  return null;
}

export function deriveExecutionProbeSuccessAttribution(
  input: DeriveExecutionProbeSuccessAttributionInput,
): DeriveExecutionProbeSuccessAttributionResult {
  if (!allCanonicalStagesPass(input.stageIds, input.stages)) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_STAGE_INCOMPLETE",
    };
  }

  if (input.cleanupStatus !== "ok" && input.cleanupStatus !== "preserved") {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_CLEANUP_FAILED",
    };
  }

  if (
    input.stageAttribution != null &&
    input.stageAttribution.dispositionKind !== "succeeded"
  ) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_TERMINAL_DISGUISED",
    };
  }

  if (input.preCleanupSignals == null) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_PRE_CLEANUP_UNREADABLE",
    };
  }

  const { job, deliveryEvents, bindingCoherent, finalizedArtifactPresent } =
    input.preCleanupSignals;

  if (job.canonicalJob.state !== "succeeded") {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_DURABLE_JOB_NOT_SUCCEEDED",
    };
  }

  if (!bindingCoherent || !finalizedArtifactPresent) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BINDING_INCOHERENT",
    };
  }

  if (
    input.owningBoundaryIngestion != null &&
    !input.owningBoundaryIngestion.ok
  ) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_INGESTION_FAILED",
    };
  }

  if (input.owningBoundaryEvidence == null) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_INGESTION_FAILED",
    };
  }

  if (!boundarySequenceProvesSuccess(input.owningBoundaryEvidence)) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BOUNDARY_SEQUENCE_INCOHERENT",
    };
  }

  const observed = input.owningBoundaryEvidence.observedSequence;
  if (!observed.includes("job_succeeded_cas_completed")) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_SUCCEEDED_CAS_NOT_PROVEN",
    };
  }
  if (!observed.includes("artifact_binding_validation_completed")) {
    return {
      ok: false,
      failureCategory:
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_BINDING_VALIDATION_NOT_PROVEN",
    };
  }

  const deliverySucceeded = findSucceededDeliveryEvent(
    deliveryEvents,
    input.preCleanupSignals.renderStartedAtMs,
  );
  if (deliverySucceeded == null) {
    return {
      ok: false,
      failureCategory:
        "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_DELIVERY_DISPOSITION_NOT_SUCCEEDED",
    };
  }

  const fromJob = buildAttributionFromTerminalJob({
    job,
    deliveryEvents,
    renderStartedAtMs: input.preCleanupSignals.renderStartedAtMs,
    initialStoreVersion: input.preCleanupSignals.initialStoreVersion,
  });
  const sanitized = sanitizeClaimedRenderExecutionAttributionSnapshot(fromJob);
  if (sanitized == null) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_INCOMPLETE",
    };
  }

  if (
    sanitized.dispositionKind !== "succeeded" ||
    sanitized.executionSubstage !== "succeeded_cas" ||
    sanitized.durableJobStateClass !== "succeeded"
  ) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_INCOMPLETE",
    };
  }

  if (!executionProbeSuccessAttributionIsAuthoritative(sanitized)) {
    return {
      ok: false,
      failureCategory: "EXECUTION_PROBE_SUCCESS_ATTRIBUTION_FALSE_PASS_REJECTED",
    };
  }

  return Object.freeze({ ok: true, attribution: sanitized });
}
