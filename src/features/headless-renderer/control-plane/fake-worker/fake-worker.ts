/**
 * Deterministic QA-only fake worker — no Chromium, no FFmpeg, no real video bytes.
 * Advances jobs through the canonical lifecycle, uploads a tiny finalized object,
 * and atomically binds it on succeeded CAS (Phase 3.3A).
 */

import { createHash, randomUUID } from "node:crypto";

import {
  applyHeadlessJobTransition,
  finalizeHeadlessRenderArtifact,
  HEADLESS_RESOLUTION_PIXELS,
  isHeadlessTerminalState,
} from "../../domain";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessQueuePort } from "../ports/queue.port";
import type { HeadlessStoragePort } from "../ports/storage.port";
import { buildValidatedArtifactObjectBinding } from "../services/validate-artifact-object-binding";
import { cpFail, cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type FakeWorkerMode = "succeed" | "fail" | "noop";

export interface FakeWorkerOptions {
  readonly mode?: FakeWorkerMode;
  readonly nowMs?: () => number;
}

export class HeadlessFakeWorker {
  constructor(
    private readonly jobStore: HeadlessJobStorePort,
    private readonly queue: HeadlessQueuePort,
    private readonly storage: HeadlessStoragePort,
    private readonly options: FakeWorkerOptions = {},
  ) {}

  /**
   * Process up to `limit` queued deliveries.
   * Duplicate deliveryIds are ignored. Deliveries for jobs not yet consumable
   * are re-queued without acknowledgment (never discarded solely for early arrival).
   */
  async processOnce(limit = 10): Promise<HeadlessControlPlaneResult<{ processed: number }>> {
    const messages = await this.queue.drain(limit);
    let processed = 0;
    for (const message of messages) {
      const current = await this.jobStore.getByJobIdAndOwner(
        message.jobId,
        message.ownerId,
      );
      if (!current.ok) {
        await this.queue.markDelivered(message.deliveryId);
        continue;
      }

      if (current.value.stage !== "canonical") {
        // Provisional records are never render-claimable.
        await this.queue.markDelivered(message.deliveryId);
        continue;
      }

      const state = current.value.canonicalJob.state;
      if (isHeadlessTerminalState(state) || current.value.claimToken != null) {
        await this.queue.markDelivered(message.deliveryId);
        continue;
      }

      if (state !== "queued") {
        await this.queue.enqueue(message);
        continue;
      }

      const first = await this.queue.markDelivered(message.deliveryId);
      if (!first) {
        continue;
      }
      const result = await this.processMessage(message.jobId, message.ownerId);
      if (!result.ok) return result;
      processed += 1;
    }
    return cpOk({ processed });
  }

  private async processMessage(
    jobId: string,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<true>> {
    const mode = this.options.mode ?? "succeed";
    if (mode === "noop") {
      return cpOk(true as const);
    }

    const current = await this.jobStore.getByJobIdAndOwner(jobId, ownerId);
    if (!current.ok) return current;
    if (current.value.stage !== "canonical") {
      return cpFail("CLAIM_REJECTED", "Provisional records cannot be claimed.");
    }
    if (current.value.canonicalJob.state !== "queued" || current.value.claimToken != null) {
      return cpFail("CLAIM_REJECTED", "Job not claimable.");
    }

    const nowMs = this.options.nowMs?.() ?? Date.now();
    const claimToken = `claim_qa_${randomUUID()}`;
    const claimed = await this.jobStore.claimQueuedJob({
      jobId,
      ownerId,
      expectedStoreVersion: current.value.storeVersion,
      claimToken,
      nowMs,
    });
    if (!claimed.ok) return claimed;
    if (claimed.value.kind !== "claimed") {
      return cpFail("CLAIM_REJECTED", "Stale or duplicate claim rejected.");
    }

    let record = claimed.value.record;
    const request = record.canonicalRequest;

    if (mode === "fail") {
      const failed = applyHeadlessJobTransition({
        jobValue: record.canonicalJob,
        requestValue: request,
        toState: "failed",
        attempt: record.canonicalJob.attempt,
        updatedAtMs: record.canonicalJob.updatedAtMs + 1,
        terminalReason: { reasonId: "WORKER_FAILED", retryable: true },
      });
      if (!failed.ok) {
        return cpFail("INTERNAL_ERROR", "Fake worker failed transition error.");
      }
      const cas = await this.jobStore.compareAndSetTransition({
        jobId,
        ownerId,
        expectedStoreVersion: record.storeVersion,
        next: {
          job: failed.job,
          request,
          idempotencyAuthorityKey: record.idempotencyAuthorityKey,
          operationId: record.operationId,
          claimToken: null,
          claimedAtMs: null,
          artifactObjectBinding: null,
          },
      });
      if (!cas.ok) return cas;
      if (cas.value.kind !== "updated") {
        return cpFail("STALE_TRANSITION", "Failed write rejected.");
      }
      return cpOk(true as const);
    }

    const stages = [
      "rendering",
      "encoding",
      "validating",
      "uploading",
    ] as const;
    let t = record.canonicalJob.updatedAtMs;
    for (const stage of stages) {
      t += 1;
      const step = applyHeadlessJobTransition({
        jobValue: record.canonicalJob,
        requestValue: request,
        toState: stage,
        attempt: record.canonicalJob.attempt,
        updatedAtMs: t,
        progress: {
          percent:
            stage === "rendering"
              ? 40
              : stage === "encoding"
                ? 60
                : stage === "validating"
                  ? 80
                  : 90,
          stage,
          updatedAtMs: t,
        },
      });
      if (!step.ok) {
        return cpFail("INTERNAL_ERROR", `Fake worker stalled at ${stage}.`);
      }
      const cas = await this.jobStore.compareAndSetTransition({
        jobId,
        ownerId,
        expectedStoreVersion: record.storeVersion,
        next: {
          job: step.job,
          request,
          idempotencyAuthorityKey: record.idempotencyAuthorityKey,
          operationId: record.operationId,
          claimToken: record.claimToken,
          claimedAtMs: record.claimedAtMs,
          artifactObjectBinding: null,
          },
      });
      if (!cas.ok) return cas;
      if (cas.value.kind === "terminal_locked") {
        return cpFail("TERMINAL_IMMUTABLE", "Terminal overwrite rejected.");
      }
      if (cas.value.kind !== "updated") {
        return cpFail("STALE_TRANSITION", "Stale worker write rejected.");
      }
      record = cas.value.record;
    }

    const pixels = HEADLESS_RESOLUTION_PIXELS[request.rendererProfile.resolution];
    const expectAudio = request.manifest.audio.mode !== "silent";
    const qaBytes = new Uint8Array(1024).fill(0x51);
    const contentDigest = `sha256:${createHash("sha256")
      .update(qaBytes)
      .digest("hex")}`;
    const mimeType =
      request.rendererProfile.format === "webm" ? "video/webm" : "video/mp4";
    const expiresAtMs = nowMs + 86_400_000;

    const session = await this.storage.createUploadSession({
      ownerId,
      projectId: request.ownership.projectId,
      purpose: "artifact",
      mimeType,
      expiresAtMs,
      expectedContentDigest: contentDigest,
      expectedByteLength: qaBytes.byteLength,
    });
    if (!session.ok) return session;
    const written = await this.storage.writeUploadBytes({
      capabilityToken: session.value.capabilityToken,
      bytes: qaBytes,
    });
    if (!written.ok) {
      await this.storage.deleteObject(session.value.locator, ownerId);
      return written;
    }
    const finalized = await this.storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: contentDigest,
    });
    if (!finalized.ok) {
      await this.storage.deleteObject(session.value.locator, ownerId);
      return finalized;
    }

    const artifactDraft = finalizeHeadlessRenderArtifact({
      version: 1,
      artifactId: `art_qa_${jobId}`,
      contentDigest,
      byteLength: qaBytes.byteLength,
      mimeType,
      format: request.rendererProfile.format,
      width: pixels.width,
      height: pixels.height,
      fps: 30,
      durationMs: request.manifest.project.renderDurationMs,
      audio: expectAudio
        ? {
            present: true,
            codec: request.rendererProfile.format === "webm" ? "opus" : "aac",
            channels: 2,
            sampleRateHz: 48000,
          }
        : {
            present: false,
            codec: null,
            channels: null,
            sampleRateHz: null,
          },
      video: {
        present: true,
        codec: request.rendererProfile.format === "webm" ? "vp9" : "h264",
        width: pixels.width,
        height: pixels.height,
        fps: 30,
      },
      rendererBuildId: request.rendererBuildId,
      manifestFingerprint: request.manifestFingerprint,
      assetBundleFingerprint: request.assetBundle.fingerprint,
      renderJobFingerprint: record.canonicalJob.renderJobFingerprint,
      expiresAtMs,
    });
    if (!artifactDraft.ok) {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return cpFail("INTERNAL_ERROR", "QA artifact metadata failed validation.");
    }

    t += 1;
    const succeeded = applyHeadlessJobTransition({
      jobValue: record.canonicalJob,
      requestValue: request,
      toState: "succeeded",
      attempt: record.canonicalJob.attempt,
      updatedAtMs: t,
      artifact: artifactDraft.artifact,
    });
    if (!succeeded.ok) {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return cpFail("INTERNAL_ERROR", "Fake worker succeed transition failed.");
    }

    const binding = buildValidatedArtifactObjectBinding({
      job: succeeded.job,
      request,
      artifact: artifactDraft.artifact,
      finalized: finalized.value,
      nowMs,
    });
    if (!binding.ok) {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return cpFail("INTERNAL_ERROR", "QA artifact binding failed validation.");
    }

    const finalCas = await this.jobStore.compareAndSetTransition({
      jobId,
      ownerId,
      expectedStoreVersion: record.storeVersion,
      next: {
        job: succeeded.job,
        request,
        idempotencyAuthorityKey: record.idempotencyAuthorityKey,
        operationId: record.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: binding.binding,
      },
    });
    if (!finalCas.ok) {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return finalCas;
    }
    if (finalCas.value.kind === "terminal_locked") {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return cpFail("TERMINAL_IMMUTABLE", "Terminal overwrite rejected.");
    }
    if (finalCas.value.kind !== "updated") {
      await this.storage.deleteObject(finalized.value.locator, ownerId);
      return cpFail("STALE_TRANSITION", "Stale succeed write rejected.");
    }
    return cpOk(true as const);
  }
}
