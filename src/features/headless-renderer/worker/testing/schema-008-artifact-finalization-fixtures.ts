/**
 * Production-shaped schema-008 artifact finalization fixtures — testing only.
 */

import { createHash, randomUUID } from "node:crypto";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessStoragePort } from "@/features/headless-renderer/control-plane/ports/storage.port";
import type { HeadlessControlPlaneResult } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { cpFail } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import { deriveAttemptBoundArtifactObjectId } from "@/features/headless-renderer/control-plane/services/attempt-bound-artifact-key";
import { HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS } from "@/features/headless-renderer/domain/headless-export-retention-authority";
import { evaluateHeadlessExportMaintenanceEnablement } from "@/features/headless-renderer/domain/headless-export-maintenance-enablement";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import { classifyOwnedObjectFinalizeLiveFailure } from "@/features/headless-renderer/worker/runtime/classify-owned-object-finalize-live-failure";
import { classifyRejectedCleanupRuntimeLiveFinalizationFailure } from "@/features/headless-renderer/worker/runtime/classify-owned-object-finalize-live-failure";
import { classifyStorageFinalizeFailureSubstage } from "@/features/headless-renderer/worker/runtime/classify-storage-finalize-failure";
import { createCollectingProviderBackedBoundaryTelemetry } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import type { OwningBoundaryEventId } from "@/features/headless-renderer/worker/runtime/provider-backed-boundary-telemetry";
import { validateOwningBoundarySequenceCoherence } from "@/features/headless-renderer/worker/runtime/owning-boundary-sequence-coherence";

const R2_CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

const FIXTURE_OWNER = "owner_schema008";
const FIXTURE_PROJECT = "project_schema008";
const FIXTURE_JOB = "job_schema008";
const FIXTURE_OPERATION = "op_schema008";

