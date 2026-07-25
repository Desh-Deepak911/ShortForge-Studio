/**
 * Job/binding deletion eligibility for artifact cleanup.
 * Terminal non-success decisions are stable because canonical terminal states
 * are immutable — a failed/cancelled/expired job cannot later become succeeded
 * with a coherent binding, so unbound orphan cleanup remains valid.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";
import type { HeadlessStoredJobRecord } from "../ports/job-store.port";
import type { HeadlessOwnedObjectRecordV1 } from "../types/owned-object-record";

export type ArtifactDeletionEligibility =
  | { readonly ok: true; readonly terminalReason: string }
  | {
      readonly ok: false;
      readonly kind: "rejected" | "protected";
      readonly message: string;
    };

function sameLocator(
  a: HeadlessStorageLocatorIdentity,
  b: HeadlessStorageLocatorIdentity,
): boolean {
  return (
    a.kind === b.kind &&
    a.storeId === b.storeId &&
    a.objectKey === b.objectKey
  );
}

function isLiveCanonicalState(state: string): boolean {
  return (
    state === "created" ||
    state === "materializing" ||
    state === "queued" ||
    state === "rendering" ||
    state === "encoding" ||
    state === "validating" ||
    state === "uploading"
  );
}

function isTerminalNonSuccess(state: string): boolean {
  return state === "failed" || state === "cancelled" || state === "expired";
}

/**
 * Decide whether a durable artifact may be deleted under the given job authority.
 */
export function evaluateArtifactDeletionEligibility(input: {
  readonly job: HeadlessStoredJobRecord;
  readonly record: HeadlessOwnedObjectRecordV1;
  readonly locator: HeadlessStorageLocatorIdentity;
  readonly attempt: number;
  /** When true, staging may be deleted on a live job (active upload failure path). */
  readonly allowLiveStagingCleanup: boolean;
}): ArtifactDeletionEligibility {
  const { job, record, locator, attempt } = input;

  if (job.stage === "provisional") {
    return {
      ok: false,
      kind: "rejected",
      message: "Provisional job artifact cleanup rejected.",
    };
  }

  if (job.stage !== "canonical") {
    return {
      ok: false,
      kind: "rejected",
      message: "Job stage rejected for artifact cleanup.",
    };
  }

  const canonical = job.canonicalJob;
  const binding = job.artifactObjectBinding;

  if (canonical.attempt !== attempt) {
    return {
      ok: false,
      kind: "rejected",
      message: "Artifact cleanup attempt mismatch.",
    };
  }

  if (canonical.state === "succeeded") {
    if (binding == null) {
      return {
        ok: false,
        kind: "rejected",
        message: "Succeeded job missing artifact binding.",
      };
    }
    if (sameLocator(binding.storageLocator, locator)) {
      return {
        ok: false,
        kind: "protected",
        message: "Succeeded artifact binding delete rejected.",
      };
    }
    return {
      ok: false,
      kind: "rejected",
      message: "Artifact locator does not match succeeded job binding.",
    };
  }

  if (isLiveCanonicalState(canonical.state)) {
    if (record.stage === "finalized" || record.stage === "cleanup_pending") {
      // cleanup_pending on live job: only allow resume if still staging-orphan path;
      // finalized-origin cleanup_pending should not delete while live.
      if (record.stage === "cleanup_pending") {
        if (record.terminalReason === "upload_session_orphan") {
          return {
            ok: true,
            terminalReason: "upload_session_orphan",
          };
        }
        return {
          ok: false,
          kind: "protected",
          message: "Live job finalized artifact delete rejected.",
        };
      }
      return {
        ok: false,
        kind: "protected",
        message: "Live job finalized artifact delete rejected.",
      };
    }
    if (record.stage === "staging" && input.allowLiveStagingCleanup) {
      return {
        ok: true,
        terminalReason: "upload_session_orphan",
      };
    }
    return {
      ok: false,
      kind: "rejected",
      message: "Live job artifact cleanup rejected.",
    };
  }

  if (isTerminalNonSuccess(canonical.state)) {
    if (record.stage === "staging" || record.stage === "rejected") {
      return {
        ok: true,
        terminalReason: "upload_session_orphan",
      };
    }
    if (record.stage === "finalized" || record.stage === "cleanup_pending") {
      return {
        ok: true,
        terminalReason:
          record.stage === "cleanup_pending" && record.terminalReason
            ? record.terminalReason
            : "finalized_unbound_orphan",
      };
    }
    return {
      ok: false,
      kind: "rejected",
      message: "Owned object stage rejected for cleanup.",
    };
  }

  return {
    ok: false,
    kind: "rejected",
    message: "Job state rejected for artifact cleanup.",
  };
}
