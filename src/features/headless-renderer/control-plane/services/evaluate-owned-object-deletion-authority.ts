/**
 * Reference-safe owned-object deletion authority.
 *
 * Proves owner, job, purpose, lifecycle stage, and remaining durable references
 * before any export-owned object may be deleted. Object-key prefixes alone never
 * authorize deletion. Project-facing source media outside export-owned copies is
 * out of scope and must never be targeted by these decisions.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import {
  isHeadlessAbandonedProvisionalUploadEligible,
  evaluateHeadlessArtifactDownloadEligibility,
} from "../../domain/headless-export-retention-authority";
import type { HeadlessStoredJobRecord } from "../ports/job-store.port";
import type { HeadlessOwnedObjectRecordV1 } from "../types/owned-object-record";
import {
  isHeadlessArtifactOwnedObjectPurpose,
  isHeadlessSourceOwnedObjectPurpose,
} from "./owned-object-purpose-authority";
import { evaluateArtifactDeletionEligibility } from "./evaluate-artifact-deletion-eligibility";

export type HeadlessOwnedObjectDeletionDecision =
  | {
      readonly ok: true;
      readonly terminalReason: string;
      readonly deletionClass:
        | "export_owned_temporary"
        | "export_owned_artifact_orphan"
        | "export_owned_source_copy"
        | "retention_expired_artifact";
    }
  | {
      readonly ok: false;
      readonly kind:
        | "rejected"
        | "protected"
        | "reference_ambiguous"
        | "environment_rejected";
      readonly message: string;
      readonly safeClassification:
        | "cross_owner"
        | "cross_job"
        | "unknown_purpose"
        | "live_job_reference"
        | "project_source_protected"
        | "downloadable_artifact"
        | "reference_check_unavailable"
        | "non_staging";
    };

export type HeadlessOwnedObjectDeletionExpectation = {
  readonly ownerId: string;
  readonly projectId: string;
  readonly jobId: string;
  readonly operationId: string;
  readonly envName: string;
};

/**
 * Determines whether an owned object may be deleted under durable authority.
 *
 * Fails closed when ownership, purpose, references, or environment cannot be
 * established. Already-absent objects should be handled by the deletion saga as
 * idempotent success and do not require a positive decision here.
 */