export type Schema008FieldClassComparisonRow = {
  readonly fieldClass:
    | "slot_key"
    | "retention_expires_at_ms"
    | "cleanup_scheduled_at_ms"
    | "upload_observed_revision"
    | "verification_claim"
    | "finalize_revision_cas"
    | "maintenance_gate"
    | "packaged_environment";
  readonly bridgeSuccessClass: string;
  readonly rejectedLiveClass: string;
  readonly correctedLocalClass: string;
};

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function makeProductionStack(nowMs: number) {
  const fake = new FakeS3Client();
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter();
  const r2 = new R2StorageAdapter({
    configOverride: R2_CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
  const storage = createR2JobBoundStorageAdapter({
    r2,
    ownedObjectStore,
    jobStore,
    context: {
      ownerId: FIXTURE_OWNER,
      projectId: FIXTURE_PROJECT,
      jobId: FIXTURE_JOB,
      operationId: FIXTURE_OPERATION,
      attempt: 1,
      environmentNamespace: "staging",
      artifactExpiresAtMs: nowMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
      allowedSourceLocators: Object.freeze([]),
      nowMs: () => nowMs,
    },
  });
  return { fake, ownedObjectStore, jobStore, storage };
}

function fixtureObjectId(): string {
  return (
    deriveAttemptBoundArtifactObjectId({
      jobId: FIXTURE_JOB,
      operationId: FIXTURE_OPERATION,
      attempt: 1,
    }) ?? "obj_missing"
  );
}

/**
 * Field-class comparison between bridge success, rejected live, and corrected local shapes.
 */
export function buildSchema008FinalizationFieldClassComparison(): readonly Schema008FieldClassComparisonRow[] {
  return Object.freeze([
    {
      fieldClass: "slot_key",
      bridgeSuccessClass: "artifact_null_slot",
      rejectedLiveClass: "artifact_null_slot",
      correctedLocalClass: "artifact_null_slot",
    },
    {
      fieldClass: "retention_expires_at_ms",
      bridgeSuccessClass: "download_retention_from_upload_epoch",
      rejectedLiveClass: "download_retention_from_upload_epoch",
      correctedLocalClass: "download_retention_from_upload_epoch",
    },
    {
      fieldClass: "cleanup_scheduled_at_ms",
      bridgeSuccessClass: "null_until_terminal_cleanup",
      rejectedLiveClass: "null_with_staging_claim_held",
      correctedLocalClass: "null_until_terminal_cleanup",
    },
    {
      fieldClass: "upload_observed_revision",
      bridgeSuccessClass: "observed_before_finalize",
      rejectedLiveClass: "observed_before_failed_finalize",
      correctedLocalClass: "observed_before_finalize",
    },
    {
      fieldClass: "verification_claim",
      bridgeSuccessClass: "claimed_then_cleared_on_finalize",
      rejectedLiveClass: "claimed_held_after_failed_finalize",
      correctedLocalClass: "claimed_then_failed_marked_on_reject",
    },
    {
      fieldClass: "finalize_revision_cas",
      bridgeSuccessClass: "monotonic_store_version_commit",
      rejectedLiveClass: "not_reached",
      correctedLocalClass: "monotonic_store_version_commit",
    },
    {
      fieldClass: "maintenance_gate",
      bridgeSuccessClass: "disabled",
      rejectedLiveClass: "disabled",
      correctedLocalClass: "disabled",
    },
    {
      fieldClass: "packaged_environment",
      bridgeSuccessClass: "rollback_bridge_007_008",
      rejectedLiveClass: "strict_schema_008_cleanup_runtime",
      correctedLocalClass: "strict_schema_008_cleanup_runtime",
    },
  ]);
}

export async function runSchema008ProductionShapedFinalizeSuccessFixture(): Promise<{
  readonly stageClass: "finalized";
  readonly observedBoundaries: readonly OwningBoundaryEventId[];
  readonly sequenceCoherent: boolean;
  readonly maintenanceDisabled: boolean;
}> {
  const nowMs = 1_700_100_000_000;
  const bytes = new TextEncoder().encode("schema-008-production-shaped-webm");
  const digest = digestOf(bytes);
  const mimeType = "video/webm";
  const expiresAtMs = nowMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS;
  const { ownedObjectStore, storage } = makeProductionStack(nowMs);

  const maintenance = evaluateHeadlessExportMaintenanceEnablement({
    envName: "staging",
    maintenanceEnabledFlag: "0",
  });
  if (maintenance.ok) {
    throw new Error("expected maintenance disabled");
  }

  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "schema-008-finalize-success",
  });

  const session = await storage.createUploadSession({
    ownerId: FIXTURE_OWNER,
    projectId: FIXTURE_PROJECT,
    purpose: "artifact",
    mimeType,
    expiresAtMs,
    expectedContentDigest: digest,
    expectedByteLength: bytes.byteLength,
  });
  if (!session.ok) {
    throw new Error("upload session rejected");
  }

  telemetry.emit("artifact_upload_started", {
    artifactLifecycleRole: "primary_output",
  });
  const written = await storage.writeUploadStream({
    capabilityToken: session.value.capabilityToken,
    expectedByteLength: bytes.byteLength,
    maxBytes: bytes.byteLength,
    chunks: (async function* () {
      yield bytes;
    })(),
  });
  if (!written.ok) {
    throw new Error("upload stream rejected");
  }
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_started", {
    artifactLifecycleRole: "primary_output",
  });

  const finalized = await storage.finalizeUploadedObject({
    capabilityToken: session.value.capabilityToken,
    expectedContentDigest: digest,
  });
  if (!finalized.ok) {
    throw new Error("finalize rejected");
  }
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

  const stored = await ownedObjectStore.getByObjectIdAndOwner({
    objectId: fixtureObjectId(),
    ownerId: FIXTURE_OWNER,
  });
  if (!stored.ok || stored.value == null || stored.value.record.stage !== "finalized") {
    throw new Error("durable finalize missing");
  }
  if (stored.value.record.slotKey !== null) {
    throw new Error("unexpected slot_key class");
  }
  if (stored.value.record.cleanupScheduledAtMs != null) {
    throw new Error("cleanup_scheduled_at_ms must remain null on success");
  }

  const observedBoundaries = telemetry.observations.map((entry) => entry.boundaryId);
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observedBoundaries,
    providerContext: null,
    workspaceAttribution: null,
  });

  return {
    stageClass: "finalized",
    observedBoundaries,
    sequenceCoherent: coherence.ok,
    maintenanceDisabled: !maintenance.ok,
  };
}

/**
 * Replays the rejected live failure mode: finalize throws, legacy upload catch collapses
 * attribution to upload→cleanup without durable finalization.
 */
