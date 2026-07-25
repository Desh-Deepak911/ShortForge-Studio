/**
 * Frozen ordered registry — hosted Fly render live matrix (2E.2D.8A).
 */

import { guardHeadlessStructure } from "@/features/headless-renderer/domain/headless-hostile-guard";

import type { FlyRenderLiveCaseEvidence, FlyRenderLiveCaseStatus } from "./evidence";
import {
  isJobCreateAttributionReasonId,
  isJobCreateAttributionStageId,
  type FlyRenderLiveJobCreateFailureAttribution,
} from "./job-create-attribution";
import { sanitizeCoverageAttributionSnapshot } from "./coverage-attribution";
import { sanitizeDispatchOutboxObservationAttribution } from "./dispatch-outbox-observation-attribution";
import { sanitizeOwnedObjectStagingAttributionSnapshot } from "./owned-object-staging-attribution";
import { sanitizeOwnedObjectFinalizeAttributionSnapshot } from "./owned-object-finalize-attribution";

export const REQUIRED_FLY_RENDER_LIVE_CASE_IDS = Object.freeze([
  "env.config",
  "fly.verify_machine_healthy",
  "fly.render_machine_healthy",
  "fly.immutable_image_equality",
  "neon.schema_fingerprint",
  "job.create_queued",
  "dispatch_outbox.intent",
  "upstash.enqueue_render",
  "hosted.render_claim",
  "redis.ack_pending_cleared",
  "hosted.chromium_execution",
  "hosted.ffmpeg_execution",
  "r2.streamed_artifact_upload",
  "owned_object.finalized",
  "artifact.binding_coherence",
  "job.succeeded_cas",
  "dispatch_outbox.completed",
  "cleanup_intent.not_retryable",
  "artifact.download_verify",
  "replay.idempotent",
  "job.terminal_immutability",
  "fly.render_still_healthy",
  "fly.verify_still_healthy",
  "cleanup.complete",
  "evidence.privacy",
] as const);

export type RequiredFlyRenderLiveCaseId =
  (typeof REQUIRED_FLY_RENDER_LIVE_CASE_IDS)[number];

const REQUIRED_SET = new Set<string>(REQUIRED_FLY_RENDER_LIVE_CASE_IDS);

export const FLY_RENDER_LIVE_FAILURE_CATEGORIES = Object.freeze([
  "ENV_CONFIG_FAILED",
  "FLY_VERIFY_UNHEALTHY",
  "FLY_RENDER_UNHEALTHY",
  "FLY_IMAGE_MISMATCH",
  "SCHEMA_FINGERPRINT_FAILED",
  "JOB_CREATE_QUEUED_FAILED",
  "DISPATCH_OUTBOX_INTENT_FAILED",
  "UPSTASH_ENQUEUE_RENDER_FAILED",
  "HOSTED_RENDER_CLAIM_FAILED",
  "REDIS_ACK_PENDING_NOT_CLEARED",
  "HOSTED_CHROMIUM_EXECUTION_FAILED",
  "HOSTED_FFMPEG_EXECUTION_FAILED",
  "R2_STREAMED_UPLOAD_FAILED",
  "OWNED_OBJECT_FINALIZED_FAILED",
  "ARTIFACT_BINDING_INCOHERENT",
  "ARTIFACT_BINDING_OBSERVATION_FAILED",
  "ARTIFACT_BINDING_DURABLE_REREAD_FAILED",
  "BOUNDARY_EVIDENCE_INGESTION_FAILED",
  "JOB_SUCCEEDED_CAS_FAILED",
  "DISPATCH_OUTBOX_NOT_COMPLETED",
  "CLEANUP_INTENT_RETRYABLE",
  "ARTIFACT_DOWNLOAD_VERIFY_FAILED",
  "REPLAY_NOT_IDEMPOTENT",
  "JOB_TERMINAL_MUTATED",
  "FLY_RENDER_UNHEALTHY_POST",
  "FLY_VERIFY_UNHEALTHY_POST",
  "CLEANUP_FAILED",
  "EVIDENCE_PRIVACY_FAILED",
  "CASE_SHAPE_INVALID",
  "MATRIX_EXCEPTION",
  "STUB_RUNNERS_REFUSED",
  "HOSTED_POLL_TIMEOUT",
  "RESOURCE_EVIDENCE_INVALID",
] as const);

