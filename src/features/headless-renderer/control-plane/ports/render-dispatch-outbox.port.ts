/**
 * Provider-neutral durable render-dispatch outbox port.
 * Memory adapter is test/QA only. Neon is production authority.
 */

import type {
  HeadlessRenderDispatchRejectReasonId,
  HeadlessStoredRenderDispatchOutbox,
} from "../types/render-dispatch-outbox";
import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

export type HeadlessEnsureDispatchIntentInput = {
  readonly jobId: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly attempt: number;
  readonly deliveryId: string;
  readonly nowMs: number;
};

export interface HeadlessRenderDispatchOutboxPort {
  /**
   * Idempotent ensure of a pending (or already-terminal) dispatch intent for a
   * canonical queued job. Reread/validate job first at the service layer.
   * Exact same identity → existing; divergent delivery identity → fail closed.
   */
  ensurePending(input: HeadlessEnsureDispatchIntentInput): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "created";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | {
          readonly kind: "existing";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  >;

  getByDispatchIdAndOwner(
    dispatchId: string,
    ownerId: string,
  ): Promise<HeadlessControlPlaneResult<HeadlessStoredRenderDispatchOutbox>>;

  getByJobAttemptAndOwner(input: {
    readonly jobId: string;
    readonly attempt: number;
    readonly ownerId: string;
  }): Promise<
    HeadlessControlPlaneResult<HeadlessStoredRenderDispatchOutbox | null>
  >;

  /**
   * List due pending intents (next_attempt_at_ms <= nowMs), bounded.
   * Database unavailable → fail (never silent empty).
   */
  listDuePending(input: {
    readonly limit: number;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<readonly HeadlessStoredRenderDispatchOutbox[]>
  >;

  /**
   * Claim a due pending (or expired claimed) intent. At most one live claim.
   */
  claimDue(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly nowMs: number;
    readonly claimLeaseMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "claimed";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  >;

  /** Terminal success after broker XADD + durable confirmation. */
  markDispatched(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "dispatched";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  >;

  /** XADD failure → pending with bounded backoff. */
  releaseWithBackoff(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "pending";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | { readonly kind: "stale" }
      | { readonly kind: "rejected" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  >;

  /** Canonical job incoherent for dispatch → terminal reject (no XADD). */
  reject(input: {
    readonly dispatchId: string;
    readonly ownerId: string;
    readonly claimToken: string;
    readonly expectedStoreVersion: number;
    readonly nowMs: number;
    readonly reasonId: HeadlessRenderDispatchRejectReasonId;
  }): Promise<
    HeadlessControlPlaneResult<
      | {
          readonly kind: "rejected";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
      | { readonly kind: "stale" }
      | {
          readonly kind: "already_terminal";
          readonly record: HeadlessStoredRenderDispatchOutbox;
        }
    >
  >;
}
