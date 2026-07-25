/**
 * Provider-neutral post-claim render execution.
 *
 * Shared by LocalHeadlessWorkerRunner and the hosted onClaimedRender hook.
 * Claim acquisition / Redis ACK remain outside this module — callers pass the
 * exact durable claimed record + claim token.
 */

import {
  applyHeadlessJobTransition,
  isHeadlessTerminalState,
} from "../../domain";
import type { HeadlessArtifactCleanupPort } from "../../control-plane/ports/artifact-cleanup.port";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type {
  HeadlessObjectMetadata,
  HeadlessStoragePort,
} from "../../control-plane/ports/storage.port";
import { deriveAttemptBoundArtifactObjectId } from "../../control-plane/services/attempt-bound-artifact-key";
import { deleteOrScheduleArtifactCleanup } from "../../control-plane/services/schedule-artifact-cleanup";
import { evaluateArtifactObjectBindingCoherence } from "../../control-plane/services/evaluate-artifact-object-binding-coherence";
import type { HeadlessArtifactCleanupReasonId } from "../../control-plane/types/artifact-cleanup-intent";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/types/stored-job-record";
import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import { scrubWorkerMessage } from "../diagnostics/scrub-worker-message";
import {
  confirmDurableClaimCoherence,
  type ClaimCoherenceRejectionId,
} from "./confirm-durable-claim-coherence";
import { executeHeadlessRenderJob } from "./execute-render-job";
import { assertPhase3WorkerCapability } from "./capability-preflight";
import {
  createJobDeadline,
  failureReasonForDeadline,
} from "./job-deadline";
import {
  buildExecutionAttributionFromClaimedResult,
  type ClaimedRenderExecutionSubstageId,
} from "./claimed-render-execution-attribution";
import {
  mapStageAdvanceToExecutionSubstage,
  mapUploadFailureReasonToSubstage,
  type SecondaryTerminalCasOutcomeClass,
} from "./post-frame-failure-containment";
import {
  isPageChromiumTerminalSubstage,
  resolveTerminalPageFailureAttribution,
} from "../chromium/page-workspace-attribution-invariant";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerArtifactEvidence,
  type HeadlessWorkerFailureReasonId,
  type HeadlessWorkerLimits,
} from "./worker-types";
import {
  classifyProviderRenderContext,
} from "./classify-provider-render-context";
import {
  createNoOpProviderBackedBoundaryTelemetry,
  type ProviderBackedBoundaryTelemetryPort,
  type StorageAdapterClass,
} from "./provider-backed-boundary-telemetry";

/** Stable module identity — local + hosted must import this same executor. */
export const CLAIMED_RENDER_EXECUTOR_ID = "executeClaimedRender" as const;

export type HeadlessOrphanCleanupReport = {
  readonly status: "deleted" | "scheduled" | "unconfirmed";
  readonly cleanupId: string | null;
};

export type ClaimedRenderExecutionKind =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "preserved_terminal"
  | "ownership_transferred"
  | "unconfirmed_terminalization"
  | "claim_coherence_rejected"
  | "cleanup_unconfirmed";

export type ClaimedRenderExecutionPhase =
  | "coherence"
  | "render"
  | "upload"
  | "binding"
  | "succeeded_cas"
  | "cleanup";

export type ClaimedRenderExecutionResult = {
  readonly kind: ClaimedRenderExecutionKind;
  readonly phase: ClaimedRenderExecutionPhase;
  readonly reasonId: string;
  readonly coherenceRejection: ClaimCoherenceRejectionId | null;
  readonly evidence: HeadlessWorkerArtifactEvidence | null;
  readonly orphanCleanup: HeadlessOrphanCleanupReport | null;
  /** True when succeeded CAS lost and orphan cleanup was attempted. */
  readonly succeededCasLost: boolean;
  readonly executionAttribution?: import("./claimed-render-execution-attribution").FlyRenderClaimedRenderExecutionAttributionSnapshot;
};

export type ExecuteClaimedRenderInput = {
  readonly claimedRecord: HeadlessCanonicalStoredJobRecord;
  readonly claimToken: string;
  readonly jobStore: HeadlessJobStorePort;
  readonly artifactCleanup: HeadlessArtifactCleanupPort;
  /**
   * Resolved only after durable claim coherence succeeds — zero R2/native
   * side effects are expected from constructing the port itself.
   */
  readonly resolveStorage: (
    coherentRecord: HeadlessCanonicalStoredJobRecord,
  ) => HeadlessStoragePort | Promise<HeadlessStoragePort>;
  readonly signal?: AbortSignal;
  readonly nowMs: () => number;
  readonly limits?: Partial<HeadlessWorkerLimits>;
  /** Owning-boundary telemetry — no-op when omitted (local/non-hosted). */
  readonly boundaryTelemetry?: ProviderBackedBoundaryTelemetryPort;
  /** Safe storage adapter classification for provider context attribution. */
  readonly storageAdapterClass?: StorageAdapterClass;
  /** Optional subclass barriers — never constructor-injected test deps. */
  readonly afterFinalizeBeforeSucceededCas?: () => Promise<void>;
  readonly throwBeforeSucceededCas?: () => boolean;
};

type TerminalOutcome =
  | "succeeded"
  | "failed"
  | "cancelled"
  | "preserved_terminal"
  | "ownership_transferred"
  | "unconfirmed_terminalization";

