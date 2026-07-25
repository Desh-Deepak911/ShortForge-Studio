/**
 * Explicit bounded ensure of a pending dispatch intent for an existing
 * canonical queued job (legacy/test paths). Authoritative reread first.
 */

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessRenderDispatchOutboxPort } from "../ports/render-dispatch-outbox.port";
import { isCanonicalStoredJobRecord } from "../types/stored-job-record";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../types/control-plane.types";
import { stableHeadlessDeliveryId } from "./stable-delivery-id";
import type { HeadlessStoredRenderDispatchOutbox } from "../types/render-dispatch-outbox";

export async function ensureDispatchIntentForQueuedJob(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly dispatchOutbox: HeadlessRenderDispatchOutboxPort;
  readonly jobId: string;
  readonly ownerId: string;
  readonly nowMs: number;
}): Promise<
  HeadlessControlPlaneResult<{
    readonly kind: "created" | "existing";
    readonly record: HeadlessStoredRenderDispatchOutbox;
  }>
> {
  const loaded = await input.jobStore.getByJobIdAndOwner(
    input.jobId,
    input.ownerId,
  );
  if (!loaded.ok) return loaded;
  if (!isCanonicalStoredJobRecord(loaded.value)) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Dispatch ensure requires a canonical job.",
    );
  }
  if (loaded.value.canonicalJob.state !== "queued") {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Dispatch ensure requires queued state.",
    );
  }
  if (loaded.value.claimToken != null) {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Dispatch ensure rejects claimed jobs.",
    );
  }

  const deliveryId = stableHeadlessDeliveryId(
    loaded.value.jobId,
    loaded.value.canonicalJob.attempt,
  );
  const ensured = await input.dispatchOutbox.ensurePending({
    jobId: loaded.value.jobId,
    ownerId: loaded.value.ownerId,
    projectId: loaded.value.projectId,
    attempt: loaded.value.canonicalJob.attempt,
    deliveryId,
    nowMs: input.nowMs,
  });
  if (!ensured.ok) return ensured;
  return cpOk(ensured.value);
}
