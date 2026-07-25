/**
 * Control-plane-private durable orphan-artifact cleanup intent.
 * Never projected into safe job views, diagnostics, or creator-visible API JSON.
 * Bound to durable owned-object identity (objectId) — never locator possession alone.
 */

import type { HeadlessStorageLocatorIdentity } from "../../domain/headless-render.types";

export const HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION = 1 as const;

/**
 * Why a finalized orphan object requires durable cleanup after a lost
 * post-finalization CAS (or related failure).
 */
export type HeadlessArtifactCleanupReasonId =
  | "SUCCEEDED_CAS_STALE"
  | "SUCCEEDED_CAS_TERMINAL_LOCKED"
  | "SUCCEEDED_CAS_THROWN"
  | "SUCCEEDED_CAS_REJECTED"
  | "BINDING_VALIDATION_FAILED"
  | "UPLOAD_SESSION_ORPHAN";

export interface HeadlessArtifactCleanupIntentV1 {
  readonly version: typeof HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION;
  readonly cleanupId: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly ownerId: string;
  readonly projectId: string;
  /** Durable owned-object identity — required for cleanup coherence. */
  readonly objectId: string;
  readonly storageLocator: HeadlessStorageLocatorIdentity;
  readonly contentDigest: string;
  readonly reasonId: HeadlessArtifactCleanupReasonId;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export const HEADLESS_ARTIFACT_CLEANUP_INTENT_FIELDS = Object.freeze([
  "version",
  "cleanupId",
  "jobId",
  "attempt",
  "ownerId",
  "projectId",
  "objectId",
  "storageLocator",
  "contentDigest",
  "reasonId",
  "createdAtMs",
  "expiresAtMs",
] as const);

export const HEADLESS_ARTIFACT_CLEANUP_REASON_IDS = Object.freeze([
  "SUCCEEDED_CAS_STALE",
  "SUCCEEDED_CAS_TERMINAL_LOCKED",
  "SUCCEEDED_CAS_THROWN",
  "SUCCEEDED_CAS_REJECTED",
  "BINDING_VALIDATION_FAILED",
  "UPLOAD_SESSION_ORPHAN",
] as const satisfies readonly HeadlessArtifactCleanupReasonId[]);

/**
 * Durable cleanup-intent lifecycle.
 * - pending/claimed: retryable work
 * - completed: R2 absence + durable metadata completion confirmed (delete happened)
 * - protected: terminal no-delete — succeeded binding / protected live artifact
 * - rejected: terminal no-delete — incoherent/invalid authority
 *
 * protected/rejected never imply R2 was deleted and never appear in retry listings.
 */
export type HeadlessArtifactCleanupIntentState =
  | "pending"
  | "claimed"
  | "completed"
  | "protected"
  | "rejected";

/** No-delete terminal dispositions for resolveWithoutDelete. */
export type HeadlessArtifactCleanupNoDeleteDisposition =
  | "protected"
  | "rejected";

export const HEADLESS_ARTIFACT_CLEANUP_NO_DELETE_DISPOSITIONS = Object.freeze([
  "protected",
  "rejected",
] as const satisfies readonly HeadlessArtifactCleanupNoDeleteDisposition[]);

export const HEADLESS_ARTIFACT_CLEANUP_TERMINAL_STATES = Object.freeze([
  "completed",
  "protected",
  "rejected",
] as const satisfies readonly HeadlessArtifactCleanupIntentState[]);

export function isHeadlessArtifactCleanupTerminalState(
  state: HeadlessArtifactCleanupIntentState,
): boolean {
  return (
    state === "completed" || state === "protected" || state === "rejected"
  );
}
