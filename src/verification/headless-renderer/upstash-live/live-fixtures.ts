/**
 * Shared helpers for Upstash live matrix runners.
 * Creates coherent queued jobs / staging objects and tracks cleanup IDs.
 */

import { randomUUID } from "node:crypto";

import {
  stableHeadlessDeliveryId,
  stableHeadlessVerifyDeliveryId,
} from "@/features/headless-renderer/control-plane";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain";

import { createQueuedCanonicalJob } from "./dual-lease-test-fixture";
import type {
  UpstashLiveMatrixContext,
  UpstashLiveTrackedStreamId,
} from "./types";

export function trackJobId(ctx: UpstashLiveMatrixContext, jobId: string): void {
  if (!ctx.createdJobIds.includes(jobId)) ctx.createdJobIds.push(jobId);
}

export function trackObjectId(
  ctx: UpstashLiveMatrixContext,
  objectId: string,
): void {
  if (!ctx.createdObjectIds.includes(objectId)) {
    ctx.createdObjectIds.push(objectId);
  }
}

export function trackProjectId(
  ctx: UpstashLiveMatrixContext,
  projectId: string,
): void {
  if (!ctx.createdProjectIds.includes(projectId)) {
    ctx.createdProjectIds.push(projectId);
  }
}

/**
 * Create active/finalized lifecycle tracking arrays (aliases share references).
 */
export function createUpstashLifecycleTracking(): {
  readonly runOwnedActiveStreamIds: UpstashLiveTrackedStreamId[];
  readonly runOwnedStreamIds: UpstashLiveTrackedStreamId[];
  readonly trackedStreamIds: UpstashLiveTrackedStreamId[];
  readonly caseFinalizedStreamIds: UpstashLiveTrackedStreamId[];
  readonly activeQaGroups: string[];
  readonly trackedQaGroups: string[];
  readonly finalizedQaGroups: string[];
  readonly trackedDlqIds: UpstashLiveTrackedStreamId[];
} {
  const runOwnedActiveStreamIds: UpstashLiveTrackedStreamId[] = [];
  const caseFinalizedStreamIds: UpstashLiveTrackedStreamId[] = [];
  const activeQaGroups: string[] = [];
  const finalizedQaGroups: string[] = [];
  const trackedDlqIds: UpstashLiveTrackedStreamId[] = [];
  return {
    runOwnedActiveStreamIds,
    runOwnedStreamIds: runOwnedActiveStreamIds,
    trackedStreamIds: runOwnedActiveStreamIds,
    caseFinalizedStreamIds,
    activeQaGroups,
    trackedQaGroups: activeQaGroups,
    finalizedQaGroups,
    trackedDlqIds,
  };
}

function keyOf(entry: UpstashLiveTrackedStreamId): string {
  return `${entry.stream}\0${entry.id}`;
}

/**
 * Record a stream ID minted by this run's successful XADD only (active set).
 * Foreign / skipped / observed IDs must never be registered here.
 * Rejects IDs already case-finalized.
 */
export function trackRunOwnedStreamId(
  ctx: UpstashLiveMatrixContext,
  entry: UpstashLiveTrackedStreamId,
): void {
  const k = keyOf(entry);
  if (ctx.caseFinalizedStreamIds.some((t) => keyOf(t) === k)) {
    return;
  }
  if (!ctx.runOwnedActiveStreamIds.some((t) => keyOf(t) === k)) {
    ctx.runOwnedActiveStreamIds.push(entry);
  }
}

/** Alias — only run-owned XADD successes. Never foreign IDs. */
export function trackStreamId(
  ctx: UpstashLiveMatrixContext,
  entry: UpstashLiveTrackedStreamId,
): void {
  trackRunOwnedStreamId(ctx, entry);
}

/**
 * Monotonic active → finalized transition for a run-owned stream entry.
 * Returns false if the entry was never active (and not already finalized).
 */
export function markCaseFinalizedStreamId(
  ctx: UpstashLiveMatrixContext,
  entry: UpstashLiveTrackedStreamId,
): boolean {
  const k = keyOf(entry);
  const activeIdx = ctx.runOwnedActiveStreamIds.findIndex(
    (t) => keyOf(t) === k,
  );
  if (activeIdx >= 0) {
    ctx.runOwnedActiveStreamIds.splice(activeIdx, 1);
  } else if (!ctx.caseFinalizedStreamIds.some((t) => keyOf(t) === k)) {
    return false;
  }
  if (!ctx.caseFinalizedStreamIds.some((t) => keyOf(t) === k)) {
    ctx.caseFinalizedStreamIds.push(entry);
  }
  return true;
}

