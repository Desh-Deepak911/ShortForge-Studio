/**
 * Deterministic in-memory job store — provisional/canonical union + promotion.
 * Verification / local fixtures only. Hardening preserved from 11C.1 / 11D 3.3A.
 */

import { applyHeadlessJobTransition } from "../../domain/headless-job-lifecycle";
import { isHeadlessTerminalState } from "../../domain/headless-render-constants";
import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { isLegalHeadlessJobTransition } from "../../domain/headless-job-lifecycle";
import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import { assertStoredBindingStateRules } from "../services/validate-artifact-object-binding";
import {
  assertCanonicalIdentityPreserved,
  assertProvisionalIdentityPreserved,
  legacyToCanonicalWrite,
  provisionalSemanticFingerprint,
} from "../services/job-store-authority";
import {
  validateHeadlessCanonicalStoredJobRecord,
  validateHeadlessProvisionalStoredJobRecord,
} from "../services/validate-provisional-stored-job";
import { assertProvisionalCasWriteRules } from "../services/provisional-staging-monotonicity";
import {
  emptyPromotionAttribution,
  type HeadlessPromotionAttributedResult,
} from "../services/promotion-attribution";
import { evaluateHeadlessPromotionPreflight } from "../services/promotion-preflight-authority";
import { cpFail, cpOk } from "../types/control-plane.types";
import { HEADLESS_STORED_JOB_RECORD_VERSION } from "../types/stored-job-record";
import type {
  HeadlessCanonicalCreateLegacyWrite,
  HeadlessCanonicalStoredJobRecord,
  HeadlessJobStorePort,
  HeadlessPromoteProvisionalInput,
  HeadlessProvisionalStoreWrite,
  HeadlessStoredJobRecord,
} from "../ports/job-store.port";
import type { HeadlessProvisionalStoredJobRecord } from "../types/stored-job-record";
import type { MemoryHeadlessRenderDispatchOutboxAdapter } from "./memory-render-dispatch-outbox.adapter";
import { stableHeadlessDeliveryId } from "../services/stable-delivery-id";

function detachRecord(
  record: HeadlessStoredJobRecord,
): HeadlessStoredJobRecord {
  return deepFreezeHeadlessValue(record);
}

function detachCanonical(
  record: HeadlessCanonicalStoredJobRecord,
): HeadlessCanonicalStoredJobRecord {
  return deepFreezeHeadlessValue(record);
}

function detachProvisional(
  record: HeadlessProvisionalStoredJobRecord,
): HeadlessProvisionalStoredJobRecord {
  return deepFreezeHeadlessValue(record);
}

export class MemoryHeadlessJobStoreAdapter implements HeadlessJobStorePort {
  private readonly byId = new Map<string, HeadlessStoredJobRecord>();
  private readonly byIdempotency = new Map<string, string>(); // key → jobId
  private readonly dispatchOutbox: MemoryHeadlessRenderDispatchOutboxAdapter | null;

  constructor(options?: {
    readonly dispatchOutbox?: MemoryHeadlessRenderDispatchOutboxAdapter;
  }) {
    this.dispatchOutbox = options?.dispatchOutbox ?? null;
  }

