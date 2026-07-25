/**
 * Execution-probe job-create attribution — Sprint 11E Phase 2E.2D.8F.7.2.
 * Maps production-authoritative job-create failure attribution into probe evidence.
 * Safe classifications only — never IDs, digests, SQL, URLs, or provider text.
 */

import {
  isJobCreateAttributionReasonId,
  isJobCreateAttributionStageId,
  type FlyRenderLiveJobCreateFailureAttribution,
  type JobCreateAttributionReasonId,
  type JobCreateAttributionStageId,
} from "./job-create-attribution";
import type { FlyRenderLiveCaseEvidence } from "./evidence";
import { extractJobCreateFailureAttributionFromCases } from "./evidence";

export const EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON =
  "job_create_unconfirmed" as const;

export type ExecutionProbeJobCreateResultKind =
  | "attributed_failure"
  | "unconfirmed";

export type FlyRenderExecutionProbeJobCreateAttribution = {
  readonly jobCreateFailureStage: JobCreateAttributionStageId | "unconfirmed";
  readonly jobCreateFailureReasonId:
    | JobCreateAttributionReasonId
    | typeof EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON;
  readonly jobCreateResultKind: ExecutionProbeJobCreateResultKind;
  readonly objectPurposeClass: string | null;
  readonly stagingSubstage: string | null;
  readonly finalizeSubstage: string | null;
  readonly coverageResultClass: string | null;
  readonly coverageExpectedCountClass: string | null;
  readonly coverageFinalizedCountClass: string | null;
  readonly coverageMissingCountClass: string | null;
  readonly promotionResultClass: string | null;
  readonly dispatchOutboxIntentClass: string | null;
  readonly durableJobStageClass: string | null;
  readonly storeVersionDeltaClass: string | null;
  readonly safeControlPlaneCode: string | null;
  readonly allowlistedSqlstate: string | null;
  readonly allowlistedConstraint: string | null;
  readonly cleanupStatus:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run"
    | null;
};

function countClass(value: number | undefined | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Math.max(0, Math.floor(value)));
}

export function buildExecutionProbeJobCreateAttributionFromLiveAttribution(
  attribution: FlyRenderLiveJobCreateFailureAttribution,
): FlyRenderExecutionProbeJobCreateAttribution {
  const staging = attribution.stagingAttribution;
  const finalize = attribution.finalizeAttribution;
  const coverage = attribution.coverageAttribution;
  return Object.freeze({
    jobCreateFailureStage: attribution.failureStage,
    jobCreateFailureReasonId: attribution.failureReasonId,
    jobCreateResultKind: "attributed_failure",
    objectPurposeClass:
      staging?.objectPurposeClass ?? finalize?.objectPurposeClass ?? null,
    stagingSubstage: staging?.stagingSubstage ?? null,
    finalizeSubstage: finalize?.finalizeSubstage ?? null,
    coverageResultClass: coverage?.reconcileResultKind ?? null,
    coverageExpectedCountClass: countClass(coverage?.requiredTargetCount),
    coverageFinalizedCountClass: countClass(coverage?.finalizedOwnedObjectCount),
    coverageMissingCountClass: countClass(coverage?.missingTargetCount),
    promotionResultClass: attribution.promotionReasonId ?? null,
    dispatchOutboxIntentClass:
      attribution.failureStage === "dispatch_outbox_intent_reread"
        ? attribution.failureReasonId
        : null,
    durableJobStageClass: attribution.durableJobStage ?? null,
    storeVersionDeltaClass:
      attribution.storeVersionDelta ?? coverage?.storeVersionDelta ?? null,
    safeControlPlaneCode: attribution.safeControlPlaneCode ?? null,
    allowlistedSqlstate: attribution.allowlistedSqlState ?? null,
    allowlistedConstraint: attribution.allowlistedConstraint ?? null,
    cleanupStatus: attribution.cleanupStatus ?? null,
  });
}

export function buildExecutionProbeJobCreateUnconfirmedAttribution(input: {
  readonly lastConfirmedStage: JobCreateAttributionStageId | null;
  readonly cleanupStatus?:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run";
}): FlyRenderExecutionProbeJobCreateAttribution {
  return Object.freeze({
    jobCreateFailureStage: input.lastConfirmedStage ?? "unconfirmed",
    jobCreateFailureReasonId: EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON,
    jobCreateResultKind: "unconfirmed",
    objectPurposeClass: null,
    stagingSubstage: null,
    finalizeSubstage: null,
    coverageResultClass: null,
    coverageExpectedCountClass: null,
    coverageFinalizedCountClass: null,
    coverageMissingCountClass: null,
    promotionResultClass: null,
    dispatchOutboxIntentClass: null,
    durableJobStageClass: null,
    storeVersionDeltaClass: null,
    safeControlPlaneCode: null,
    allowlistedSqlstate: null,
    allowlistedConstraint: null,
    cleanupStatus: input.cleanupStatus ?? null,
  });
}

export function extractExecutionProbeJobCreateAttribution(input: {
  readonly stageCases: readonly FlyRenderLiveCaseEvidence[];
  readonly failedStageId: string | null;
  readonly cleanupStatus:
    | "ok"
    | "failed"
    | "skipped"
    | "preserved"
    | "not_run";
  readonly setupFailed?: boolean;
  readonly lastConfirmedStage?: JobCreateAttributionStageId | null;
}): FlyRenderExecutionProbeJobCreateAttribution | null {
  if (input.failedStageId !== "job.create_queued" && !input.setupFailed) {
    return null;
  }
  const live = extractJobCreateFailureAttributionFromCases(
    input.stageCases,
    input.cleanupStatus,
  );
  if (live != null) {
    return buildExecutionProbeJobCreateAttributionFromLiveAttribution(live);
  }
  if (input.setupFailed || input.failedStageId === "job.create_queued") {
    return buildExecutionProbeJobCreateUnconfirmedAttribution({
      lastConfirmedStage: input.lastConfirmedStage ?? null,
      cleanupStatus: input.cleanupStatus,
    });
  }
  return null;
}

