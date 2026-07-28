/**
 * Bounded job-create attribution — Sprint 11E Phase 2E.2D.8B.
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, SQL, or IDs.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane";
import type { HeadlessControlPlaneErrorCode } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import {
  HEADLESS_PG_SQLSTATE,
} from "@/features/headless-renderer/control-plane/runtime/map-database-failure";
import type { NeonHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/testing";
import {
  emptyPromotionAttribution,
  type HeadlessPromotionAttribution,
} from "@/features/headless-renderer/control-plane/services/promotion-attribution";
import {
  sanitizeHeadlessPromotionReasonId,
  type HeadlessPromotionReasonId,
} from "@/features/headless-renderer/control-plane/services/promotion-reason-ids";
import type { HeadlessStoreVersionDeltaClass } from "@/features/headless-renderer/control-plane/services/promotion-attribution";

import {
  buildLiveDraft,
  type LiveDraftContext,
} from "../neon-live/live-fixtures";
import { buildCapacity4kLiveDraft } from "../fly-render-4k-capacity/capacity-4k-live-fixtures";
import { materializeCanonicalFromFinalizedCoverage } from "@/features/headless-renderer/control-plane/services/materialize-canonical-from-finalized-coverage";
import type {
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
} from "@/features/headless-renderer/domain";
import { trackJobId, trackProjectId } from "../r2-live/live-fixtures";
import { runOwnedObjectStagingRecordChain } from "./owned-object-staging-chain";
import {
  OWNED_OBJECT_STAGING_REASON_IDS,
  sanitizeOwnedObjectStagingAttributionSnapshot,
  type FlyRenderOwnedObjectStagingAttributionSnapshot,
} from "./owned-object-staging-attribution";
import { runOwnedObjectFinalizeChain } from "./owned-object-finalize-chain";
import {
  OWNED_OBJECT_FINALIZE_REASON_IDS,
  sanitizeOwnedObjectFinalizeAttributionSnapshot,
  type FlyRenderOwnedObjectFinalizeAttributionSnapshot,
} from "./owned-object-finalize-attribution";

import {
  assertFlyRenderJobCreateProjectIdentity,
  deriveFlyRenderJobCreateStagingPayloads,
} from "./job-create-fixture-identity";
import { reconcileCompleteLiveCoverage } from "./complete-coverage-fixture";
import {
  type FlyRenderLiveCoverageAttributionSnapshot,
  sanitizeCoverageAttributionSnapshot,
} from "./coverage-attribution";
import { captureMonotonicDispatchOutboxObservation } from "./dispatch-outbox-observation-capture";
import {
  sanitizeDispatchOutboxObservationAttribution,
  type FlyRenderLiveDispatchOutboxObservationAttribution,
} from "./dispatch-outbox-observation-attribution";
import type { FlyRenderLiveMatrixContext } from "./types";

export const JOB_CREATE_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "project_ownership_claim",
  "live_manifest_construction",
  "provisional_job_create",
  "provisional_job_reread",
  "owned_object_staging",
  "staging_reference_append",
  "coverage_reconcile",
  "canonical_materialization",
  "promotion_transaction",
  "queued_job_reread",
  "queued_state_assertion",
  "dispatch_outbox_intent_reread",
  "cleanup",
] as const);

export type JobCreateAttributionStageId =
  (typeof JOB_CREATE_ATTRIBUTION_STAGE_IDS)[number];

export const JOB_CREATE_ATTRIBUTION_REASON_IDS = Object.freeze([
  "project_ownership_failed",
  "live_manifest_construction_failed",
  "fixture_identity_incoherent",
  "stale_manifest_fingerprint",
  "provisional_create_failed",
  "provisional_reread_failed",
  "owned_object_staging_failed",
  ...OWNED_OBJECT_STAGING_REASON_IDS,
  ...OWNED_OBJECT_FINALIZE_REASON_IDS.filter(
    (id) => id !== "owned_object_finalize_failed",
  ),
  "owned_object_finalize_failed",
  "staging_reference_append_failed",
  "staging_cas_failed",
  "coverage_reconcile_failed",
  "coverage_incomplete",
  "canonical_pair_invalid",
  "promotion_transaction_failed",
  "promotion_rejected",
  "queued_reread_failed",
  "queued_state_mismatch",
  "dispatch_outbox_intent_failed",
  "hostile_input_rejected",
  "unknown_safe_failure",
] as const);

export type JobCreateAttributionReasonId =
  (typeof JOB_CREATE_ATTRIBUTION_REASON_IDS)[number];

const STAGE_SET = new Set<string>(JOB_CREATE_ATTRIBUTION_STAGE_IDS);
const REASON_SET = new Set<string>(JOB_CREATE_ATTRIBUTION_REASON_IDS);

const ALLOWLISTED_SQLSTATES = new Set<string>([
  ...Object.values(HEADLESS_PG_SQLSTATE),
  "0A000",
  "25006",
  "25P01",
  "3F000",
  "42P01",
  "42703",
  "42883",
  "42P10",
  "XX000",
]);

export type JobCreateAttributionStageStatus =
  | "ok"
  | "failed"
  | "skipped"
  | "best_effort_failed";

export type JobCreateAttributionStageResult = {
  readonly stage: JobCreateAttributionStageId;
  readonly status: JobCreateAttributionStageStatus;
  readonly reasonId?: JobCreateAttributionReasonId;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly promotionReasonId?: HeadlessPromotionReasonId;
  readonly durableJobStage?: "provisional" | "canonical";
  readonly storeVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly stagingAttribution?: FlyRenderOwnedObjectStagingAttributionSnapshot;
  readonly finalizeAttribution?: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
  readonly dispatchOutboxAttribution?: FlyRenderLiveDispatchOutboxObservationAttribution;
};

export type AttributedFlyRenderJobCreateSuccess = {
  readonly ok: true;
  readonly stages: readonly JobCreateAttributionStageResult[];
  readonly draftCtx: LiveDraftContext;
  /** Local/fixture only — chain stopped before promotion/outbox stages. */
  readonly stoppedBeforePromotion?: true;
};