  private ensureDispatchForCanonical(
    record: HeadlessCanonicalStoredJobRecord,
    nowMs: number,
  ):
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string } {
    if (this.dispatchOutbox == null) return { ok: true };
    if (record.canonicalJob.state !== "queued") return { ok: true };
    const deliveryId = stableHeadlessDeliveryId(
      record.jobId,
      record.canonicalJob.attempt,
    );
    const ensured = this.dispatchOutbox.testingUpsertPendingAtomic({
      jobId: record.jobId,
      ownerId: record.ownerId,
      projectId: record.projectId,
      attempt: record.canonicalJob.attempt,
      deliveryId,
      nowMs,
    });
    if (!ensured.ok) return ensured;
    return { ok: true };
  }

  async createIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessCanonicalCreateLegacyWrite;
  }) {
    const coherent = validateHeadlessRenderJobCoherence(
      input.record.job,
      input.record.request,
    );
    if (!coherent.ok) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Create rejected: job/request coherence failed.",
      );
    }
    if (input.record.idempotencyAuthorityKey !== input.idempotencyAuthorityKey) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "idempotencyAuthorityKey mismatch on create.",
      );
    }
    if (
      coherent.job.ownership.ownerId !== coherent.request.ownership.ownerId ||
      coherent.job.ownership.projectId !== coherent.request.ownership.projectId
    ) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Ownership mismatch on create.",
      );
    }

    const bindingRules = assertStoredBindingStateRules({
      job: coherent.job,
      request: coherent.request,
      binding: input.record.artifactObjectBinding ?? null,
    });
    if (!bindingRules.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", bindingRules.message);
    }

    const existingId = this.byIdempotency.get(input.idempotencyAuthorityKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (!existing) {
        return cpFail("INTERNAL_ERROR", "Idempotency index corruption.");
      }
      if (existing.stage !== "canonical") {
        return cpOk({
          kind: "conflict" as const,
          existingRequestFingerprint: "provisional",
        });
      }
      if (
        existing.canonicalRequest.requestFingerprint !==
        coherent.request.requestFingerprint
      ) {
        return cpOk({
          kind: "conflict" as const,
          existingRequestFingerprint:
            existing.canonicalRequest.requestFingerprint,
        });
      }
      return cpOk({
        kind: "existing" as const,
        record: detachCanonical(existing),
      });
    }

    const jobId = coherent.job.jobId;
    if (this.byId.has(jobId)) {
      return cpFail("INTERNAL_ERROR", "Job id collision.");
    }

    const writeResult = legacyToCanonicalWrite({
      ...input.record,
      job: coherent.job,
      request: coherent.request,
      artifactObjectBinding: bindingRules.binding,
    });
    if (!writeResult.ok) return writeResult.fail;
    const validated = validateHeadlessCanonicalStoredJobRecord({
      ...writeResult.write,
      storeVersion: 1,
    });
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(jobId, validated.record);
    this.byIdempotency.set(input.idempotencyAuthorityKey, jobId);
    return cpOk({
      kind: "created" as const,
      record: detachCanonical(validated.record),
    });
  }

  async createProvisionalIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessProvisionalStoreWrite;
  }) {
    if (input.record.idempotencyAuthorityKey !== input.idempotencyAuthorityKey) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "idempotencyAuthorityKey mismatch on provisional create.",
      );
    }
    const validated = validateHeadlessProvisionalStoredJobRecord(
      { ...input.record, storeVersion: 1 },
      { requireStoreVersion: true },
    );
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }

    const existingId = this.byIdempotency.get(input.idempotencyAuthorityKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (!existing) {
        return cpFail("INTERNAL_ERROR", "Idempotency index corruption.");
      }
      if (existing.stage === "provisional") {
        if (
          provisionalSemanticFingerprint(existing) !==
          provisionalSemanticFingerprint(validated.record)
        ) {
          return cpOk({
            kind: "conflict" as const,
            existingJobId: existing.jobId,
          });
        }
        return cpOk({
          kind: "existing" as const,
          record: detachRecord(existing),
        });
      }
      // Same key already promoted or created as canonical — treat as conflict
      // unless jobId matches and semantics are preserved via idempotency key alone.
      return cpOk({
        kind: "conflict" as const,
        existingJobId: existing.jobId,
      });
    }

    if (this.byId.has(validated.record.jobId)) {
      return cpFail("INTERNAL_ERROR", "Job id collision.");
    }

    const record = detachProvisional(validated.record);
    this.byId.set(record.jobId, record);
    this.byIdempotency.set(input.idempotencyAuthorityKey, record.jobId);
    return cpOk({ kind: "created" as const, record: detachProvisional(record) });
  }

  async getByJobIdAndOwner(jobId: string, ownerId: string) {
    const record = this.byId.get(jobId);
    if (!record || record.ownerId !== ownerId) {
      return cpFail("JOB_NOT_FOUND", "Job not found for owner.");
    }
    return cpOk(detachRecord(record));
  }

  async compareAndSetProvisional(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessProvisionalStoreWrite;
  }) {
    const current = this.byId.get(input.jobId);
    if (!current || current.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Job not found for owner.");
    }
    if (current.stage === "canonical") {
      return cpOk({ kind: "already_promoted" as const });
    }
    if (current.state !== "materializing") {
      return cpOk({ kind: "terminal_locked" as const });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "stale" as const });
    }

    const identity = assertProvisionalIdentityPreserved(current, input.next);
    if (identity) return identity;

    if (input.next.updatedAtMs < current.updatedAtMs) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Provisional updatedAtMs must be monotonic.",
      );
    }

    const casRules = assertProvisionalCasWriteRules({
      current,
      next: input.next,
    });
    if (!casRules.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", casRules.message);
    }

    const validated = validateHeadlessProvisionalStoredJobRecord(
      { ...input.next, storeVersion: current.storeVersion + 1 },
      { requireStoreVersion: true },
    );
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }

    const record = detachProvisional(validated.record);
    this.byId.set(input.jobId, record);
    return cpOk({ kind: "updated" as const, record: detachProvisional(record) });
  }

  async promoteProvisionalToCanonical(input: HeadlessPromoteProvisionalInput) {
    const attributed = await this.promoteProvisionalToCanonicalAttributed(input);
    return attributed.result;
  }

  /**
   * QA/testing attribution surface — same acceptance/rejection as production promote.
   */
  async promoteProvisionalToCanonicalAttributed(
    input: HeadlessPromoteProvisionalInput,
  ): Promise<HeadlessPromotionAttributedResult> {
    let attribution = emptyPromotionAttribution("promotion_record_read");
    const current = this.byId.get(input.jobId);
    if (!current || current.ownerId !== input.ownerId) {
      return {
        result: cpFail("JOB_NOT_FOUND", "Job not found for owner."),
        attribution: {
          ...attribution,
          safeOperationStage: "promotion_record_read",
          promotionResultKind: "control_plane_failure",
          safeControlPlaneCode: "JOB_NOT_FOUND",
          promotionReasonId: "unknown_safe_failure",
        },
      };
    }

    attribution = {
      ...attribution,
      stageClassification: current.stage,
      durableCanonicalRowExists: current.stage === "canonical",
    };

    const preflight = evaluateHeadlessPromotionPreflight({
      current,
      promote: input,
    });
    attribution = {
      ...attribution,
      safeOperationStage: "promotion_preflight",
    };

    if (!preflight.ok) {
      if (preflight.outcome === "already_promoted") {
        const ensured = this.ensureDispatchForCanonical(
          preflight.record,
          Math.max(preflight.record.updatedAtMs, preflight.record.createdAtMs),
        );
        if (!ensured.ok) {
          return {
            result: cpOk({
              kind: "rejected" as const,
              message: ensured.message,
            }),
            attribution: {
              ...attribution,
              promotionResultKind: "rejected",
              promotionReasonId: "dispatch_outbox_ensure_failed",
              storeVersionDelta: "unchanged",
            },
          };
        }
        return {
          result: cpOk({
            kind: "already_promoted" as const,
            record: detachCanonical(preflight.record),
          }),
          attribution: {
            ...attribution,
            promotionResultKind: "already_promoted",
            durableCanonicalRowExists: true,
            stageClassification: "canonical",
            storeVersionDelta: "unchanged",
            promotionReasonId: null,
          },
        };
      }
      if (preflight.outcome === "stale") {
        return {
          result: cpOk({ kind: "stale" as const }),
          attribution: {
            ...attribution,
            promotionResultKind: "stale",
            promotionReasonId: preflight.reasonId,
            storeVersionDelta: "unchanged",
          },
        };
      }
      return {
        result: cpOk({
          kind: "rejected" as const,
          message: preflight.message,
        }),
        attribution: {
          ...attribution,
          promotionResultKind: "rejected",
          promotionReasonId: preflight.reasonId,
          storeVersionDelta: "unchanged",
        },
      };
    }

    const beforeVersion = current.storeVersion;
    this.byId.set(input.jobId, preflight.record);
    const ensured = this.ensureDispatchForCanonical(
      preflight.record,
      preflight.record.updatedAtMs,
    );
    if (!ensured.ok) {
      this.byId.set(input.jobId, current);
      return {
        result: cpOk({
          kind: "rejected" as const,
          message: ensured.message,
        }),
        attribution: {
          ...attribution,
          promotionResultKind: "rejected",
          promotionReasonId: "dispatch_outbox_ensure_failed",
          storeVersionDelta: "unchanged",
        },
      };
    }
    const stored = detachCanonical(preflight.record);
    return {
      result: cpOk({ kind: "updated" as const, record: stored }),
      attribution: {
        ...attribution,
        safeOperationStage: "promotion_post_write",
        promotionResultKind: "updated",
        durableCanonicalRowExists: true,
        stageClassification: "canonical",
        storeVersionDelta:
          stored.storeVersion === beforeVersion + 1 ? "plus_one" : "unexpected",
        promotionReasonId: null,
      },
    };
  }

  async compareAndSetTransition(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessCanonicalCreateLegacyWrite;
  }) {
    const current = this.byId.get(input.jobId);
    if (!current || current.ownerId !== input.ownerId) {
      return cpFail("JOB_NOT_FOUND", "Job not found for owner.");
    }
    if (current.stage !== "canonical") {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Provisional records cannot use canonical transitions.",
      );
    }
    if (isHeadlessTerminalState(current.canonicalJob.state)) {
      return cpOk({ kind: "terminal_locked" as const });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "stale" as const });
    }

    if (
      current.claimToken != null &&
      input.next.claimToken != null &&
      input.next.claimToken !== current.claimToken
    ) {
      return cpOk({ kind: "stale" as const });
    }

    const identity = assertCanonicalIdentityPreserved(current, input.next);
    if (identity) return identity;

    const coherent = validateHeadlessRenderJobCoherence(
      input.next.job,
      input.next.request,
    );
    if (!coherent.ok) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "CAS rejected: job/request coherence failed.",
      );
    }

    if (
      !isLegalHeadlessJobTransition(
        current.canonicalJob.state,
        coherent.job.state,
      ) &&
      current.canonicalJob.state !== coherent.job.state
    ) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "CAS rejected: illegal lifecycle transition.",
      );
    }

    const bindingRules = assertStoredBindingStateRules({
      job: coherent.job,
      request: coherent.request,
      binding: input.next.artifactObjectBinding ?? null,
    });
    if (!bindingRules.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", bindingRules.message);
    }

    const writeResult = legacyToCanonicalWrite({
      ...input.next,
      job: coherent.job,
      request: coherent.request,
      artifactObjectBinding: bindingRules.binding,
      idempotencyAuthorityKey: current.idempotencyAuthorityKey,
      operationId: current.operationId,
    });
    if (!writeResult.ok) return writeResult.fail;
    const validated = validateHeadlessCanonicalStoredJobRecord({
      ...writeResult.write,
      storeVersion: current.storeVersion + 1,
      createdAtMs: current.createdAtMs,
      updatedAtMs: coherent.job.updatedAtMs,
    });
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }

    this.byId.set(input.jobId, validated.record);
    return cpOk({
      kind: "updated" as const,
      record: detachCanonical(validated.record),
    });
  }

  async claimQueuedJob(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    claimToken: string;
    nowMs: number;
  }) {
    const current = this.byId.get(input.jobId);
    if (!current || current.ownerId !== input.ownerId) {
      return cpOk({ kind: "rejected" as const });
    }
    if (current.stage !== "canonical") {
      return cpOk({ kind: "rejected" as const });
    }
    if (current.canonicalJob.state !== "queued") {
      return cpOk({ kind: "rejected" as const });
    }
    if (current.storeVersion !== input.expectedStoreVersion) {
      return cpOk({ kind: "rejected" as const });
    }
    if (current.claimToken != null) {
      return cpOk({ kind: "rejected" as const });
    }
    const record = detachCanonical({
      ...current,
      storeVersion: current.storeVersion + 1,
      claimToken: input.claimToken,
      claimedAtMs: input.nowMs,
      artifactObjectBinding: null,
    });
    this.byId.set(input.jobId, record);
    return cpOk({ kind: "claimed" as const, record: detachCanonical(record) });
  }

  async recoverExpiredClaim(input: {
    jobId: string;
    ownerId: string;
    nowMs: number;
    leaseMs: number;
    expectedClaimToken?: string | null;
  }) {
    const current = this.byId.get(input.jobId);
    if (!current || current.ownerId !== input.ownerId) {
      return cpOk({ kind: "rejected" as const });
    }
    if (current.stage !== "canonical") {
      return cpOk({ kind: "rejected" as const });
    }
    if (isHeadlessTerminalState(current.canonicalJob.state)) {
      return cpOk({ kind: "rejected_terminal" as const });
    }
    if (current.claimToken == null || current.claimedAtMs == null) {
      return cpOk({ kind: "rejected" as const });
    }
    if (
      input.expectedClaimToken != null &&
      current.claimToken !== input.expectedClaimToken
    ) {
      return cpOk({ kind: "rejected" as const });
    }

    const expiresAt = current.claimedAtMs + input.leaseMs;
    if (input.nowMs <= expiresAt) {
      return cpOk({ kind: "rejected_live_claim" as const });
    }

    const failed = applyHeadlessJobTransition({
      jobValue: current.canonicalJob,
      requestValue: current.canonicalRequest,
      toState: "failed",
      attempt: current.canonicalJob.attempt,
      updatedAtMs: Math.max(
        input.nowMs,
        current.canonicalJob.updatedAtMs + 1,
      ),
      terminalReason: { reasonId: "CLAIM_LEASE_EXPIRED", retryable: true },
    });
    if (!failed.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", "Lease recovery failed.");
    }
    const validated = validateHeadlessCanonicalStoredJobRecord({
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "canonical",
      storeVersion: current.storeVersion + 1,
      jobId: current.jobId,
      ownerId: current.ownerId,
      projectId: current.projectId,
      createdAtMs: current.createdAtMs,
      updatedAtMs: failed.job.updatedAtMs,
      idempotencyAuthorityKey: current.idempotencyAuthorityKey,
      operationId: current.operationId,
      canonicalJob: failed.job,
      canonicalRequest: current.canonicalRequest,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    });
    if (!validated.ok) {
      return cpFail("JOB_STORE_COHERENCE_REJECTED", validated.message);
    }
    this.byId.set(input.jobId, validated.record);
    return cpOk({
      kind: "failed_expired" as const,
      record: detachCanonical(validated.record),
    });
  }

  async listQueuedJobIds(limit: number) {
    return this.listCanonicalQueuedJobIds(limit);
  }

  async listCanonicalQueuedDispatchCandidates(limit: number) {
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000
    ) {
      return cpFail("INVALID_TRANSPORT", "Queue list limit is invalid.");
    }
    const candidates: {
      readonly jobId: string;
      readonly ownerId: string;
      readonly attempt: number;
      readonly storeVersion: number;
      readonly updatedAtMs: number;
    }[] = [];
    for (const [id, record] of this.byId) {
      if (
        record.stage === "canonical" &&
        record.canonicalJob.state === "queued" &&
        record.claimToken == null
      ) {
        candidates.push(
          Object.freeze({
            jobId: id,
            ownerId: record.ownerId,
            attempt: record.canonicalJob.attempt,
            storeVersion: record.storeVersion,
            updatedAtMs: record.canonicalJob.updatedAtMs,
          }),
        );
        if (candidates.length >= limit) break;
      }
    }
    return cpOk(candidates);
  }

  async listCanonicalQueuedJobIds(limit: number) {
    const listed = await this.listCanonicalQueuedDispatchCandidates(limit);
    if (!listed.ok) return listed;
    return cpOk(listed.value.map((c) => c.jobId));
  }

  /**
   * Test-only: bump storeVersion without changing job semantics.
   * Used to force a stale CAS after upload finalization.
   */
  testingBumpStoreVersion(jobId: string): boolean {
    const current = this.byId.get(jobId);
    if (!current) return false;
    const record = detachRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
    });
    this.byId.set(jobId, record);
    return true;
  }
}
