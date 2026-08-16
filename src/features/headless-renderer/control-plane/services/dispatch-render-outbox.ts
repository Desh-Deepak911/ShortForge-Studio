/**
 * Durable outbox dispatch worker — claim due intent → reread job → XADD →
 * mark dispatched. Every outbox CAS result is checked exhaustively; outcomes
 * never invent retryability or terminal rejection without durable confirmation.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessRenderDispatchOutboxPort } from "../ports/render-dispatch-outbox.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import type { HeadlessQueueProviderId } from "../runtime/queue-provider";
import {
  isCanonicalStoredJobRecord,
  type HeadlessCanonicalStoredJobRecord,
} from "../types/stored-job-record";
import { isHeadlessTerminalState } from "../../domain/headless-render-constants";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneErrorCode,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import {
  headlessDispatchBackoffMs,
  type HeadlessRenderDispatchRejectReasonId,
  type HeadlessStoredRenderDispatchOutbox,
} from "../types/render-dispatch-outbox";
import { stableHeadlessDeliveryId } from "./stable-delivery-id";

export const HEADLESS_DISPATCH_OUTBOX_DEFAULT_BATCH = 25;
export const HEADLESS_DISPATCH_OUTBOX_DEFAULT_INTERVAL_MS = 15_000;
export const HEADLESS_DISPATCH_OUTBOX_CLAIM_LEASE_MS = 60_000;

export type DispatchRenderOutboxOnceSuccess = {
  readonly scanned: number;
  readonly claimed: number;
  readonly dispatched: number;
  readonly rescheduled: number;
  readonly rejected: number;
  readonly unconfirmed: number;
  readonly skipped: number;
};

export type DispatchSingleOutboxResultKind =
  | "dispatched"
  | "dispatch_pending"
  | "dispatch_unconfirmed"
  | "already_dispatched"
  | "rejected"
  | "claim_rejected"
  | "aborted_released"
  | "aborted_unconfirmed"
  | "job_reread_failed_released"
  | "job_reread_failed_unconfirmed";

export type DispatchSingleOutboxResult = {
  readonly kind: DispatchSingleOutboxResultKind;
  readonly deliveryId: string | null;
  /** Present on job-reread failure paths — never raw provider text. */
  readonly safeControlPlaneCode?: HeadlessControlPlaneErrorCode | null;
  readonly rejectReasonId?: HeadlessRenderDispatchRejectReasonId | null;
};

type ClaimedPrior = {
  readonly retryCount: number;
  readonly storeVersion: number;
};

function okResult(
  value: DispatchSingleOutboxResult,
): HeadlessControlPlaneResult<DispatchSingleOutboxResult> {
  return cpOk(Object.freeze(value));
}

function isConfirmedPendingRelease(
  released: HeadlessControlPlaneResult<
    | {
        readonly kind: "pending";
        readonly record: HeadlessStoredRenderDispatchOutbox;
      }
    | { readonly kind: "stale" }
    | { readonly kind: "rejected" }
    | {
        readonly kind: "already_terminal";
        readonly record: HeadlessStoredRenderDispatchOutbox;
      }
  >,
  prior: ClaimedPrior,
  nowMs: number,
):
  | { readonly confirmed: true; readonly record: HeadlessStoredRenderDispatchOutbox }
  | {
      readonly confirmed: false;
      readonly terminal?: HeadlessStoredRenderDispatchOutbox;
    } {
  if (!released.ok) return { confirmed: false };
  if (released.value.kind === "already_terminal") {
    return { confirmed: false, terminal: released.value.record };
  }
  if (released.value.kind !== "pending") return { confirmed: false };
  const record = released.value.record;
  const expectedRetry = prior.retryCount + 1;
  const expectedVersion = prior.storeVersion + 1;
  const expectedNext =
    nowMs + headlessDispatchBackoffMs(expectedRetry);
  if (
    record.state !== "pending" ||
    record.claimToken !== null ||
    record.claimedAtMs !== null ||
    record.retryCount !== expectedRetry ||
    record.storeVersion !== expectedVersion ||
    record.nextAttemptAtMs !== expectedNext
  ) {
    return { confirmed: false };
  }
  return { confirmed: true, record };
}