export type AttributedFlyRenderJobCreateFailure = {
  readonly ok: false;
  readonly failureStage: JobCreateAttributionStageId;
  readonly failureReasonId: JobCreateAttributionReasonId;
  readonly stages: readonly JobCreateAttributionStageResult[];
  readonly promotionAttribution?: HeadlessPromotionAttribution;
  readonly coverageAttribution?: FlyRenderLiveCoverageAttributionSnapshot;
  readonly stagingAttribution?: FlyRenderOwnedObjectStagingAttributionSnapshot;
  readonly finalizeAttribution?: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
};

export type AttributedFlyRenderJobCreateResult =
  | AttributedFlyRenderJobCreateSuccess
  | AttributedFlyRenderJobCreateFailure;

/** Safe job-create failure attribution for official render-live evidence. */
export type FlyRenderLiveJobCreateFailureAttribution = {
  readonly failureStage: JobCreateAttributionStageId;
  readonly failureReasonId: JobCreateAttributionReasonId;
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode;
  readonly allowlistedSqlState?: string;
  readonly allowlistedConstraint?: string;
  readonly promotionReasonId?: HeadlessPromotionReasonId;
  readonly durableJobStage?: "provisional" | "canonical";
  readonly storeVersionDelta?: HeadlessStoreVersionDeltaClass;
  readonly cleanupStatus?: "ok" | "failed" | "skipped" | "preserved" | "not_run";
  readonly coverageAttribution?: FlyRenderLiveCoverageAttributionSnapshot;
  readonly stagingAttribution?: FlyRenderOwnedObjectStagingAttributionSnapshot;
  readonly finalizeAttribution?: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
};

