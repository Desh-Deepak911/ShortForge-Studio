/**
 * Post-frame failure containment production-shaped fixtures — testing only.
 */

import { randomUUID } from "node:crypto";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import {
  buildClaimedRenderExecutionAttributionSnapshot,
  buildExecutionAttributionFromClaimedResult,
  executionAttributionToSafeTelemetryFacts,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  executeClaimedRender,
  mapClaimedRenderToHostedResult,
} from "@/features/headless-renderer/worker/runtime/execute-claimed-render";
import {
  classifyStoreVersionDeltaLocal,
  resolveAttributedExecutionSubstage,
} from "@/features/headless-renderer/worker/runtime/post-frame-failure-containment";
import { createCollectingProviderBackedBoundaryTelemetry } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import {
  resolveBranchAwareMissingNextBoundary,
  validateOwningBoundarySequenceCoherence,
} from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";
import { classifyArtifactObjectBindingFailureSubstage } from "@/features/headless-renderer/control-plane/services/classify-artifact-object-binding-failure";
import {
  classifyArtifactObjectBindingFieldComparisons,
  firstArtifactObjectBindingFieldMismatch,
} from "@/features/headless-renderer/control-plane/services/classify-artifact-object-binding-field-comparisons";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";

export type PostFrameContainmentScenario =
  | "primary_ffmpeg_preserved_over_secondary_cas"
  | "primary_upload_preserved_over_secondary_cas"
  | "terminal_cas_local_store_version_delta";

export async function runPostFrameContainmentAttributionFixture(
  scenario: PostFrameContainmentScenario,
): Promise<{
  readonly scenario: PostFrameContainmentScenario;
  readonly executionSubstage: string;
  readonly primaryExecutionSubstage?: string;
  readonly secondaryTerminalCasSubstage?: string;
  readonly hostedFacts: Readonly<Record<string, string>>;
}> {
  if (scenario === "primary_ffmpeg_preserved_over_secondary_cas") {
    const attribution = buildClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "ffmpeg_execution",
      dispositionKind: "terminal_failure",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "scheduled",
      safeWorkerCode: "WORKER_FAILED",
      primaryExecutionSubstage: "ffmpeg_execution",
      secondaryTerminalCasSubstage: "terminal_failure_cas",
      secondaryTerminalCasOutcome: "confirmed",
      terminalCasStoreVersionDelta: "plus_one",
      storeVersionBefore: 1,
      storeVersionAfter: 2,
    });
    return {
      scenario,
      executionSubstage: attribution.executionSubstage,
      primaryExecutionSubstage: attribution.primaryExecutionSubstage,
      secondaryTerminalCasSubstage: attribution.secondaryTerminalCasSubstage,
      hostedFacts: executionAttributionToSafeTelemetryFacts(attribution),
    };
  }

  if (scenario === "primary_upload_preserved_over_secondary_cas") {
    const substage = resolveAttributedExecutionSubstage({
      primaryExecutionSubstage: "artifact_upload",
      reportedExecutionSubstage: "terminal_failure_cas",
    });
    const attribution = buildClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "terminal_failure_cas",
      dispositionKind: "cleanup_scheduled",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "scheduled",
      safeWorkerCode: "WORKER_FAILED",
      primaryExecutionSubstage: "artifact_upload",
      secondaryTerminalCasSubstage: "terminal_failure_cas",
      secondaryTerminalCasOutcome: "confirmed",
      terminalCasStoreVersionDelta: "plus_one",
    });
    return {
      scenario,
      executionSubstage: substage,
      primaryExecutionSubstage: attribution.primaryExecutionSubstage,
      secondaryTerminalCasSubstage: attribution.secondaryTerminalCasSubstage,
      hostedFacts: executionAttributionToSafeTelemetryFacts({
        ...attribution,
        executionSubstage: substage,
      }),
    };
  }

  const delta = classifyStoreVersionDeltaLocal(5, 6);
  const attribution = buildExecutionAttributionFromClaimedResult({
    result: {
      kind: "failed",
      phase: "render",
      reasonId: "WORKER_FAILED",
      orphanCleanup: { status: "scheduled" },
    },
    executionSubstage: "terminal_failure_cas",
    durableJobState: "failed",
    storeVersionBefore: 1,
    storeVersionAfter: 6,
    storeVersionAtTerminalAttempt: 5,
    claimTokenCoherenceClass: "cleared_after_terminal",
    primaryExecutionSubstage: "ffmpeg_execution",
    secondaryTerminalCasSubstage: "terminal_failure_cas",
    secondaryTerminalCasOutcome: "confirmed",
  });
  return {
    scenario,
    executionSubstage: attribution.executionSubstage,
    primaryExecutionSubstage: attribution.primaryExecutionSubstage,
    secondaryTerminalCasSubstage: attribution.secondaryTerminalCasSubstage,
    hostedFacts: {
      ...executionAttributionToSafeTelemetryFacts(attribution),
      terminal_cas_store_version_delta: delta,
    },
  };
}