function resultOf(input: {
  readonly kind: ClaimedRenderExecutionKind;
  readonly phase: ClaimedRenderExecutionPhase;
  readonly reasonId: string;
  readonly coherenceRejection?: ClaimCoherenceRejectionId | null;
  readonly evidence?: HeadlessWorkerArtifactEvidence | null;
  readonly orphanCleanup?: HeadlessOrphanCleanupReport | null;
  readonly succeededCasLost?: boolean;
  readonly executionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly durableJobState?: string;
  readonly storeVersionBefore?: number;
  readonly storeVersionAfter?: number;
  readonly claimTokenCoherenceClass?: import("./claimed-render-execution-attribution").ClaimTokenCoherenceClass;
  readonly boundedDurationMs?: number;
  readonly pageFailureReason?: import("./claimed-render-execution-attribution").ClaimedRenderExecutionReasonId;
  readonly pageResponseClass?: import("../chromium/page-execution-attribution").PageResponseClassification;
  readonly pageWorkspaceAttribution?: import("../chromium/page-workspace-attribution").PageWorkspaceAttribution;
  readonly workspaceMaterializationCompleted?: boolean;
  readonly sourceBindingAttribution?: import("./source-binding-resolution").SourceBindingAttributionSnapshot;
  readonly primaryExecutionSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId;
  readonly secondaryTerminalCasOutcome?: SecondaryTerminalCasOutcomeClass;
  readonly storeVersionAtTerminalAttempt?: number;
}): ClaimedRenderExecutionResult {
  const base = {
    kind: input.kind,
    phase: input.phase,
    reasonId: input.reasonId,
    coherenceRejection: input.coherenceRejection ?? null,
    evidence: input.evidence ?? null,
    orphanCleanup: input.orphanCleanup ?? null,
    succeededCasLost: input.succeededCasLost === true,
  };
  if (input.durableJobState == null) {
    return base;
  }
  let pageFailureReason = input.pageFailureReason;
  let pageWorkspaceAttribution = input.pageWorkspaceAttribution;
  if (
    input.executionSubstage != null &&
    isPageChromiumTerminalSubstage(input.executionSubstage)
  ) {
    const resolved = resolveTerminalPageFailureAttribution({
      workspacePrepared: input.workspaceMaterializationCompleted === true,
      executionSubstage: input.executionSubstage,
      pageFailureReason:
        input.pageFailureReason ?? "render_terminalized_failure",
      pageWorkspaceAttribution: input.pageWorkspaceAttribution,
    });
    pageFailureReason = resolved.pageFailureReason;
    pageWorkspaceAttribution = resolved.pageWorkspaceAttribution;
  }
  return {
    ...base,
    executionAttribution: buildExecutionAttributionFromClaimedResult({
      result: base,
      executionSubstage: input.executionSubstage,
      durableJobState: input.durableJobState,
      storeVersionBefore: input.storeVersionBefore,
      storeVersionAfter: input.storeVersionAfter,
      claimTokenCoherenceClass: input.claimTokenCoherenceClass,
      boundedDurationMs: input.boundedDurationMs,
      pageFailureReason,
      pageResponseClass: input.pageResponseClass,
      pageWorkspaceAttribution,
      sourceBindingAttribution: input.sourceBindingAttribution,
      primaryExecutionSubstage: input.primaryExecutionSubstage,
      secondaryTerminalCasSubstage: input.secondaryTerminalCasSubstage,
      secondaryTerminalCasOutcome: input.secondaryTerminalCasOutcome,
      storeVersionAtTerminalAttempt: input.storeVersionAtTerminalAttempt,
    }),
  };
}

/**
 * Execute the production post-claim render lifecycle under an already-acquired
 * durable claim. Does not claim or ACK.
 */