export function buildFlyRenderLiveJobCreateFailureAttribution(
  failure: AttributedFlyRenderJobCreateFailure,
  options?: {
    readonly cleanupStatus?: FlyRenderLiveJobCreateFailureAttribution["cleanupStatus"];
    readonly coverageAttribution?: FlyRenderLiveCoverageAttributionSnapshot;
    readonly stagingAttribution?: FlyRenderOwnedObjectStagingAttributionSnapshot;
    readonly finalizeAttribution?: FlyRenderOwnedObjectFinalizeAttributionSnapshot;
  },
): FlyRenderLiveJobCreateFailureAttribution {
  const failedStageEntry = failure.stages.find(
    (s) => s.stage === failure.failureStage && s.status === "failed",
  );
  const promo =
    failedStageEntry?.promotionReasonId ??
    failure.promotionAttribution?.promotionReasonId ??
    undefined;
  const sanitizedPromo = sanitizeHeadlessPromotionReasonId(promo);
  const coverage =
    sanitizeCoverageAttributionSnapshot(
      options?.coverageAttribution ?? failure.coverageAttribution,
    ) ?? undefined;
  const staging =
    sanitizeOwnedObjectStagingAttributionSnapshot(
      options?.stagingAttribution ?? failure.stagingAttribution,
    ) ?? undefined;
  const finalize =
    sanitizeOwnedObjectFinalizeAttributionSnapshot(
      options?.finalizeAttribution ?? failure.finalizeAttribution,
    ) ?? undefined;
  return Object.freeze({
    failureStage: failure.failureStage,
    failureReasonId: failure.failureReasonId,
    ...(failedStageEntry?.safeControlPlaneCode != null
      ? { safeControlPlaneCode: failedStageEntry.safeControlPlaneCode }
      : {}),
    ...(failedStageEntry?.allowlistedSqlState != null
      ? { allowlistedSqlState: failedStageEntry.allowlistedSqlState }
      : {}),
    ...(failedStageEntry?.allowlistedConstraint != null
      ? { allowlistedConstraint: failedStageEntry.allowlistedConstraint }
      : {}),
    ...(sanitizedPromo != null ? { promotionReasonId: sanitizedPromo } : {}),
    ...(failedStageEntry?.durableJobStage != null
      ? { durableJobStage: failedStageEntry.durableJobStage }
      : {}),
    ...(failedStageEntry?.storeVersionDelta != null
      ? { storeVersionDelta: failedStageEntry.storeVersionDelta }
      : {}),
    ...(options?.cleanupStatus != null
      ? { cleanupStatus: options.cleanupStatus }
      : {}),
    ...(coverage != null ? { coverageAttribution: coverage } : {}),
    ...(staging != null ? { stagingAttribution: staging } : {}),
    ...(finalize != null ? { finalizeAttribution: finalize } : {}),
  });
}

export type JobCreateAttributionInjectionPoint =
  | "project_ownership"
  | "live_manifest_construction"
  | "provisional_create"
  | "owned_object_staging"
  | "staging_append"
  | "coverage_reconcile"
  | "canonical_materialization"
  | "promotion_transaction"
  | "dispatch_outbox_intent";

function sanitizeSqlState(value: unknown): string | undefined {
  if (typeof value !== "string" || !ALLOWLISTED_SQLSTATES.has(value)) {
    return undefined;
  }
  return value;
}

function sanitizeConstraint(value: unknown): string | undefined {
  const allowed = new Set([
    "headless_jobs_pkey",
    "headless_jobs_fk_project_owner",
    "headless_owned_objects_pkey",
    "headless_render_dispatch_outbox_pkey",
    "uidx_headless_jobs_idempotency_authority",
  ]);
  if (typeof value !== "string" || !allowed.has(value)) {
    return undefined;
  }
  return value;
}