export async function runPostFrameBoundaryTelemetryFixture(): Promise<{
  readonly postFrameBoundaryCount: number;
  readonly lastBoundary: string | null;
}> {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "post-frame-fixture",
  });
  telemetry.emit("chromium_session_cleanup", { cleanupOutcomeClass: "ok" });
  telemetry.emit("ffmpeg_preflight_started");
  telemetry.emit("ffmpeg_preflight_completed", { ffmpegOutcomeClass: "succeeded" });
  telemetry.emit("ffmpeg_process_started");
  telemetry.emit("ffmpeg_input_completed");
  telemetry.emit("ffmpeg_process_terminal", { ffmpegOutcomeClass: "succeeded" });
  telemetry.emit("artifact_upload_started");
  telemetry.emit("artifact_upload_completed", { uploadOutcomeClass: "failed" });
  telemetry.emit("terminal_failure_cas_started");
  telemetry.emit("terminal_failure_cas_completed", { casOutcomeClass: "succeeded" });
  const postFrame = telemetry.observations.filter((o) =>
    o.boundaryId.startsWith("ffmpeg_") ||
    o.boundaryId.startsWith("artifact_") ||
    o.boundaryId.startsWith("terminal_failure"),
  );
  return {
    postFrameBoundaryCount: postFrame.length,
    lastBoundary: postFrame.at(-1)?.boundaryId ?? null,
  };
}

export async function runPostFrameClaimedRenderStageAdvanceFixture(): Promise<{
  readonly ok: boolean;
  readonly executionSubstage?: string;
}> {
  const fixture = buildHeadlessReferenceFixture({
    audioMode: "silent",
    durationMs: 2000,
  });
  const clock = 1_700_000_010_000;
  const { stack, jobId, ownerId } = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: `post-frame-${randomUUID().slice(0, 8)}`,
    clockMs: clock,
  });
  const current = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
  if (!current.ok || current.value.stage !== "canonical") {
    throw new Error("expected queued job");
  }
  const claimToken = `claim_${randomUUID()}`;
  const claimed = await stack.jobStore.claimQueuedJob({
    jobId,
    ownerId,
    expectedStoreVersion: current.value.storeVersion,
    claimToken,
    nowMs: clock + 1,
  });
  if (!claimed.ok || claimed.value.kind !== "claimed") {
    throw new Error("claim failed");
  }

  const boundaryTelemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "claimed-render-post-frame",
  });
  const result = await executeClaimedRender({
    claimedRecord: claimed.value.record,
    claimToken,
    jobStore: stack.jobStore,
    artifactCleanup: new MemoryHeadlessArtifactCleanupAdapter(),
    nowMs: () => clock + 100,
    resolveStorage: () => stack.storage,
    boundaryTelemetry,
    limits: {
      jobTimeoutMs: 120_000,
      evaluateTimeoutMs: 30_000,
    },
  });
  const hosted = mapClaimedRenderToHostedResult(result);
  return {
    ok: result.kind === "succeeded" || result.executionAttribution != null,
    executionSubstage: hosted.executionAttribution?.executionSubstage,
  };
}

export async function runPostFrameMonotonicArtifactBoundaryFixture(): Promise<{
  readonly sequenceCoherent: boolean;
  readonly artifactBoundaries: readonly string[];
}> {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "artifact-boundary-order",
  });
  telemetry.emit("artifact_upload_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_completed", {
    finalizeOutcomeClass: "succeeded",
    finalizeSubstage: "provider_finalize",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_binding_validation_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_binding_validation_completed", {
    finalizeOutcomeClass: "succeeded",
    finalizeSubstage: "canonical_artifact_attachment",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("job_succeeded_cas_started");
  telemetry.emit("job_succeeded_cas_completed", { casOutcomeClass: "succeeded" });
  telemetry.emit("cleanup_scheduled");
  telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });
  const artifactBoundaries = telemetry.observations
    .map((o) => o.boundaryId)
    .filter(
      (id) =>
        id.startsWith("artifact_") ||
        id.startsWith("owned_object_finalize_") ||
        id.startsWith("job_succeeded_cas_") ||
        id.startsWith("cleanup_"),
    );
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: artifactBoundaries,
    providerContext: null,
    workspaceAttribution: null,
  });
  return {
    sequenceCoherent: coherence.ok,
    artifactBoundaries,
  };
}

