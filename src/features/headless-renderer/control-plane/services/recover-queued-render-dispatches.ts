/**
 * Provider-neutral recovery for canonical queued jobs that lack a live
 * render delivery (promoted_dispatch_pending after XADD failure).
 *
 * Neon job record remains authority. Recovery never mints job/attempt/
 * fingerprint identities and never fails a job because XADD failed.
 */

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessStreamQueuePort } from "../ports/stream-queue.port";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import { isCanonicalStoredJobRecord } from "../types/stored-job-record";
import { stableHeadlessDeliveryId } from "./stable-delivery-id";

export const HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_BATCH = 25;
export const HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_INTERVAL_MS = 15_000;

export type RecoverQueuedRenderDispatchesOnceSuccess = {
  readonly scanned: number;
  readonly enqueued: number;
  readonly skipped: number;
  readonly failed: number;
  readonly deliveryIds: readonly string[];
};

/**
 * One bounded sweep: list candidates → authoritative reread → stable XADD.
 */
export async function recoverQueuedRenderDispatchesOnce(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly limit?: number;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
}): Promise<
  HeadlessControlPlaneResult<RecoverQueuedRenderDispatchesOnceSuccess>
> {
  if (input.signal?.aborted) {
    return cpFail("OPERATION_ABORTED", "Queued dispatch recovery aborted.");
  }

  const limit =
    input.limit ?? HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_BATCH;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1000
  ) {
    return cpFail("INVALID_TRANSPORT", "Recovery batch limit is invalid.");
  }

  const listed = await input.jobStore.listCanonicalQueuedDispatchCandidates(
    limit,
  );
  if (!listed.ok) {
    // Outage must not look like an empty queue.
    return listed;
  }

  let enqueued = 0;
  let skipped = 0;
  let failed = 0;
  const deliveryIds: string[] = [];

  for (const candidate of listed.value) {
    if (input.signal?.aborted) {
      return cpFail("OPERATION_ABORTED", "Queued dispatch recovery aborted.");
    }

    const reread = await input.jobStore.getByJobIdAndOwner(
      candidate.jobId,
      candidate.ownerId,
    );
    if (!reread.ok) {
      return reread;
    }
    const record = reread.value;
    if (
      !isCanonicalStoredJobRecord(record) ||
      record.canonicalJob.state !== "queued" ||
      record.claimToken != null
    ) {
      skipped += 1;
      continue;
    }
    if (
      record.canonicalJob.attempt !== candidate.attempt ||
      record.ownerId !== candidate.ownerId
    ) {
      skipped += 1;
      continue;
    }

    const deliveryId = stableHeadlessDeliveryId(
      record.jobId,
      record.canonicalJob.attempt,
    );
    const enqueue = await input.streamQueue.enqueueRender({
      deliveryId,
      jobId: record.jobId,
      ownerId: record.ownerId,
      attempt: record.canonicalJob.attempt,
      enqueuedAtMs: input.nowMs,
      deliveryKind: "render",
    });
    if (!enqueue.ok) {
      // Leave queued unchanged for a later sweep.
      failed += 1;
      continue;
    }
    enqueued += 1;
    deliveryIds.push(deliveryId);
  }

  return cpOk(
    Object.freeze({
      scanned: listed.value.length,
      enqueued,
      skipped,
      failed,
      deliveryIds: Object.freeze(deliveryIds),
    }),
  );
}

/**
 * Hosted recovery scheduler — one-at-a-time sweeps, stoppable on shutdown.
 */
export function createQueuedDispatchRecoveryScheduler(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly streamQueue: Pick<HeadlessStreamQueuePort, "enqueueRender">;
  readonly nowMs?: () => number;
  readonly intervalMs?: number;
  readonly batchLimit?: number;
  readonly onSweep?: (
    result: HeadlessControlPlaneResult<RecoverQueuedRenderDispatchesOnceSuccess>,
  ) => void;
}): {
  readonly runOnce: () => Promise<
    HeadlessControlPlaneResult<RecoverQueuedRenderDispatchesOnceSuccess>
  >;
  readonly start: () => void;
  readonly stop: () => Promise<void>;
  readonly isRunning: () => boolean;
  readonly isSweepActive: () => boolean;
} {
  const nowMs = input.nowMs ?? (() => Date.now());
  const intervalMs =
    input.intervalMs ?? HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_INTERVAL_MS;
  const batchLimit =
    input.batchLimit ?? HEADLESS_QUEUED_DISPATCH_RECOVERY_DEFAULT_BATCH;

  let accepting = true;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sweepActive = false;
  let sweepPromise: Promise<void> | null = null;
  const abort = new AbortController();

  const runOnce = async () => {
    if (!accepting || abort.signal.aborted) {
      return cpFail("OPERATION_ABORTED", "Queued dispatch recovery stopped.");
    }
    if (sweepActive) {
      // Concurrent sweeps must not widen authority.
      return cpOk(
        Object.freeze({
          scanned: 0,
          enqueued: 0,
          skipped: 0,
          failed: 0,
          deliveryIds: Object.freeze([] as string[]),
        }),
      );
    }
    sweepActive = true;
    try {
      const result = await recoverQueuedRenderDispatchesOnce({
        jobStore: input.jobStore,
        streamQueue: input.streamQueue,
        limit: batchLimit,
        nowMs: nowMs(),
        signal: abort.signal,
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

  const stop = async () => {
    accepting = false;
    abort.abort();
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
    if (sweepPromise != null) {
      await sweepPromise.catch(() => undefined);
    }
    // Drain in-flight runOnce not tracked via interval.
    while (sweepActive) {
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  return {
    runOnce,
    start,
    stop,
    isRunning: () => timer != null && accepting,
    isSweepActive: () => sweepActive,
  };
}