export type FlyRenderLiveFailureCategory =
  (typeof FLY_RENDER_LIVE_FAILURE_CATEGORIES)[number];

const FAILURE_SET = new Set<string>(FLY_RENDER_LIVE_FAILURE_CATEGORIES);

function validateJobCreateFailureAttributionShape(
  value: unknown,
):
  | { readonly ok: true; readonly attribution: FlyRenderLiveJobCreateFailureAttribution }
  | { readonly ok: false; readonly message: string } {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "jobCreateFailureAttribution invalid." };
  }
  const a = value as Record<string, unknown>;
  if (
    !isJobCreateAttributionStageId(a.failureStage) ||
    !isJobCreateAttributionReasonId(a.failureReasonId)
  ) {
    return { ok: false, message: "jobCreateFailureAttribution stage/reason invalid." };
  }
  const coverageAttribution = sanitizeCoverageAttributionSnapshot(
    a.coverageAttribution,
  );
  if (a.coverageAttribution != null && coverageAttribution == null) {
    return {
      ok: false,
      message: "jobCreateFailureAttribution coverageAttribution invalid.",
    };
  }
  const stagingAttribution = sanitizeOwnedObjectStagingAttributionSnapshot(
    a.stagingAttribution,
  );
  if (a.stagingAttribution != null && stagingAttribution == null) {
    return {
      ok: false,
      message: "jobCreateFailureAttribution stagingAttribution invalid.",
    };
  }
  const finalizeAttribution = sanitizeOwnedObjectFinalizeAttributionSnapshot(
    a.finalizeAttribution,
  );
  if (a.finalizeAttribution != null && finalizeAttribution == null) {
    return {
      ok: false,
      message: "jobCreateFailureAttribution finalizeAttribution invalid.",
    };
  }
  return {
    ok: true,
    attribution: {
      failureStage: a.failureStage,
      failureReasonId: a.failureReasonId,
      ...(typeof a.safeControlPlaneCode === "string"
        ? { safeControlPlaneCode: a.safeControlPlaneCode as never }
        : {}),
      ...(typeof a.allowlistedSqlState === "string"
        ? { allowlistedSqlState: a.allowlistedSqlState }
        : {}),
      ...(typeof a.allowlistedConstraint === "string"
        ? { allowlistedConstraint: a.allowlistedConstraint }
        : {}),
      ...(typeof a.promotionReasonId === "string"
        ? { promotionReasonId: a.promotionReasonId as never }
        : {}),
      ...(a.durableJobStage === "provisional" || a.durableJobStage === "canonical"
        ? { durableJobStage: a.durableJobStage }
        : {}),
      ...(a.storeVersionDelta === "unchanged" ||
      a.storeVersionDelta === "plus_one" ||
      a.storeVersionDelta === "unexpected"
        ? { storeVersionDelta: a.storeVersionDelta }
        : {}),
      ...(a.cleanupStatus === "ok" ||
      a.cleanupStatus === "failed" ||
      a.cleanupStatus === "skipped" ||
      a.cleanupStatus === "preserved" ||
      a.cleanupStatus === "not_run"
        ? { cleanupStatus: a.cleanupStatus }
        : {}),
      ...(coverageAttribution != null
        ? { coverageAttribution }
        : {}),
      ...(stagingAttribution != null ? { stagingAttribution } : {}),
      ...(finalizeAttribution != null ? { finalizeAttribution } : {}),
    },
  };
}