export function runPostFrameBindingFailureClassificationFixture(): {
  readonly finalizedCoherence: string;
  readonly canonicalAttachment: string;
} {
  return {
    finalizedCoherence: classifyArtifactObjectBindingFailureSubstage(
      "Finalized metadata mismatch.",
    ),
    canonicalAttachment: classifyArtifactObjectBindingFailureSubstage(
      "Binding requires succeeded job with artifact.",
    ),
  };
}

export async function runPostFrameBindingFailureAfterProviderFinalizeFixture(): Promise<{
  readonly sequenceCoherent: boolean;
  readonly artifactBoundaries: readonly string[];
  readonly terminalSubstage: string;
}> {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "artifact-binding-failure-after-finalize",
  });
  telemetry.emit("artifact_upload_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_completed", {
    finalizeOutcomeClass: "succeeded",
    finalizeSubstage: "provider_finalize",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_binding_validation_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("artifact_binding_validation_completed", {
    finalizeOutcomeClass: "failed",
    finalizeSubstage: "binding_coherence",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("terminal_failure_cas_started");
  telemetry.emit("terminal_failure_cas_completed", { casOutcomeClass: "succeeded" });
  telemetry.emit("cleanup_scheduled");
  telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });
  const artifactBoundaries = telemetry.observations.map((o) => o.boundaryId);
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: artifactBoundaries,
    providerContext: null,
    workspaceAttribution: null,
    terminalSubstage: "artifact_binding_validation",
  });
  return {
    sequenceCoherent: coherence.ok,
    artifactBoundaries,
    terminalSubstage: "artifact_binding_validation",
  };
}

export function runPostFrameBindingFieldComparisonFixtures(): Readonly<
  Record<
    string,
    {
      readonly field: string;
      readonly class: string;
      readonly owningAuthority: string;
    }
  >
> {
  const baseArtifact = {
    contentDigest: `sha256:${"a".repeat(64)}`,
    byteLength: 100,
    mimeType: "video/webm",
    fingerprint: `hra:sha256:${"b".repeat(64)}`,
    expiresAtMs: 9_000,
    rendererBuildId: "worker-build-a",
  };
  const baseJob = {
    state: "succeeded" as const,
    jobId: "job_1",
    attempt: 1,
    ownership: { ownerId: "owner_a", projectId: "proj_a" },
    requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
    rendererBuildId: "worker-build-a",
    artifact: baseArtifact,
  };
  const baseRequest = {
    ownership: { ownerId: "owner_a", projectId: "proj_a" },
    requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
  };
  const baseFinalized = {
    finalized: true,
    purpose: "artifact" as const,
    ownerId: "owner_a",
    projectId: "proj_a",
    locator: {
      kind: "object_storage" as const,
      storeId: "artifacts",
      objectKey: "artifact/key",
    },
    contentDigest: baseArtifact.contentDigest,
    byteLength: baseArtifact.byteLength,
    mimeType: baseArtifact.mimeType,
    expiresAtMs: baseArtifact.expiresAtMs,
  };

  const mismatch = (fieldPatch: Partial<typeof baseFinalized>) => {
    const comparisons = classifyArtifactObjectBindingFieldComparisons({
      job: baseJob as never,
      request: baseRequest as never,
      artifact: baseArtifact as never,
      finalized: { ...baseFinalized, ...fieldPatch },
      nowMs: 1_000,
    });
    const first = firstArtifactObjectBindingFieldMismatch(comparisons);
    if (first == null) {
      throw new Error("expected mismatch");
    }
    return {
      field: first.field,
      class: first.class,
      owningAuthority: first.owningAuthority,
    };
  };

  return Object.freeze({
    digest: mismatch({ contentDigest: `sha256:${"d".repeat(64)}` }),
    byteLength: mismatch({ byteLength: 101 }),
    mimeType: mismatch({ mimeType: "video/mp4" }),
    expiresAtMs: mismatch({ expiresAtMs: 8_000 }),
  });
}

