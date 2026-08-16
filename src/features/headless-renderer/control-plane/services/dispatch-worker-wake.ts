/**
 * After a queued job commits, wake the worker once.
 * Reuses the render-dispatch outbox as the wake intent.
 * Fly start failure leaves the job queued and retries the outbox.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessRenderDispatchOutboxPort } from "../ports/render-dispatch-outbox.port";
import type { HeadlessWorkerWakePort } from "../ports/worker-wake.port";
import { HEADLESS_DISPATCH_OUTBOX_CLAIM_LEASE_MS } from "./dispatch-render-outbox";
import { ensureDispatchIntentForQueuedJob } from "./ensure-dispatch-intent-for-queued-job";
import { isCanonicalStoredJobRecord } from "../types/stored-job-record";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type DispatchWorkerWakeKind =
  | "woken"
  | "already_running"
  | "already_dispatched"
  | "failed_queued"
  | "skipped_not_queued";

export async function dispatchWorkerWakeAfterQueuedCommit(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly outbox: HeadlessRenderDispatchOutboxPort;
  readonly wake: HeadlessWorkerWakePort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
}): Promise<HeadlessControlPlaneResult<{ readonly kind: DispatchWorkerWakeKind }>> {
  const loaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!loaded.ok) return loaded;
  if (
    !isCanonicalStoredJobRecord(loaded.value) ||
    loaded.value.canonicalJob.state !== "queued" ||
    loaded.value.claimToken != null
  ) {
    return cpOk({ kind: "skipped_not_queued" });
  }

  const ensured = await ensureDispatchIntentForQueuedJob({
    dispatchOutbox: input.outbox,
    jobStore: input.jobStore,
    jobId: input.jobId,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
  });
  if (!ensured.ok) return ensured;

  const existing = await input.outbox.getByJobAttemptAndOwner({
    jobId: input.jobId,
    attempt: loaded.value.canonicalJob.attempt,
    ownerId: input.ownerId,
  });
  if (!existing.ok) return existing;
  if (existing.value == null) {
    return cpOk({ kind: "failed_queued" });
  }
  if (existing.value.state === "dispatched") {
    const retry = await input.wake.wake({ nowMs: input.nowMs });
    if (!retry.ok) return retry;
    if (retry.value.kind === "failed") {
      return cpOk({ kind: "failed_queued" });
    }
    return cpOk({
      kind:
        retry.value.kind === "already_running" ? "already_running" : "woken",
    });
  }

  const claimed = await input.outbox.claimDue({
    dispatchId: existing.value.intent.dispatchId,
    ownerId: input.ownerId,
    claimToken: randomUUID(),
    nowMs: input.nowMs,
    claimLeaseMs: HEADLESS_DISPATCH_OUTBOX_CLAIM_LEASE_MS,
  });
  if (!claimed.ok) return claimed;
  if (claimed.value.kind === "already_terminal") {
    const retry = await input.wake.wake({ nowMs: input.nowMs });
    if (!retry.ok) return retry;
    return cpOk({
      kind:
        claimed.value.record.state === "dispatched"
          ? "already_dispatched"
          : "failed_queued",
    });
  }
  if (claimed.value.kind !== "claimed") {
    return cpOk({ kind: "failed_queued" });
  }

  const woken = await input.wake.wake({ nowMs: input.nowMs });
  if (!woken.ok || woken.value.kind === "failed") {
    await input.outbox.releaseWithBackoff({
      dispatchId: claimed.value.record.intent.dispatchId,
      ownerId: input.ownerId,
      claimToken: claimed.value.record.claimToken ?? "",
      expectedStoreVersion: claimed.value.record.storeVersion,
      nowMs: input.nowMs,
    });
    return cpOk({ kind: "failed_queued" });
  }

  const marked = await input.outbox.markDispatched({
    dispatchId: claimed.value.record.intent.dispatchId,
    ownerId: input.ownerId,
    claimToken: claimed.value.record.claimToken ?? "",
    expectedStoreVersion: claimed.value.record.storeVersion,
    nowMs: input.nowMs,
  });
  if (!marked.ok || marked.value.kind !== "dispatched") {
    return cpOk({ kind: "failed_queued" });
  }
  return cpOk({
    kind: woken.value.kind === "already_running" ? "already_running" : "woken",
  });
}