function esc(value: string): string {
  if (/[\0-\x08\x0a-\x1f\x7f`<>|]/.test(value)) return "none";
  return value;
}

export function renderExecutionProbeJobCreateAttributionMarkdown(
  attribution: FlyRenderExecutionProbeJobCreateAttribution,
): readonly string[] {
  const lines = [
    `- job_create_failure_stage=${esc(String(attribution.jobCreateFailureStage))}`,
    `- job_create_failure_reason_id=${esc(String(attribution.jobCreateFailureReasonId))}`,
    `- job_create_result_kind=${esc(attribution.jobCreateResultKind)}`,
    `- object_purpose_class=${attribution.objectPurposeClass != null ? esc(attribution.objectPurposeClass) : "none"}`,
    `- staging_substage=${attribution.stagingSubstage != null ? esc(attribution.stagingSubstage) : "none"}`,
    `- finalize_substage=${attribution.finalizeSubstage != null ? esc(attribution.finalizeSubstage) : "none"}`,
    `- coverage_result_class=${attribution.coverageResultClass != null ? esc(attribution.coverageResultClass) : "none"}`,
    `- coverage_expected_count_class=${attribution.coverageExpectedCountClass ?? "none"}`,
    `- coverage_finalized_count_class=${attribution.coverageFinalizedCountClass ?? "none"}`,
    `- coverage_missing_count_class=${attribution.coverageMissingCountClass ?? "none"}`,
    `- promotion_result_class=${attribution.promotionResultClass != null ? esc(attribution.promotionResultClass) : "none"}`,
    `- dispatch_outbox_intent_class=${attribution.dispatchOutboxIntentClass != null ? esc(attribution.dispatchOutboxIntentClass) : "none"}`,
    `- durable_job_stage_class=${attribution.durableJobStageClass != null ? esc(attribution.durableJobStageClass) : "none"}`,
    `- store_version_delta_class=${attribution.storeVersionDeltaClass != null ? esc(attribution.storeVersionDeltaClass) : "none"}`,
    `- safe_control_plane_code=${attribution.safeControlPlaneCode != null ? esc(attribution.safeControlPlaneCode) : "none"}`,
    `- allowlisted_sqlstate=${attribution.allowlistedSqlstate != null ? esc(attribution.allowlistedSqlstate) : "none"}`,
    `- allowlisted_constraint=${attribution.allowlistedConstraint != null ? esc(attribution.allowlistedConstraint) : "none"}`,
    `- cleanup_status=${attribution.cleanupStatus != null ? esc(attribution.cleanupStatus) : "none"}`,
  ];
  return lines;
}

export function sanitizeExecutionProbeJobCreateAttribution(
  value: unknown,
): FlyRenderExecutionProbeJobCreateAttribution | null {
  if (value == null || typeof value !== "object") return null;
  const v = value as FlyRenderExecutionProbeJobCreateAttribution;
  const stage =
    v.jobCreateFailureStage === "unconfirmed" ||
    isJobCreateAttributionStageId(v.jobCreateFailureStage)
      ? v.jobCreateFailureStage
      : null;
  if (stage == null) return null;
  const reason =
    v.jobCreateFailureReasonId === EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON ||
    isJobCreateAttributionReasonId(v.jobCreateFailureReasonId)
      ? v.jobCreateFailureReasonId
      : null;
  if (reason == null) return null;
  if (
    v.jobCreateResultKind !== "attributed_failure" &&
    v.jobCreateResultKind !== "unconfirmed"
  ) {
    return null;
  }
  return buildExecutionProbeJobCreateAttributionFromLiveAttribution({
    failureStage: stage === "unconfirmed" ? "live_manifest_construction" : stage,
    failureReasonId:
      reason === EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON
        ? "unknown_safe_failure"
        : reason,
    ...(v.safeControlPlaneCode != null
      ? { safeControlPlaneCode: v.safeControlPlaneCode as never }
      : {}),
    ...(v.allowlistedSqlstate != null
      ? { allowlistedSqlState: v.allowlistedSqlstate }
      : {}),
    ...(v.allowlistedConstraint != null
      ? { allowlistedConstraint: v.allowlistedConstraint }
      : {}),
    ...(v.cleanupStatus != null ? { cleanupStatus: v.cleanupStatus } : {}),
  });
}

export function assertExecutionProbeJobCreateAttributionRequired(input: {
  readonly failedStageId: string | null;
  readonly jobCreateAttribution: FlyRenderExecutionProbeJobCreateAttribution | null;
}): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  if (input.failedStageId !== "job.create_queued") {
    return { ok: true };
  }
  if (input.jobCreateAttribution == null) {
    return {
      ok: false,
      message: "job.create_queued FAIL requires execution probe job-create attribution",
    };
  }
  if (
    input.jobCreateAttribution.jobCreateResultKind === "attributed_failure" &&
    !isJobCreateAttributionStageId(input.jobCreateAttribution.jobCreateFailureStage)
  ) {
    return { ok: false, message: "attributed_failure requires allowlisted stage" };
  }
  return { ok: true };
}
