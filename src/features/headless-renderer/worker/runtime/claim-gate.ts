/**
 * Reject jobs that must not enter Chromium/FFmpeg work.
 */

import { isHeadlessTerminalState } from "../../domain";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/ports/job-store.port";
import type { HeadlessWorkerRunFailure } from "./worker-types";

export function assertClaimedWorkerJob(input: {
  record: HeadlessCanonicalStoredJobRecord;
  claimToken: string;
  ownerId: string;
  nowMs: number;
}): HeadlessWorkerRunFailure | null {
  const { record, claimToken, ownerId, nowMs } = input;
  const job = record.canonicalJob;

  if (job.ownership.ownerId !== ownerId) {
    return {
      ok: false,
      reasonId: "INVALID_JOB",
      message: "Job ownership mismatch.",
      retryable: false,
    };
  }

  if (isHeadlessTerminalState(job.state)) {
    return {
      ok: false,
      reasonId: "TERMINAL_STATE_IMMUTABLE",
      message: `Job is terminal (${job.state}).`,
      retryable: false,
    };
  }

  if (job.state !== "queued" && job.state !== "rendering") {
    // Claimed jobs stay queued until first transition; rendering allowed for resume.
    if (job.state === "encoding" || job.state === "validating" || job.state === "uploading") {
      // In-progress worker-owned stages require matching claim.
    } else {
      return {
        ok: false,
        reasonId: "INVALID_JOB",
        message: `Job state ${job.state} is not worker-consumable.`,
        retryable: false,
      };
    }
  }

  if (record.claimToken == null || record.claimToken !== claimToken) {
    return {
      ok: false,
      reasonId: "STALE_ATTEMPT",
      message: "Missing or mismatched claim token.",
      retryable: true,
    };
  }

  // Source lease: every asset descriptor must still be unexpired at worker start.
  for (const asset of record.canonicalRequest.assetBundle.assets) {
    if (!Number.isSafeInteger(asset.expiresAtMs) || nowMs > asset.expiresAtMs) {
      return {
        ok: false,
        reasonId: "EXPIRED",
        message: "Owned asset lease expired before render.",
        retryable: true,
      };
    }
  }

  return null;
}