function interpretRejectCas(
  rejected: HeadlessControlPlaneResult<
    | {
        readonly kind: "rejected";
        readonly record: HeadlessStoredRenderDispatchOutbox;
      }
    | { readonly kind: "stale" }
    | {
        readonly kind: "already_terminal";
        readonly record: HeadlessStoredRenderDispatchOutbox;
      }
  >,
  reasonId: HeadlessRenderDispatchRejectReasonId,
  deliveryId: string,
): DispatchSingleOutboxResult {
  if (!rejected.ok) {
    return { kind: "dispatch_unconfirmed", deliveryId };
  }
  if (rejected.value.kind === "rejected") {
    const record = rejected.value.record;
    if (
      record.state === "rejected" &&
      record.rejectReasonId === reasonId
    ) {
      return {
        kind: "rejected",
        deliveryId,
        rejectReasonId: reasonId,
      };
    }
    return { kind: "dispatch_unconfirmed", deliveryId };
  }
  if (rejected.value.kind === "already_terminal") {
    const record = rejected.value.record;
    if (record.state === "dispatched") {
      return { kind: "already_dispatched", deliveryId };
    }
    if (
      record.state === "rejected" &&
      record.rejectReasonId === reasonId
    ) {
      return {
        kind: "rejected",
        deliveryId,
        rejectReasonId: reasonId,
      };
    }
    // Divergent terminal reason or unexpected terminal shape.
    return { kind: "dispatch_unconfirmed", deliveryId };
  }
  return { kind: "dispatch_unconfirmed", deliveryId };
}

function isCoherentLiveRenderClaim(
  record: HeadlessCanonicalStoredJobRecord,
  attempt: number,
): boolean {
  if (record.canonicalJob.attempt !== attempt) return false;
  if (record.claimToken == null || record.claimedAtMs == null) return false;
  if (isHeadlessTerminalState(record.canonicalJob.state)) return false;
  // Pre-dispatch cancellation / still-queued is not delivery proof.
  if (record.canonicalJob.state === "queued") return false;
  return (
    record.canonicalJob.state === "rendering" ||
    record.canonicalJob.state === "encoding" ||
    record.canonicalJob.state === "validating" ||
    record.canonicalJob.state === "uploading"
  );
}

