/**
 * Bounded enqueue-stage attribution for Upstash live / probe QA.
 * Stages + reason IDs are frozen allowlists — never secrets, URLs, SQL, or IDs.
 */

import { validateExportManifest } from "@/features/export/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain";
import {
  stableHeadlessDeliveryId,
  validateHeadlessStreamQueueEntry,
  type HeadlessRenderQueueMessage,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessUpstashRestClient } from "@/features/headless-renderer/control-plane/adapters/upstash-rest-queue-producer.adapter";

import { createQueuedCanonicalJob } from "./dual-lease-test-fixture";
import type { UpstashLiveCaseEvidence } from "./evidence";
import {
  trackJobId,
  trackProjectId,
  trackRunOwnedStreamId,
} from "./live-fixtures";
import type { UpstashLiveMatrixContext } from "./types";

export const ENQUEUE_ATTRIBUTION_STAGE_IDS = Object.freeze([
  "fixture_manifest",
  "project_ownership",
  "canonical_pair_construction",
  "neon_job_insert",
  "neon_job_reread",
  "queue_entry_validation",
  "rest_xadd",
  "rest_response_validation",
  "rest_xtrim",
  "cleanup",
] as const);

export type EnqueueAttributionStageId =
  (typeof ENQUEUE_ATTRIBUTION_STAGE_IDS)[number];

export const ENQUEUE_ATTRIBUTION_REASON_IDS = Object.freeze([
  "fixture_manifest_invalid",
  "fixture_project_identity_mismatch",
  "project_ownership_failed",
  "canonical_job_seed_failed",
  "neon_job_insert_failed",
  "neon_job_reread_failed",
  "queued_job_coherence_failed",
  "queue_entry_invalid",
  "rest_xadd_rejected",
  "rest_xadd_transport_failed",
  "rest_response_invalid",
  "rest_trim_failed",
] as const);

export type EnqueueAttributionReasonId =
  (typeof ENQUEUE_ATTRIBUTION_REASON_IDS)[number];

const STAGE_SET = new Set<string>(ENQUEUE_ATTRIBUTION_STAGE_IDS);
const REASON_SET = new Set<string>(ENQUEUE_ATTRIBUTION_REASON_IDS);

export type EnqueueAttributionStageStatus =
  | "ok"
  | "failed"
  | "skipped"
  | "best_effort_failed";

/** Allowlisted stage result — no secrets/IDs/URLs/SQL. */
export type EnqueueAttributionStageResult = {
  readonly stage: EnqueueAttributionStageId;
  readonly status: EnqueueAttributionStageStatus;
  readonly reasonId?: EnqueueAttributionReasonId;
};

export type AttributedRenderEnqueueSuccess = {
  readonly ok: true;
  readonly jobId: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly storeVersion: number;
  readonly streamId: string;
  readonly stages: readonly EnqueueAttributionStageResult[];
  /** Non-fatal trim adaptation (never fails the enqueue). */
  readonly trimBestEffortFailed: boolean;
};

export type AttributedRenderEnqueueFailure = {
  readonly ok: false;
  readonly failureStage: EnqueueAttributionStageId;
  readonly failureReasonId: EnqueueAttributionReasonId;
  readonly stages: readonly EnqueueAttributionStageResult[];
};

export type AttributedRenderEnqueueResult =
  | AttributedRenderEnqueueSuccess
  | AttributedRenderEnqueueFailure;

export type AttributedRenderEnqueueRestOps = {
  readonly xadd: HeadlessUpstashRestClient["xadd"];
  readonly xtrim: HeadlessUpstashRestClient["xtrim"];
  readonly streamKey: string;
};

export function isEnqueueAttributionStageId(
  value: unknown,
): value is EnqueueAttributionStageId {
  return typeof value === "string" && STAGE_SET.has(value);
}

export function isEnqueueAttributionReasonId(
  value: unknown,
): value is EnqueueAttributionReasonId {
  return typeof value === "string" && REASON_SET.has(value);
}