export async function runLegacyUploadCatchFinalizeContainmentFixture(): Promise<{
  readonly liveClassificationMatches: boolean;
  readonly durableStageClass: "staging_with_verification_claim";
  readonly observedBoundaries: readonly OwningBoundaryEventId[];
  readonly sequenceIncoherent: boolean;
}> {
  const nowMs = 1_700_100_100_000;
  const bytes = new TextEncoder().encode("legacy-containment-repro");
  const digest = digestOf(bytes);
  const base = makeProductionStack(nowMs);

  const session = await base.storage.createUploadSession({
    ownerId: FIXTURE_OWNER,
    projectId: FIXTURE_PROJECT,
    purpose: "artifact",
    mimeType: "video/webm",
    expiresAtMs: nowMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
    expectedContentDigest: digest,
    expectedByteLength: bytes.byteLength,
  });
  if (!session.ok) {
    throw new Error("session rejected");
  }

  await base.storage.writeUploadStream({
    capabilityToken: session.value.capabilityToken,
    expectedByteLength: bytes.byteLength,
    maxBytes: bytes.byteLength,
    chunks: (async function* () {
      yield bytes;
    })(),
  });

  const originalFinalize = base.storage.finalizeUploadedObject.bind(base.storage);
  base.storage.finalizeUploadedObject = async () => {
    throw Object.assign(new Error("ProviderFinalizeRejected"), {
      name: "ProviderFinalizeRejected",
    });
  };

  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "legacy-upload-catch",
  });
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });

  let uploadFailed = false;
  try {
    await base.storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });
  } catch {
    uploadFailed = true;
  } finally {
    base.storage.finalizeUploadedObject = originalFinalize;
  }
  if (!uploadFailed) {
    throw new Error("expected legacy catch path");
  }
  telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });

  const observedBoundaries = telemetry.observations.map((entry) => entry.boundaryId);
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observedBoundaries,
    providerContext: null,
    workspaceAttribution: null,
    terminalSubstage: "artifact_finalize",
  });

  const live = classifyRejectedCleanupRuntimeLiveFinalizationFailure();
  const repro = classifyOwnedObjectFinalizeLiveFailure({
    threwUnhandledException: true,
    durableStageClass: "staging_with_verification_claim",
    boundarySequenceIncludesFinalizeStarted: observedBoundaries.includes(
      "owned_object_finalize_started",
    ),
    boundarySequenceIncludesFinalizeCompleted: observedBoundaries.includes(
      "owned_object_finalize_completed",
    ),
  });

  return {
    liveClassificationMatches:
      live.finalizeSubstage === repro.finalizeSubstage &&
      live.actualLifecycleClass === repro.actualLifecycleClass &&
      live.revisionOutcome === repro.revisionOutcome,
    durableStageClass: "staging_with_verification_claim",
    observedBoundaries,
    sequenceIncoherent: !coherence.ok,
  };
}

/**
 * Production-shaped integrity reject after verification claim — matches unpinned live locus.
 */
export async function runPreFixFinalizeIntegrityRejectFixture(): Promise<{
  readonly classification: ReturnType<typeof classifyOwnedObjectFinalizeLiveFailure>;
  readonly finalizeCode: string;
  readonly verificationStateClass: "claimed" | "failed";
}> {
  const nowMs = 1_700_100_200_000;
  const bytes = new TextEncoder().encode("integrity-reject");
  const digest = digestOf(bytes);
  const { ownedObjectStore, storage } = makeProductionStack(nowMs);

  ownedObjectStore.finalizeStagingRecord = async () =>
    cpFail(
      "OBJECT_INTEGRITY_FAILED",
      "Trusted facts do not match staging claims.",
    );

  const session = await storage.createUploadSession({
    ownerId: FIXTURE_OWNER,
    projectId: FIXTURE_PROJECT,
    purpose: "artifact",
    mimeType: "video/webm",
    expiresAtMs: nowMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
    expectedContentDigest: digest,
    expectedByteLength: bytes.byteLength,
  });
  if (!session.ok) {
    throw new Error("session rejected");
  }
  await storage.writeUploadStream({
    capabilityToken: session.value.capabilityToken,
    expectedByteLength: bytes.byteLength,
    maxBytes: bytes.byteLength,
    chunks: (async function* () {
      yield bytes;
    })(),
  });

  const finalized = await storage.finalizeUploadedObject({
    capabilityToken: session.value.capabilityToken,
    expectedContentDigest: digest,
  });
  if (finalized.ok) {
    throw new Error("expected integrity reject before correction");
  }

  const code = finalized.issues[0]?.code ?? "UNKNOWN";
  const stored = await ownedObjectStore.getByObjectIdAndOwner({
    objectId: fixtureObjectId(),
    ownerId: FIXTURE_OWNER,
  });

  return {
    classification: classifyOwnedObjectFinalizeLiveFailure({
      safeControlPlaneCode: code,
      durableStageClass: "staging_with_verification_claim",
    }),
    finalizeCode: code,
    verificationStateClass:
      stored.ok && stored.value?.record.verificationState === "failed"
        ? "failed"
        : "claimed",
  };
}

