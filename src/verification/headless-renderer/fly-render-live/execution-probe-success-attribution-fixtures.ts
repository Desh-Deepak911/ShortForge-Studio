/**
 * Fixtures for Sprint 11E Phase 2E.2D.8I.6D success-attribution authority.
 */

import { buildClaimedRenderExecutionAttributionSnapshot } from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import type { OwningBoundaryEventId } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";

import {
  EXECUTION_PROBE_STAGE_IDS,
  type ExecutionProbeStageEvidence,
} from "./claimed-render-execution-probe-runner";
import type { HostedRenderDeliveryEventObservation } from "./claim-correlation-authority";
import type {
  DeriveExecutionProbeSuccessAttributionInput,
  ExecutionProbePreCleanupSuccessSignals,
} from "./execution-probe-success-attribution";

const DIGEST = `sha256:${"a".repeat(64)}`;

function allPassStages(): readonly ExecutionProbeStageEvidence[] {
  return EXECUTION_PROBE_STAGE_IDS.map((stageId) =>
    Object.freeze({ stageId, status: "PASS" as const }),
  );
}

function succeededJobRecord() {
  return {
    stage: "canonical" as const,
    storeVersion: 4,
    claimToken: null,
    canonicalJob: {
      state: "succeeded" as const,
      attempt: 1,
      jobId: "job_8i6d",
      ownership: { ownerId: "fep_owner_8i6d", projectId: "proj_8i6d" },
      requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      rendererBuildId: "worker-build-a",
      artifact: {
        contentDigest: DIGEST,
        byteLength: 100,
        mimeType: "video/webm",
        fingerprint: `hra:sha256:${"b".repeat(64)}`,
        expiresAtMs: 9_000,
        rendererBuildId: "worker-build-a",
      },
    },
    artifactObjectBinding: {
      version: 1,
      jobId: "job_8i6d",
      attempt: 1,
      ownerId: "fep_owner_8i6d",
      projectId: "proj_8i6d",
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "artifacts" as const,
        objectKey: "artifact/key",
      },
      contentDigest: DIGEST,
      byteLength: 100,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      expiresAtMs: 9_000,
    },
    canonicalRequest: {
      ownership: { ownerId: "fep_owner_8i6d", projectId: "proj_8i6d" },
      requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
    },
  };
}

function succeededDeliveryEvent(): HostedRenderDeliveryEventObservation {
  return Object.freeze({
    name: "hosted.loop.delivery",
    atMs: 2_000,
    action: "succeeded",
    facts: Object.freeze({
      execution_substage: "succeeded_cas",
      disposition_kind: "succeeded",
      durable_job_state_class: "succeeded",
      claim_token_coherence_class: "cleared_after_terminal",
      cleanup_scheduled_class: "not_applicable",
      binary_component_class: "none",
      bounded_duration_class: "under_30s",
      store_version_delta: "plus_one",
    }),
  });
}

function successBoundaryEvidence(): {
  readonly observedSequence: readonly OwningBoundaryEventId[];
  readonly sequenceCoherence: { readonly ok: boolean };
  readonly lastObservedBoundary: OwningBoundaryEventId;
} {
  const observedSequence = [
    "claimed_context_validated",
    "artifact_binding_validation_started",
    "artifact_binding_validation_completed",
    "job_succeeded_cas_started",
    "job_succeeded_cas_completed",
  ] as const satisfies readonly OwningBoundaryEventId[];
  return Object.freeze({
    observedSequence,
    sequenceCoherence: Object.freeze({ ok: true }),
    lastObservedBoundary: "job_succeeded_cas_completed",
  });
}

function basePreCleanupSignals(): ExecutionProbePreCleanupSuccessSignals {
  return Object.freeze({
    job: succeededJobRecord() as never,
    deliveryEvents: Object.freeze([succeededDeliveryEvent()]),
    bindingCoherent: true,
    finalizedArtifactPresent: true,
    renderStartedAtMs: 1_000,
    initialStoreVersion: 3,
  });
}

export function build8I6CAllPassNullAttributionFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return Object.freeze({
    stageIds: EXECUTION_PROBE_STAGE_IDS,
    stages: allPassStages(),
    cleanupStatus: "ok",
    stageAttribution: null,
    preCleanupSignals: basePreCleanupSignals(),
    owningBoundaryEvidence: successBoundaryEvidence(),
    owningBoundaryIngestion: Object.freeze({
      ok: true,
      evidence: successBoundaryEvidence() as never,
      emissionClassification: "boundary_events_emitted_and_correlated" as const,
    }),
  });
}

export function buildSuccessAttributionDerivedFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return build8I6CAllPassNullAttributionFixture();
}

export function buildMissingSucceededCasProofFixture(): DeriveExecutionProbeSuccessAttributionInput {
  const boundary = Object.freeze({
    observedSequence: Object.freeze([
      "artifact_binding_validation_completed",
    ] as const satisfies readonly OwningBoundaryEventId[]),
    sequenceCoherence: Object.freeze({ ok: true }),
    lastObservedBoundary: "artifact_binding_validation_completed" as const,
  });
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    owningBoundaryEvidence: boundary,
    owningBoundaryIngestion: Object.freeze({
      ok: true,
      evidence: boundary as never,
      emissionClassification: "boundary_events_emitted_but_incomplete" as const,
    }),
  });
}

export function buildAllPassFailedCleanupFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    cleanupStatus: "failed",
  });
}

export function buildTerminalFailureDisguisedFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    stageAttribution: buildClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "ffmpeg_execution",
      dispositionKind: "terminal_failure",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "scheduled",
      boundedDurationMs: 100,
      safeWorkerCode: "WORKER_FAILED",
    }),
  });
}

export function buildBoundaryIngestionFailureFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    owningBoundaryEvidence: null,
    owningBoundaryIngestion: Object.freeze({
      ok: false,
      reasonId: "boundary_evidence_ingestion_failed" as const,
      correlatedRawEventCount: 2,
      emissionClassification: "boundary_events_emitted_but_observer_rejected" as const,
    }),
  });
}

export function buildIncompleteAttributionFixture(): DeriveExecutionProbeSuccessAttributionInput {
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    preCleanupSignals: Object.freeze({
      ...basePreCleanupSignals(),
      deliveryEvents: Object.freeze([]),
    }),
  });
}

export function buildIllegalFailureCasBoundaryFixture(): DeriveExecutionProbeSuccessAttributionInput {
  const boundary = Object.freeze({
    observedSequence: Object.freeze([
      "job_succeeded_cas_completed",
      "terminal_failure_cas_started",
    ] as const satisfies readonly OwningBoundaryEventId[]),
    sequenceCoherence: Object.freeze({ ok: false }),
    lastObservedBoundary: "terminal_failure_cas_started" as const,
  });
  return Object.freeze({
    ...build8I6CAllPassNullAttributionFixture(),
    owningBoundaryEvidence: boundary,
    owningBoundaryIngestion: Object.freeze({
      ok: true,
      evidence: boundary as never,
      emissionClassification: "boundary_events_emitted_but_incomplete" as const,
    }),
  });
}