export function scrubEnqueueAttributionStages(
  stages: readonly EnqueueAttributionStageResult[],
): readonly EnqueueAttributionStageResult[] {
  const out: EnqueueAttributionStageResult[] = [];
  for (const s of stages) {
    if (!isEnqueueAttributionStageId(s.stage)) continue;
    if (
      s.status !== "ok" &&
      s.status !== "failed" &&
      s.status !== "skipped" &&
      s.status !== "best_effort_failed"
    ) {
      continue;
    }
    if (s.reasonId != null && !isEnqueueAttributionReasonId(s.reasonId)) {
      out.push({ stage: s.stage, status: s.status });
      continue;
    }
    out.push(
      s.reasonId != null
        ? { stage: s.stage, status: s.status, reasonId: s.reasonId }
        : { stage: s.stage, status: s.status },
    );
  }
  return Object.freeze(out.slice());
}

function stageOk(stage: EnqueueAttributionStageId): EnqueueAttributionStageResult {
  return { stage, status: "ok" };
}

function stageFail(
  stage: EnqueueAttributionStageId,
  reasonId: EnqueueAttributionReasonId,
): EnqueueAttributionStageResult {
  return { stage, status: "failed", reasonId };
}

function failAt(
  stages: EnqueueAttributionStageResult[],
  stage: EnqueueAttributionStageId,
  reasonId: EnqueueAttributionReasonId,
): AttributedRenderEnqueueFailure {
  stages.push(stageFail(stage, reasonId));
  return {
    ok: false,
    failureStage: stage,
    failureReasonId: reasonId,
    stages: scrubEnqueueAttributionStages(stages),
  };
}

/**
 * Sequential attributed render-enqueue chain.
 * Stops on first hard failure. XTRIM failure is best-effort (non-fatal).
 */
