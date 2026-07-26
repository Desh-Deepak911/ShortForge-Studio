/**
 * Recover provisional job staging refs + verification coverage from a finalized
 * owned-object record. Idempotent via CAS. NEVER deletes or relabels the
 * finalized object on coverage failure. Promotion remains blocked until
 * coverage is complete (existing promotion preflight).
 */

import { createHash } from "node:crypto";

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "../ports/owned-object-store.port";
import {
  appendProvisionalStagingObjectRefs,
  updateProvisionalVerificationCoverage,
} from "./provisional-job-lifecycle";
import {
  coverageCompleteFromSets,
  stagingRefVerificationTarget,
} from "./provisional-verification-targets";
import { assertSourcePurposeNotArtifact } from "./owned-object-purpose-authority";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type {
  HeadlessProvisionalStagingObjectRefV1,
  HeadlessProvisionalStoredJobRecord,
} from "../types/stored-job-record";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "../types/owned-object-record";

export type HeadlessReconcileFinalizedCoverageResult = {
  readonly status:
    | "applied"
    | "already_complete"
    | "blocked_incomplete"
    | "not_finalized";
  readonly coverageComplete: boolean;
};

function buildStagingRefFromFinalized(
  record: HeadlessFinalizedOwnedObjectRecordV1,
):
  | { readonly ok: true; readonly ref: HeadlessProvisionalStagingObjectRefV1 }
  | { readonly ok: false; readonly message: string } {
  const purposeGate = assertSourcePurposeNotArtifact(record.purpose);
  if (!purposeGate.ok) return purposeGate;
  if (
    record.purpose !== "manifest" &&
    record.purpose !== "asset_bundle_record" &&
    record.purpose !== "asset_bytes"
  ) {
    return { ok: false, message: "Purpose cannot contribute to coverage." };
  }
  return {
    ok: true,
    ref: {
      purpose: record.purpose,
      slotKey: record.slotKey,
      locator: {
        kind: "object_storage",
        storeId: record.storeId,
        objectKey: record.objectKey,
      },
      contentDigestClaim: record.contentDigest,
      byteLengthClaim: record.byteLength,
      mimeTypeClaim: record.mimeType,
    },
  };
}

async function applyOnce(input: {
  jobStore: HeadlessJobStorePort;
  provisional: HeadlessProvisionalStoredJobRecord;
  refs: readonly HeadlessProvisionalStagingObjectRefV1[];
  nowMs: number;
}): Promise<
  HeadlessControlPlaneResult<HeadlessReconcileFinalizedCoverageResult>
> {
  const { provisional } = input;
  const nextRefs = [...provisional.stagingObjectRefs];
  const finalizedTargets = new Set<string>();

  for (const ref of input.refs) {
    const target = stagingRefVerificationTarget(ref);
    if (target != null) finalizedTargets.add(target);
    const alreadyBound = nextRefs.some((candidate) => {
      const candidateTarget = stagingRefVerificationTarget(candidate);
      return (
        candidateTarget === target &&
        candidate.locator.storeId === ref.locator.storeId &&
        candidate.locator.objectKey === ref.locator.objectKey &&
        candidate.contentDigestClaim === ref.contentDigestClaim &&
        candidate.byteLengthClaim === ref.byteLengthClaim &&
        candidate.mimeTypeClaim === ref.mimeTypeClaim
      );
    });
    if (!alreadyBound) {
      nextRefs.push(ref);
    }
  }

  const effectiveNowMs = Math.max(input.nowMs, provisional.updatedAtMs);
  const stagingWrite = appendProvisionalStagingObjectRefs(
    provisional,
    nextRefs,
    effectiveNowMs,
  );
  if (!stagingWrite.ok) {
    return cpFail("JOB_STORE_COHERENCE_REJECTED", stagingWrite.message);
  }

  const afterStaging: HeadlessProvisionalStoredJobRecord = {
    ...stagingWrite.record,
    storeVersion: provisional.storeVersion,
  };

  const verifiedSet = new Set(provisional.verificationCoverage.verifiedTargets);
  for (const target of finalizedTargets) verifiedSet.add(target);
  const orderedVerified =
    provisional.verificationCoverage.requiredTargets.filter((t) =>
      verifiedSet.has(t),
    );
  const complete = coverageCompleteFromSets(
    provisional.verificationCoverage.requiredTargets,
    orderedVerified,
  );

  const coverageWrite = updateProvisionalVerificationCoverage(
    afterStaging,
    {
      requiredTargets: provisional.verificationCoverage.requiredTargets,
      verifiedTargets: orderedVerified,
      complete,
    },
    provisional.verificationClaimToken ??
      `reconcile_${createHash("sha256")
        .update(`${provisional.ownerId}:${provisional.jobId}`)
        .digest("hex")}`,
    provisional.verificationClaimedAtMs ?? effectiveNowMs,
    effectiveNowMs,
  );
  if (!coverageWrite.ok) {
    return cpFail("JOB_STORE_COHERENCE_REJECTED", coverageWrite.message);
  }

  const cas = await input.jobStore.compareAndSetProvisional({
    jobId: provisional.jobId,
    ownerId: provisional.ownerId,
    expectedStoreVersion: provisional.storeVersion,
    next: coverageWrite.record,
  });
  if (!cas.ok) return cas;

  if (cas.value.kind === "stale") {
    return cpFail("STALE_TRANSITION", "Provisional store version stale.");
  }
  if (cas.value.kind !== "updated") {
    return cpFail(
      "JOB_STORE_COHERENCE_REJECTED",
      "Coverage reconcile could not update provisional job.",
    );
  }

  const after = cas.value.record;
  const wasComplete = provisional.verificationCoverage.complete;
  if (after.verificationCoverage.complete && wasComplete) {
    return cpOk(
      Object.freeze({
        status: "already_complete" as const,
        coverageComplete: true,
      }),
    );
  }
  if (after.verificationCoverage.complete) {
    return cpOk(
      Object.freeze({
        status: "applied" as const,
        coverageComplete: true,
      }),
    );
  }
  return cpOk(
    Object.freeze({
      status: "blocked_incomplete" as const,
      coverageComplete: false,
    }),
  );
}

