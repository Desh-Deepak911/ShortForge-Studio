/**
 * Real local worker runner — claim before ack; post-claim via shared executor.
 */

import { randomUUID } from "node:crypto";

import type { HeadlessArtifactCleanupPort } from "../../control-plane/ports/artifact-cleanup.port";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type { HeadlessQueuePort } from "../../control-plane/ports/queue.port";
import type { HeadlessStoragePort } from "../../control-plane/ports/storage.port";
import {
  cpFail,
  cpOk,
  type HeadlessControlPlaneResult,
} from "../../control-plane/types/control-plane.types";
import {
  executeClaimedRender,
  type HeadlessOrphanCleanupReport,
} from "./execute-claimed-render";
import {
  DEFAULT_HEADLESS_WORKER_LIMITS,
  type HeadlessWorkerArtifactEvidence,
  type HeadlessWorkerLimits,
} from "./worker-types";

export type { HeadlessOrphanCleanupReport };

export class LocalHeadlessWorkerRunner {
  private readonly limits: HeadlessWorkerLimits;

  constructor(
    private readonly deps: {
      readonly jobStore: HeadlessJobStorePort;
      readonly queue: HeadlessQueuePort;
      readonly storage: HeadlessStoragePort;
      readonly artifactCleanup: HeadlessArtifactCleanupPort;
      readonly nowMs: () => number;
      readonly limits?: Partial<HeadlessWorkerLimits>;
    },
  ) {
    this.limits = { ...DEFAULT_HEADLESS_WORKER_LIMITS, ...deps.limits };
  }

  /**
   * Testing subclass hook — production path is a no-op.
   * Barriers must not be injectable via the ordinary constructor deps.
   */
  protected async afterFinalizeBeforeSucceededCas(): Promise<void> {}

  /** Testing subclass hook — production path is false. */
  protected throwBeforeSucceededCas(): boolean {
    return false;
  }

  /**
   * Process up to `limit` deliveries.
   * Acknowledge only after durable claim (or terminal no-op for already-terminal).
   */
  async processOnce(
    limit = 1,
    signal?: AbortSignal,
  ): Promise<
    HeadlessControlPlaneResult<{
      processed: number;
      succeeded: number;
      failed: number;
      /** Last successful run evidence in this drain (metrics; not job identity). */
      lastEvidence: HeadlessWorkerArtifactEvidence | null;
      /** Last post-finalization orphan cleanup outcome in this drain. */
      lastOrphanCleanup: HeadlessOrphanCleanupReport | null;
    }>
  > {
    const messages = await this.deps.queue.drain(limit);
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let lastEvidence: HeadlessWorkerArtifactEvidence | null = null;
    let lastOrphanCleanup: HeadlessOrphanCleanupReport | null = null;
    let cleanupUnconfirmed = false;

    for (const message of messages) {
      if (signal?.aborted) break;

      const current = await this.deps.jobStore.getByJobIdAndOwner(
        message.jobId,
        message.ownerId,
      );
      if (!current.ok) {
        await this.deps.queue.markDelivered(message.deliveryId);
        continue;
      }

      if (current.value.stage !== "canonical") {
        // Provisional records must never enter render claim/execution.
        await this.deps.queue.markDelivered(message.deliveryId);
        continue;
      }

      const state = current.value.canonicalJob.state;
      if (
        state === "succeeded" ||
        state === "failed" ||
        state === "cancelled"
      ) {
        await this.deps.queue.markDelivered(message.deliveryId);
        continue;
      }

      // Expired claim on delivery: fail closed. Fresh attempt comes from recoverDispatch.
      if (current.value.claimToken != null) {
        const recovered = await this.deps.jobStore.recoverExpiredClaim({
          jobId: message.jobId,
          ownerId: message.ownerId,
          nowMs: this.deps.nowMs(),
          leaseMs: this.limits.claimLeaseMs,
        });
        if (!recovered.ok) {
          await this.deps.queue.enqueue(message);
          continue;
        }
        if (recovered.value.kind === "failed_expired") {
          await this.deps.queue.markDelivered(message.deliveryId);
          failed += 1;
          processed += 1;
          continue;
        }
        if (recovered.value.kind === "rejected_terminal") {
          await this.deps.queue.markDelivered(message.deliveryId);
          continue;
        }
        // live claim or other rejection — do not steal; requeue without ack
        await this.deps.queue.enqueue(message);
        continue;
      }

      if (current.value.canonicalJob.state !== "queued" || current.value.claimToken != null) {
        await this.deps.queue.enqueue(message);
        continue;
      }

      const claimToken = `claim_${randomUUID()}`;
      const nowMs = this.deps.nowMs();
      const claimed = await this.deps.jobStore.claimQueuedJob({
        jobId: message.jobId,
        ownerId: message.ownerId,
        expectedStoreVersion: current.value.storeVersion,
        claimToken,
        nowMs,
      });
      if (!claimed.ok) {
        await this.deps.queue.enqueue(message);
        continue;
      }
      if (claimed.value.kind !== "claimed") {
        await this.deps.queue.enqueue(message);
        continue;
      }

      // Durable claim succeeded — acknowledge delivery.
      const first = await this.deps.queue.markDelivered(message.deliveryId);
      if (!first) {
        // Duplicate delivery after claim — owning claim remains; do not re-render.
        continue;
      }

      const executed = await executeClaimedRender({
        claimedRecord: claimed.value.record,
        claimToken,
        jobStore: this.deps.jobStore,
        artifactCleanup: this.deps.artifactCleanup,
        resolveStorage: () => this.deps.storage,
        signal,
        nowMs: this.deps.nowMs,
        limits: this.limits,
        afterFinalizeBeforeSucceededCas: () =>
          this.afterFinalizeBeforeSucceededCas(),
        throwBeforeSucceededCas: () => this.throwBeforeSucceededCas(),
      });

      if (executed.orphanCleanup != null) {
        lastOrphanCleanup = executed.orphanCleanup;
      }
      if (executed.kind === "cleanup_unconfirmed") {
        cleanupUnconfirmed = true;
      }
      if (executed.kind === "succeeded") {
        succeeded += 1;
        if (executed.evidence != null) {
          lastEvidence = executed.evidence;
        }
      } else if (
        executed.kind === "failed" ||
        executed.kind === "cancelled"
      ) {
        failed += 1;
      }
      processed += 1;
    }

    if (cleanupUnconfirmed) {
      return cpFail(
        "ARTIFACT_CLEANUP_UNCONFIRMED",
        "Orphan artifact cleanup could not be confirmed.",
      );
    }
    return cpOk({
      processed,
      succeeded,
      failed,
      lastEvidence,
      lastOrphanCleanup,
    });
  }
}