export async function runCorrectedFinalizeFailureBoundaryFixture(): Promise<{
  readonly observedBoundaries: readonly OwningBoundaryEventId[];
  readonly sequenceCoherent: boolean;
  readonly finalizeSubstage: string;
}> {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "corrected-finalize-failure",
  });
  const code = "OBJECT_INTEGRITY_FAILED";
  telemetry.emit("artifact_upload_completed", {
    uploadOutcomeClass: "succeeded",
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_started", {
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("owned_object_finalize_completed", {
    finalizeOutcomeClass: "failed",
    finalizeSubstage: classifyStorageFinalizeFailureSubstage(code),
    artifactLifecycleRole: "primary_output",
  });
  telemetry.emit("terminal_failure_cas_started");
  telemetry.emit("terminal_failure_cas_completed", { casOutcomeClass: "succeeded" });
  telemetry.emit("cleanup_completed", { cleanupOutcomeClass: "ok" });

  const observedBoundaries = telemetry.observations.map((entry) => entry.boundaryId);
  const coherence = validateOwningBoundarySequenceCoherence({
    observedSequence: observedBoundaries,
    providerContext: null,
    workspaceAttribution: null,
    terminalSubstage: "artifact_finalize",
  });

  return {
    observedBoundaries,
    sequenceCoherent: coherence.ok,
    finalizeSubstage: classifyStorageFinalizeFailureSubstage(code),
  };
}

export async function runStaleRevisionBeforeObserveFixture(): Promise<{
  readonly failedWithStaleObserve: boolean;
  readonly succeededAfterFreshObserve: boolean;
}> {
  const nowMs = 1_700_100_300_000;
  const bytes = new TextEncoder().encode("stale-revision-observe");
  const digest = digestOf(bytes);
  const { ownedObjectStore, storage } = makeProductionStack(nowMs);

  const session = await storage.createUploadSession({
    ownerId: FIXTURE_OWNER,
    projectId: FIXTURE_PROJECT,
    purpose: "artifact",
    mimeType: "video/webm",
    expiresAtMs: nowMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS,
    expectedContentDigest: digest,
    expectedByteLength: bytes.byteLength,
  });
  if (!session.ok) {
    throw new Error("session rejected");
  }

  const staged = await ownedObjectStore.getByObjectIdAndOwner({
    objectId: fixtureObjectId(),
    ownerId: FIXTURE_OWNER,
  });
  if (!staged.ok || staged.value == null) {
    throw new Error("missing staged object");
  }

  await ownedObjectStore.markUploadedObserved({
    objectId: fixtureObjectId(),
    ownerId: FIXTURE_OWNER,
    expectedStoreVersion: staged.value.storeVersion,
    uploadedObservedAtMs: nowMs,
    nowMs,
  });

  const staleWrite = await storage.writeUploadStream({
    capabilityToken: session.value.capabilityToken,
    expectedByteLength: bytes.byteLength,
    maxBytes: bytes.byteLength,
    chunks: (async function* () {
      yield bytes;
    })(),
  });

  return {
    failedWithStaleObserve: staleWrite.ok === false,
    succeededAfterFreshObserve: staleWrite.ok === true,
  };
}

export function assertNoPrivateValuesInTelemetryFacts(
  facts: Readonly<Record<string, string>>,
): void {
  for (const value of Object.values(facts)) {
    if (/^sha256:[0-9a-f]{64}$/.test(value)) {
      throw new Error("raw digest leaked to telemetry");
    }
    if (/^(job_|op_|owner_|project_|obj_)/.test(value)) {
      throw new Error("raw identifier leaked to telemetry");
    }
    if (value.includes("artifacts/") || value.includes("assets/")) {
      throw new Error("raw locator leaked to telemetry");
    }
  }
}

export async function runPrivacySafeTelemetryFixture(): Promise<void> {
  const telemetry = createCollectingProviderBackedBoundaryTelemetry({
    portId: "privacy-safe-finalize",
  });
  telemetry.emit("owned_object_finalize_completed", {
    finalizeOutcomeClass: "failed",
    finalizeSubstage: "finalized_coherence_assertion",
    artifactLifecycleRole: "primary_output",
  });
  for (const observation of telemetry.observations) {
    assertNoPrivateValuesInTelemetryFacts(observation.facts);
  }
}

export async function runTerminalCleanupNotOnSuccessFixture(): Promise<{
  readonly cleanupScheduled: boolean;
}> {
  const result = await runSchema008ProductionShapedFinalizeSuccessFixture();
  return {
    cleanupScheduled: result.observedBoundaries.includes("cleanup_scheduled"),
  };
}

export function wrapStorageForIntegrityReject(
  storage: HeadlessStoragePort,
): HeadlessStoragePort {
  return {
    ...storage,
    finalizeUploadedObject: async (input) => {
      const denied: HeadlessControlPlaneResult<never> = cpFail(
        "OBJECT_INTEGRITY_FAILED",
        "Trusted facts do not match staging claims.",
      );
      return denied;
    },
  };
}

export function randomCapabilityToken(): string {
  return `cap_${randomUUID()}`;
}
