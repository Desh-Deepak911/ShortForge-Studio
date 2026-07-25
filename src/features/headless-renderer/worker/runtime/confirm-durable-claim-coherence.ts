/**
 * Exact durable claim coherence — required before Chromium, FFmpeg,
 * workspace creation, or artifact I/O. Never acquires a second claim.
 */

import { isHeadlessTerminalState } from "../../domain";
import type { HeadlessJobStorePort } from "../../control-plane/ports/job-store.port";
import type { HeadlessCanonicalStoredJobRecord } from "../../control-plane/types/stored-job-record";

export type ClaimCoherenceRejectionId =
  | "store_read_failed"
  | "missing_record"
  | "provisional"
  | "terminal"
  | "owner_mismatch"
  | "job_id_mismatch"
  | "project_mismatch"
  | "operation_mismatch"
  | "attempt_mismatch"
  | "claim_token_mismatch"
  | "request_identity_mismatch"
  | "job_identity_mismatch"
  | "state_not_permitted"
  | "claimed_input_invalid";

export type ConfirmDurableClaimCoherenceResult =
  | {
      readonly ok: true;
      readonly record: HeadlessCanonicalStoredJobRecord;
    }
  | {
      readonly ok: false;
      readonly reasonId: ClaimCoherenceRejectionId;
    };

const PERMITTED_CLAIMED_STATES = new Set([
  "queued",
  "rendering",
  "encoding",
  "validating",
  "uploading",
]);

/**
 * Reread the durable record and require exact coherence with the claimed
 * canonical record + claim token before any native or provider work.
 */
export async function confirmDurableClaimCoherence(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly claimedRecord: HeadlessCanonicalStoredJobRecord;
  readonly claimToken: string;
}): Promise<ConfirmDurableClaimCoherenceResult> {
  const claimed = input.claimedRecord;
  const claimToken = input.claimToken;

  if (
    claimed.stage !== "canonical" ||
    typeof claimToken !== "string" ||
    claimToken.length === 0 ||
    claimed.claimedAtMs == null ||
    claimed.claimToken == null
  ) {
    return { ok: false, reasonId: "claimed_input_invalid" };
  }
  if (claimed.claimToken !== claimToken) {
    return { ok: false, reasonId: "claim_token_mismatch" };
  }

  const jobId = claimed.jobId;
  const ownerId = claimed.ownerId;
  if (
    claimed.canonicalJob.jobId !== jobId ||
    claimed.canonicalJob.ownership.ownerId !== ownerId ||
    claimed.canonicalRequest.ownership.ownerId !== ownerId ||
    claimed.projectId !== claimed.canonicalJob.ownership.projectId ||
    claimed.projectId !== claimed.canonicalRequest.ownership.projectId ||
    claimed.canonicalJob.ownership.projectId !==
      claimed.canonicalRequest.ownership.projectId
  ) {
    return { ok: false, reasonId: "claimed_input_invalid" };
  }

  const loaded = await input.jobStore.getByJobIdAndOwner(jobId, ownerId);
  if (!loaded.ok) {
    return { ok: false, reasonId: "store_read_failed" };
  }
  if (loaded.value == null) {
    return { ok: false, reasonId: "missing_record" };
  }

  const fresh = loaded.value;
  if (fresh.stage === "provisional") {
    return { ok: false, reasonId: "provisional" };
  }
  if (fresh.stage !== "canonical") {
    return { ok: false, reasonId: "missing_record" };
  }

  if (fresh.jobId !== jobId || fresh.canonicalJob.jobId !== jobId) {
    return { ok: false, reasonId: "job_id_mismatch" };
  }
  if (
    fresh.ownerId !== ownerId ||
    fresh.canonicalJob.ownership.ownerId !== ownerId ||
    fresh.canonicalRequest.ownership.ownerId !== ownerId
  ) {
    return { ok: false, reasonId: "owner_mismatch" };
  }
  if (
    fresh.projectId !== claimed.projectId ||
    fresh.canonicalJob.ownership.projectId !== claimed.projectId ||
    fresh.canonicalRequest.ownership.projectId !== claimed.projectId
  ) {
    return { ok: false, reasonId: "project_mismatch" };
  }
  if (fresh.operationId !== claimed.operationId) {
    return { ok: false, reasonId: "operation_mismatch" };
  }
  if (fresh.canonicalJob.attempt !== claimed.canonicalJob.attempt) {
    return { ok: false, reasonId: "attempt_mismatch" };
  }
  if (
    fresh.claimToken == null ||
    fresh.claimToken !== claimToken ||
    claimed.claimToken !== claimToken
  ) {
    return { ok: false, reasonId: "claim_token_mismatch" };
  }

  if (
    fresh.canonicalJob.requestFingerprint !==
      claimed.canonicalJob.requestFingerprint ||
    fresh.canonicalJob.renderJobFingerprint !==
      claimed.canonicalJob.renderJobFingerprint ||
    fresh.canonicalRequest.requestFingerprint !==
      claimed.canonicalRequest.requestFingerprint ||
    fresh.idempotencyAuthorityKey !== claimed.idempotencyAuthorityKey
  ) {
    return { ok: false, reasonId: "request_identity_mismatch" };
  }

  if (
    fresh.canonicalJob.manifestFingerprint !==
      claimed.canonicalJob.manifestFingerprint ||
    fresh.canonicalJob.assetBundleFingerprint !==
      claimed.canonicalJob.assetBundleFingerprint ||
    fresh.canonicalJob.rendererBuildId !==
      claimed.canonicalJob.rendererBuildId
  ) {
    return { ok: false, reasonId: "job_identity_mismatch" };
  }

  if (isHeadlessTerminalState(fresh.canonicalJob.state)) {
    return { ok: false, reasonId: "terminal" };
  }

  if (!PERMITTED_CLAIMED_STATES.has(fresh.canonicalJob.state)) {
    return { ok: false, reasonId: "state_not_permitted" };
  }

  return { ok: true, record: fresh };
}