export function isRequiredFlyRenderLiveCaseId(
  value: string,
): value is RequiredFlyRenderLiveCaseId {
  return REQUIRED_SET.has(value);
}

export function validateFlyRenderLiveCaseEvidenceShape(
  value: unknown,
):
  | { readonly ok: true; readonly case: FlyRenderLiveCaseEvidence }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(value)) {
      return { ok: false, message: "Hostile case evidence rejected." };
    }
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, message: "Case evidence must be a plain object." };
    }
    const c = value as Record<string, unknown>;
    if (
      typeof c.caseId !== "string" ||
      !isRequiredFlyRenderLiveCaseId(c.caseId)
    ) {
      return { ok: false, message: "caseId is not a required fly render live case." };
    }
    if (
      c.status !== "PASS" &&
      c.status !== "FAIL" &&
      c.status !== "NOT_TESTED"
    ) {
      return { ok: false, message: "status invalid." };
    }
    if (c.status === "FAIL") {
      if (
        typeof c.failureCategory !== "string" ||
        !FAILURE_SET.has(c.failureCategory)
      ) {
        return { ok: false, message: "failureCategory invalid." };
      }
      let jobCreateFailureAttribution:
        | FlyRenderLiveJobCreateFailureAttribution
        | undefined;
      if (c.caseId === "job.create_queued") {
        if (c.jobCreateFailureAttribution == null) {
          return {
            ok: false,
            message: "job.create_queued FAIL requires jobCreateFailureAttribution.",
          };
        }
        const attr = validateJobCreateFailureAttributionShape(
          c.jobCreateFailureAttribution,
        );
        if (!attr.ok) return attr;
        jobCreateFailureAttribution = attr.attribution;
      } else if (c.jobCreateFailureAttribution != null) {
        return {
          ok: false,
          message: "jobCreateFailureAttribution only allowed on job.create_queued.",
        };
      }
      return {
        ok: true,
        case: {
          caseId: c.caseId,
          status: "FAIL",
          failureCategory: c.failureCategory,
          ...(jobCreateFailureAttribution != null
            ? { jobCreateFailureAttribution }
            : {}),
        },
      };
    }
    let dispatchOutboxIntentAttribution:
      | NonNullable<FlyRenderLiveCaseEvidence["dispatchOutboxIntentAttribution"]>
      | undefined;
    if (c.caseId === "dispatch_outbox.intent" && c.status === "PASS") {
      const attr = sanitizeDispatchOutboxObservationAttribution(
        c.dispatchOutboxIntentAttribution,
      );
      if (attr == null) {
        return {
          ok: false,
          message:
            "dispatch_outbox.intent PASS requires dispatchOutboxIntentAttribution.",
        };
      }
      dispatchOutboxIntentAttribution = attr;
    } else if (c.dispatchOutboxIntentAttribution != null) {
      return {
        ok: false,
        message:
          "dispatchOutboxIntentAttribution only allowed on dispatch_outbox.intent PASS.",
      };
    }
    return {
      ok: true,
      case: {
        caseId: c.caseId,
        status: c.status as FlyRenderLiveCaseStatus,
        ...(dispatchOutboxIntentAttribution != null
          ? { dispatchOutboxIntentAttribution }
          : {}),
      },
    };
  } catch {
    return { ok: false, message: "Hostile case evidence rejected." };
  }
}

