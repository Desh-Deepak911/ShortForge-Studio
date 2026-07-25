/**
 * Provider-neutral durable orphan-artifact cleanup port.
 * Production composition remains configuration-unavailable until a durable
 * provider exists. Memory adapter is test/QA only.
 */

import type {
  HeadlessArtifactCleanupIntentV1,
  HeadlessArtifactCleanupIntentState,
  HeadlessArtifactCleanupNoDeleteDisposition,
} from "../types/artifact-cleanup-intent";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export interface HeadlessStoredCleanupIntent {
  readonly storeVersion: number;
  readonly intent: HeadlessArtifactCleanupIntentV1;
  readonly state: HeadlessArtifactCleanupIntentState;
  readonly claimToken: string | null;
  readonly claimedAtMs: number | null;
  /**
   * Resolution timestamp for any terminal state (completed | protected | rejected).
   * Does not imply R2 deletion for protected/rejected.
   */
  readonly completedAtMs: number | null;
  readonly idempotencyKey: string;
}

export interface HeadlessArtifactCleanupPort {
  /**
   * Idempotent create. Duplicate idempotencyKey with identical intent → existing.
   * Semantic conflict (same key, different locator/digest) → fail closed.
   */
  createIfAbsent(input: {
    readonly idempotencyKey: string;
    readonly intent: HeadlessArtifactCleanupIntentV1;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "created";
          readonly record: HeadlessStoredCleanupIntent;
        }
      | {
          readonly kind: "existing";
          readonly record: HeadlessStoredCleanupIntent;
        }
    >
  >;

  getByCleanupIdAndOwner(
    cleanupId: string,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredCleanupIntent>>;

  /**
   * Claim a pending (or expired-claim) intent for exclusive delete work.
   * Concurrent claims: at most one succeeds.
   * Terminal states are never reclaimable.
   */
  claimPending(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "claimed"; readonly record: HeadlessStoredCleanupIntent }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredCleanupIntent;
        }
    >
  >;

  /** Mark claimed intent completed after confirmed owned delete. Immutable after. */
  complete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "completed"; readonly record: HeadlessStoredCleanupIntent }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredCleanupIntent;
        }
    >
  >;

  /**
   * Terminal no-delete disposition from a matching claimed lease.
   * Exact replay of the same disposition is idempotent (no storeVersion bump).
   * Does not imply R2 was deleted.
   */
  resolveWithoutDelete(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly disposition: HeadlessArtifactCleanupNoDeleteDisposition;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "resolved"; readonly record: HeadlessStoredCleanupIntent }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredCleanupIntent;
        }
    >
  >;

  /**
   * Release claim after retryable failure — returns to pending.
   * Terminal intents remain immutable.
   */
  failClaim(input: {
    readonly cleanupId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | { readonly kind: "pending"; readonly record: HeadlessStoredCleanupIntent }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredCleanupIntent;
        }
    >
  >;

  /** Owner-scoped pending/claimed intents for maintenance recovery. */
  listRetryableForOwner(
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<readonly HeadlessStoredCleanupIntent[]>>;
}
