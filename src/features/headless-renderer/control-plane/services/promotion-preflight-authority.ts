/**
 * Pure shared promotion preflight authority for memory + Neon adapters.
 * Returns bounded reason IDs; preserves existing reject messages byte-for-byte.
 * Internal control-plane service — not a public Headless barrel export.
 */

import { validateHeadlessRenderJobCoherence } from "../../domain/validate-headless-coherence";
import { HEADLESS_STORED_JOB_RECORD_VERSION } from "../types/stored-job-record";
import type {
  HeadlessCanonicalStoredJobRecord,
  HeadlessProvisionalStoredJobRecord,
  HeadlessStoredJobRecord,
} from "../types/stored-job-record";
import type { HeadlessPromoteProvisionalInput } from "../ports/job-store.port";
import { assertStoredBindingStateRules } from "./validate-artifact-object-binding";
import { validateHeadlessCanonicalStoredJobRecord } from "./validate-provisional-stored-job";
import {
  alreadyPromotedAuthorityMatches,
  profilesMatch,
} from "./job-store-authority";
import { coverageCompleteFromSets } from "./provisional-verification-targets";
import {
  type HeadlessPromotionReasonId,
} from "./promotion-reason-ids";
import { provisionalSnapshotSlotClaimsMatchBundle } from "./provisional-snapshot-slot-authority";

function coverageIsComplete(
  record: HeadlessProvisionalStoredJobRecord,
): boolean {
  return (
    record.verificationCoverage.complete &&
    coverageCompleteFromSets(
      record.verificationCoverage.requiredTargets,
      record.verificationCoverage.verifiedTargets,
    )
  );
}

export type HeadlessPromotionPreflightReject = {
  readonly ok: false;
  readonly outcome: "rejected" | "stale";
  readonly reasonId: HeadlessPromotionReasonId;
  /** Exact production-facing message historically returned by adapters. */
  readonly message: string;
};

export type HeadlessPromotionPreflightAlreadyPromoted = {
  readonly ok: false;
  readonly outcome: "already_promoted";
  readonly reasonId: null;
  readonly record: HeadlessCanonicalStoredJobRecord;
};

export type HeadlessPromotionPreflightProceed = {
  readonly ok: true;
  readonly record: HeadlessCanonicalStoredJobRecord;
};

export type HeadlessPromotionPreflightResult =
  | HeadlessPromotionPreflightProceed
  | HeadlessPromotionPreflightReject
  | HeadlessPromotionPreflightAlreadyPromoted;

function reject(
  reasonId: HeadlessPromotionReasonId,
  message: string,
  outcome: HeadlessPromotionPreflightReject["outcome"] = "rejected",
): HeadlessPromotionPreflightReject {
  return { ok: false, outcome, reasonId, message };
}

/**
 * Evaluate promotion preflight against a locked/read stored job record.
 * Hostile / unexpected inputs fail closed as unknown_safe_failure.
 */
