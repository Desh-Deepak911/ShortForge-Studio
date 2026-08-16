/**
 * Atomic job-store port — provider-neutral CAS / idempotency / claim / promotion.
 * Discriminated provisional vs canonical stored records (Phase 2B Phase 1).
 */

import type {
  HeadlessAdvisoryProgress,
  HeadlessRenderJobRequestV1,
  HeadlessRenderJobV1,
} from "../../domain/headless-render.types";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type {
  HeadlessCanonicalCreateLegacyWrite,
  HeadlessCanonicalStoredJobRecord,
  HeadlessProvisionalStoreWrite,
  HeadlessStoredJobRecord,
} from "../types/stored-job-record";

export type {
  HeadlessStoredJobRecord,
  HeadlessProvisionalStoredJobRecord,
  HeadlessCanonicalStoredJobRecord,
  HeadlessProvisionalStoreWrite,
  HeadlessCanonicalStoreWrite,
  HeadlessCanonicalCreateLegacyWrite,
} from "../types/stored-job-record";

export type HeadlessPromoteProvisionalInput = {
  readonly jobId: string;
  readonly ownerId: string;
  readonly expectedStoreVersion: number;
  readonly expectedOperationId: string;
  readonly canonicalRequest: HeadlessRenderJobRequestV1;
  readonly canonicalJob: HeadlessRenderJobV1;
};

export type HeadlessPromoteProvisionalResult =
  | { readonly kind: "updated"; readonly record: HeadlessCanonicalStoredJobRecord }
  | {
      readonly kind: "already_promoted";
      readonly record: HeadlessCanonicalStoredJobRecord;
    }
  | { readonly kind: "stale" }
  | { readonly kind: "rejected"; readonly message: string };

export interface HeadlessJobStorePort {
  /**
   * Canonical-only create for local/fake worker fixtures and the current
   * createJob acceptance path. Requires a full HeadlessRenderJobRequestV1.
   */
  createIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessCanonicalCreateLegacyWrite;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "created"; readonly record: HeadlessCanonicalStoredJobRecord }
      | {
          readonly kind: "existing";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | {
          readonly kind: "conflict";
          readonly existingRequestFingerprint: string;
        }
    >
  >;

  createProvisionalIfAbsent(input: {
    idempotencyAuthorityKey: string;
    record: HeadlessProvisionalStoreWrite;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "created";
          readonly record: HeadlessStoredJobRecord & { readonly stage: "provisional" };
        }
      | {
          readonly kind: "existing";
          readonly record: HeadlessStoredJobRecord;
        }
      | {
          readonly kind: "conflict";
          readonly existingJobId: string;
        }
    >
  >;

  getByJobIdAndOwner(
    jobId: string,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredJobRecord>>;

  compareAndSetProvisional(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessProvisionalStoreWrite;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "updated";
          readonly record: HeadlessStoredJobRecord & { readonly stage: "provisional" };
        }
      | { readonly kind: "stale" }
      | { readonly kind: "terminal_locked" }
      | { readonly kind: "already_promoted" }
    >
  >;

  /**
   * Atomically promote a materializing provisional record with complete
   * verification coverage to a coherent canonical job/request pair.
   * Does not enqueue render work.
   */
  promoteProvisionalToCanonical(
    input: HeadlessPromoteProvisionalInput,
  ): Promise<HeadlessControlPlaneResult<HeadlessPromoteProvisionalResult>>;

  /** Canonical-only CAS transition (rejects provisional records). */
  compareAndSetTransition(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    next: HeadlessCanonicalCreateLegacyWrite;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "updated";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | { readonly kind: "stale" }
      | { readonly kind: "terminal_locked" }
    >
  >;

  /** Canonical queued jobs only — provisional records are never claimable. */
  claimQueuedJob(input: {
    jobId: string;
    ownerId: string;
    expectedStoreVersion: number;
    claimToken: string;
    nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "claimed";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | { readonly kind: "rejected" }
    >
  >;

  /**
   * Atomically claim the next eligible canonical queued job.
   * Neon: `FOR UPDATE SKIP LOCKED`. Two workers cannot win the same job.
   * Empty queue → `{ kind: "empty" }` (not an error).
   */
  claimNextQueuedJob(input: {
    claimToken: string;
    nowMs: number;
    /**
     * When set, skip owners who already have this many live (claimed,
     * non-terminal) render claims. Omit for FIFO-only claim-next.
     */
    maxActiveRendersPerOwner?: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "claimed";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | { readonly kind: "empty" }
    >
  >;

  /**
   * Slide the render lease clock (`claimed_at_ms`) without bumping
   * `store_version`. Rejects token mismatch, missing claim, and terminals.
   */
  renewRenderClaim(input: {
    jobId: string;
    ownerId: string;
    claimToken: string;
    nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "renewed"; readonly claimedAtMs: number }
      | { readonly kind: "rejected" }
    >
  >;

  /**
   * Claim-token-gated advisory progress. Does not overwrite `claimed_at_ms`.
   * Queued → rendering on first persist; later updates stay in the current
   * non-terminal state.
   */
  updateClaimedProgress(input: {
    jobId: string;
    ownerId: string;
    claimToken: string;
    expectedStoreVersion: number;
    nowMs: number;
    progress: HeadlessAdvisoryProgress;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "updated";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | { readonly kind: "terminal_locked" }
    >
  >;

  /**
   * Bounded live claims whose lease clock has expired.
   * Database unavailable → fail (never silent empty).
   */
  listExpiredRenderClaims(input: {
    nowMs: number;
    leaseMs: number;
    limit: number;
  }): Promise<
    HeadlessControlPlaneResult<
      readonly {
        readonly jobId: string;
        readonly ownerId: string;
        readonly claimToken: string;
        readonly claimedAtMs: number;
      }[]
    >
  >;

  /**
   * Recover an expired worker claim on a canonical job.
   * Provisional records are rejected.
   */
  recoverExpiredClaim(input: {
    jobId: string;
    ownerId: string;
    nowMs: number;
    leaseMs: number;
    expectedClaimToken?: string | null;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "failed_expired";
          readonly record: HeadlessCanonicalStoredJobRecord;
        }
      | { readonly kind: "rejected_live_claim" }
      | { readonly kind: "rejected_terminal" }
      | { readonly kind: "rejected" }
    >
  >;

  /**
   * @deprecated Prefer listCanonicalQueuedJobIds — alias for compatibility.
   * Same Result contract as listCanonicalQueuedJobIds (never silent empty on outage).
   */
  listQueuedJobIds(
    limit: number,
  ): Promise<HeadlessControlPlaneResult<readonly string[]>>;

  /**
   * Lists only canonical jobs in queued state without an active render claim.
   * - valid empty queue → ok([])
   * - database unavailable → DATABASE_UNAVAILABLE (not [])
   * - invalid limit → INVALID_TRANSPORT
   */
  listCanonicalQueuedJobIds(
    limit: number,
  ): Promise<HeadlessControlPlaneResult<readonly string[]>>;

  /**
   * Bounded canonical queued / unclaimed dispatch candidates with private
   * identity needed for stable render re-enqueue. Never includes provisional,
   * terminal, claimed, or non-queued jobs.
   * - valid empty queue → ok([])
   * - database unavailable → DATABASE_UNAVAILABLE (not [])
   */
  listCanonicalQueuedDispatchCandidates(
    limit: number,
  ): Promise<
    HeadlessControlPlaneResult<
      readonly {
        readonly jobId: string;
        readonly ownerId: string;
        readonly attempt: number;
        readonly storeVersion: number;
        readonly updatedAtMs: number;
      }[]
    >
  >;
}