export async function runPostFramePrimaryPreservedWhenCleanupAlsoFailsFixture(): Promise<{
  readonly executionSubstage: string;
  readonly primaryExecutionSubstage: string;
  readonly cleanupScheduledClass: string;
}> {
  const attribution = buildClaimedRenderExecutionAttributionSnapshot({
    executionSubstage: "artifact_binding_validation",
    dispositionKind: "cleanup_scheduled",
    durableJobStateClass: "failed",
    claimTokenCoherenceClass: "cleared_after_terminal",
    cleanupScheduledClass: "scheduled",
    safeWorkerCode: "WORKER_FAILED",
    primaryExecutionSubstage: "artifact_binding_validation",
    secondaryTerminalCasSubstage: "terminal_failure_cas",
    secondaryTerminalCasOutcome: "unconfirmed",
    terminalCasStoreVersionDelta: "unchanged",
    storeVersionBefore: 2,
    storeVersionAfter: 2,
  });
  return {
    executionSubstage: attribution.executionSubstage,
    primaryExecutionSubstage: attribution.primaryExecutionSubstage ?? "",
    cleanupScheduledClass: attribution.cleanupScheduledClass,
  };
}

export function runPostFrameAsyncLogDeliveryOrderingFixture(): {
  readonly sortedBySequence: readonly string[];
  readonly sortedByTimestamp: readonly string[];
  readonly sequenceCoherent: boolean;
} {
  const bySequence = [
    "artifact_upload_started",
    "artifact_upload_completed",
    "owned_object_finalize_started",
    "owned_object_finalize_completed",
    "job_succeeded_cas_started",
  ] as const;
  const byTimestamp = [
    "artifact_upload_started",
    "owned_object_finalize_completed",
    "artifact_upload_completed",
    "owned_object_finalize_started",
    "job_succeeded_cas_started",
  ] as const;
  return {
    sortedBySequence: bySequence,
    sortedByTimestamp: byTimestamp,
    sequenceCoherent: validateOwningBoundarySequenceCoherence({
      observedSequence: bySequence,
      providerContext: null,
      workspaceAttribution: null,
    }).ok,
  };
}

export function runPostFrameSuccessBranchWithoutFailureCasFixture(): {
  readonly sequenceCoherent: boolean;
  readonly missingNextBoundary: string | null;
} {
  const observed = [
    "artifact_binding_validation_completed",
    "job_succeeded_cas_started",
    "job_succeeded_cas_completed",
  ] as const;
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observed,
    providerContext: null,
    workspaceAttribution: null,
  });
  const missing = resolveBranchAwareMissingNextBoundary({
    observedSequence: observed,
    lastObservedBoundary: "job_succeeded_cas_completed",
  });
  return {
    sequenceCoherent: coherence.ok,
    missingNextBoundary: missing,
  };
}

export function runPostFrameIllegalFailureCasAfterSucceededFixture(): {
  readonly sequenceCoherent: boolean;
  readonly incoherenceClass: string | null;
} {
  const observed = [
    "job_succeeded_cas_completed",
    "terminal_failure_cas_started",
  ] as const;
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observed,
    providerContext: null,
    workspaceAttribution: null,
  });
  return {
    sequenceCoherent: coherence.ok,
    incoherenceClass: coherence.ok ? null : coherence.incoherenceClass,
  };
}

export function runPostFrameCompleteFailureBranchFixture(): {
  readonly sequenceCoherent: boolean;
} {
  const observed = [
    "artifact_binding_validation_started",
    "artifact_binding_validation_completed",
    "terminal_failure_cas_started",
    "terminal_failure_cas_completed",
    "cleanup_scheduled",
    "cleanup_completed",
  ] as const;
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observed,
    providerContext: null,
    workspaceAttribution: null,
    terminalSubstage: "artifact_binding_validation",
  });
  return { sequenceCoherent: coherence.ok };
}

export function runPostFrameMissingSucceededCasFixture(): {
  readonly sequenceCoherent: boolean;
  readonly incoherenceClass: string | null;
} {
  const observed = [
    "artifact_binding_validation_completed",
    "job_succeeded_cas_started",
  ] as const;
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observed,
    providerContext: null,
    workspaceAttribution: null,
  });
  return {
    sequenceCoherent: coherence.ok,
    incoherenceClass: coherence.ok ? null : coherence.incoherenceClass,
  };
}