/** True when every active run-owned render entry has been case-finalized. */
export function hasNoActiveRunOwnedRenderEntries(
  ctx: UpstashLiveMatrixContext,
): boolean {
  return !ctx.runOwnedActiveStreamIds.some((t) => t.kind === "render");
}

/** Observation-only — never cleaned via XACK/XDEL. */
export function observeForeignStreamId(
  ctx: UpstashLiveMatrixContext,
  entry: UpstashLiveTrackedStreamId,
): void {
  if (
    !ctx.observedForeignStreamIds.some(
      (t) => t.stream === entry.stream && t.id === entry.id,
    )
  ) {
    ctx.observedForeignStreamIds.push(entry);
  }
}

export function trackQaGroup(
  ctx: UpstashLiveMatrixContext,
  group: string,
): void {
  if (ctx.finalizedQaGroups.includes(group)) return;
  if (!ctx.activeQaGroups.includes(group)) {
    ctx.activeQaGroups.push(group);
  }
}

/** Monotonic active → finalized for a case-scoped QA group. */
export function markQaGroupFinalized(
  ctx: UpstashLiveMatrixContext,
  group: string,
): boolean {
  const idx = ctx.activeQaGroups.indexOf(group);
  if (idx >= 0) {
    ctx.activeQaGroups.splice(idx, 1);
  } else if (!ctx.finalizedQaGroups.includes(group)) {
    return false;
  }
  if (!ctx.finalizedQaGroups.includes(group)) {
    ctx.finalizedQaGroups.push(group);
  }
  return true;
}

export function trackConsumerName(
  ctx: UpstashLiveMatrixContext,
  name: string,
): void {
  if (!ctx.trackedConsumerNames.includes(name)) {
    ctx.trackedConsumerNames.push(name);
  }
}

export function trackDlqId(
  ctx: UpstashLiveMatrixContext,
  entry: UpstashLiveTrackedStreamId,
): void {
  if (
    !ctx.trackedDlqIds.some(
      (t) => t.stream === entry.stream && t.id === entry.id,
    )
  ) {
    ctx.trackedDlqIds.push(entry);
  }
}

export function runScopedConsumerName(
  ctx: UpstashLiveMatrixContext,
  label: string,
): string {
  return `uq_${label}_${ctx.runId.slice(0, 8)}`;
}

/**
 * Seed ownership + insert a coherent queued canonical job into ctx.jobStore.
 * Reuses dual-lease fixture authority (manifest/bundle) then ports the record.
 */
export async function seedQueuedCanonicalJob(
  ctx: UpstashLiveMatrixContext,
): Promise<
  | {
      ok: true;
      jobId: string;
      deliveryId: string;
      attempt: number;
      storeVersion: number;
    }
  | { ok: false; message: string }
> {
  try {
    trackProjectId(ctx, ctx.projectId);
    const claimed = await ctx.projectAuthorization.claimUnownedProject(
      { ownerId: ctx.ownerId, sessionId: `uq_${ctx.runId.slice(0, 8)}` },
      ctx.projectId,
    );
    if (!claimed.ok) {
      // Same-owner re-claim / already owned by this owner is acceptable.
      const access = await ctx.projectAuthorization.assertProjectAccess(
        { ownerId: ctx.ownerId, sessionId: `uq_${ctx.runId.slice(0, 8)}` },
        ctx.projectId,
      );
      if (!access.ok) {
        return { ok: false, message: "project ownership seed failed" };
      }
    }

    const fx = await createQueuedCanonicalJob({
      nowMs: ctx.nowMs,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
    });
    if (
      fx.projectId !== ctx.projectId ||
      fx.manifest.project.projectId !== ctx.projectId ||
      fx.record.canonicalRequest!.ownership.projectId !== ctx.projectId
    ) {
      return {
        ok: false,
        message: "fixture project identity mismatch after fingerprint",
      };
    }

    const record = fx.record;
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
      return { ok: false, message: "jobStore.createIfAbsent failed" };
    }
    // Idempotent create may return existing — ensure queued + unclaimed.
    const stored = await ctx.jobStore.getByJobIdAndOwner(
      record.jobId,
      ctx.ownerId,
    );
    if (!stored.ok || stored.value.stage !== "canonical") {
      return { ok: false, message: "expected canonical job after insert" };
    }
    if (stored.value.canonicalJob!.state !== "queued") {
      const queued = applyHeadlessJobTransition({
        jobValue: stored.value.canonicalJob,
        requestValue: stored.value.canonicalRequest,
        toState: "queued",
        attempt: stored.value.canonicalJob!.attempt,
        updatedAtMs: Math.max(
          ctx.nowMs,
          stored.value.canonicalJob!.updatedAtMs + 1,
        ),
      });
      if (!queued.ok) {
        return { ok: false, message: "queue transition failed" };
      }
      const cas = await ctx.jobStore.compareAndSetTransition({
        jobId: stored.value.jobId,
        ownerId: ctx.ownerId,
        expectedStoreVersion: stored.value.storeVersion,
        next: {
          job: queued.job,
          request: stored.value.canonicalRequest,
          idempotencyAuthorityKey: stored.value.idempotencyAuthorityKey,
          operationId: stored.value.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
        },
      });
      if (!cas.ok || cas.value.kind !== "updated") {
        return { ok: false, message: "queue CAS failed" };
      }
    }

    trackJobId(ctx, record.jobId);
    const deliveryId = stableHeadlessDeliveryId(
      record.jobId,
      record.canonicalJob!.attempt,
    );
    ctx.session.jobId = record.jobId;
    ctx.session.renderDeliveryId = deliveryId;
    return {
      ok: true,
      jobId: record.jobId,
      deliveryId,
      attempt: record.canonicalJob!.attempt,
      storeVersion:
        stored.value.stage === "canonical" ? stored.value.storeVersion : 1,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "seed job failed",
    };
  }
}