async function deliverNeonWakeOrFailClosed(input: {
  readonly wake?: HeadlessWorkerWakePort;
  readonly nowMs: number;
}): Promise<{ readonly ok: boolean }> {
  if (input.wake == null) {
    return { ok: false };
  }
  const woken = await input.wake.wake({ nowMs: input.nowMs });
  if (!woken.ok || woken.value.kind === "failed") {
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Dispatch one claimed (or claimable) outbox intent.
 */
export async function dispatchRenderOutboxIntentOnce(input: {
  readonly outbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly dispatchId: string;
  readonly ownerId: string;
  readonly nowMs: number;
  readonly claimLeaseMs?: number;
  readonly signal?: AbortSignal;
  /** When set, skip claim and use this token (immediate post-promote path). */
  readonly existingClaim?: {
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
  };
  /**
   * Neon path wakes the worker instead of XADD. Missing wake fails closed
   * (backoff, job stays queued). Never dual-enqueues.
   */
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
}): Promise<HeadlessControlPlaneResult<DispatchSingleOutboxResult>> {
  // Pre-claim abort with no injected claim — nothing held to release.
  if (input.signal?.aborted && input.existingClaim == null) {
    return okResult({ kind: "aborted_released", deliveryId: null });
  }

  let claimToken: string;
  let expectedStoreVersion: number;
  let deliveryId: string;
  let prior: ClaimedPrior;

  if (input.existingClaim) {
    const loaded = await input.outbox.getByDispatchIdAndOwner(
      input.dispatchId,
      input.ownerId,
    );
    if (!loaded.ok) return loaded;
    if (loaded.value.state === "dispatched") {
      return okResult({
        kind: "already_dispatched",
        deliveryId: loaded.value.intent.deliveryId,
      });
    }
    if (loaded.value.state === "rejected") {
      return okResult({
        kind: "rejected",
        deliveryId: loaded.value.intent.deliveryId,
        rejectReasonId: loaded.value.rejectReasonId,
      });
    }
    // Exact claim pairing + immutable dispatch/delivery identity pair.
    // Stable job/attempt form is enforced later (DELIVERY_MISMATCH), not here.
    const exactClaim =
      loaded.value.intent.dispatchId === input.dispatchId &&
      loaded.value.intent.ownerId === input.ownerId &&
      loaded.value.state === "claimed" &&
      loaded.value.claimToken === input.existingClaim.claimToken &&
      loaded.value.storeVersion === input.existingClaim.expectedStoreVersion &&
      loaded.value.intent.deliveryId === loaded.value.intent.dispatchId;
    if (!exactClaim) {
      return okResult({ kind: "claim_rejected", deliveryId: null });
    }
    claimToken = input.existingClaim.claimToken;
    expectedStoreVersion = input.existingClaim.expectedStoreVersion;
    deliveryId = loaded.value.intent.deliveryId;
    prior = {
      retryCount: loaded.value.retryCount,
      storeVersion: loaded.value.storeVersion,
    };
  } else {
    const claimed = await input.outbox.claimDue({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken: randomUUID(),
      nowMs: input.nowMs,
      claimLeaseMs:
        input.claimLeaseMs ?? HEADLESS_DISPATCH_OUTBOX_CLAIM_LEASE_MS,
    });
    if (!claimed.ok) return claimed;
    if (claimed.value.kind === "already_terminal") {
      return okResult({
        kind:
          claimed.value.record.state === "dispatched"
            ? "already_dispatched"
            : "rejected",
        deliveryId: claimed.value.record.intent.deliveryId,
        rejectReasonId: claimed.value.record.rejectReasonId,
      });
    }
    if (claimed.value.kind !== "claimed") {
      return okResult({ kind: "claim_rejected", deliveryId: null });
    }
    claimToken = claimed.value.record.claimToken!;
    expectedStoreVersion = claimed.value.record.storeVersion;
    deliveryId = claimed.value.record.intent.deliveryId;
    prior = {
      retryCount: claimed.value.record.retryCount,
      storeVersion: claimed.value.record.storeVersion,
    };
  }

  if (input.signal?.aborted) {
    const released = await input.outbox.releaseWithBackoff({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
    });
    const confirmed = isConfirmedPendingRelease(released, prior, input.nowMs);
    if (confirmed.confirmed) {
      return okResult({ kind: "aborted_released", deliveryId });
    }
    if (confirmed.terminal?.state === "dispatched") {
      return okResult({ kind: "already_dispatched", deliveryId });
    }
    if (confirmed.terminal?.state === "rejected") {
      return okResult({
        kind: "rejected",
        deliveryId,
        rejectReasonId: confirmed.terminal.rejectReasonId,
      });
    }
    return okResult({ kind: "aborted_unconfirmed", deliveryId });
  }

  const outboxRow = await input.outbox.getByDispatchIdAndOwner(
    input.dispatchId,
    input.ownerId,
  );
  if (!outboxRow.ok) return outboxRow;
  const intent = outboxRow.value.intent;

  const canonical = await input.jobStore.getByJobIdAndOwner(
    intent.jobId,
    input.ownerId,
  );
  if (!canonical.ok) {
    const safeCode = canonical.issues[0]?.code ?? "DATABASE_UNAVAILABLE";
    // Authoritative absence → permanent reject. Provider/outage codes → release.
    if (safeCode === "JOB_NOT_FOUND") {
      const rejected = await input.outbox.reject({
        dispatchId: input.dispatchId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion,
        nowMs: input.nowMs,
        reasonId: "JOB_NOT_FOUND",
      });
      return okResult(
        interpretRejectCas(rejected, "JOB_NOT_FOUND", deliveryId),
      );
    }
    const released = await input.outbox.releaseWithBackoff({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
    });
    const confirmed = isConfirmedPendingRelease(released, prior, input.nowMs);
    if (confirmed.confirmed) {
      return okResult({
        kind: "job_reread_failed_released",
        deliveryId,
        safeControlPlaneCode: safeCode,
      });
    }
    return okResult({
      kind: "job_reread_failed_unconfirmed",
      deliveryId,
      safeControlPlaneCode: safeCode,
    });
  }

  const expectedDelivery = stableHeadlessDeliveryId(
    intent.jobId,
    intent.attempt,
  );
  if (
    intent.deliveryId !== expectedDelivery ||
    deliveryId !== expectedDelivery
  ) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "DELIVERY_MISMATCH",
    });
    return okResult(
      interpretRejectCas(rejected, "DELIVERY_MISMATCH", deliveryId),
    );
  }

  if (!isCanonicalStoredJobRecord(canonical.value)) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_NOT_FOUND",
    });
    return okResult(interpretRejectCas(rejected, "JOB_NOT_FOUND", deliveryId));
  }

  const record = canonical.value;
  if (record.ownerId !== intent.ownerId) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_MISMATCH",
    });
    return okResult(interpretRejectCas(rejected, "JOB_MISMATCH", deliveryId));
  }
  if (record.canonicalJob.attempt !== intent.attempt) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_MISMATCH",
    });
    return okResult(interpretRejectCas(rejected, "JOB_MISMATCH", deliveryId));
  }
  if (isHeadlessTerminalState(record.canonicalJob.state)) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_TERMINAL",
    });
    return okResult(interpretRejectCas(rejected, "JOB_TERMINAL", deliveryId));
  }
  if (record.canonicalJob.state !== "queued") {
    // Optional delivered-by-claim: coherent live render claim for same attempt
    // is positive evidence delivery was consumed — resolve without another XADD.
    if (isCoherentLiveRenderClaim(record, intent.attempt)) {
      const marked = await input.outbox.markDispatched({
        dispatchId: input.dispatchId,
        ownerId: input.ownerId,
        claimToken,
        expectedStoreVersion,
        nowMs: input.nowMs,
      });
      if (!marked.ok) {
        return okResult({ kind: "dispatch_unconfirmed", deliveryId });
      }
      if (marked.value.kind === "dispatched") {
        return okResult({ kind: "dispatched", deliveryId });
      }
      if (
        marked.value.kind === "already_terminal" &&
        marked.value.record.state === "dispatched"
      ) {
        return okResult({ kind: "already_dispatched", deliveryId });
      }
      return okResult({ kind: "dispatch_unconfirmed", deliveryId });
    }
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_NOT_QUEUED",
    });
    return okResult(interpretRejectCas(rejected, "JOB_NOT_QUEUED", deliveryId));
  }
  if (record.claimToken != null) {
    const rejected = await input.outbox.reject({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
      reasonId: "JOB_CLAIMED",
    });
    return okResult(interpretRejectCas(rejected, "JOB_CLAIMED", deliveryId));
  }

  const delivered =
    input.queueProvider === "neon"
      ? await deliverNeonWakeOrFailClosed(input)
      : await input.streamQueue.enqueueRender({
          deliveryKind: "render",
          jobId: intent.jobId,
          ownerId: intent.ownerId,
          attempt: intent.attempt,
          deliveryId: intent.deliveryId,
          enqueuedAtMs: input.nowMs,
        });

  if (!delivered.ok) {
    const released = await input.outbox.releaseWithBackoff({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      expectedStoreVersion,
      nowMs: input.nowMs,
    });
    const confirmed = isConfirmedPendingRelease(released, prior, input.nowMs);
    if (confirmed.confirmed) {
      return okResult({ kind: "dispatch_pending", deliveryId });
    }
    if (confirmed.terminal?.state === "dispatched") {
      return okResult({ kind: "already_dispatched", deliveryId });
    }
    return okResult({ kind: "dispatch_unconfirmed", deliveryId });
  }

  const marked = await input.outbox.markDispatched({
    dispatchId: input.dispatchId,
    ownerId: input.ownerId,
    claimToken,
    expectedStoreVersion,
    nowMs: input.nowMs,
  });
  if (!marked.ok) {
    return await convergeOrUnconfirmedAfterXadd({
      outbox: input.outbox,
      jobStore: input.jobStore,
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken,
      deliveryId,
      attempt: intent.attempt,
      jobId: intent.jobId,
      nowMs: input.nowMs,
    });
  }
  if (marked.value.kind === "dispatched") {
    return okResult({ kind: "dispatched", deliveryId });
  }
  if (marked.value.kind === "already_terminal") {
    if (marked.value.record.state === "dispatched") {
      return okResult({ kind: "already_dispatched", deliveryId });
    }
    return okResult({ kind: "dispatch_unconfirmed", deliveryId });
  }
  // stale/rejected after successful XADD — never release back to pending.
  return await convergeOrUnconfirmedAfterXadd({
    outbox: input.outbox,
    jobStore: input.jobStore,
    dispatchId: input.dispatchId,
    ownerId: input.ownerId,
    claimToken,
    deliveryId,
    attempt: intent.attempt,
    jobId: intent.jobId,
    nowMs: input.nowMs,
  });
}

