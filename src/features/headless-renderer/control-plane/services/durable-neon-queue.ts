/**
 * Provider-neutral Neon durable-queue orchestration.
 * Enqueue is the existing canonical create/promote path. Claim-next, lease
 * renew, progress, and expired-lease recovery live on HeadlessJobStorePort.
 * Does not start Fly and does not contact Upstash.
 */

import type { HeadlessJobStorePort } from "../ports/job-store.port";
import { cpOk, type HeadlessControlPlaneResult } from "../types/control-plane.types";

export type RecoverExpiredRenderClaimsOnceSuccess = {
  readonly scanned: number;
  readonly recovered: number;
  readonly live: number;
  readonly rejected: number;
};

export async function recoverExpiredRenderClaimsOnce(input: {
  readonly jobStore: HeadlessJobStorePort;
  readonly nowMs: number;
  readonly leaseMs: number;
  readonly limit: number;
}): Promise<HeadlessControlPlaneResult<RecoverExpiredRenderClaimsOnceSuccess>> {
  const listed = await input.jobStore.listExpiredRenderClaims({
    nowMs: input.nowMs,
    leaseMs: input.leaseMs,
    limit: input.limit,
  });
  if (!listed.ok) return listed;

  let recovered = 0;
  let live = 0;
  let rejected = 0;
  for (const row of listed.value) {
    const result = await input.jobStore.recoverExpiredClaim({
      jobId: row.jobId,
      ownerId: row.ownerId,
      nowMs: input.nowMs,
      leaseMs: input.leaseMs,
      expectedClaimToken: row.claimToken,
    });
    if (!result.ok) {
      rejected += 1;
      continue;
    }
    if (result.value.kind === "failed_expired") {
      recovered += 1;
      continue;
    }
    if (result.value.kind === "rejected_live_claim") {
      live += 1;
      continue;
    }
    rejected += 1;
  }

  return cpOk(
    Object.freeze({
      scanned: listed.value.length,
      recovered,
      live,
      rejected,
    }),
  );
}