export function evaluateOwnedObjectDeletionAuthority(input: {
  readonly expectation: HeadlessOwnedObjectDeletionExpectation;
  readonly job: HeadlessStoredJobRecord;
  readonly record: HeadlessOwnedObjectRecordV1;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly attempt: number;
  readonly nowMs: number;
  readonly allowLiveStagingCleanup?: boolean;
  /** Active durable references outside this job/export (0 means unreferenced). */
  readonly externalActiveReferenceCount: number;
  /** When true, skip provider deletion and return eligibility only. */
  readonly dryRun?: boolean;
}): HeadlessOwnedObjectDeletionDecision {
  const staging = input.expectation.envName === "staging";
  if (!staging) {
    return {
      ok: false,
      kind: "environment_rejected",
      message: "Cleanup rejected outside staging.",
      safeClassification: "non_staging",
    };
  }

  const { record, expectation } = input;
  if (record.ownerId !== expectation.ownerId) {
    return {
      ok: false,
      kind: "rejected",
      message: "Owner mismatch rejected.",
      safeClassification: "cross_owner",
    };
  }
  if (
    record.projectId !== expectation.projectId ||
    record.jobId !== expectation.jobId ||
    record.operationId !== expectation.operationId
  ) {
    return {
      ok: false,
      kind: "rejected",
      message: "Job/export association mismatch rejected.",
      safeClassification: "cross_job",
    };
  }

  if (
    !isHeadlessArtifactOwnedObjectPurpose(record.purpose) &&
    !isHeadlessSourceOwnedObjectPurpose(record.purpose)
  ) {
    return {
      ok: false,
      kind: "rejected",
      message: "Unknown owned-object purpose rejected.",
      safeClassification: "unknown_purpose",
    };
  }

  if (input.externalActiveReferenceCount < 0) {
    return {
      ok: false,
      kind: "reference_ambiguous",
      message: "Reference authority unavailable.",
      safeClassification: "reference_check_unavailable",
    };
  }

  if (input.externalActiveReferenceCount > 0) {
    return {
      ok: false,
      kind: "protected",
      message: "Referenced export-owned object protected.",
      safeClassification: "project_source_protected",
    };
  }

  if (isHeadlessArtifactOwnedObjectPurpose(record.purpose)) {
    if (record.storeId !== "artifacts") {
      return {
        ok: false,
        kind: "rejected",
        message: "Artifact store class rejected.",
        safeClassification: "unknown_purpose",
      };
    }
    const artifactEligibility = evaluateArtifactDeletionEligibility({
      job: input.job,
      record,
      locator: input.locator,
      attempt: input.attempt,
      allowLiveStagingCleanup: input.allowLiveStagingCleanup === true,
    });
    if (!artifactEligibility.ok) {
      return {
        ok: false,
        kind: artifactEligibility.kind === "protected" ? "protected" : "rejected",
        message: artifactEligibility.message,
        safeClassification:
          artifactEligibility.kind === "protected"
            ? "downloadable_artifact"
            : "cross_job",
      };
    }
    if (
      input.job.stage === "canonical" &&
      input.job.canonicalJob.state === "succeeded" &&
      record.stage === "finalized" &&
      record.expiresAtMs != null
    ) {
      const download = evaluateHeadlessArtifactDownloadEligibility({
        nowMs: input.nowMs,
        expiresAtMs: record.expiresAtMs,
        jobState: "succeeded",
      });
      if (download.ok) {
        return {
          ok: false,
          kind: "protected",
          message: "Downloadable artifact protected until retention expiry.",
          safeClassification: "downloadable_artifact",
        };
      }
      return {
        ok: true,
        terminalReason: "retention_expired_artifact",
        deletionClass: "retention_expired_artifact",
      };
    }
    return {
      ok: true,
      terminalReason: artifactEligibility.terminalReason,
      deletionClass: "export_owned_artifact_orphan",
    };
  }

  if (record.storeId !== "assets") {
    return {
      ok: false,
      kind: "rejected",
      message: "Source copy store class rejected.",
      safeClassification: "unknown_purpose",
    };
  }

  if (input.job.stage !== "canonical") {
    return {
      ok: false,
      kind: "rejected",
      message: "Provisional job source cleanup rejected.",
      safeClassification: "cross_job",
    };
  }

  const state = input.job.canonicalJob.state;
  if (
    state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "expired"
  ) {
    if (
      record.stage === "staging" &&
      isHeadlessAbandonedProvisionalUploadEligible({
        createdAtMs: record.createdAtMs,
        nowMs: input.nowMs,
        stage: "staging",
      })
    ) {
      return {
        ok: true,
        terminalReason: "abandoned_provisional_upload",
        deletionClass: "export_owned_temporary",
      };
    }
    if (
      state === "succeeded" &&
      (record.stage === "finalized" || record.stage === "staging")
    ) {
      return {
        ok: true,
        terminalReason: "export_source_copy_unreferenced",
        deletionClass: "export_owned_source_copy",
      };
    }
    if (
      (state === "failed" || state === "cancelled" || state === "expired") &&
      (record.stage === "staging" ||
        record.stage === "finalized" ||
        record.stage === "rejected" ||
        record.stage === "cleanup_pending")
    ) {
      return {
        ok: true,
        terminalReason: "terminal_export_source_copy",
        deletionClass: "export_owned_source_copy",
      };
    }
  }

  if (
    state === "rendering" ||
    state === "encoding" ||
    state === "queued" ||
    state === "uploading" ||
    state === "validating" ||
    state === "materializing" ||
    state === "created"
  ) {
    return {
      ok: false,
      kind: "protected",
      message: "Live job source copy protected.",
      safeClassification: "live_job_reference",
    };
  }

  return {
    ok: false,
    kind: "rejected",
    message: "Owned object deletion rejected.",
    safeClassification: "unknown_purpose",
  };
}