async function convergeOrUnconfirmedAfterXadd(input: {
  readonly outbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly dispatchId: string;
  readonly ownerId: string;
  readonly claimToken: string;
  readonly deliveryId: string;
  readonly attempt: number;
  readonly jobId: string;
  readonly nowMs: number;
}): Promise<HeadlessControlPlaneResult<DispatchSingleOutboxResult>> {
  const currentOutbox = await input.outbox.getByDispatchIdAndOwner(
    input.dispatchId,
    input.ownerId,
  );
  if (!currentOutbox.ok) {
    return okResult({ kind: "dispatch_unconfirmed", deliveryId: input.deliveryId });
  }
  if (currentOutbox.value.state === "dispatched") {
    return okResult({
      kind: "already_dispatched",
      deliveryId: input.deliveryId,
    });
  }
  if (
    currentOutbox.value.state !== "claimed" ||
    currentOutbox.value.claimToken !== input.claimToken
  ) {
    return okResult({ kind: "dispatch_unconfirmed", deliveryId: input.deliveryId });
  }

  const job = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (
    job.ok &&
    isCanonicalStoredJobRecord(job.value) &&
    isCoherentLiveRenderClaim(job.value, input.attempt)
  ) {
    const marked = await input.outbox.markDispatched({
      dispatchId: input.dispatchId,
      ownerId: input.ownerId,
      claimToken: input.claimToken,
      expectedStoreVersion: currentOutbox.value.storeVersion,
      nowMs: input.nowMs,
    });
    if (
      marked.ok &&
      (marked.value.kind === "dispatched" ||
        (marked.value.kind === "already_terminal" &&
          marked.value.record.state === "dispatched"))
    ) {
      return okResult({
        kind:
          marked.value.kind === "dispatched"
            ? "dispatched"
            : "already_dispatched",
        deliveryId: input.deliveryId,
      });
    }
  }
  return okResult({ kind: "dispatch_unconfirmed", deliveryId: input.deliveryId });
}

