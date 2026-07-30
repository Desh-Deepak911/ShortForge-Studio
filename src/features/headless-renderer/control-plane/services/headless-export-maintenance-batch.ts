/**
 * Provider-independent maintenance batch for export cleanup and retention.
 *
 * Consumes durable eligibility only — never contacts object storage directly.
 * A later phase wires this core to a scheduler; overlapping runs are rejected
 * through a lease/claim boundary.
 */

import { randomUUID } from "node:crypto";

import { assertHeadlessCleanupStagingEnvironment } from "../../domain/headless-export-retention-authority";
import type { HeadlessArtifactCleanupPort } from "../ports/artifact-cleanup.port";
import type { HeadlessArtifactObjectIOPort } from "../ports/artifact-object-io.port";
import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import {
  buildHeadlessExportCleanupMetrics,
  type HeadlessExportCleanupMetricsV1,
} from "./headless-export-cleanup-metrics";
import { processHeadlessArtifactCleanupOnce } from "./process-artifact-cleanup";
import {
  evaluateOwnedObjectDeletionAuthority,
  type HeadlessOwnedObjectDeletionExpectation,
} from "./evaluate-owned-object-deletion-authority";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export const HEADLESS_MAINTENANCE_DEFAULT_BATCH_SIZE = 25 as const;
export const HEADLESS_MAINTENANCE_MAX_DELETIONS_PER_RUN = 50 as const;
export const HEADLESS_MAINTENANCE_LEASE_MS = 120_000 as const;

export type HeadlessMaintenanceBatchCursor = {
  readonly ownerId: string;
  readonly lastObjectId: string | null;
};

export type HeadlessMaintenanceBatchItemResult =
  | { readonly kind: "deleted"; readonly classification: string }
  | { readonly kind: "protected"; readonly classification: string }
  | { readonly kind: "rejected"; readonly classification: string }
  | { readonly kind: "dry_run_eligible"; readonly classification: string }
  | { readonly kind: "already_absent"; readonly classification: string }
  | { readonly kind: "retry_scheduled"; readonly classification: string };

export type HeadlessMaintenanceBatchResult = {
  readonly status: "completed" | "lease_rejected" | "environment_rejected";
  readonly processed: number;
  readonly items: readonly HeadlessMaintenanceBatchItemResult[];
  readonly metrics: HeadlessExportCleanupMetricsV1;
  readonly nextCursor: HeadlessMaintenanceBatchCursor | null;
};

type MaintenanceLeaseRecord = {
  readonly leaseToken: string;
  readonly ownerId: string;
  readonly expiresAtMs: number;
};

const inMemoryLeases = new Map<string, MaintenanceLeaseRecord>();

/**
 * Claims an exclusive maintenance lease for one owner scope. Concurrent claims
 * fail closed until the prior lease expires.
 */
export function claimHeadlessMaintenanceLease(input: {
  readonly ownerId: string;
  readonly nowMs: number;
  readonly leaseMs?: number;
}):
  | { readonly ok: true; readonly leaseToken: string }
  | { readonly ok: false; readonly reason: "lease_rejected" } {
  const existing = inMemoryLeases.get(input.ownerId);
  if (existing != null && existing.expiresAtMs > input.nowMs) {
    return { ok: false, reason: "lease_rejected" };
  }
  const leaseToken = randomUUID();
  inMemoryLeases.set(
    input.ownerId,
    Object.freeze({
      leaseToken,
      ownerId: input.ownerId,
      expiresAtMs: input.nowMs + (input.leaseMs ?? HEADLESS_MAINTENANCE_LEASE_MS),
    }),
  );
  return { ok: true, leaseToken };
}

export function releaseHeadlessMaintenanceLease(input: {
  readonly ownerId: string;
  readonly leaseToken: string;
}): void {
  const existing = inMemoryLeases.get(input.ownerId);
  if (existing?.leaseToken === input.leaseToken) {
    inMemoryLeases.delete(input.ownerId);
  }
}

/**
 * Processes one bounded maintenance batch using durable deletion authority only.
 *
 * Does not perform provider deletes directly — artifact orphan intents are
 * replayed through the existing deletion saga. Dry-run mode classifies items
 * without mutating storage.
 */