function sanitizeControlPlaneCode(
  value: unknown,
): HeadlessControlPlaneErrorCode | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }
  if (/[\0-\x1f\x7f`<>|\\\s]/.test(value)) return undefined;
  return value as HeadlessControlPlaneErrorCode;
}

export function isJobCreateAttributionStageId(
  value: unknown,
): value is JobCreateAttributionStageId {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function isJobCreateAttributionReasonId(
  value: unknown,
): value is JobCreateAttributionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function scrubJobCreateAttributionStages(
  stages: readonly JobCreateAttributionStageResult[],
): readonly JobCreateAttributionStageResult[] {
  const out: JobCreateAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isJobCreateAttributionStageId(s.stage)) continue;
    if (
      s.status !== "ok" &&
      s.status !== "failed" &&
      s.status !== "skipped" &&
      s.status !== "best_effort_failed"
    ) {
      continue;
    }
    const reasonId =
      s.reasonId != null && isJobCreateAttributionReasonId(s.reasonId)
        ? s.reasonId
        : undefined;
    const promotionReasonId = sanitizeHeadlessPromotionReasonId(
      s.promotionReasonId,
    );
    const base: JobCreateAttributionStageResult = {
      stage: s.stage,
      status: s.status,
      ...(reasonId != null ? { reasonId } : {}),
      ...(sanitizeControlPlaneCode(s.safeControlPlaneCode) != null
        ? {
            safeControlPlaneCode: sanitizeControlPlaneCode(
              s.safeControlPlaneCode,
            )!,
          }
        : {}),
      ...(sanitizeSqlState(s.allowlistedSqlState) != null
        ? { allowlistedSqlState: sanitizeSqlState(s.allowlistedSqlState)! }
        : {}),
      ...(sanitizeConstraint(s.allowlistedConstraint) != null
        ? {
            allowlistedConstraint: sanitizeConstraint(
              s.allowlistedConstraint,
            )!,
          }
        : {}),
      ...(promotionReasonId != null ? { promotionReasonId } : {}),
      ...(s.durableJobStage === "provisional" || s.durableJobStage === "canonical"
        ? { durableJobStage: s.durableJobStage }
        : {}),
      ...(s.storeVersionDelta === "unchanged" ||
      s.storeVersionDelta === "plus_one" ||
      s.storeVersionDelta === "unexpected"
        ? { storeVersionDelta: s.storeVersionDelta }
        : {}),
      ...(sanitizeOwnedObjectStagingAttributionSnapshot(s.stagingAttribution) !=
      null
        ? {
            stagingAttribution: sanitizeOwnedObjectStagingAttributionSnapshot(
              s.stagingAttribution,
            )!,
          }
        : {}),
      ...(sanitizeOwnedObjectFinalizeAttributionSnapshot(s.finalizeAttribution) !=
      null
        ? {
            finalizeAttribution: sanitizeOwnedObjectFinalizeAttributionSnapshot(
              s.finalizeAttribution,
            )!,
          }
        : {}),
      ...(sanitizeDispatchOutboxObservationAttribution(
        s.dispatchOutboxAttribution,
      ) != null
        ? {
            dispatchOutboxAttribution: sanitizeDispatchOutboxObservationAttribution(
              s.dispatchOutboxAttribution,
            )!,
          }
        : {}),
    };
    out.push(base);
  }
  return Object.freeze(out.slice());
}

function stageOk(
  stage: JobCreateAttributionStageId,
  extra?: Omit<JobCreateAttributionStageResult, "stage" | "status">,
): JobCreateAttributionStageResult {
  return { stage, status: "ok", ...extra };
}

function stageFail(
  stage: JobCreateAttributionStageId,
  reasonId: JobCreateAttributionReasonId,
  extra?: Omit<
    JobCreateAttributionStageResult,
    "stage" | "status" | "reasonId"
  >,
): JobCreateAttributionStageResult {
  return { stage, status: "failed", reasonId, ...extra };
}

function failAt(
  stages: JobCreateAttributionStageResult[],
  stage: JobCreateAttributionStageId,
  reasonId: JobCreateAttributionReasonId,
  extra?: Omit<
    JobCreateAttributionStageResult,
    "stage" | "status" | "reasonId"
  >,
  promotionAttribution?: HeadlessPromotionAttribution,
  coverageAttribution?: FlyRenderLiveCoverageAttributionSnapshot,
  stagingAttribution?: FlyRenderOwnedObjectStagingAttributionSnapshot,
  finalizeAttribution?: FlyRenderOwnedObjectFinalizeAttributionSnapshot,
): AttributedFlyRenderJobCreateFailure {
  stages.push(
    stageFail(stage, reasonId, {
      ...extra,
      ...(stagingAttribution != null ? { stagingAttribution } : {}),
      ...(finalizeAttribution != null ? { finalizeAttribution } : {}),
    }),
  );
  return {
    ok: false,
    failureStage: stage,
    failureReasonId: reasonId,
    stages: scrubJobCreateAttributionStages(stages),
    ...(promotionAttribution != null
      ? { promotionAttribution }
      : {}),
    ...(coverageAttribution != null ? { coverageAttribution } : {}),
    ...(stagingAttribution != null ? { stagingAttribution } : {}),
    ...(finalizeAttribution != null ? { finalizeAttribution } : {}),
  };
}

function maybeInjectThrow(
  point: JobCreateAttributionInjectionPoint | undefined,
  expected: JobCreateAttributionInjectionPoint,
): void {
  if (point === expected) {
    throw new Error("JOB_CREATE_INJECTED");
  }
}

/**
 * Sequential attributed job-create chain through queued canonical job.
 * Probe mode may extend through dispatch-outbox intent reread (no render delivery).
 */
export async function runAttributedFlyRenderJobCreateChain(input: {
  readonly ctx: FlyRenderLiveMatrixContext;
  readonly includeDispatchOutboxIntentReread?: boolean;
  readonly markCleanupSkipped?: boolean;
  readonly injectThrowAt?: JobCreateAttributionInjectionPoint;
  readonly forceStaleManifestFingerprint?: boolean;
  readonly forceForeignProjectId?: boolean;
  readonly forceIncompleteCoverage?: boolean;
  readonly forcePromotionReject?: boolean;
  readonly forceQueuedStateMismatch?: boolean;
  /** Fixture/local — stop after coverage; does not prove promotion or outbox. */
  readonly stopBeforePromotion?: boolean;
}): Promise<AttributedFlyRenderJobCreateResult> {
  const { ctx } = input;
  const stages: JobCreateAttributionStageResult[] = [];
  let draftCtx: LiveDraftContext | null = null;
  let provisional: HeadlessProvisionalStoredJobRecord | null = null;

  // --- project_ownership_claim ---
  try {
    maybeInjectThrow(input.injectThrowAt, "project_ownership");
    trackProjectId(ctx, ctx.projectId);
    const claimed = await ctx.projectAuthorization.claimUnownedProject(
      { ownerId: ctx.ownerId, sessionId: `frjc_${ctx.runId.slice(0, 8)}` },
      ctx.projectId,
    );
    if (!claimed.ok) {
      const access = await ctx.projectAuthorization.assertProjectAccess(
        { ownerId: ctx.ownerId, sessionId: `frjc_${ctx.runId.slice(0, 8)}` },
        ctx.projectId,
      );
      if (!access.ok) {
        return failAt(
          stages,
          "project_ownership_claim",
          "project_ownership_failed",
          {
            safeControlPlaneCode: sanitizeControlPlaneCode(
              claimed.issues[0]?.code,
            ),
          },
        );
      }
    }
    stages.push(stageOk("project_ownership_claim"));
  } catch {
    return failAt(
      stages,
      "project_ownership_claim",
      "hostile_input_rejected",
    );
  }

  // --- live_manifest_construction ---
  try {
    maybeInjectThrow(input.injectThrowAt, "live_manifest_construction");
    const projectId = input.forceForeignProjectId
      ? randomUUID()
      : ctx.projectId;
    draftCtx =
      ctx.capacity4kBoundary != null
        ? await buildCapacity4kLiveDraft({
            runId: ctx.runId,
            ownerId: ctx.ownerId,
            projectId,
            profileId: ctx.capacity4kBoundary.profileId,
            contentDurationMs: ctx.capacity4kBoundary.contentDurationMs,
            creatorKey: `fly-render-4k-${ctx.capacity4kCreatorPrefix}-${ctx.runId}`,
            audioMode: ctx.capacity4kAudioMode ?? "silent",
            randomUUID: () => randomUUID(),
          })
        : await buildLiveDraft({
            runId: ctx.runId,
            ownerId: ctx.ownerId,
            projectId,
            emptyStaging: true,
            creatorKey: `fly-render-live-${ctx.runId}`,
            contentDurationMs: ctx.smokeContentDurationMs,
            randomUUID: () => randomUUID(),
          });
    const identity = assertFlyRenderJobCreateProjectIdentity({
      ctxProjectId: ctx.projectId,
      draftProjectId: draftCtx.projectId,
      ctxOwnerId: ctx.ownerId,
      draftOwnerId: draftCtx.ownerId,
    });
    if (!identity.ok) {
      return failAt(
        stages,
        "live_manifest_construction",
        "fixture_identity_incoherent",
      );
    }
    if (input.forceStaleManifestFingerprint) {
      return failAt(
        stages,
        "live_manifest_construction",
        "stale_manifest_fingerprint",
      );
    }
    deriveFlyRenderJobCreateStagingPayloads(draftCtx);
    stages.push(stageOk("live_manifest_construction"));
  } catch {
    return failAt(
      stages,
      "live_manifest_construction",
      "live_manifest_construction_failed",
    );
  }

  // --- provisional_job_create ---
  try {
    maybeInjectThrow(input.injectThrowAt, "provisional_create");
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx!.idempotencyAuthorityKey,
      record: draftCtx!.draft,
    });
    if (!created.ok || created.value.kind !== "created") {
      return failAt(stages, "provisional_job_create", "provisional_create_failed", {
        safeControlPlaneCode: created.ok
          ? undefined
          : sanitizeControlPlaneCode(created.issues[0]?.code),
        durableJobStage: "provisional",
      });
    }
    provisional = created.value.record as HeadlessProvisionalStoredJobRecord;
    ctx.session.jobId = draftCtx!.jobId;
    ctx.session.operationId = draftCtx!.operationId;
    trackJobId(ctx, draftCtx!.jobId);
    stages.push(stageOk("provisional_job_create"));
  } catch {
    return failAt(
      stages,
      "provisional_job_create",
      "provisional_create_failed",
    );
  }

  // --- provisional_job_reread ---
  try {
    const reread = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx!.jobId,
      ctx.ownerId,
    );
    if (
      !reread.ok ||
      reread.value.stage !== "provisional" ||
      reread.value.jobId !== draftCtx!.jobId ||
      reread.value.projectId !== draftCtx!.projectId
    ) {
      return failAt(
        stages,
        "provisional_job_reread",
        "provisional_reread_failed",
        { durableJobStage: "provisional" },
      );
    }
    provisional = reread.value as HeadlessProvisionalStoredJobRecord;
    stages.push(stageOk("provisional_job_reread"));
  } catch {
    return failAt(
      stages,
      "provisional_job_reread",
      "provisional_reread_failed",
    );
  }

  // --- owned_object_staging ---
  const finalizedObjectIds: string[] = [];
  try {
    maybeInjectThrow(input.injectThrowAt, "owned_object_staging");
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx!);
    const recordChain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads,
      jobId: draftCtx!.jobId,
      operationId: draftCtx!.operationId,
    });
    if (!recordChain.ok) {
      return failAt(
        stages,
        "owned_object_staging",
        recordChain.failureReasonId as JobCreateAttributionReasonId,
        {
          safeControlPlaneCode: sanitizeControlPlaneCode(
            recordChain.stagingAttribution.safeControlPlaneCode,
          ),
          allowlistedSqlState: sanitizeSqlState(
            recordChain.stagingAttribution.allowlistedSqlState,
          ),
          allowlistedConstraint: sanitizeConstraint(
            recordChain.stagingAttribution.allowlistedConstraint,
          ),
          stagingAttribution: recordChain.stagingAttribution,
        },
        undefined,
        undefined,
        recordChain.stagingAttribution,
      );
    }
    const finalizedStaged =
      input.forceIncompleteCoverage === true
        ? recordChain.staged.slice(0, -1)
        : recordChain.staged;
    const finalizedPayloads =
      input.forceIncompleteCoverage === true
        ? payloads.slice(0, -1)
        : payloads;
    const finalizeChain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: finalizedStaged,
      payloads: finalizedPayloads,
    });
    if (!finalizeChain.ok) {
      const reasonId = isJobCreateAttributionReasonId(
        finalizeChain.failureReasonId,
      )
        ? finalizeChain.failureReasonId
        : "owned_object_finalize_failed";
      return failAt(
        stages,
        "owned_object_staging",
        reasonId,
        {
          safeControlPlaneCode: sanitizeControlPlaneCode(
            finalizeChain.finalizeAttribution.safeControlPlaneCode,
          ),
          allowlistedSqlState: sanitizeSqlState(
            finalizeChain.finalizeAttribution.allowlistedSqlState,
          ),
          allowlistedConstraint: sanitizeConstraint(
            finalizeChain.finalizeAttribution.allowlistedConstraint,
          ),
          finalizeAttribution: finalizeChain.finalizeAttribution,
        },
        undefined,
        undefined,
        undefined,
        finalizeChain.finalizeAttribution,
      );
    }
    finalizedObjectIds.push(...finalizeChain.finalizedObjectIds);
    stages.push(
      stageOk("owned_object_staging", {
        finalizeAttribution: finalizeChain.finalizeAttribution,
      }),
    );
  } catch {
    return failAt(
      stages,
      "owned_object_staging",
      "owned_object_staging_failed",
    );
  }

  // --- staging_reference_append (production reconcile owns refs) ---
  stages.push({
    stage: "staging_reference_append",
    status: "skipped",
  });

  // --- coverage_reconcile ---
  try {
    maybeInjectThrow(input.injectThrowAt, "coverage_reconcile");
    const coverage = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: provisional!,
      finalizedObjectIds,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    if (!coverage.ok) {
      return failAt(
        stages,
        "coverage_reconcile",
        coverage.reasonId,
        {
          durableJobStage: "provisional",
          promotionReasonId: "coverage_incomplete",
          storeVersionDelta: coverage.snapshot.storeVersionDelta,
        },
        undefined,
        coverage.snapshot,
      );
    }
    provisional = coverage.record;
    stages.push(stageOk("coverage_reconcile", {
      storeVersionDelta: coverage.snapshot.storeVersionDelta,
    }));
  } catch {
    return failAt(stages, "coverage_reconcile", "coverage_reconcile_failed");
  }

  if (input.stopBeforePromotion === true) {
    const skipped: JobCreateAttributionStageId[] = [
      "canonical_materialization",
      "promotion_transaction",
      "queued_job_reread",
      "queued_state_assertion",
      "dispatch_outbox_intent_reread",
    ];
    for (const stage of skipped) {
      stages.push({ stage, status: "skipped" });
    }
    if (input.markCleanupSkipped === true) {
      stages.push({ stage: "cleanup", status: "skipped" });
    } else {
      stages.push(stageOk("cleanup"));
    }
    return {
      ok: true,
      stages: scrubJobCreateAttributionStages(stages),
      draftCtx: draftCtx!,
      stoppedBeforePromotion: true,
    };
  }

  let promotionAttribution = emptyPromotionAttribution("promotion_update");
  let canonicalPair: {
    readonly job: HeadlessRenderJobV1;
    readonly request: HeadlessRenderJobRequestV1;
  } | null = null;

  // --- canonical_materialization ---
  try {
    maybeInjectThrow(input.injectThrowAt, "canonical_materialization");
    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      io: ctx.io,
      jobId: provisional!.jobId,
      ownerId: provisional!.ownerId,
      nowMs: ctx.nowMs,
    });
    if (!materialized.ok) {
      return failAt(
        stages,
        "canonical_materialization",
        "canonical_pair_invalid",
        {
          durableJobStage: "provisional",
          promotionReasonId: "canonical_pair_invalid",
          safeControlPlaneCode: sanitizeControlPlaneCode(
            materialized.issues[0]?.code,
          ),
        },
      );
    }
    canonicalPair = {
      job: materialized.value.canonicalJob,
      request: materialized.value.canonicalRequest,
    };
    stages.push(stageOk("canonical_materialization"));
  } catch {
    return failAt(
      stages,
      "canonical_materialization",
      "canonical_pair_invalid",
    );
  }

  // --- promotion_transaction ---
  try {
    maybeInjectThrow(input.injectThrowAt, "promotion_transaction");

    if (input.forcePromotionReject) {
      return failAt(stages, "promotion_transaction", "promotion_rejected", {
        durableJobStage: "provisional",
        promotionReasonId: "promotion_update_failed",
        storeVersionDelta: "unchanged",
      });
    }

    const store = ctx.jobStore as NeonHeadlessJobStoreAdapter;
    const attributed = await store.promoteProvisionalToCanonicalAttributed({
      jobId: provisional!.jobId,
      ownerId: provisional!.ownerId,
      expectedStoreVersion: provisional!.storeVersion,
      expectedOperationId: provisional!.operationId,
      canonicalJob: canonicalPair!.job,
      canonicalRequest: canonicalPair!.request,
    });
    promotionAttribution = attributed.attribution;
    const promoted = attributed.result;
    if (!promoted.ok || promoted.value.kind !== "updated") {
      return failAt(
        stages,
        "promotion_transaction",
        promoted.ok && promoted.value.kind === "rejected"
          ? "promotion_rejected"
          : "promotion_transaction_failed",
        {
          safeControlPlaneCode: promoted.ok
            ? undefined
            : sanitizeControlPlaneCode(promoted.issues[0]?.code),
          promotionReasonId:
            promotionAttribution.promotionReasonId ?? "unknown_safe_failure",
          durableJobStage:
            promotionAttribution.stageClassification ?? "provisional",
          storeVersionDelta:
            promotionAttribution.storeVersionDelta ?? "unchanged",
        },
        promotionAttribution,
      );
    }
    ctx.session.initialStoreVersion = promoted.value.record.storeVersion;
    stages.push(stageOk("promotion_transaction", {
      promotionReasonId: promotionAttribution.promotionReasonId ?? undefined,
      durableJobStage: "canonical",
      storeVersionDelta: "plus_one",
    }));
  } catch {
    return failAt(
      stages,
      "promotion_transaction",
      "promotion_transaction_failed",
      undefined,
      promotionAttribution,
    );
  }

  // --- queued_job_reread ---
  try {
    const job = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx!.jobId,
      ctx.ownerId,
    );
    if (!job.ok || job.value.stage !== "canonical") {
      return failAt(stages, "queued_job_reread", "queued_reread_failed", {
        durableJobStage: job.ok ? job.value.stage : undefined,
      });
    }
    ctx.session.observedStoreVersion = job.value.storeVersion;
    stages.push(stageOk("queued_job_reread", {
      durableJobStage: "canonical",
      storeVersionDelta: "plus_one",
    }));
  } catch {
    return failAt(stages, "queued_job_reread", "queued_reread_failed");
  }

  // --- queued_state_assertion ---
  try {
    if (input.forceQueuedStateMismatch) {
      return failAt(stages, "queued_state_assertion", "queued_state_mismatch", {
        durableJobStage: "canonical",
      });
    }
    const job = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx!.jobId,
      ctx.ownerId,
    );
    if (
      !job.ok ||
      job.value.stage !== "canonical" ||
      job.value.canonicalJob!.state !== "queued"
    ) {
      return failAt(stages, "queued_state_assertion", "queued_state_mismatch", {
        durableJobStage: job.ok ? job.value.stage : undefined,
      });
    }
    stages.push(stageOk("queued_state_assertion", {
      durableJobStage: "canonical",
    }));
  } catch {
    return failAt(
      stages,
      "queued_state_assertion",
      "queued_state_mismatch",
    );
  }

  // --- dispatch_outbox_intent_reread (monotonic observation authority) ---
  try {
    maybeInjectThrow(input.injectThrowAt, "dispatch_outbox_intent");
    if (ctx.dispatchOutbox == null) {
      return failAt(
        stages,
        "dispatch_outbox_intent_reread",
        "dispatch_outbox_intent_failed",
      );
    }
    const captured = await captureMonotonicDispatchOutboxObservation({
      dispatchOutbox: ctx.dispatchOutbox,
      jobStore: ctx.jobStore,
      jobId: draftCtx!.jobId,
      ownerId: ctx.ownerId,
      expectedOperationId: draftCtx!.operationId,
      promotionAttribution,
    });
    if (!captured.ok) {
      return failAt(
        stages,
        "dispatch_outbox_intent_reread",
        "dispatch_outbox_intent_failed",
      );
    }
    ctx.session.dispatchOutboxObservationAnchor = captured.anchor;
    stages.push(
      stageOk("dispatch_outbox_intent_reread", {
        dispatchOutboxAttribution: captured.anchor.attribution,
      }),
    );
  } catch {
    return failAt(
      stages,
      "dispatch_outbox_intent_reread",
      "dispatch_outbox_intent_failed",
    );
  }

  if (input.markCleanupSkipped === true) {
    stages.push({ stage: "cleanup", status: "skipped" });
  } else {
    stages.push(stageOk("cleanup"));
  }

  return {
    ok: true,
    stages: scrubJobCreateAttributionStages(stages),
    draftCtx: draftCtx!,
  };
}