/**
 * One bounded sweep over due pending outbox intents.
 */
export async function dispatchRenderOutboxOnce(input: {
  readonly outbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly limit?: number;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
}): Promise<HeadlessControlPlaneResult<DispatchRenderOutboxOnceSuccess>> {
  if (input.signal?.aborted) {
    return cpFail("OPERATION_ABORTED", "Dispatch outbox sweep aborted.");
  }
  const limit = input.limit ?? HEADLESS_DISPATCH_OUTBOX_DEFAULT_BATCH;
  const listed = await input.outbox.listDuePending({
    limit,
    nowMs: input.nowMs,
  });
  if (!listed.ok) return listed;

  let claimed = 0;
  let dispatched = 0;
  let rescheduled = 0;
  let rejected = 0;
  let unconfirmed = 0;
  let skipped = 0;

  for (const row of listed.value) {
    if (input.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Dispatch outbox sweep aborted.");
    }
    const result = await dispatchRenderOutboxIntentOnce({
      outbox: input.outbox,
      jobStore: input.jobStore,
      streamQueue: input.streamQueue,
      queueProvider: input.queueProvider,
      wake: input.wake,
      dispatchId: row.intent.dispatchId,
      ownerId: row.intent.ownerId,
      nowMs: input.nowMs,
      signal: input.signal,
    });
    if (!result.ok) return result;
    switch (result.value.kind) {
      case "dispatched":
      case "already_dispatched":
        claimed += 1;
        dispatched += 1;
        break;
      case "dispatch_pending":
      case "job_reread_failed_released":
        claimed += 1;
        rescheduled += 1;
        break;
      case "dispatch_unconfirmed":
      case "aborted_unconfirmed":
      case "job_reread_failed_unconfirmed":
        claimed += 1;
        unconfirmed += 1;
        break;
      case "rejected":
        claimed += 1;
        rejected += 1;
        break;
      case "claim_rejected":
      case "aborted_released":
        skipped += 1;
        break;
      default:
        skipped += 1;
    }
  }

  return cpOk(
    Object.freeze({
      scanned: listed.value.length,
      claimed,
      dispatched,
      rescheduled,
      rejected,
      unconfirmed,
      skipped,
    }),
  );
}