export function assertExactRequiredFlyRenderLiveCasePassAuthority(
  cases: readonly unknown[],
):
  | { readonly ok: true; readonly cases: readonly FlyRenderLiveCaseEvidence[] }
  | { readonly ok: false; readonly message: string } {
  const byId = new Map<string, FlyRenderLiveCaseEvidence>();
  for (const raw of cases) {
    const shaped = validateFlyRenderLiveCaseEvidenceShape(raw);
    if (!shaped.ok) return shaped;
    if (byId.has(shaped.case.caseId)) {
      return { ok: false, message: "Duplicate caseId in evidence." };
    }
    byId.set(shaped.case.caseId, shaped.case);
  }
  if (byId.size !== REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length) {
    return { ok: false, message: "Case registry membership incomplete." };
  }
  const ordered: FlyRenderLiveCaseEvidence[] = [];
  for (const id of REQUIRED_FLY_RENDER_LIVE_CASE_IDS) {
    const c = byId.get(id);
    if (c == null) {
      return { ok: false, message: `Missing required case ${id}.` };
    }
    if (c.status !== "PASS") {
      return { ok: false, message: `Required case ${id} is not PASS.` };
    }
    ordered.push(c);
  }
  return { ok: true, cases: Object.freeze(ordered) };
}

export function createExactPassFlyRenderLiveCaseResults(): readonly FlyRenderLiveCaseEvidence[] {
  return Object.freeze(
    REQUIRED_FLY_RENDER_LIVE_CASE_IDS.map((caseId) => {
      if (caseId === "dispatch_outbox.intent") {
        return Object.freeze({
          caseId,
          status: "PASS" as const,
          dispatchOutboxIntentAttribution: Object.freeze({
            firstObservedState: "pending" as const,
            rereadObservedState: "pending" as const,
            monotonicTransitionClass: "unchanged" as const,
            identityCoherent: true as const,
            outboxStoreVersionDelta: "unchanged" as const,
            promotionResultKind: "updated" as const,
          }),
        });
      }
      return Object.freeze({ caseId, status: "PASS" as const });
    }),
  );
}

export function assertExactRequiredFlyRenderLiveCasePrefixFailAuthority(
  cases: readonly FlyRenderLiveCaseEvidence[],
):
  | {
      readonly ok: true;
      readonly failedCaseId: RequiredFlyRenderLiveCaseId;
      readonly lastCompletedRequiredCase: RequiredFlyRenderLiveCaseId | null;
    }
  | { readonly ok: false; readonly message: string } {
  if (cases.length !== REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length) {
    return {
      ok: false,
      message: `Prefix-FAIL requires exactly ${REQUIRED_FLY_RENDER_LIVE_CASE_IDS.length} cases.`,
    };
  }
  let failIndex = -1;
  for (let i = 0; i < cases.length; i++) {
    const shaped = validateFlyRenderLiveCaseEvidenceShape(cases[i]);
    if (!shaped.ok) {
      return { ok: false, message: shaped.message };
    }
    const expectedId = REQUIRED_FLY_RENDER_LIVE_CASE_IDS[i]!;
    if (shaped.case.caseId !== expectedId) {
      return { ok: false, message: "Prefix-FAIL case order invalid." };
    }
    if (shaped.case.status === "FAIL") {
      if (failIndex >= 0) {
        return { ok: false, message: "Prefix-FAIL allows exactly one FAIL." };
      }
      if (shaped.case.failureCategory == null) {
        return { ok: false, message: "FAIL requires failureCategory." };
      }
      failIndex = i;
      continue;
    }
    if (shaped.case.status === "NOT_TESTED") {
      if (failIndex < 0) {
        return {
          ok: false,
          message: "NOT_TESTED before first FAIL is invalid.",
        };
      }
      continue;
    }
    if (failIndex >= 0) {
      return {
        ok: false,
        message: "PASS after FAIL is invalid in prefix-FAIL authority.",
      };
    }
  }
  if (failIndex < 0) {
    return { ok: false, message: "Prefix-FAIL requires exactly one FAIL." };
  }
  const failedCaseId = REQUIRED_FLY_RENDER_LIVE_CASE_IDS[failIndex]!;
  const lastCompletedRequiredCase =
    failIndex > 0 ? REQUIRED_FLY_RENDER_LIVE_CASE_IDS[failIndex - 1]! : null;
  return { ok: true, failedCaseId, lastCompletedRequiredCase };
}
