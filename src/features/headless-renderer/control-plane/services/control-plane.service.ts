/**
 * Sprint 11C / 11C.1 — Headless control-plane orchestration (server-only).
 * Builds canonical 11B requests internally; never trusts client ownership.
 * Verifies owned asset bytes before accept/persist/queue.
 */

import { createHash, randomUUID } from "node:crypto";

import {
  validateExportManifest,
  type ExportManifest,
} from "@/features/export/domain/headless-safe";

import {
  applyHeadlessJobTransition,
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  HEADLESS_CLAIM_LEASE_MS,
  isHeadlessTerminalState,
  validateHeadlessAssetBundle,
  type HeadlessRenderJobRequestV1,
  type HeadlessRenderJobV1,
} from "../../domain";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessPrincipalPort } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";
import type { HeadlessQueuePort } from "../ports/queue.port";
import type { HeadlessStoragePort } from "../ports/storage.port";
import {
  HEADLESS_BUNDLE_RECORD_MAX_BYTES,
  HEADLESS_MANIFEST_MAX_BYTES,
  HEADLESS_MANIFEST_MAX_JSON_DEPTH,
  HEADLESS_MANIFEST_MAX_JSON_NODES,
  cpFail,
  cpFailRecoverable,
  cpOk,
  type HeadlessCreateJobResult,
  type HeadlessControlPlaneResult,
  type HeadlessPublicJobViewV1,
} from "../types/control-plane.types";
import { assertHeadlessMaterializationPolicy } from "./materialization-policy";
import {
  toHeadlessPublicJobView,
  toHeadlessPublicJobViewFromStore,
} from "./safe-job-view";
import { cancelProvisionalRecord } from "./provisional-job-lifecycle";
import { requireCanonicalStoredJobRecord } from "./require-canonical-stored-job";
import { stableHeadlessDeliveryId } from "./stable-delivery-id";
import {
  parseHeadlessCreateJobTransport,
  rejectMediaPayloadInTransportBody,
} from "./transport-validate";
import {
  headlessMinExpiryDeadline,
  verifyOwnedAssetBytes,
} from "./verify-owned-assets";

function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function countJsonNodes(value: unknown, depth: number): number {
  if (depth > HEADLESS_MANIFEST_MAX_JSON_DEPTH) {
    throw new Error("depth");
  }
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    let n = 1;
    for (const item of value) n += countJsonNodes(item, depth + 1);
    return n;
  }
  let n = 1;
  for (const key of Object.keys(value as object)) {
    n += countJsonNodes((value as Record<string, unknown>)[key], depth + 1);
  }
  return n;
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export interface HeadlessControlPlaneDeps {
  readonly principal: HeadlessPrincipalPort;
  readonly projectAuthorization: HeadlessProjectAuthorizationPort;
  readonly storage: HeadlessStoragePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly queue: HeadlessQueuePort;
  readonly nowMs: () => number;
  /** Test-only aggregate ceiling override. */
  readonly maxVerifiedAssetBytes?: number;
  /** Worker claim lease used by crash-after-ack recovery (default HEADLESS_CLAIM_LEASE_MS). */
  readonly claimLeaseMs?: number;
}

export class HeadlessControlPlaneService {
  constructor(private readonly deps: HeadlessControlPlaneDeps) {}

