/**
 * Read-only hosted verifier observation — never mutates Neon/R2/Redis state.
 * Sprint 11E Phase 2E.2D.7A.2
 */

import {
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  isProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import { stagingRefVerificationTarget } from "@/features/headless-renderer/control-plane/services/provisional-verification-targets";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "@/features/headless-renderer/control-plane/types/owned-object-record";
import type { HeadlessProvisionalStoredJobRecord } from "@/features/headless-renderer/control-plane/types/stored-job-record";

import type { FlyVerifyLiveMatrixContext } from "./types";

export type HostedVerifierObservationStatus =
  | "ok"
  | "read_failed"
  | "session_incomplete"
  | "owned_not_finalized"
  | "claim_not_cleared"
  | "job_not_provisional"
  | "required_targets_mismatch"
  | "manifest_staging_ref_absent"
  | "manifest_staging_ref_duplicate"
  | "manifest_binding_mismatch"
  | "manifest_not_verified"
  | "coverage_complete_unexpected"
  | "promotion_occurred"
  | "render_dispatch_present"
  | "render_delivery_present";

/** Safe aggregate attribution — no secret values, rows, digests, or URLs. */
export type HostedVerifierObservationAttribution = {
  readonly observation_status: HostedVerifierObservationStatus;
};

export type HostedVerifierObservedState = {
  readonly attribution: HostedVerifierObservationAttribution;
  readonly finalized: boolean;
  readonly claimCleared: boolean;
  readonly coverageReconciled: boolean;
  readonly coverageComplete: boolean;
  readonly promoted: boolean;
  readonly renderDispatchPresent: boolean;
  readonly renderQueueDeliveryPresent: boolean;
  readonly verifyPendingCleared: boolean;
  readonly storeVersion: number | null;
};

const EXPECTED_INCOMPLETE_REQUIRED_TARGETS = Object.freeze([
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
] as const);

function attribution(
  observation_status: HostedVerifierObservationStatus,
): HostedVerifierObservationAttribution {
  return Object.freeze({ observation_status });
}

function manifestRefsMatchFinalizedObject(input: {
  readonly ref: {
    readonly locator: { readonly storeId: string; readonly objectKey: string };
    readonly contentDigestClaim: string;
    readonly byteLengthClaim: number;
    readonly mimeTypeClaim: string;
  };
  readonly finalized: HeadlessFinalizedOwnedObjectRecordV1;
  readonly objectId: string;
}): boolean {
  const { ref, finalized, objectId } = input;
  return (
    finalized.objectId === objectId &&
    ref.locator.storeId === finalized.storeId &&
    ref.locator.objectKey === finalized.objectKey &&
    ref.contentDigestClaim === finalized.contentDigest &&
    ref.byteLengthClaim === finalized.byteLength &&
    ref.mimeTypeClaim === finalized.mimeType
  );
}

/**
 * Validate the durable incomplete-coverage snapshot after hosted worker reconcile.
 * Read-only — inspects authoritative Neon rows only.
 */
export function validateDurableIncompleteCoverageSnapshot(input: {
  readonly objectId: string;
  readonly ownerId: string;
  readonly finalized: HeadlessFinalizedOwnedObjectRecordV1;
  readonly provisional: HeadlessProvisionalStoredJobRecord;
}):
  | { readonly ok: true }
  | { readonly ok: false; readonly status: HostedVerifierObservationStatus } {
  const { objectId, finalized, provisional } = input;

  if (finalized.verificationClaimToken != null) {
    return { ok: false, status: "claim_not_cleared" };
  }

  const required = provisional.verificationCoverage.requiredTargets;
  if (
    required.length !== EXPECTED_INCOMPLETE_REQUIRED_TARGETS.length ||
    !EXPECTED_INCOMPLETE_REQUIRED_TARGETS.every((t, i) => required[i] === t)
  ) {
    return { ok: false, status: "required_targets_mismatch" };
  }

  const manifestRefs = provisional.stagingObjectRefs.filter(
    (ref) => ref.purpose === "manifest",
  );
  if (manifestRefs.length === 0) {
    return { ok: false, status: "manifest_staging_ref_absent" };
  }
  if (manifestRefs.length !== 1) {
    return { ok: false, status: "manifest_staging_ref_duplicate" };
  }

  const manifestRef = manifestRefs[0]!;
  if (
    stagingRefVerificationTarget(manifestRef) !==
    HEADLESS_VERIFICATION_TARGET_MANIFEST
  ) {
    return { ok: false, status: "manifest_binding_mismatch" };
  }

  if (!manifestRefsMatchFinalizedObject({ ref: manifestRef, finalized, objectId })) {
    return { ok: false, status: "manifest_binding_mismatch" };
  }

  const verified = provisional.verificationCoverage.verifiedTargets;
  if (!verified.includes(HEADLESS_VERIFICATION_TARGET_MANIFEST)) {
    return { ok: false, status: "manifest_not_verified" };
  }
  if (verified.includes(HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD)) {
    return { ok: false, status: "coverage_complete_unexpected" };
  }
  if (provisional.verificationCoverage.complete) {
    return { ok: false, status: "coverage_complete_unexpected" };
  }

  return { ok: true };
}

export async function observeHostedVerifierState(
  ctx: FlyVerifyLiveMatrixContext,
): Promise<HostedVerifierObservedState> {
  if (ctx.pollHostedVerifier != null) {
    const injected = await ctx.pollHostedVerifier();
    return {
      attribution: attribution("ok"),
      finalized: injected.finalized,
      claimCleared: injected.claimCleared,
      coverageReconciled: injected.coverageReconciled,
      coverageComplete: injected.coverageComplete,
      promoted: injected.promoted,
      renderDispatchPresent: injected.renderDispatchPresent,
      renderQueueDeliveryPresent: false,
      verifyPendingCleared: injected.verifyPendingCleared,
      storeVersion: injected.storeVersion,
    };
  }

  const objectId = ctx.session.objectId;
  const jobId = ctx.session.jobId;
  if (objectId == null || jobId == null) {
    return {
      attribution: attribution("session_incomplete"),
      finalized: false,
      claimCleared: false,
      coverageReconciled: false,
      coverageComplete: false,
      promoted: false,
      renderDispatchPresent: false,
      renderQueueDeliveryPresent: false,
      verifyPendingCleared: false,
      storeVersion: null,
    };
  }

  try {
    const owned = await ctx.ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: ctx.ownerId,
    });
    const job = await ctx.jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);

    if (!owned.ok || owned.value == null || !job.ok || job.value == null) {
      return {
        attribution: attribution("read_failed"),
        finalized: false,
        claimCleared: false,
        coverageReconciled: false,
        coverageComplete: false,
        promoted: false,
        renderDispatchPresent: false,
        renderQueueDeliveryPresent: false,
        verifyPendingCleared: false,
        storeVersion: null,
      };
    }

    const finalized = owned.value.record.stage === "finalized";
    const claimCleared = owned.value.record.verificationClaimToken == null;
    const promoted = !isProvisionalStoredJobRecord(job.value);

    if (!finalized) {
      return {
        attribution: attribution("owned_not_finalized"),
        finalized: false,
        claimCleared,
        coverageReconciled: false,
        coverageComplete: false,
        promoted,
        renderDispatchPresent: false,
        renderQueueDeliveryPresent: false,
        verifyPendingCleared: false,
        storeVersion: owned.value.storeVersion,
      };
    }

    if (!claimCleared) {
      return {
        attribution: attribution("claim_not_cleared"),
        finalized: true,
        claimCleared: false,
        coverageReconciled: false,
        coverageComplete: false,
        promoted,
        renderDispatchPresent: false,
        renderQueueDeliveryPresent: false,
        verifyPendingCleared: false,
        storeVersion: owned.value.storeVersion,
      };
    }

    if (!isProvisionalStoredJobRecord(job.value)) {
      return {
        attribution: attribution(promoted ? "promotion_occurred" : "job_not_provisional"),
        finalized: true,
        claimCleared: true,
        coverageReconciled: false,
        coverageComplete: false,
        promoted: true,
        renderDispatchPresent: false,
        renderQueueDeliveryPresent: false,
        verifyPendingCleared: true,
        storeVersion: owned.value.storeVersion,
      };
    }

    let renderDispatchPresent = false;
    if (ctx.dispatchOutbox != null) {
      const outbox = await ctx.dispatchOutbox.getByJobAttemptAndOwner({
        jobId,
        attempt: 1,
        ownerId: ctx.ownerId,
      });
      renderDispatchPresent = outbox.ok && outbox.value != null;
    }

    const renderQueueDeliveryPresent = ctx.trackedStreamIds.some(
      (t) => t.kind !== "verify",
    );

    if (renderDispatchPresent) {
      return {
        attribution: attribution("render_dispatch_present"),
        finalized: true,
        claimCleared: true,
        coverageReconciled: false,
        coverageComplete: job.value.verificationCoverage.complete,
        promoted: false,
        renderDispatchPresent: true,
        renderQueueDeliveryPresent,
        verifyPendingCleared: true,
        storeVersion: owned.value.storeVersion,
      };
    }

    if (renderQueueDeliveryPresent) {
      return {
        attribution: attribution("render_delivery_present"),
        finalized: true,
        claimCleared: true,
        coverageReconciled: false,
        coverageComplete: job.value.verificationCoverage.complete,
        promoted: false,
        renderDispatchPresent: false,
        renderQueueDeliveryPresent: true,
        verifyPendingCleared: true,
        storeVersion: owned.value.storeVersion,
      };
    }

    const snapshot = validateDurableIncompleteCoverageSnapshot({
      objectId,
      ownerId: ctx.ownerId,
      finalized: owned.value.record,
      provisional: job.value,
    });

    const coverageReconciled = snapshot.ok;
    const coverageComplete = job.value.verificationCoverage.complete;

    return {
      attribution: attribution(snapshot.ok ? "ok" : snapshot.status),
      finalized: true,
      claimCleared: true,
      coverageReconciled,
      coverageComplete,
      promoted: false,
      renderDispatchPresent: false,
      renderQueueDeliveryPresent: false,
      verifyPendingCleared: true,
      storeVersion: owned.value.storeVersion,
    };
  } catch {
    return {
      attribution: attribution("read_failed"),
      finalized: false,
      claimCleared: false,
      coverageReconciled: false,
      coverageComplete: false,
      promoted: false,
      renderDispatchPresent: false,
      renderQueueDeliveryPresent: false,
      verifyPendingCleared: false,
      storeVersion: null,
    };
  }
}

export function mapObservationStatusToFailureCategory(
  status: HostedVerifierObservationStatus,
): "COVERAGE_RECONCILE_FAILED" | "COVERAGE_INCOMPLETE_FAILED" | "PROMOTION_RAN_UNEXPECTEDLY" | "RENDER_DISPATCH_PRESENT" {
  switch (status) {
    case "coverage_complete_unexpected":
      return "COVERAGE_INCOMPLETE_FAILED";
    case "promotion_occurred":
      return "PROMOTION_RAN_UNEXPECTEDLY";
    case "render_dispatch_present":
    case "render_delivery_present":
      return "RENDER_DISPATCH_PRESENT";
    default:
      return "COVERAGE_RECONCILE_FAILED";
  }
}