export async function runHeadlessExportMaintenanceBatchOnce(input: {
  readonly envName: string;
  readonly ownerId: string;
  readonly nowMs: () => number;
  readonly leaseToken: string;
  readonly cleanup: HeadlessArtifactCleanupPort;
  readonly ownedObjectStore: HeadlessOwnedObjectStorePort;
  readonly jobStore: HeadlessJobStorePort;
  readonly objectIo: HeadlessArtifactObjectIOPort;
  readonly expectation: HeadlessOwnedObjectDeletionExpectation;
  readonly cursor?: HeadlessMaintenanceBatchCursor | null;
  readonly batchSize?: number;
  readonly maxDeletions?: number;
  readonly dryRun?: boolean;
  readonly countExternalReferences?: (input: {
    readonly objectId: string;
    readonly ownerId: string;
    readonly jobId: string;
  }) => Promise<number>;
}): Promise<HeadlessControlPlaneResult<HeadlessMaintenanceBatchResult>> {
  const staging = assertHeadlessCleanupStagingEnvironment(input.envName);
  if (!staging.ok) {
    return cpOk({
      status: "environment_rejected",
      processed: 0,
      items: Object.freeze([]),
      metrics: buildHeadlessExportCleanupMetrics({
        cleanupAttempts: 0,
        cleanupSuccesses: 0,
        cleanupFailures: 0,
        retryBacklog: 0,
        rejectedUnsafeDeletions: 0,
        projectSourceDeletionAttempts: 0,
        expiredArtifactCount: 0,
        orphanCandidates: 0,
        storedArtifactCount: 0,
        estimatedStoredArtifactBytesClass: "unknown",
        oldestPendingCleanupAgeClass: "none",
      }),
      nextCursor: null,
    });
  }

  const lease = inMemoryLeases.get(input.ownerId);
  if (lease?.leaseToken !== input.leaseToken || lease.expiresAtMs <= input.nowMs()) {
    return cpOk({
      status: "lease_rejected",
      processed: 0,
      items: Object.freeze([]),
      metrics: buildHeadlessExportCleanupMetrics({
        cleanupAttempts: 0,
        cleanupSuccesses: 0,
        cleanupFailures: 0,
        retryBacklog: 0,
        rejectedUnsafeDeletions: 0,
        projectSourceDeletionAttempts: 0,
        expiredArtifactCount: 0,
        orphanCandidates: 0,
        storedArtifactCount: 0,
        estimatedStoredArtifactBytesClass: "unknown",
        oldestPendingCleanupAgeClass: "none",
      }),
      nextCursor: input.cursor ?? null,
    });
  }

  const batchSize = input.batchSize ?? HEADLESS_MAINTENANCE_DEFAULT_BATCH_SIZE;
  const items: HeadlessMaintenanceBatchItemResult[] = [];
  let rejectedUnsafe = 0;
  let projectSourceAttempts = 0;
  let orphanCandidates = 0;
  let expiredArtifacts = 0;

  const intentBatch = await processHeadlessArtifactCleanupOnce({
    cleanup: input.cleanup,
    ownedObjectStore: input.ownedObjectStore,
    jobStore: input.jobStore,
    objectIo: input.objectIo,
    ownerId: input.ownerId,
    nowMs: input.nowMs,
    limit: batchSize,
  });
  if (intentBatch.ok) {
    items.push(
      Object.freeze({
        kind: "retry_scheduled",
        classification: "cleanup_intent_batch",
      }),
    );
  }

  const candidates = await input.ownedObjectStore.listCleanupCandidates({
    limit: batchSize,
    nowMs: input.nowMs(),
  });
  if (!candidates.ok) {
    return candidates as HeadlessControlPlaneResult<HeadlessMaintenanceBatchResult>;
  }

  let processed = 0;
  for (const stored of candidates.value) {
    if (processed >= batchSize) break;
    const record = stored.record;
    orphanCandidates += 1;
    const job = await input.jobStore.getByJobIdAndOwner(
      record.jobId,
      record.ownerId,
    );
    if (!job.ok) {
      rejectedUnsafe += 1;
      items.push(
        Object.freeze({
          kind: "rejected",
          classification: "job_reference_unavailable",
        }),
      );
      processed += 1;
      continue;
    }

    const externalRefs =
      (await input.countExternalReferences?.({
        objectId: record.objectId,
        ownerId: record.ownerId,
        jobId: record.jobId,
      })) ?? 0;

    const decision = evaluateOwnedObjectDeletionAuthority({
      expectation: input.expectation,
      job: job.value,
      record,
      locator: {
        kind: "object_storage",
        storeId: record.storeId,
        objectKey: record.objectKey,
      },
      attempt: job.value.stage === "canonical" ? job.value.canonicalJob.attempt : 1,
      nowMs: input.nowMs(),
      externalActiveReferenceCount: externalRefs,
      dryRun: input.dryRun === true,
    });

    if (!decision.ok) {
      if (decision.safeClassification === "project_source_protected") {
        projectSourceAttempts += 1;
      } else if (
        decision.safeClassification === "cross_owner" ||
        decision.safeClassification === "cross_job" ||
        decision.safeClassification === "unknown_purpose"
      ) {
        rejectedUnsafe += 1;
      }
      if (decision.safeClassification === "downloadable_artifact") {
        expiredArtifacts += 0;
      }
      items.push(
        Object.freeze({
          kind: decision.kind === "protected" ? "protected" : "rejected",
          classification: decision.safeClassification,
        }),
      );
      processed += 1;
      continue;
    }

    if (decision.deletionClass === "retention_expired_artifact") {
      expiredArtifacts += 1;
    }

    if (input.dryRun === true) {
      items.push(
        Object.freeze({
          kind: "dry_run_eligible",
          classification: decision.deletionClass,
        }),
      );
    } else {
      items.push(
        Object.freeze({
          kind: "dry_run_eligible",
          classification: decision.deletionClass,
        }),
      );
    }
    processed += 1;
  }

  const metrics = buildHeadlessExportCleanupMetrics({
    cleanupAttempts: processed,
    cleanupSuccesses: items.filter((i) => i.kind === "dry_run_eligible").length,
    cleanupFailures: items.filter((i) => i.kind === "rejected").length,
    retryBacklog: intentBatch.ok ? intentBatch.value.retryableFailed : 0,
    rejectedUnsafeDeletions: rejectedUnsafe,
    projectSourceDeletionAttempts: projectSourceAttempts,
    expiredArtifactCount: expiredArtifacts,
    orphanCandidates,
    storedArtifactCount: candidates.value.filter(
      (c) => c.record.purpose === "artifact",
    ).length,
    estimatedStoredArtifactBytesClass:
      candidates.value.length > 10 ? "large" : "small",
    oldestPendingCleanupAgeClass:
      orphanCandidates > 0 ? "hours" : "none",
  });

  return cpOk({
    status: "completed",
    processed,
    items: Object.freeze(items),
    metrics,
    nextCursor:
      candidates.value.length > 0
        ? Object.freeze({
            ownerId: input.ownerId,
            lastObjectId:
              candidates.value[candidates.value.length - 1]?.record.objectId ??
              null,
          })
        : input.cursor ?? null,
  });
}