  async createJob(input: {
    requestContext: unknown;
    rawBodyText: string;
    body: unknown;
  }): Promise<HeadlessCreateJobResult> {
    const mediaGate = rejectMediaPayloadInTransportBody(input.rawBodyText);
    if (!mediaGate.ok) return mediaGate;

    const principalResult = await this.deps.principal.resolvePrincipal(
      input.requestContext,
    );
    if (!principalResult.ok) return principalResult;
    const principal = principalResult.value;

    const transportResult = parseHeadlessCreateJobTransport(input.body);
    if (!transportResult.ok) return transportResult;
    const transport = transportResult.value;

    const access = await this.deps.projectAuthorization.assertProjectAccess(
      principal,
      transport.projectId,
    );
    if (!access.ok) return access;

    const ownership = {
      ownerId: principal.ownerId,
      projectId: transport.projectId,
    };

    const nowMs = this.deps.nowMs();
    const minExpiryResult = headlessMinExpiryDeadline(nowMs);
    if (!minExpiryResult.ok) return minExpiryResult;
    const minExpiry = minExpiryResult.value;

    const manifestVerified = await this.deps.storage.verifyObjectDigest({
      locator: transport.manifestObject,
      ownerId: principal.ownerId,
      expectedContentDigest: transport.manifestPayloadDigest,
      nowMs,
    });
    if (!manifestVerified.ok) return manifestVerified;
    if (manifestVerified.value.projectId !== transport.projectId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Manifest project mismatch.");
    }
    if (manifestVerified.value.purpose !== "manifest") {
      return cpFail("INVALID_TRANSPORT", "Object purpose must be manifest.");
    }
    if (manifestVerified.value.byteLength > HEADLESS_MANIFEST_MAX_BYTES) {
      return cpFail("MANIFEST_TOO_LARGE", "Manifest exceeds byte ceiling.");
    }
    if (manifestVerified.value.expiresAtMs < minExpiry) {
      return cpFail(
        "ASSET_LEASE_INSUFFICIENT",
        "Manifest object lease is insufficient for job execution.",
      );
    }

    const manifestOpened = await this.deps.storage.openOwnedObject(
      transport.manifestObject,
      principal.ownerId,
      nowMs,
    );
    if (!manifestOpened.ok) return manifestOpened;

    let manifestJson: unknown;
    try {
      const text = utf8(manifestOpened.value.bytes);
      if (digestBytes(manifestOpened.value.bytes) !== transport.manifestPayloadDigest) {
        return cpFail("MANIFEST_DIGEST_MISMATCH", "Manifest digest mismatch.");
      }
      manifestJson = JSON.parse(text);
      if (countJsonNodes(manifestJson, 0) > HEADLESS_MANIFEST_MAX_JSON_NODES) {
        return cpFail("MANIFEST_TOO_LARGE", "Manifest exceeds structure ceiling.");
      }
    } catch {
      return cpFail("MANIFEST_MALFORMED", "Manifest JSON is malformed.");
    }

    const manifestValidation = validateExportManifest(manifestJson);
    if (!manifestValidation.ok) {
      return cpFail("MANIFEST_MALFORMED", "ExportManifest failed validation.");
    }
    const manifest = manifestJson as ExportManifest;
    if (manifest.project.projectId !== transport.projectId) {
      return cpFail(
        "OBJECT_OWNERSHIP_MISMATCH",
        "Manifest projectId does not match transport projectId.",
      );
    }

    const slots = extractRequiredHeadlessSourceSlots(manifest);
    const matPolicy = assertHeadlessMaterializationPolicy(slots);
    if (!matPolicy.ok) return matPolicy;

    const bundleOpened = await this.deps.storage.openOwnedObject(
      transport.assetBundleObject,
      principal.ownerId,
      nowMs,
    );
    if (!bundleOpened.ok) {
      return cpFail("BUNDLE_NOT_FOUND", "Asset bundle object not found.");
    }
    if (bundleOpened.value.metadata.projectId !== transport.projectId) {
      return cpFail("OBJECT_OWNERSHIP_MISMATCH", "Bundle project mismatch.");
    }
    if (bundleOpened.value.metadata.purpose !== "asset_bundle_record") {
      return cpFail("INVALID_TRANSPORT", "Object purpose must be asset_bundle_record.");
    }
    if (bundleOpened.value.bytes.byteLength > HEADLESS_BUNDLE_RECORD_MAX_BYTES) {
      return cpFail("BODY_TOO_LARGE", "Asset bundle record exceeds ceiling.");
    }
    if (nowMs > bundleOpened.value.metadata.expiresAtMs) {
      return cpFail("BUNDLE_EXPIRED", "Asset bundle object expired.");
    }
    if (bundleOpened.value.metadata.expiresAtMs < minExpiry) {
      return cpFail(
        "ASSET_LEASE_INSUFFICIENT",
        "Asset bundle record lease is insufficient for job execution.",
      );
    }

    let bundleJson: unknown;
    try {
      bundleJson = JSON.parse(utf8(bundleOpened.value.bytes));
    } catch {
      return cpFail("INVALID_TRANSPORT", "Asset bundle record is malformed JSON.");
    }

    const bundleResult = validateHeadlessAssetBundle(bundleJson, manifest);
    if (!bundleResult.ok) {
      return cpFail(
        "BUNDLE_FINGERPRINT_MISMATCH",
        "Asset bundle failed exact coverage/validation.",
      );
    }
    if (bundleResult.bundle.fingerprint !== transport.assetBundleFingerprint) {
      return cpFail(
        "BUNDLE_FINGERPRINT_MISMATCH",
        "Asset bundle fingerprint mismatch.",
      );
    }

    // 11C.1 — verify every asset descriptor against owned bytes before accept.
    const assetsOk = await verifyOwnedAssetBytes({
      storage: this.deps.storage,
      ownership,
      bundle: bundleResult.bundle,
      nowMs,
      maxTotalAssetBytes: this.deps.maxVerifiedAssetBytes,
    });
    if (!assetsOk.ok) return assetsOk;

    const requestResult = finalizeHeadlessRenderJobRequest({
      ownership,
      manifest,
      assetBundle: bundleResult.bundle,
      rendererProfile: transport.rendererProfile,
      rendererBuildId: transport.rendererBuildId,
      idempotencyKey: transport.idempotencyKey,
    });
    if (!requestResult.ok) {
      return cpFail("INVALID_TRANSPORT", "Failed to build canonical request.");
    }

    const idempotency = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: {
        ownerId: ownership.ownerId,
        projectId: ownership.projectId,
      },
      idempotencyKey: transport.idempotencyKey,
    });
    if (!idempotency.ok) {
      return cpFail("INTERNAL_ERROR", "Failed to build idempotency authority.");
    }

    const accepted = createAcceptedHeadlessRenderJob({
      jobId: `job_${randomUUID()}`,
      requestValue: requestResult.request,
      createdAtMs: nowMs,
    });
    if (!accepted.ok) {
      return cpFail("INTERNAL_ERROR", "Failed to accept headless job.");
    }

    const stored = await this.deps.jobStore.createIfAbsent({
      idempotencyAuthorityKey: idempotency.fingerprint,
      record: {
        job: accepted.job,
        request: accepted.request,
        idempotencyAuthorityKey: idempotency.fingerprint,
        // Creator operation identity — transport idempotency key is the
        // client-supplied operation authority (never invented by the adapter).
        operationId: transport.idempotencyKey,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!stored.ok) return stored;

    if (stored.value.kind === "conflict") {
      return cpFail(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key reused with different request semantics.",
      );
    }

    const record = stored.value.record;
    if (stored.value.kind === "existing") {
      return cpOk(toHeadlessPublicJobView(record.canonicalJob));
    }

    // Race-safe dispatch: created → materializing → queued persisted → enqueue stable delivery.
    return this.dispatchAfterAccept({
      jobId: record.canonicalJob.jobId,
      ownerId: principal.ownerId,
      storeVersion: record.storeVersion,
      request: record.canonicalRequest,
      idempotencyAuthorityKey: record.idempotencyAuthorityKey,
      job: record.canonicalJob,
      nowMs,
    });
  }

  /**
   * Explicit Export/status recovery — provider-neutral, no cron.
   *
   * - Expired claims (queued or in-flight) → CLAIM_LEASE_EXPIRED, then mint a
   *   new attempt with fresh jobId + delivery identity (acked deliveries are never reused).
   * - QUEUE_ENQUEUE_FAILED → same new-attempt path.
   * - Unclaimed queued → re-enqueue only when delivery was never acknowledged.
   * - Live claims / other terminals → truthful current view (never steal).
   */
  async recoverDispatch(input: {
    requestContext: unknown;
    jobId: string;
  }): Promise<HeadlessCreateJobResult> {
    const principalResult = await this.deps.principal.resolvePrincipal(
      input.requestContext,
    );
    if (!principalResult.ok) return principalResult;
    const principal = principalResult.value;

    const currentResult = await this.deps.jobStore.getByJobIdAndOwner(
      input.jobId,
      principal.ownerId,
    );
    if (!currentResult.ok) return currentResult;
    const narrowedInitial = requireCanonicalStoredJobRecord(currentResult.value);
    if (!narrowedInitial.ok) {
      // Provisional jobs surface honestly; dispatch recovery is canonical-only.
      return cpOk(toHeadlessPublicJobViewFromStore(currentResult.value));
    }
    let record = narrowedInitial.value;
    const nowMs = this.deps.nowMs();
    const leaseMs = this.deps.claimLeaseMs ?? HEADLESS_CLAIM_LEASE_MS;

    // Crash-after-ack: empty queue + abandoned claim — expire then mint new attempt.
    if (
      record.claimToken != null &&
      !isHeadlessTerminalState(record.canonicalJob.state)
    ) {
      const recovered = await this.deps.jobStore.recoverExpiredClaim({
        jobId: input.jobId,
        ownerId: principal.ownerId,
        nowMs,
        leaseMs,
      });
      if (!recovered.ok) return recovered;
      if (recovered.value.kind === "rejected_live_claim") {
        return cpOk(toHeadlessPublicJobView(record.canonicalJob));
      }
      if (recovered.value.kind === "failed_expired") {
        record = recovered.value.record;
      } else if (recovered.value.kind === "rejected_terminal") {
        const terminal = await this.deps.jobStore.getByJobIdAndOwner(
          input.jobId,
          principal.ownerId,
        );
        if (!terminal.ok) return terminal;
        return cpOk(toHeadlessPublicJobViewFromStore(terminal.value));
      }
    }

    if (
      record.canonicalJob.state === "failed" &&
      record.canonicalJob.terminalReason?.retryable === true &&
      (record.canonicalJob.terminalReason.reasonId === "QUEUE_ENQUEUE_FAILED" ||
        record.canonicalJob.terminalReason.reasonId === "CLAIM_LEASE_EXPIRED")
    ) {
      return this.createRecoveryAttempt({
        parentJobId: record.canonicalJob.jobId,
        parentIdempotencyAuthorityKey: record.idempotencyAuthorityKey,
        parentAttempt: record.canonicalJob.attempt,
        request: record.canonicalRequest,
        ownerId: principal.ownerId,
        nowMs,
        recoveryKind:
          record.canonicalJob.terminalReason.reasonId === "CLAIM_LEASE_EXPIRED"
            ? "control-plane-claim-lease-recovery"
            : "control-plane-dispatch-recovery",
      });
    }

    if (record.canonicalJob.state === "queued" && record.claimToken == null) {
      const deliveryId = stableHeadlessDeliveryId(
        record.canonicalJob.jobId,
        record.canonicalJob.attempt,
      );
      // Already-acked delivery cannot be reused — fail closed + new attempt.
      if (await this.deps.queue.wasDelivered(deliveryId)) {
        const failed = applyHeadlessJobTransition({
          jobValue: record.canonicalJob,
          requestValue: record.canonicalRequest,
          toState: "failed",
          attempt: record.canonicalJob.attempt,
          updatedAtMs: Math.max(nowMs, record.canonicalJob.updatedAtMs + 1),
          terminalReason: {
            reasonId: "CLAIM_LEASE_EXPIRED",
            retryable: true,
          },
        });
        if (!failed.ok) {
          return cpFail("INTERNAL_ERROR", "Failed to terminalize burned delivery.");
        }
        const cas = await this.deps.jobStore.compareAndSetTransition({
          jobId: record.canonicalJob.jobId,
          ownerId: principal.ownerId,
          expectedStoreVersion: record.storeVersion,
          next: {
            job: failed.job,
            request: record.canonicalRequest,
            idempotencyAuthorityKey: record.idempotencyAuthorityKey,
            operationId: record.operationId,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: null,
            },
        });
        if (!cas.ok) return cas;
        if (cas.value.kind !== "updated") {
          const refresh = await this.deps.jobStore.getByJobIdAndOwner(
            input.jobId,
            principal.ownerId,
          );
          if (!refresh.ok) return refresh;
          const refreshCanon = requireCanonicalStoredJobRecord(refresh.value);
          if (!refreshCanon.ok) {
            return cpOk(toHeadlessPublicJobViewFromStore(refresh.value));
          }
          const refreshed = refreshCanon.value;
          if (
            refreshed.canonicalJob.state === "failed" &&
            refreshed.canonicalJob.terminalReason?.reasonId === "CLAIM_LEASE_EXPIRED"
          ) {
            return this.createRecoveryAttempt({
              parentJobId: refreshed.canonicalJob.jobId,
              parentIdempotencyAuthorityKey: refreshed.idempotencyAuthorityKey,
              parentAttempt: refreshed.canonicalJob.attempt,
              request: refreshed.canonicalRequest,
              ownerId: principal.ownerId,
              nowMs,
              recoveryKind: "control-plane-claim-lease-recovery",
            });
          }
          return cpOk(toHeadlessPublicJobView(refreshed.canonicalJob));
        }
        return this.createRecoveryAttempt({
          parentJobId: cas.value.record.canonicalJob.jobId,
          parentIdempotencyAuthorityKey: cas.value.record.idempotencyAuthorityKey,
          parentAttempt: cas.value.record.canonicalJob.attempt,
          request: cas.value.record.canonicalRequest,
          ownerId: principal.ownerId,
          nowMs,
          recoveryKind: "control-plane-claim-lease-recovery",
        });
      }

      const enqueue = await this.deps.queue.enqueue({
        jobId: record.canonicalJob.jobId,
        ownerId: principal.ownerId,
        attempt: record.canonicalJob.attempt,
        deliveryId,
        enqueuedAtMs: nowMs,
      });
      if (!enqueue.ok) {
        return this.failQueuedAfterEnqueueFailure({
          jobId: record.canonicalJob.jobId,
          ownerId: principal.ownerId,
          expectedStoreVersion: record.storeVersion,
          request: record.canonicalRequest,
          idempotencyAuthorityKey: record.idempotencyAuthorityKey,
          nowMs,
        });
      }
      return cpOk(toHeadlessPublicJobView(record.canonicalJob));
    }

    // Terminal / live in-progress — truthful current job.
    return cpOk(toHeadlessPublicJobView(record.canonicalJob));
  }

  private async createRecoveryAttempt(input: {
    parentJobId: string;
    parentIdempotencyAuthorityKey: string;
    parentAttempt: number;
    request: HeadlessRenderJobRequestV1;
    ownerId: string;
    nowMs: number;
    recoveryKind:
      | "control-plane-dispatch-recovery"
      | "control-plane-claim-lease-recovery";
  }): Promise<HeadlessCreateJobResult> {
    const recoveryAttempt = input.parentAttempt + 1;
    const recoveryIdempotency = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: input.recoveryKind,
      parentJobId: input.parentJobId,
      parentIdempotencyAuthorityKey: input.parentIdempotencyAuthorityKey,
      recoveryAttempt,
    });
    if (!recoveryIdempotency.ok) {
      return cpFail("INTERNAL_ERROR", "Failed to build recovery idempotency.");
    }

    const accepted = createAcceptedHeadlessRenderJob({
      jobId: `job_${randomUUID()}`,
      requestValue: input.request,
      createdAtMs: input.nowMs,
    });
    if (!accepted.ok) {
      return cpFail("INTERNAL_ERROR", "Failed to accept recovery job.");
    }

    const stored = await this.deps.jobStore.createIfAbsent({
      idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
      record: {
        job: accepted.job,
        request: accepted.request,
        idempotencyAuthorityKey: recoveryIdempotency.fingerprint,
        operationId: `recover_${input.parentJobId}_${recoveryAttempt}`,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!stored.ok) return stored;
    if (stored.value.kind === "conflict") {
      return cpFail(
        "IDEMPOTENCY_CONFLICT",
        "Dispatch recovery idempotency conflict.",
      );
    }

    // created or existing stranded child — always continue idempotently.
    const child = stored.value.record;
    return this.continueDispatchToQueued({
      jobId: child.canonicalJob.jobId,
      ownerId: input.ownerId,
      nowMs: input.nowMs,
    });
  }

  /**
   * Resume created → materializing → queued → enqueue with CAS races tolerated.
   * Used by initial accept and by recovery-child continuation after crash windows.
   */
  private async continueDispatchToQueued(input: {
    jobId: string;
    ownerId: string;
    nowMs: number;
  }): Promise<HeadlessCreateJobResult> {
    // Bounded retries: concurrent recovery callers may win individual CAS steps.
    for (let i = 0; i < 8; i++) {
      const current = await this.deps.jobStore.getByJobIdAndOwner(
        input.jobId,
        input.ownerId,
      );
      if (!current.ok) return current;
      const narrowed = requireCanonicalStoredJobRecord(current.value);
      if (!narrowed.ok) {
        return cpOk(toHeadlessPublicJobViewFromStore(current.value));
      }
      const record = narrowed.value;
      const state = record.canonicalJob.state;

      if (isHeadlessTerminalState(state)) {
        return cpOk(toHeadlessPublicJobView(record.canonicalJob));
      }

      if (state === "queued") {
        if (record.claimToken != null) {
          // Live claim — never steal.
          return cpOk(toHeadlessPublicJobView(record.canonicalJob));
        }
        const deliveryId = stableHeadlessDeliveryId(
          record.canonicalJob.jobId,
          record.canonicalJob.attempt,
        );
        if (await this.deps.queue.wasDelivered(deliveryId)) {
          // Burned delivery on recovery child — leave truthful queued view;
          // parent recovery paths mint a further attempt when needed.
          return cpOk(toHeadlessPublicJobView(record.canonicalJob));
        }
        const enqueue = await this.deps.queue.enqueue({
          jobId: record.canonicalJob.jobId,
          ownerId: input.ownerId,
          attempt: record.canonicalJob.attempt,
          deliveryId,
          enqueuedAtMs: Math.max(input.nowMs, record.canonicalJob.updatedAtMs + 1),
        });
        if (!enqueue.ok) {
          return this.failQueuedAfterEnqueueFailure({
            jobId: record.canonicalJob.jobId,
            ownerId: input.ownerId,
            expectedStoreVersion: record.storeVersion,
            request: record.canonicalRequest,
            idempotencyAuthorityKey: record.idempotencyAuthorityKey,
            nowMs: Math.max(input.nowMs, record.canonicalJob.updatedAtMs + 1),
          });
        }
        const after = await this.deps.jobStore.getByJobIdAndOwner(
          input.jobId,
          input.ownerId,
        );
        if (!after.ok) return after;
        return cpOk(toHeadlessPublicJobViewFromStore(after.value));
      }

      if (state === "created" || state === "materializing") {
        const toState = state === "created" ? "materializing" : "queued";
        const t = Math.max(input.nowMs + 1, record.canonicalJob.updatedAtMs + 1);
        const stepped = applyHeadlessJobTransition({
          jobValue: record.canonicalJob,
          requestValue: record.canonicalRequest,
          toState,
          attempt: record.canonicalJob.attempt,
          updatedAtMs: t,
          progress: {
            percent: toState === "materializing" ? 5 : 10,
            stage: toState,
            updatedAtMs: t,
          },
        });
        if (!stepped.ok) {
          return cpFail("INTERNAL_ERROR", `Failed ${toState} transition.`);
        }
        const cas = await this.deps.jobStore.compareAndSetTransition({
          jobId: input.jobId,
          ownerId: input.ownerId,
          expectedStoreVersion: record.storeVersion,
          next: {
            job: stepped.job,
            request: record.canonicalRequest,
            idempotencyAuthorityKey: record.idempotencyAuthorityKey,
            operationId: record.operationId,
            claimToken: null,
            claimedAtMs: null,
            artifactObjectBinding: null,
            },
        });
        if (!cas.ok) return cas;
        // stale / terminal_locked → loop and re-read (another recovery caller may have won)
        continue;
      }

      // In-flight worker stages (rendering…) — truthful current view.
      return cpOk(toHeadlessPublicJobView(record.canonicalJob));
    }

    const final = await this.deps.jobStore.getByJobIdAndOwner(
      input.jobId,
      input.ownerId,
    );
    if (!final.ok) return final;
    return cpOk(toHeadlessPublicJobViewFromStore(final.value));
  }

  private async dispatchAfterAccept(input: {
    jobId: string;
    ownerId: string;
    storeVersion: number;
    request: HeadlessRenderJobRequestV1;
    idempotencyAuthorityKey: string;
    job: HeadlessRenderJobV1;
    nowMs: number;
  }): Promise<HeadlessCreateJobResult> {
    void input.storeVersion;
    void input.request;
    void input.idempotencyAuthorityKey;
    void input.job;
    return this.continueDispatchToQueued({
      jobId: input.jobId,
      ownerId: input.ownerId,
      nowMs: input.nowMs,
    });
  }

  private async failQueuedAfterEnqueueFailure(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    request: HeadlessRenderJobRequestV1;
    idempotencyAuthorityKey: string;
    nowMs: number;
  }): Promise<HeadlessCreateJobResult> {
    const currentRaw = await this.deps.jobStore.getByJobIdAndOwner(
      input.jobId,
      input.ownerId,
    );
    if (!currentRaw.ok) return currentRaw;
    const currentNarrowed = requireCanonicalStoredJobRecord(currentRaw.value);
    if (!currentNarrowed.ok) {
      return cpOk(toHeadlessPublicJobViewFromStore(currentRaw.value));
    }
    const current = currentNarrowed.value;

    // Worker already claimed or job left queued — preserve worker-owned progression.
    if (current.claimToken != null || current.canonicalJob.state !== "queued") {
      return cpOk(toHeadlessPublicJobView(current.canonicalJob));
    }

    const failed = applyHeadlessJobTransition({
      jobValue: current.canonicalJob,
      requestValue: input.request,
      toState: "failed",
      attempt: current.canonicalJob.attempt,
      updatedAtMs: Math.max(input.nowMs, current.canonicalJob.updatedAtMs + 1),
      terminalReason: { reasonId: "QUEUE_ENQUEUE_FAILED", retryable: true },
    });
    if (!failed.ok) {
      return cpFail("INTERNAL_ERROR", "Failed enqueue-failure transition.");
    }

    const cas = await this.deps.jobStore.compareAndSetTransition({
      jobId: input.jobId,
      ownerId: input.ownerId,
      expectedStoreVersion: current.storeVersion,
      next: {
        job: failed.job,
        request: input.request,
        idempotencyAuthorityKey: input.idempotencyAuthorityKey,
        operationId: current.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!cas.ok) return cas;
    if (cas.value.kind === "stale" || cas.value.kind === "terminal_locked") {
      const again = await this.deps.jobStore.getByJobIdAndOwner(
        input.jobId,
        input.ownerId,
      );
      if (!again.ok) return again;
      return cpOk(toHeadlessPublicJobViewFromStore(again.value));
    }
    if (cas.value.kind !== "updated") {
      return cpFail("STALE_TRANSITION", "Enqueue-failure transition rejected.");
    }

    return cpFailRecoverable(
      "QUEUE_ENQUEUE_FAILED",
      "Job was persisted as queued but broker enqueue failed; use recoverDispatch for a new attempt.",
      toHeadlessPublicJobView(cas.value.record.canonicalJob),
    );
  }

  async getJob(input: {
    requestContext: unknown;
    jobId: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessPublicJobViewV1>> {
    const principalResult = await this.deps.principal.resolvePrincipal(
      input.requestContext,
    );
    if (!principalResult.ok) return principalResult;
    const record = await this.deps.jobStore.getByJobIdAndOwner(
      input.jobId,
      principalResult.value.ownerId,
    );
    if (!record.ok) return record;
    return cpOk(toHeadlessPublicJobViewFromStore(record.value));
  }

  async cancelJob(input: {
    requestContext: unknown;
    jobId: string;
  }): Promise<HeadlessControlPlaneResult<HeadlessPublicJobViewV1>> {
    const principalResult = await this.deps.principal.resolvePrincipal(
      input.requestContext,
    );
    if (!principalResult.ok) return principalResult;
    const principal = principalResult.value;
    const current = await this.deps.jobStore.getByJobIdAndOwner(
      input.jobId,
      principal.ownerId,
    );
    if (!current.ok) return current;

    if (current.value.stage === "provisional") {
      const cancelled = cancelProvisionalRecord(
        current.value,
        Math.max(this.deps.nowMs(), current.value.updatedAtMs + 1),
      );
      if (!cancelled.ok) {
        return cpFail("CANCEL_REJECTED", cancelled.message);
      }
      const cas = await this.deps.jobStore.compareAndSetProvisional({
        jobId: input.jobId,
        ownerId: principal.ownerId,
        expectedStoreVersion: current.value.storeVersion,
        next: cancelled.record,
      });
      if (!cas.ok) return cas;
      if (cas.value.kind === "stale") {
        return cpFail("STALE_TRANSITION", "Stale cancel rejected.");
      }
      if (cas.value.kind === "terminal_locked") {
        return cpFail("TERMINAL_IMMUTABLE", "Terminal job cannot be cancelled.");
      }
      if (cas.value.kind === "already_promoted") {
        return cpFail("CANCEL_REJECTED", "Job was promoted during cancel.");
      }
      return cpOk(toHeadlessPublicJobViewFromStore(cas.value.record));
    }

    const cancelled = applyHeadlessJobTransition({
      jobValue: current.value.canonicalJob,
      requestValue: current.value.canonicalRequest,
      toState: "cancelled",
      attempt: current.value.canonicalJob.attempt,
      updatedAtMs: Math.max(
        this.deps.nowMs(),
        current.value.canonicalJob.updatedAtMs + 1,
      ),
      terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
    });
    if (!cancelled.ok) {
      return cpFail("CANCEL_REJECTED", "Job cannot be cancelled in current state.");
    }

    const cas = await this.deps.jobStore.compareAndSetTransition({
      jobId: input.jobId,
      ownerId: principal.ownerId,
      expectedStoreVersion: current.value.storeVersion,
      next: {
        job: cancelled.job,
        request: current.value.canonicalRequest,
        idempotencyAuthorityKey: current.value.idempotencyAuthorityKey,
        operationId: current.value.operationId,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding: null,
      },
    });
    if (!cas.ok) return cas;
    if (cas.value.kind === "stale") {
      return cpFail("STALE_TRANSITION", "Stale cancel rejected.");
    }
    if (cas.value.kind === "terminal_locked") {
      return cpFail("TERMINAL_IMMUTABLE", "Terminal job cannot be cancelled.");
    }
    return cpOk(toHeadlessPublicJobViewFromStore(cas.value.record));
  }
}