export function evaluateHeadlessPromotionPreflight(input: {
  readonly current: HeadlessStoredJobRecord;
  readonly promote: HeadlessPromoteProvisionalInput;
}): HeadlessPromotionPreflightResult {
  try {
    const { current, promote } = input;

    if (current.stage === "canonical") {
      if (alreadyPromotedAuthorityMatches(current, promote)) {
        return {
          ok: false,
          outcome: "already_promoted",
          reasonId: null,
          record: current,
        };
      }
      return reject(
        "already_promoted_mismatch",
        "Forged or mismatched promotion against an existing canonical job rejected.",
      );
    }

    if (current.storeVersion !== promote.expectedStoreVersion) {
      return reject("stale_store_version", "", "stale");
    }

    if (current.state !== "materializing") {
      return reject(
        "provisional_not_materializing",
        "Cancelled/failed/expired provisional records cannot promote.",
      );
    }

    if (current.operationId !== promote.expectedOperationId) {
      return reject(
        "operation_lineage_mismatch",
        "expectedOperationId mismatch.",
      );
    }

    if (!coverageIsComplete(current)) {
      return reject(
        "coverage_incomplete",
        "Verification coverage is incomplete.",
      );
    }

    const coherent = validateHeadlessRenderJobCoherence(
      promote.canonicalJob,
      promote.canonicalRequest,
    );
    if (!coherent.ok) {
      return reject(
        "canonical_coherence_invalid",
        "Canonical job/request coherence failed.",
      );
    }

    if (coherent.job.jobId !== current.jobId) {
      return reject(
        "job_identity_mismatch",
        "jobId must be unchanged across promotion.",
      );
    }

    if (
      coherent.job.ownership.ownerId !== current.ownerId ||
      coherent.job.ownership.projectId !== current.projectId ||
      coherent.request.ownership.ownerId !== current.ownerId ||
      coherent.request.ownership.projectId !== current.projectId
    ) {
      return reject(
        "ownership_mismatch",
        "ownerId/projectId must match provisional authority.",
      );
    }

    if (
      !profilesMatch(
        current.requestedRendererProfile,
        coherent.job.rendererProfile,
      ) ||
      coherent.job.rendererBuildId !== current.requestedRendererBuildId ||
      coherent.request.rendererBuildId !== current.requestedRendererBuildId
    ) {
      return reject(
        "profile_build_mismatch",
        "Renderer profile/build must match provisional request.",
      );
    }

    const bundleFingerprintMatches =
      coherent.job.assetBundleFingerprint ===
        current.snapshotClaim.assetBundleFingerprintClaim &&
      coherent.request.assetBundle.fingerprint ===
        current.snapshotClaim.assetBundleFingerprintClaim;
    const slotClaimsMatch = provisionalSnapshotSlotClaimsMatchBundle(
      current.snapshotClaim.expectedSlotClaims,
      coherent.request.assetBundle,
    );
    if (
      (!bundleFingerprintMatches && !slotClaimsMatch) ||
      coherent.job.manifestFingerprint !== coherent.request.manifestFingerprint
    ) {
      return reject(
        "snapshot_fingerprint_mismatch",
        "Manifest/bundle fingerprints must match provisional claims.",
      );
    }

    const initialState = coherent.job.state;
    if (
      initialState !== "created" &&
      initialState !== "materializing" &&
      initialState !== "queued"
    ) {
      return reject(
        "illegal_initial_state",
        "Canonical initial state illegal for post-materialization promotion.",
      );
    }

    const bindingRules = assertStoredBindingStateRules({
      job: coherent.job,
      request: coherent.request,
      binding: null,
    });
    if (!bindingRules.ok) {
      return reject("binding_rule_mismatch", bindingRules.message);
    }

    const updatedAtMs = Math.max(
      coherent.job.updatedAtMs,
      current.updatedAtMs + 1,
    );
    const draft: HeadlessCanonicalStoredJobRecord = {
      version: HEADLESS_STORED_JOB_RECORD_VERSION,
      stage: "canonical",
      storeVersion: current.storeVersion + 1,
      jobId: current.jobId,
      ownerId: current.ownerId,
      projectId: current.projectId,
      createdAtMs: current.createdAtMs,
      updatedAtMs,
      idempotencyAuthorityKey: current.idempotencyAuthorityKey,
      operationId: current.operationId,
      canonicalJob: {
        ...coherent.job,
        updatedAtMs,
        createdAtMs: current.createdAtMs,
      },
      canonicalRequest: coherent.request,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    };

    const reCoherent = validateHeadlessRenderJobCoherence(
      draft.canonicalJob,
      draft.canonicalRequest,
    );
    if (!reCoherent.ok) {
      return reject(
        "timestamp_recoherence_failed",
        "Promotion timestamp adjustment broke coherence.",
      );
    }

    const validated = validateHeadlessCanonicalStoredJobRecord({
      ...draft,
      canonicalJob: reCoherent.job,
      canonicalRequest: reCoherent.request,
    });
    if (!validated.ok) {
      return reject("canonical_record_invalid", validated.message);
    }

    return { ok: true, record: validated.record };
  } catch {
    return reject(
      "unknown_safe_failure",
      "Hostile or unreadable promotion input rejected.",
    );
  }
}