export async function executeClaimedRender(
  input: ExecuteClaimedRenderInput,
): Promise<ClaimedRenderExecutionResult> {
  const limits: HeadlessWorkerLimits = {
    ...DEFAULT_HEADLESS_WORKER_LIMITS,
    ...input.limits,
  };
  const boundaryTelemetry =
    input.boundaryTelemetry ?? createNoOpProviderBackedBoundaryTelemetry();
  const storageAdapterClass = input.storageAdapterClass ?? "not_reached";
  const claimToken = input.claimToken;
  const storeVersionBefore = input.claimedRecord.storeVersion;
  const executionStartedMs = input.nowMs();
  let lastKnownExecutionSubstage: ClaimedRenderExecutionSubstageId =
    "page_contract_ready";

  const coherence = await confirmDurableClaimCoherence({
    jobStore: input.jobStore,
    claimedRecord: input.claimedRecord,
    claimToken,
  });
  if (!coherence.ok) {
    return resultOf({
      kind: "claim_coherence_rejected",
      phase: "coherence",
      reasonId: coherence.reasonId,
      coherenceRejection: coherence.reasonId,
      executionSubstage: "claim_coherence",
      durableJobState: input.claimedRecord.canonicalJob.state,
      storeVersionBefore,
      storeVersionAfter: input.claimedRecord.storeVersion,
      claimTokenCoherenceClass: "mismatch",
      boundedDurationMs: input.nowMs() - executionStartedMs,
    });
  }

  let record = coherence.record;
  boundaryTelemetry.emit("claimed_context_validated");
  const request = record.canonicalRequest;
  const providerContext = classifyProviderRenderContext({
    request,
    bundle: request.assetBundle,
    storageAdapterClass,
    identityCoherent: true,
  });
  boundaryTelemetry.emit("canonical_request_loaded", { providerContext });

  const jobId = record.jobId;
  const ownerId = record.ownerId;
  const storage = await input.resolveStorage(record);

  const deadline = createJobDeadline({
    timeoutMs: limits.jobTimeoutMs,
    parentSignal: input.signal,
  });

  const advance = async (
    toState: "rendering" | "encoding" | "validating" | "uploading",
    percent: number,
  ): Promise<
    | { ok: true }
    | {
        ok: false;
        reasonId: HeadlessWorkerFailureReasonId;
        message: string;
        retryable: boolean;
      }
  > => {
    try {
      const t = Math.max(input.nowMs(), record.canonicalJob.updatedAtMs + 1);
      const step = applyHeadlessJobTransition({
        jobValue: record.canonicalJob,
        requestValue: request,
        toState,
        attempt: record.canonicalJob.attempt,
        updatedAtMs: t,
        progress: { percent, stage: toState, updatedAtMs: t },
      });
      if (!step.ok) {
        return {
          ok: false,
          reasonId: "WORKER_FAILED",
          message: scrubWorkerMessage("stage"),
          retryable: true,
        };
      }
      const cas = await input.jobStore.compareAndSetTransition({
        jobId,
        ownerId,
        expectedStoreVersion: record.storeVersion,
        next: {
          job: step.job,
          request,
          idempotencyAuthorityKey: record.idempotencyAuthorityKey,
          operationId: record.operationId,
          claimToken: record.claimToken,
          claimedAtMs: record.claimedAtMs,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok) {
        return {
          ok: false,
          reasonId: "WORKER_FAILED",
          message: scrubWorkerMessage("stage"),
          retryable: true,
        };
      }
      if (cas.value.kind === "terminal_locked") {
        return {
          ok: false,
          reasonId: "TERMINAL_STATE_IMMUTABLE",
          message: scrubWorkerMessage("claim"),
          retryable: false,
        };
      }
      if (cas.value.kind !== "updated") {
        return {
          ok: false,
          reasonId: "STALE_ATTEMPT",
          message: scrubWorkerMessage("claim"),
          retryable: false,
        };
      }
      record = cas.value.record;
      return { ok: true };
    } catch {
      return {
        ok: false,
        reasonId: "WORKER_FAILED",
        message: scrubWorkerMessage("stage"),
        retryable: true,
      };
    }
  };

  const classifyAfterTerminalCasMiss = async (): Promise<TerminalOutcome> => {
    const refresh = await input.jobStore.getByJobIdAndOwner(jobId, ownerId);
    if (!refresh.ok) return "unconfirmed_terminalization";
    if (refresh.value.stage !== "canonical") {
      return "unconfirmed_terminalization";
    }
    if (isHeadlessTerminalState(refresh.value.canonicalJob.state)) {
      return "preserved_terminal";
    }
    if (
      refresh.value.claimToken != null &&
      refresh.value.claimToken !== claimToken
    ) {
      return "ownership_transferred";
    }
    return "unconfirmed_terminalization";
  };

  const terminalize = async (termInput: {
    reasonId: HeadlessWorkerFailureReasonId;
    retryable: boolean;
  }): Promise<TerminalOutcome> => {
    const toState =
      termInput.reasonId === "CANCELLED_BY_USER" ? "cancelled" : "failed";
    try {
      const t = Math.max(input.nowMs(), record.canonicalJob.updatedAtMs + 1);
      const failedJob = applyHeadlessJobTransition({
        jobValue: record.canonicalJob,
        requestValue: request,
        toState,
        attempt: record.canonicalJob.attempt,
        updatedAtMs: t,
        terminalReason: {
          reasonId: termInput.reasonId,
          retryable: termInput.retryable,
        },
      });
      if (!failedJob.ok) {
        return classifyAfterTerminalCasMiss();
      }
      const cas = await input.jobStore.compareAndSetTransition({
        jobId,
        ownerId,
        expectedStoreVersion: record.storeVersion,
        next: {
          job: failedJob.job,
          request,
          idempotencyAuthorityKey: record.idempotencyAuthorityKey,
          operationId: record.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok) return "unconfirmed_terminalization";
      if (cas.value.kind === "terminal_locked") return "preserved_terminal";
      if (cas.value.kind !== "updated") {
        return classifyAfterTerminalCasMiss();
      }
      record = cas.value.record;
      return toState === "cancelled" ? "cancelled" : "failed";
    } catch {
      return "unconfirmed_terminalization";
    }
  };

  const mapTerminal = (
    outcome: TerminalOutcome,
    phase: ClaimedRenderExecutionPhase,
    reasonId: string,
    orphanCleanup: HeadlessOrphanCleanupReport | null = null,
    succeededCasLost = false,
    executionSubstage?: ClaimedRenderExecutionSubstageId,
    pageFailureReason?: import("./claimed-render-execution-attribution").ClaimedRenderExecutionReasonId,
    pageResponseClass?: import("../chromium/page-execution-attribution").PageResponseClassification,
    pageWorkspaceAttribution?: import("../chromium/page-workspace-attribution").PageWorkspaceAttribution,
    workspaceMaterializationCompleted?: boolean,
    sourceBindingAttribution?: import("./source-binding-resolution").SourceBindingAttributionSnapshot,
    containment?: {
      readonly primaryExecutionSubstage?: ClaimedRenderExecutionSubstageId;
      readonly secondaryTerminalCasSubstage?: ClaimedRenderExecutionSubstageId;
      readonly secondaryTerminalCasOutcome?: SecondaryTerminalCasOutcomeClass;
      readonly storeVersionAtTerminalAttempt?: number;
    },
  ): ClaimedRenderExecutionResult => {
    const reportedSubstage =
      executionSubstage ??
      (phase === "render"
        ? "terminal_failure_cas"
        : phase === "upload"
          ? "artifact_upload"
          : phase === "succeeded_cas"
            ? "succeeded_cas"
            : phase === "binding"
              ? "artifact_binding_validation"
              : "terminal_failure_cas");
    const primarySubstage =
      containment?.primaryExecutionSubstage ?? lastKnownExecutionSubstage;
    const secondarySubstage =
      containment?.secondaryTerminalCasSubstage ??
      (reportedSubstage === "terminal_failure_cas" &&
      primarySubstage !== "terminal_failure_cas"
        ? reportedSubstage
        : undefined);
    const attributedSubstage =
      reportedSubstage === "terminal_failure_cas" &&
      primarySubstage !== "terminal_failure_cas"
        ? primarySubstage
        : reportedSubstage;
    if (attributedSubstage !== "terminal_failure_cas") {
      lastKnownExecutionSubstage = attributedSubstage;
    }
    const kind =
      outcome === "failed" || outcome === "cancelled"
        ? outcome
        : outcome;
    const storeVersionAtTerminalAttempt =
      containment?.storeVersionAtTerminalAttempt ?? record.storeVersion;
    if (
      reportedSubstage === "terminal_failure_cas" ||
      secondarySubstage === "terminal_failure_cas"
    ) {
      boundaryTelemetry.emit("terminal_failure_cas_started");
    }
    if (
      outcome === "failed" ||
      outcome === "cancelled" ||
      outcome === "preserved_terminal" ||
      outcome === "ownership_transferred" ||
      outcome === "unconfirmed_terminalization"
    ) {
      if (
        reportedSubstage === "terminal_failure_cas" ||
        secondarySubstage === "terminal_failure_cas"
      ) {
        boundaryTelemetry.emit("terminal_failure_cas_completed", {
          casOutcomeClass:
            outcome === "failed" || outcome === "cancelled"
              ? "succeeded"
              : "failed",
        });
      }
    }
    if (orphanCleanup?.status === "scheduled") {
      boundaryTelemetry.emit("cleanup_scheduled");
    }
    if (
      orphanCleanup?.status === "deleted" ||
      orphanCleanup?.status === "scheduled"
    ) {
      boundaryTelemetry.emit("cleanup_completed", {
        cleanupOutcomeClass:
          orphanCleanup.status === "deleted" ? "ok" : "ok",
      });
    }
    const base = {
      kind: kind as ClaimedRenderExecutionKind,
      phase,
      reasonId,
      orphanCleanup,
      succeededCasLost,
      executionSubstage: attributedSubstage,
      durableJobState:
        record.stage === "canonical" ? record.canonicalJob.state : "queued",
      storeVersionBefore,
      storeVersionAfter: record.storeVersion,
      claimTokenCoherenceClass: "cleared_after_terminal" as const,
      boundedDurationMs: input.nowMs() - executionStartedMs,
      pageFailureReason,
      pageResponseClass,
      pageWorkspaceAttribution,
      workspaceMaterializationCompleted,
      sourceBindingAttribution,
      primaryExecutionSubstage:
        secondarySubstage != null ? primarySubstage : undefined,
      secondaryTerminalCasSubstage: secondarySubstage,
      secondaryTerminalCasOutcome:
        containment?.secondaryTerminalCasOutcome ??
        (secondarySubstage != null
          ? outcome === "failed" || outcome === "cancelled"
            ? "confirmed"
            : outcome === "preserved_terminal"
              ? "preserved_terminal"
              : outcome === "ownership_transferred"
                ? "ownership_transferred"
                : "unconfirmed"
          : undefined),
      storeVersionAtTerminalAttempt,
    };
    if (outcome === "failed" || outcome === "cancelled") {
      return resultOf(base);
    }
    return resultOf(base);
  };

  const capabilityFailure = assertPhase3WorkerCapability({ request });
  if (capabilityFailure != null) {
    const outcome = await terminalize({
      reasonId: capabilityFailure.reasonId,
      retryable: capabilityFailure.retryable,
    });
    return mapTerminal(
      outcome,
      "render",
      capabilityFailure.reasonId,
      null,
      false,
      "render_request_materialization",
      "unsupported_capability",
      undefined,
      undefined,
      false,
    );
  }

  try {
    const executed = await executeHeadlessRenderJob({
      run: {
        record,
        claimToken,
        ownerId,
        signal: deadline.signal,
        nowMs: input.nowMs(),
      },
      storage,
      limits,
      deadline,
      boundaryTelemetry,
      providerContext,
      onStage: async (stage) => {
        const percent =
          stage === "rendering" ? 35 : stage === "encoding" ? 60 : 80;
        lastKnownExecutionSubstage = mapStageAdvanceToExecutionSubstage(stage);
        const stepped = await advance(stage, percent);
        if (!stepped.ok) {
          lastKnownExecutionSubstage = mapStageAdvanceToExecutionSubstage(stage);
          const err = new Error(stepped.message);
          (err as Error & { reasonId?: string; executionSubstage?: string }).reasonId =
            stepped.reasonId;
          (err as Error & { executionSubstage?: string }).executionSubstage =
            lastKnownExecutionSubstage;
          throw err;
        }
      },
    });

    if (!executed.ok) {
      const deadlineKind = deadline.abortKind();
      const mapped =
        failureReasonForDeadline(deadlineKind) ?? executed.reasonId;
      const outcome = await terminalize({
        reasonId: mapped,
        retryable:
          mapped === "WORKER_TIMEOUT" || mapped === "CLAIM_LEASE_EXPIRED"
            ? true
            : executed.retryable,
      });
      const failureSubstage =
        executed.executionSubstage ??
        (mapped === "UNSUPPORTED_CAPABILITY"
          ? "render_request_materialization"
          : mapped === "WORKSPACE_QUOTA_EXCEEDED"
            ? "workspace_prepare"
            : mapped === "ENCODE_FAILED"
              ? "ffmpeg_execution"
              : lastKnownExecutionSubstage);
      const pageFailureReason =
        executed.pageFailureReason ??
        (mapped === "UNSUPPORTED_CAPABILITY"
          ? ("unsupported_capability" as const)
          : undefined);
      return mapTerminal(
        outcome,
        "render",
        mapped,
        null,
        false,
        failureSubstage,
        pageFailureReason,
        executed.pageResponseClass,
        executed.pageWorkspaceAttribution,
        executed.pageWorkspaceAttribution != null,
        executed.sourceBindingAttribution,
      );
    }

    const artifactLease = executed.artifactLease;
    try {
      const toUploading = await advance("uploading", 90);
      if (!toUploading.ok) {
        lastKnownExecutionSubstage = "artifact_upload";
        const storeVersionAtTerminalAttempt = record.storeVersion;
        const outcome = await terminalize({
          reasonId: toUploading.reasonId,
          retryable: toUploading.retryable,
        });
        return mapTerminal(
          outcome,
          "upload",
          toUploading.reasonId,
          null,
          false,
          "artifact_upload",
          undefined,
          undefined,
          undefined,
          undefined,
          executed.sourceBindingAttribution,
          {
            primaryExecutionSubstage: "artifact_upload",
            storeVersionAtTerminalAttempt,
          },
        );
      }
      lastKnownExecutionSubstage = "artifact_upload";
      boundaryTelemetry.emit("artifact_upload_started");

      let uploadFailed: {
        reasonId: HeadlessWorkerFailureReasonId;
        retryable: boolean;
      } | null = null;
      let finalizeFailed: {
        reasonId: HeadlessWorkerFailureReasonId;
        retryable: boolean;
      } | null = null;
      let uploadMetrics: {
        byteLength: number;
        chunkCount: number;
        peakChunkBytes: number;
        elapsedMs: number;
      } | null = null;
      let finalizedMeta: HeadlessObjectMetadata | null = null;
      let orphanLocator: HeadlessStorageLocatorIdentity | null = null;
      let lastOrphanCleanup: HeadlessOrphanCleanupReport | null = null;
      let cleanupUnconfirmed = false;

      const cleanupOrphan = async (
        locator: HeadlessStorageLocatorIdentity | null,
        reasonId: HeadlessArtifactCleanupReasonId,
      ): Promise<HeadlessOrphanCleanupReport> => {
        if (!locator) {
          return { status: "deleted", cleanupId: null };
        }
        const objectId = deriveAttemptBoundArtifactObjectId({
          jobId,
          operationId: record.operationId,
          attempt: record.canonicalJob.attempt,
        });
        if (objectId == null) {
          return { status: "unconfirmed", cleanupId: null };
        }
        const outcome = await deleteOrScheduleArtifactCleanup({
          storage,
          cleanup: input.artifactCleanup,
          locator,
          objectId,
          ownerId,
          projectId: request.ownership.projectId,
          jobId,
          attempt: record.canonicalJob.attempt,
          contentDigest: executed.artifact.contentDigest,
          reasonId,
          nowMs: input.nowMs(),
          expiresAtMs: executed.artifact.expiresAtMs,
        });
        if (outcome.status === "deleted") {
          return { status: "deleted", cleanupId: null };
        }
        if (outcome.status === "scheduled") {
          return { status: "scheduled", cleanupId: outcome.cleanupId };
        }
        return { status: "unconfirmed", cleanupId: null };
      };

      try {
        if (deadline.signal.aborted) {
          uploadFailed = {
            reasonId:
              failureReasonForDeadline(deadline.abortKind()) ??
              "WORKER_TIMEOUT",
            retryable: deadline.abortKind() === "timeout",
          };
        } else {
          const upload = await storage.createUploadSession({
            ownerId,
            projectId: request.ownership.projectId,
            purpose: "artifact",
            mimeType: executed.artifact.mimeType,
            expiresAtMs: executed.artifact.expiresAtMs,
            expectedContentDigest: executed.artifact.contentDigest,
            expectedByteLength: executed.artifact.byteLength,
          });
          if (!upload.ok) {
            uploadFailed = {
              reasonId: "WORKER_FAILED",
              retryable: true,
            };
          } else {
            orphanLocator = upload.value.locator;
            const uploadStarted = Date.now();
            const maxChunkBytes = Math.min(
              1024 * 1024,
              limits.maxSingleFrameBytes,
            );
            const written = await storage.writeUploadStream({
              capabilityToken: upload.value.capabilityToken,
              expectedByteLength: executed.artifact.byteLength,
              maxBytes: executed.artifact.byteLength,
              signal: deadline.signal,
              chunks: artifactLease.openUploadChunks({
                maxChunkBytes,
                signal: deadline.signal,
              }),
            });
            if (!written.ok) {
              const cleaned = await cleanupOrphan(
                orphanLocator,
                "UPLOAD_SESSION_ORPHAN",
              );
              lastOrphanCleanup = cleaned;
              if (cleaned.status === "unconfirmed") {
                cleanupUnconfirmed = true;
              }
              orphanLocator = null;
              const uploadCode = written.issues[0]?.code;
              uploadFailed = {
                reasonId:
                  uploadCode === "OPERATION_ABORTED"
                    ? (failureReasonForDeadline(deadline.abortKind()) ??
                      "CANCELLED_BY_USER")
                    : "WORKER_FAILED",
                retryable: uploadCode !== "OPERATION_ABORTED",
              };
            } else if (
              written.value.byteLength !== executed.artifact.byteLength
            ) {
              const cleaned = await cleanupOrphan(
                orphanLocator,
                "UPLOAD_SESSION_ORPHAN",
              );
              lastOrphanCleanup = cleaned;
              if (cleaned.status === "unconfirmed") {
                cleanupUnconfirmed = true;
              }
              orphanLocator = null;
              uploadFailed = {
                reasonId: "WORKER_FAILED",
                retryable: true,
              };
            } else {
              uploadMetrics = {
                byteLength: written.value.byteLength,
                chunkCount: written.value.chunkCount,
                peakChunkBytes: written.value.peakChunkBytes,
                elapsedMs: Date.now() - uploadStarted,
              };
              boundaryTelemetry.emit("artifact_upload_completed", {
                uploadOutcomeClass: "succeeded",
                artifactLifecycleRole: "primary_output",
              });
              boundaryTelemetry.emit("owned_object_finalize_started", {
                artifactLifecycleRole: "primary_output",
              });
              const finalized = await storage.finalizeUploadedObject({
                capabilityToken: upload.value.capabilityToken,
                expectedContentDigest: executed.artifact.contentDigest,
              });
              if (!finalized.ok) {
                boundaryTelemetry.emit("owned_object_finalize_completed", {
                  finalizeOutcomeClass: "failed",
                  finalizeSubstage: "r2_upload",
                });
                const cleaned = await cleanupOrphan(
                  orphanLocator,
                  "UPLOAD_SESSION_ORPHAN",
                );
                lastOrphanCleanup = cleaned;
                if (cleaned.status === "unconfirmed") {
                  cleanupUnconfirmed = true;
                }
                orphanLocator = null;
                finalizeFailed = {
                  reasonId: "WORKER_FAILED",
                  retryable: true,
                };
              } else {
                finalizedMeta = finalized.value;
                orphanLocator = finalized.value.locator;
              }
            }
          }
        }
      } catch {
        const cleaned = await cleanupOrphan(
          orphanLocator,
          "UPLOAD_SESSION_ORPHAN",
        );
        lastOrphanCleanup = cleaned;
        if (cleaned.status === "unconfirmed") {
          cleanupUnconfirmed = true;
        }
        orphanLocator = null;
        uploadFailed = {
          reasonId: "WORKER_FAILED",
          retryable: true,
        };
      }

      if (uploadFailed) {
        lastKnownExecutionSubstage = mapUploadFailureReasonToSubstage(
          uploadFailed.reasonId,
        );
        const storeVersionAtTerminalAttempt = record.storeVersion;
        const outcome = await terminalize({
          reasonId: uploadFailed.reasonId,
          retryable: uploadFailed.retryable,
        });
        if (cleanupUnconfirmed) {
          return resultOf({
            kind: "cleanup_unconfirmed",
            phase: "cleanup",
            reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
            orphanCleanup: lastOrphanCleanup,
          });
        }
        boundaryTelemetry.emit("artifact_upload_completed", {
          uploadOutcomeClass: "failed",
        });
        return mapTerminal(
          outcome,
          "upload",
          uploadFailed.reasonId,
          lastOrphanCleanup,
          false,
          lastKnownExecutionSubstage,
          undefined,
          undefined,
          undefined,
          undefined,
          executed.sourceBindingAttribution,
          {
            primaryExecutionSubstage: lastKnownExecutionSubstage,
            storeVersionAtTerminalAttempt,
          },
        );
      }

      if (finalizeFailed) {
        lastKnownExecutionSubstage = "artifact_finalize";
        const storeVersionAtTerminalAttempt = record.storeVersion;
        const outcome = await terminalize({
          reasonId: finalizeFailed.reasonId,
          retryable: finalizeFailed.retryable,
        });
        if (cleanupUnconfirmed) {
          return resultOf({
            kind: "cleanup_unconfirmed",
            phase: "cleanup",
            reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
            orphanCleanup: lastOrphanCleanup,
          });
        }
        return mapTerminal(
          outcome,
          "binding",
          finalizeFailed.reasonId,
          lastOrphanCleanup,
          false,
          "artifact_finalize",
          undefined,
          undefined,
          undefined,
          undefined,
          executed.sourceBindingAttribution,
          {
            primaryExecutionSubstage: "artifact_finalize",
            storeVersionAtTerminalAttempt,
          },
        );
      }

      if (finalizedMeta != null) {
        boundaryTelemetry.emit("owned_object_finalize_completed", {
          finalizeOutcomeClass: "succeeded",
          finalizeSubstage: "provider_finalize",
          artifactLifecycleRole: "primary_output",
        });
      }

      try {
        if (input.afterFinalizeBeforeSucceededCas) {
          await input.afterFinalizeBeforeSucceededCas();
        }
        if (input.throwBeforeSucceededCas?.() === true) {
          throw new Error("test_throw_before_succeeded_cas");
        }

        const t = Math.max(input.nowMs(), record.canonicalJob.updatedAtMs + 1);
        const succeededJob = applyHeadlessJobTransition({
          jobValue: record.canonicalJob,
          requestValue: request,
          toState: "succeeded",
          attempt: record.canonicalJob.attempt,
          updatedAtMs: t,
          artifact: executed.artifact,
        });
        if (!succeededJob.ok || !finalizedMeta) {
          const storeVersionAtTerminalAttempt = record.storeVersion;
          const outcome = await terminalize({
            reasonId: "WORKER_FAILED",
            retryable: true,
          });
          const cleaned = await cleanupOrphan(
            orphanLocator,
            "SUCCEEDED_CAS_REJECTED",
          );
          lastOrphanCleanup = cleaned;
          orphanLocator = null;
          if (cleaned.status === "unconfirmed") {
            cleanupUnconfirmed = true;
          }
          if (cleanupUnconfirmed) {
            return resultOf({
              kind: "cleanup_unconfirmed",
              phase: "cleanup",
              reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
              orphanCleanup: cleaned,
              succeededCasLost: true,
            });
          }
          return mapTerminal(
            outcome,
            "succeeded_cas",
            "WORKER_FAILED",
            cleaned,
            true,
            "succeeded_cas",
            undefined,
            undefined,
            undefined,
            undefined,
            executed.sourceBindingAttribution,
            {
              primaryExecutionSubstage: "succeeded_cas",
              storeVersionAtTerminalAttempt,
            },
          );
        }

        boundaryTelemetry.emit("artifact_binding_validation_started", {
          artifactLifecycleRole: "primary_output",
        });
        const bindingEvaluated = evaluateArtifactObjectBindingCoherence({
          job: succeededJob.job,
          request,
          artifact: executed.artifact,
          finalized: finalizedMeta,
          nowMs: input.nowMs(),
          storeVersion: record.storeVersion,
        });
        if (!bindingEvaluated.ok) {
          const firstMismatch = bindingEvaluated.firstMismatch;
          boundaryTelemetry.emit("artifact_binding_validation_completed", {
            finalizeOutcomeClass: "failed",
            finalizeSubstage: bindingEvaluated.failureSubstage,
            artifactLifecycleRole: "primary_output",
            ...(firstMismatch != null
              ? {
                  bindingFieldMismatchClass: firstMismatch.field,
                  bindingFieldMismatchAuthority: firstMismatch.owningAuthority,
                }
              : {}),
          });
          lastKnownExecutionSubstage = "artifact_binding_validation";
          const storeVersionAtTerminalAttempt = record.storeVersion;
          const outcome = await terminalize({
            reasonId: "WORKER_FAILED",
            retryable: true,
          });
          const cleaned = await cleanupOrphan(
            orphanLocator,
            "BINDING_VALIDATION_FAILED",
          );
          lastOrphanCleanup = cleaned;
          orphanLocator = null;
          if (cleaned.status === "unconfirmed") {
            cleanupUnconfirmed = true;
          }
          if (cleanupUnconfirmed) {
            return resultOf({
              kind: "cleanup_unconfirmed",
              phase: "cleanup",
              reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
              orphanCleanup: cleaned,
            });
          }
          return mapTerminal(
            outcome,
            "binding",
            "WORKER_FAILED",
            cleaned,
            false,
            "artifact_binding_validation",
            undefined,
            undefined,
            undefined,
            undefined,
            executed.sourceBindingAttribution,
            {
              primaryExecutionSubstage: "artifact_binding_validation",
              storeVersionAtTerminalAttempt,
            },
          );
        }

        boundaryTelemetry.emit("artifact_binding_validation_completed", {
          finalizeOutcomeClass: "succeeded",
          finalizeSubstage: "canonical_artifact_attachment",
          artifactLifecycleRole: "primary_output",
        });
        boundaryTelemetry.emit("job_succeeded_cas_started");
        const cas = await input.jobStore.compareAndSetTransition({
          jobId,
          ownerId,
          expectedStoreVersion: record.storeVersion,
          next: {
            job: succeededJob.job,
            request,
            idempotencyAuthorityKey: record.idempotencyAuthorityKey,
            operationId: record.operationId,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: bindingEvaluated.binding,
          },
        });
        if (!cas.ok || cas.value.kind !== "updated") {
          const cleanupReason: HeadlessArtifactCleanupReasonId =
            cas.ok && cas.value.kind === "terminal_locked"
              ? "SUCCEEDED_CAS_TERMINAL_LOCKED"
              : cas.ok && cas.value.kind === "stale"
                ? "SUCCEEDED_CAS_STALE"
                : "SUCCEEDED_CAS_REJECTED";
          const cleaned = await cleanupOrphan(orphanLocator, cleanupReason);
          lastOrphanCleanup = cleaned;
          orphanLocator = null;
          if (cleaned.status === "unconfirmed") {
            cleanupUnconfirmed = true;
          }
          if (cas.ok && cas.value.kind === "terminal_locked") {
            if (cleanupUnconfirmed) {
              return resultOf({
                kind: "cleanup_unconfirmed",
                phase: "cleanup",
                reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
                orphanCleanup: cleaned,
                succeededCasLost: true,
              });
            }
            return resultOf({
              kind: "preserved_terminal",
              phase: "succeeded_cas",
              reasonId: "TERMINAL_STATE_IMMUTABLE",
              orphanCleanup: cleaned,
              succeededCasLost: true,
            });
          }
          const outcome = await terminalize({
            reasonId:
              cleaned.status === "unconfirmed"
                ? "ARTIFACT_CLEANUP_UNCONFIRMED"
                : cleaned.status === "deleted"
                  ? "STALE_ATTEMPT"
                  : "WORKER_FAILED",
            retryable: cleaned.status !== "deleted",
          });
          if (cleanupUnconfirmed) {
            return resultOf({
              kind: "cleanup_unconfirmed",
              phase: "cleanup",
              reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
              orphanCleanup: cleaned,
              succeededCasLost: true,
            });
          }
          return mapTerminal(
            outcome,
            "succeeded_cas",
            cleaned.status === "deleted" ? "STALE_ATTEMPT" : "WORKER_FAILED",
            cleaned,
            true,
          );
        }

        orphanLocator = null;
        boundaryTelemetry.emit("job_succeeded_cas_completed", {
          casOutcomeClass: "succeeded",
        });

        const evidence: HeadlessWorkerArtifactEvidence = {
          ...executed.evidence,
          metrics: {
            ...executed.evidence.metrics,
            uploadStageMs: uploadMetrics?.elapsedMs ?? null,
            artifactBytesStreamed: uploadMetrics?.byteLength ?? null,
            artifactUploadChunkCount: uploadMetrics?.chunkCount ?? null,
            peakArtifactUploadChunkBytes:
              uploadMetrics?.peakChunkBytes ?? null,
            artifactUploadElapsedMs: uploadMetrics?.elapsedMs ?? null,
            unavailableReasons: Object.freeze({
              ...executed.evidence.metrics.unavailableReasons,
            }),
          },
        };

        return resultOf({
          kind: "succeeded",
          phase: "succeeded_cas",
          reasonId: "render_succeeded",
          evidence,
          orphanCleanup: lastOrphanCleanup,
          executionSubstage: "succeeded_cas",
          durableJobState: "succeeded",
          storeVersionBefore,
          storeVersionAfter: record.storeVersion,
          claimTokenCoherenceClass: "cleared_after_terminal",
          boundedDurationMs: input.nowMs() - executionStartedMs,
          sourceBindingAttribution: executed.sourceBindingAttribution,
        });
      } catch {
        const cleaned = await cleanupOrphan(
          orphanLocator,
          "SUCCEEDED_CAS_THROWN",
        );
        lastOrphanCleanup = cleaned;
        orphanLocator = null;
        if (cleaned.status === "unconfirmed") {
          cleanupUnconfirmed = true;
        }
        const outcome = await terminalize({
          reasonId:
            cleaned.status === "unconfirmed"
              ? "ARTIFACT_CLEANUP_UNCONFIRMED"
              : "WORKER_FAILED",
          retryable: true,
        });
        if (cleanupUnconfirmed) {
          return resultOf({
            kind: "cleanup_unconfirmed",
            phase: "cleanup",
            reasonId: "ARTIFACT_CLEANUP_UNCONFIRMED",
            orphanCleanup: cleaned,
            succeededCasLost: true,
          });
        }
        return mapTerminal(
          outcome,
          "succeeded_cas",
          "WORKER_FAILED",
          cleaned,
          true,
        );
      }
    } finally {
      artifactLease.dispose();
    }
  } catch (error) {
    const deadlineKind = deadline.abortKind();
    const reasonId =
      failureReasonForDeadline(deadlineKind) ??
      ((error as { reasonId?: HeadlessWorkerFailureReasonId }).reasonId ??
        "WORKER_FAILED");
    const errorSubstage = (error as { executionSubstage?: ClaimedRenderExecutionSubstageId })
      .executionSubstage;
    const primarySubstage = errorSubstage ?? lastKnownExecutionSubstage;
    const storeVersionAtTerminalAttempt = record.storeVersion;
    const outcome = await terminalize({
      reasonId,
      retryable: reasonId === "WORKER_TIMEOUT",
    });
    return mapTerminal(
      outcome,
      "render",
      reasonId,
      null,
      false,
      "terminal_failure_cas",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        primaryExecutionSubstage: primarySubstage,
        secondaryTerminalCasSubstage: "terminal_failure_cas",
        storeVersionAtTerminalAttempt,
      },
    );
  } finally {
    deadline.dispose();
  }
}

/** Bounded hosted render hook outcomes (truthful; never invent success). */
export type HostedClaimedRenderResult = {
  readonly kind:
    | "succeeded"
    | "terminalized_render_failure"
    | "aborted"
    | "stale_claim"
    | "claim_coherence_rejected"
    | "upload_finalize_failed"
    | "succeeded_cas_lost"
    | "cleanup_scheduled"
    | "cleanup_unconfirmed";
  readonly reasonId: string;
  readonly orphanCleanup: HeadlessOrphanCleanupReport | null;
  readonly executionAttribution?: import("./claimed-render-execution-attribution").FlyRenderClaimedRenderExecutionAttributionSnapshot;
};

export function mapClaimedRenderToHostedResult(
  result: ClaimedRenderExecutionResult,
): HostedClaimedRenderResult {
  const attribution = result.executionAttribution;
  const wrap = (
    hosted: Omit<HostedClaimedRenderResult, "executionAttribution">,
  ): HostedClaimedRenderResult =>
    attribution != null ? { ...hosted, executionAttribution: attribution } : hosted;

  if (result.kind === "cleanup_unconfirmed") {
    return wrap({
      kind: "cleanup_unconfirmed",
      reasonId: "render_cleanup_unconfirmed",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (
    result.succeededCasLost &&
    result.orphanCleanup?.status === "scheduled"
  ) {
    return wrap({
      kind: "cleanup_scheduled",
      reasonId: "render_cleanup_scheduled",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (result.succeededCasLost) {
    return wrap({
      kind: "succeeded_cas_lost",
      reasonId: "render_succeeded_cas_lost",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (result.kind === "claim_coherence_rejected") {
    const isStale =
      result.coherenceRejection === "claim_token_mismatch" ||
      result.coherenceRejection === "attempt_mismatch" ||
      result.coherenceRejection === "terminal";
    return wrap({
      kind: isStale ? "stale_claim" : "claim_coherence_rejected",
      reasonId: isStale
        ? "render_stale_claim"
        : "render_claim_coherence_rejected",
      orphanCleanup: null,
    });
  }
  if (result.kind === "cancelled") {
    return wrap({
      kind: "aborted",
      reasonId: "render_aborted",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (result.kind === "succeeded") {
    return wrap({
      kind: "succeeded",
      reasonId: "render_succeeded",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (result.phase === "upload") {
    return wrap({
      kind: "upload_finalize_failed",
      reasonId: "render_upload_finalize_failed",
      orphanCleanup: result.orphanCleanup,
    });
  }
  if (
    result.kind === "ownership_transferred" ||
    result.kind === "preserved_terminal"
  ) {
    return wrap({
      kind: "stale_claim",
      reasonId: "render_stale_claim",
      orphanCleanup: result.orphanCleanup,
    });
  }
  return wrap({
    kind: "terminalized_render_failure",
    reasonId: result.reasonId || "render_terminalized_failure",
    orphanCleanup: result.orphanCleanup,
  });
}