/**
 * Hosted outbox scheduler — one-at-a-time sweeps, stoppable on shutdown.
 */
export function createRenderDispatchOutboxScheduler(input: {
  readonly outbox: HeadlessRenderDispatchOutboxPort;
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly nowMs?: () => number;
  readonly intervalMs?: number;
  readonly batchLimit?: number;
  readonly queueProvider?: HeadlessQueueProviderId;
  readonly wake?: HeadlessWorkerWakePort;
  readonly onSweep?: (
    result: HeadlessControlPlaneResult<DispatchRenderOutboxOnceSuccess>,
  ) => void;
}): {
  readonly runOnce: () => Promise<
    HeadlessControlPlaneResult<DispatchRenderOutboxOnceSuccess>
  >;
  readonly start: () => void;
  readonly stop: (options?: {
    readonly drainDeadlineMs?: number;
  }) => Promise<"drained" | "deadline_exceeded">;
  readonly isRunning: () => boolean;
  readonly isSweepActive: () => boolean;
  readonly requestForcedAbort: () => void;
} {
  const nowMs = input.nowMs ?? (() => Date.now());
  const intervalMs =
    input.intervalMs ?? HEADLESS_DISPATCH_OUTBOX_DEFAULT_INTERVAL_MS;
  const batchLimit =
    input.batchLimit ?? HEADLESS_DISPATCH_OUTBOX_DEFAULT_BATCH;

  let accepting = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sweepActive = false;
  let sweepPromise: Promise<void> | null = null;
  const abort = new AbortController();

  const runOnce = async () => {
    if (!accepting || abort.signal.aborted) {
      return cpFail("OPERATION_ABORTED", "Dispatch outbox stopped.");
    }
    if (sweepActive) {
      return cpOk(
        Object.freeze({
          scanned: 0,
          claimed: 0,
          dispatched: 0,
          rescheduled: 0,
          rejected: 0,
          unconfirmed: 0,
          skipped: 0,
        }),
      );
    }
    sweepActive = true;
    try {
      const result = await dispatchRenderOutboxOnce({
        outbox: input.outbox,
        jobStore: input.jobStore,
        streamQueue: input.streamQueue,
        limit: batchLimit,
        nowMs: nowMs(),
        signal: abort.signal,
        queueProvider: input.queueProvider,
        wake: input.wake,
      });
      input.onSweep?.(result);
      return result;
    } finally {
      sweepActive = false;
    }
  };

  const start = () => {
    if (timer != null || !accepting) return;
    timer = setInterval(() => {
      if (!accepting || sweepActive) return;
      sweepPromise = runOnce().then(() => undefined);
    }, intervalMs);
    timer.unref?.();
  };

  const requestForcedAbort = () => {
    accepting = false;
    abort.abort();
  };

  const stop = async (options?: {
    readonly drainDeadlineMs?: number;
  }): Promise<"drained" | "deadline_exceeded"> => {
    accepting = false;
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    const deadlineMs = options?.drainDeadlineMs ?? 5_000;
    const started = Date.now();
    if (sweepPromise != null) {
      await Promise.race([
        sweepPromise.catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, deadlineMs)),
      ]);
    }
    while (sweepActive && Date.now() - started < deadlineMs) {
      await new Promise((r) => setTimeout(r, 10));
    }
    if (sweepActive) {
      abort.abort();
      return "deadline_exceeded";
    }
    return "drained";
  };

  return {
    runOnce,
    start,
    stop,
    isRunning: () => timer != null && accepting,
    isSweepActive: () => sweepActive,
    requestForcedAbort,
  };
}