export async function seedTerminalCanonicalJob(
  ctx: UpstashLiveMatrixContext,
): Promise<
  | { ok: true; jobId: string; deliveryId: string; attempt: number }
  | { ok: false; message: string }
> {
  const seeded = await seedQueuedCanonicalJob(ctx);
  if (!seeded.ok) return seeded;
  const loaded = await ctx.jobStore.getByJobIdAndOwner(
    seeded.jobId,
    ctx.ownerId,
  );
  if (!loaded.ok || loaded.value.stage !== "canonical") {
    return { ok: false, message: "terminal seed load failed" };
  }
  const failed = applyHeadlessJobTransition({
    jobValue: loaded.value.canonicalJob,
    requestValue: loaded.value.canonicalRequest,
    toState: "failed",
    attempt: loaded.value.canonicalJob!.attempt,
    updatedAtMs: Math.max(
      ctx.nowMs,
      loaded.value.canonicalJob!.updatedAtMs + 1,
    ),
    terminalReason: { reasonId: "WORKER_FAILED", retryable: false },
  });
  if (!failed.ok) return { ok: false, message: "terminal transition failed" };
  const cas = await ctx.jobStore.compareAndSetTransition({
    jobId: seeded.jobId,
    ownerId: ctx.ownerId,
    expectedStoreVersion: loaded.value.storeVersion,
    next: {
      job: failed.job,
      request: loaded.value.canonicalRequest,
      idempotencyAuthorityKey: loaded.value.idempotencyAuthorityKey,
      operationId: loaded.value.operationId,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    },
  });
  if (!cas.ok || cas.value.kind !== "updated") {
    return { ok: false, message: "terminal CAS failed" };
  }
  return {
    ok: true,
    jobId: seeded.jobId,
    deliveryId: seeded.deliveryId,
    attempt: seeded.attempt,
  };
}

export async function seedStagingOwnedObject(
  ctx: UpstashLiveMatrixContext,
): Promise<
  | { ok: true; objectId: string; deliveryId: string; attempt: number }
  | { ok: false; message: string }
> {
  try {
    trackProjectId(ctx, ctx.projectId);
    const objectId = `obj_${randomUUID()}`;
    const jobId = `job_${randomUUID()}`;
    const operationId = `op_${randomUUID()}`;
    trackJobId(ctx, jobId);
    trackObjectId(ctx, objectId);
    const created = await ctx.ownedObjectStore.createStagingRecord({
      objectId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      jobId,
      operationId,
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: `qa/uq/${ctx.runId.slice(0, 8)}/${objectId}`,
      createdAtMs: ctx.nowMs,
      expectedContentDigestClaim: `sha256:${"ab".repeat(32)}`,
      expectedByteLength: 64,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: ctx.nowMs,
      uploadCapabilityExpiresAtMs: ctx.nowMs + 60_000,
      expiresAtMs: ctx.nowMs + 3_600_000,
    });
    if (!created.ok) {
      return { ok: false, message: "staging create failed" };
    }
    const attempt = 1;
    const deliveryId = stableHeadlessVerifyDeliveryId(objectId, attempt);
    ctx.session.ownedObjectId = objectId;
    ctx.session.verifyDeliveryId = deliveryId;
    return { ok: true, objectId, deliveryId, attempt };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "staging seed failed",
    };
  }
}

export function emptyUpstashLiveSession(): UpstashLiveMatrixContext["session"] {
  return {
    renderStreamId: null,
    verifyStreamId: null,
    renderDeliveryId: null,
    verifyDeliveryId: null,
    jobId: null,
    claimToken: null,
    ownedObjectId: null,
    consumerA: null,
    consumerB: null,
    recoveryStreamId: null,
    recoveryJobId: null,
    dlqStreamId: null,
  };
}