/**
 * Load finalized owned object + provisional job; append staging ref and update
 * coverage idempotently. Duplicate reconciliation cannot regress coverage.
 */
export async function reconcileFinalizedOwnedObjectCoverage(input: {
  jobStore: HeadlessJobStorePort;
  ownedObjectStore: HeadlessOwnedObjectStorePort;
  objectId: string;
  ownerId: string;
  nowMs: number;
}): Promise<
  HeadlessControlPlaneResult<HeadlessReconcileFinalizedCoverageResult>
> {
  try {
    const owned = await input.ownedObjectStore.getByObjectIdAndOwner({
      objectId: input.objectId,
      ownerId: input.ownerId,
    });
    if (!owned.ok) return owned;
    if (owned.value == null) {
      return cpFail("JOB_NOT_FOUND", "Owned object not found.");
    }
    if (owned.value.record.stage !== "finalized") {
      return cpOk(
        Object.freeze({
          status: "not_finalized" as const,
          coverageComplete: false,
        }),
      );
    }
    const finalized = owned.value.record;

    const jobLoaded = await input.jobStore.getByJobIdAndOwner(
      finalized.jobId,
      input.ownerId,
    );
    if (!jobLoaded.ok) return jobLoaded;
    if (jobLoaded.value.stage !== "provisional") {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Provisional job required for coverage reconcile.",
      );
    }

    let current = jobLoaded.value;
    if (current.verificationCoverage.complete) {
      return cpOk(
        Object.freeze({
          status: "already_complete" as const,
          coverageComplete: true,
        }),
      );
    }

    const listed = await input.ownedObjectStore.listByJobIdAndOwner({
      jobId: finalized.jobId,
      ownerId: input.ownerId,
    });
    if (!listed.ok) return listed;

    // Reconstruct from durable finalized authority on every callback. This
    // closes lost/out-of-order callback gaps for multi-object website exports:
    // any later finalized object can recover coverage for all earlier objects.
    const refs: HeadlessProvisionalStagingObjectRefV1[] = [];
    for (const stored of listed.value) {
      if (stored.record.stage !== "finalized") continue;
      if (stored.record.purpose === "artifact") continue;
      const built = buildStagingRefFromFinalized(stored.record);
      if (!built.ok) {
        return cpFail("HOSTILE_INPUT", built.message);
      }
      refs.push(built.ref);
    }
    if (refs.length === 0) {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "No finalized source objects available for coverage reconcile.",
      );
    }

    const first = await applyOnce({
      jobStore: input.jobStore,
      provisional: current,
      refs,
      nowMs: input.nowMs,
    });
    if (
      first.ok ||
      (!first.ok && first.issues[0]?.code !== "STALE_TRANSITION")
    ) {
      return first;
    }

    // One stale retry
    const reread = await input.jobStore.getByJobIdAndOwner(
      finalized.jobId,
      input.ownerId,
    );
    if (!reread.ok) return reread;
    if (reread.value.stage !== "provisional") {
      return cpFail(
        "JOB_STORE_COHERENCE_REJECTED",
        "Provisional job required for coverage reconcile.",
      );
    }
    current = reread.value;
    if (current.verificationCoverage.complete) {
      return cpOk(
        Object.freeze({
          status: "already_complete" as const,
          coverageComplete: true,
        }),
      );
    }
    return applyOnce({
      jobStore: input.jobStore,
      provisional: current,
      refs,
      nowMs: input.nowMs,
    });
  } catch {
    return cpFail("INTERNAL_ERROR", "Finalized coverage reconcile failed.");
  }
}