export async function runAttributedRenderEnqueue(input: {
  readonly ctx: UpstashLiveMatrixContext;
  /**
   * Fine-grained REST ops (XADD/XTRIM). When omitted, uses ctx.restProducer
   * (trim attribution recorded as ok when producer returns success).
   */
  readonly restOps?: AttributedRenderEnqueueRestOps;
  /** Skip cleanup stage marker (harness cleanup runs separately). */
  readonly markCleanupSkipped?: boolean;
  /** Deterministic suites only — force hostile queue entry after Neon seed. */
  readonly forceInvalidQueueEntry?: boolean;
}): Promise<AttributedRenderEnqueueResult> {
  const { ctx } = input;
  const stages: EnqueueAttributionStageResult[] = [];

  // --- project_ownership ---
  try {
    trackProjectId(ctx, ctx.projectId);
    const claimed = await ctx.projectAuthorization.claimUnownedProject(
      { ownerId: ctx.ownerId, sessionId: `uq_${ctx.runId.slice(0, 8)}` },
      ctx.projectId,
    );
    if (!claimed.ok) {
      const access = await ctx.projectAuthorization.assertProjectAccess(
        { ownerId: ctx.ownerId, sessionId: `uq_${ctx.runId.slice(0, 8)}` },
        ctx.projectId,
      );
      if (!access.ok) {
        return failAt(stages, "project_ownership", "project_ownership_failed");
      }
    }
    stages.push(stageOk("project_ownership"));
  } catch {
    return failAt(stages, "project_ownership", "project_ownership_failed");
  }

  // --- fixture_manifest + canonical_pair_construction ---
  let jobId: string;
  let deliveryId: string;
  let attempt: number;
  let storeVersion: number;
  let record: Awaited<
    ReturnType<typeof createQueuedCanonicalJob>
  >["record"];

  try {
    const fx = await createQueuedCanonicalJob({
      nowMs: ctx.nowMs,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
    });
    if (fx.manifest.project.projectId !== ctx.projectId) {
      return failAt(
        stages,
        "fixture_manifest",
        "fixture_project_identity_mismatch",
      );
    }
    if (!validateExportManifest(fx.manifest).ok) {
      return failAt(stages, "fixture_manifest", "fixture_manifest_invalid");
    }
    stages.push(stageOk("fixture_manifest"));
    record = fx.record;
    stages.push(stageOk("canonical_pair_construction"));
  } catch {
    // Distinguish identity vs seed — identity already checked above when possible.
    if (stages.every((s) => s.stage !== "fixture_manifest")) {
      return failAt(stages, "fixture_manifest", "fixture_manifest_invalid");
    }
    return failAt(
      stages,
      "canonical_pair_construction",
      "canonical_job_seed_failed",
    );
  }

  // --- neon_job_insert ---
  try {
    const inserted = await ctx.jobStore.createIfAbsent({
      idempotencyAuthorityKey: record.idempotencyAuthorityKey,
      record: {
        job: record.canonicalJob,
        request: record.canonicalRequest,
        idempotencyAuthorityKey: record.idempotencyAuthorityKey,
        operationId: record.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!inserted.ok) {
      return failAt(stages, "neon_job_insert", "neon_job_insert_failed");
    }
    stages.push(stageOk("neon_job_insert"));
  } catch {
    return failAt(stages, "neon_job_insert", "neon_job_insert_failed");
  }

  // --- neon_job_reread + queued coherence ---
  try {
    const stored = await ctx.jobStore.getByJobIdAndOwner(
      record.jobId,
      ctx.ownerId,
    );
    if (!stored.ok || stored.value.stage !== "canonical") {
      return failAt(stages, "neon_job_reread", "neon_job_reread_failed");
    }
    stages.push(stageOk("neon_job_reread"));

    let current = stored.value;
    if (current.canonicalJob.state !== "queued") {
      const queued = applyHeadlessJobTransition({
        jobValue: current.canonicalJob,
        requestValue: current.canonicalRequest,
        toState: "queued",
        attempt: current.canonicalJob.attempt,
        updatedAtMs: Math.max(
          ctx.nowMs,
          current.canonicalJob.updatedAtMs + 1,
        ),
      });
      if (!queued.ok) {
        return failAt(
          stages,
          "neon_job_reread",
          "queued_job_coherence_failed",
        );
      }
      const cas = await ctx.jobStore.compareAndSetTransition({
        jobId: current.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: current.storeVersion,
        next: {
          job: queued.job,
          request: current.canonicalRequest,
          idempotencyAuthorityKey: current.idempotencyAuthorityKey,
          operationId: current.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok || cas.value.kind !== "updated") {
        return failAt(
          stages,
          "neon_job_reread",
          "queued_job_coherence_failed",
        );
      }
      const reread = await ctx.jobStore.getByJobIdAndOwner(
        record.jobId,
        ctx.ownerId,
      );
      if (
        !reread.ok ||
        reread.value.stage !== "canonical" ||
        reread.value.canonicalJob.state !== "queued"
      ) {
        return failAt(
          stages,
          "neon_job_reread",
          "queued_job_coherence_failed",
        );
      }
      current = reread.value;
    }

    if (
      current.canonicalJob.state !== "queued" ||
      current.claimToken != null ||
      current.canonicalRequest.ownership.projectId !== ctx.projectId
    ) {
      return failAt(
        stages,
        "neon_job_reread",
        "queued_job_coherence_failed",
      );
    }

    jobId = current.jobId;
    attempt = current.canonicalJob.attempt;
    storeVersion = current.storeVersion;
    deliveryId = stableHeadlessDeliveryId(jobId, attempt);
    trackJobId(ctx, jobId);
    ctx.session.jobId = jobId;
    ctx.session.renderDeliveryId = deliveryId;
  } catch {
    return failAt(stages, "neon_job_reread", "neon_job_reread_failed");
  }

  const message: HeadlessRenderQueueMessage = input.forceInvalidQueueEntry
    ? ({
        deliveryId: "",
        jobId: "",
        ownerId: "",
        attempt: -1,
        enqueuedAtMs: Number.NaN,
        deliveryKind: "render",
        extra: "hostile",
      } as unknown as HeadlessRenderQueueMessage)
    : {
        deliveryId,
        jobId,
        ownerId: ctx.ownerId,
        attempt,
        enqueuedAtMs: ctx.nowMs,
        deliveryKind: "render",
      };

  // --- queue_entry_validation ---
  const entryValidated = validateHeadlessStreamQueueEntry(message);
  if (!entryValidated.ok || entryValidated.entry.deliveryKind !== "render") {
    return failAt(stages, "queue_entry_validation", "queue_entry_invalid");
  }
  const renderEntry = entryValidated.entry;
  stages.push(stageOk("queue_entry_validation"));

  // --- REST XADD (+ optional fine-grained XTRIM) ---
  let streamId: string;
  let trimBestEffortFailed = false;

  if (input.restOps != null) {
    const { restOps } = input;
    try {
      const rawId = await restOps.xadd(restOps.streamKey, "*", {
        deliveryId: renderEntry.deliveryId,
        jobId: renderEntry.jobId,
        ownerId: renderEntry.ownerId,
        attempt: String(renderEntry.attempt),
        enqueuedAtMs: String(renderEntry.enqueuedAtMs),
        deliveryKind: "render",
      });
      stages.push(stageOk("rest_xadd"));
      if (rawId == null || typeof rawId !== "string" || rawId.length === 0) {
        return failAt(
          stages,
          "rest_response_validation",
          "rest_response_invalid",
        );
      }
      streamId = rawId;
      stages.push(stageOk("rest_response_validation"));
    } catch {
      return failAt(stages, "rest_xadd", "rest_xadd_transport_failed");
    }

    try {
      await restOps.xtrim(restOps.streamKey, {
        strategy: "MAXLEN",
        exactness: "~",
        threshold: 10_000,
      });
      stages.push(stageOk("rest_xtrim"));
    } catch {
      trimBestEffortFailed = true;
      stages.push({
        stage: "rest_xtrim",
        status: "best_effort_failed",
        reasonId: "rest_trim_failed",
      });
    }
  } else {
    try {
      const enqueued = await ctx.restProducer.enqueueRender(message);
      if (!enqueued.ok) {
        const code = enqueued.issues[0]?.code;
        if (code === "HOSTILE_INPUT") {
          return failAt(stages, "rest_xadd", "rest_xadd_rejected");
        }
        return failAt(stages, "rest_xadd", "rest_xadd_transport_failed");
      }
      stages.push(stageOk("rest_xadd"));
      if (
        typeof enqueued.value.streamId !== "string" ||
        enqueued.value.streamId.length === 0
      ) {
        return failAt(
          stages,
          "rest_response_validation",
          "rest_response_invalid",
        );
      }
      streamId = enqueued.value.streamId;
      stages.push(stageOk("rest_response_validation"));
      // Producer swallows trim errors — record trim as ok (enqueue durably succeeded).
      stages.push(stageOk("rest_xtrim"));
    } catch {
      return failAt(stages, "rest_xadd", "rest_xadd_transport_failed");
    }
  }

  trackRunOwnedStreamId(ctx, {
    stream: ctx.streamNames.renderStream,
    id: streamId,
    kind: "render",
  });
  ctx.session.renderStreamId = streamId;

  if (input.markCleanupSkipped) {
    stages.push({ stage: "cleanup", status: "skipped" });
  } else {
    stages.push(stageOk("cleanup"));
  }

  return {
    ok: true,
    jobId,
    deliveryId,
    attempt,
    storeVersion,
    streamId,
    stages: scrubEnqueueAttributionStages(stages),
    trimBestEffortFailed,
  };
}

/**
 * Map attributed failure to live-matrix case evidence (category + allowlisted reason).
 */
export function attributedFailureToEnqueueRenderEvidence(
  failure: AttributedRenderEnqueueFailure,
): UpstashLiveCaseEvidence {
  return {
    caseId: "enqueue.render",
    status: "FAIL",
    failureCategory: "ENQUEUE_RENDER_FAILED",
    failureReasonId: failure.failureReasonId,
  };
}
