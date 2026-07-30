/**
 * Staging artifact and metadata retention authority for headless exports.
 *
 * Centralizes TTL boundaries used by download eligibility, maintenance sweeps,
 * and the lifecycle-policy specification consumed by later deployment phases.
 * Values apply to export-owned storage only — never to draft/project media.
 */

import type { HeadlessJobState } from "./headless-render.types";

/** Successful downloadable artifact retention (24 hours). */
export const HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS = 86_400_000 as const;

/** Abandoned provisional upload objects become cleanup-eligible after 1 hour. */
export const HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS = 3_600_000 as const;

/** Completed dispatch outbox rows become eligible after 24 hours. */
export const HEADLESS_COMPLETED_OUTBOX_RETENTION_MS = 86_400_000 as const;

/** Terminal job metadata becomes eligible after 7 days. */
export const HEADLESS_TERMINAL_JOB_METADATA_RETENTION_MS = 604_800_000;

/** Cleanup audit aggregates are retained without private identifiers (indefinite class). */
export const HEADLESS_CLEANUP_METRICS_RETENTION_CLASS = "aggregate_only" as const;

export type HeadlessArtifactRetentionClass =
  | "downloadable_artifact"
  | "failed_provisional"
  | "abandoned_provisional"
  | "terminal_metadata"
  | "completed_outbox";

export type HeadlessArtifactDownloadEligibility =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "artifact_expired" | "artifact_unavailable";
    };

/**
 * Derives artifact expiry from finalize time using the staging retention window.
 * Does not mutate storage or expose private locator identity.
 */
export function deriveHeadlessArtifactExpiresAtMs(finalizedAtMs: number): number {
  if (!Number.isFinite(finalizedAtMs) || finalizedAtMs < 0) {
    return 0;
  }
  return finalizedAtMs + HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS;
}

/**
 * Determines whether an authorized owner may receive a download capability
 * before artifact retention expires.
 */
export function evaluateHeadlessArtifactDownloadEligibility(input: {
  readonly nowMs: number;
  readonly expiresAtMs: number | null;
  readonly jobState: HeadlessJobState;
}): HeadlessArtifactDownloadEligibility {
  if (input.jobState !== "succeeded") {
    return { ok: false, reason: "artifact_unavailable" };
  }
  if (
    input.expiresAtMs == null ||
    !Number.isFinite(input.expiresAtMs) ||
    input.nowMs >= input.expiresAtMs
  ) {
    return { ok: false, reason: "artifact_expired" };
  }
  return { ok: true };
}

/**
 * Provisional upload objects with no finalize progress become eligible after
 * the abandoned interval elapses.
 */
export function isHeadlessAbandonedProvisionalUploadEligible(input: {
  readonly createdAtMs: number;
  readonly nowMs: number;
  readonly stage: "staging" | "finalized" | "cleanup_pending" | "rejected";
}): boolean {
  if (input.stage !== "staging") {
    return false;
  }
  return input.nowMs - input.createdAtMs >= HEADLESS_ABANDONED_PROVISIONAL_UPLOAD_MS;
}

/**
 * Terminal job metadata rows may be purged only after the metadata retention window.
 */
export function isHeadlessTerminalJobMetadataEligible(input: {
  readonly terminalAtMs: number;
  readonly nowMs: number;
  readonly state: HeadlessJobState;
}): boolean {
  if (
    input.state !== "succeeded" &&
    input.state !== "failed" &&
    input.state !== "cancelled" &&
    input.state !== "expired"
  ) {
    return false;
  }
  return input.nowMs - input.terminalAtMs >= HEADLESS_TERMINAL_JOB_METADATA_RETENTION_MS;
}

/**
 * Completed outbox dispatch rows become eligible after the outbox retention window.
 */
export function isHeadlessCompletedOutboxRowEligible(input: {
  readonly terminalAtMs: number;
  readonly nowMs: number;
  readonly state: "completed" | "failed" | "pending" | "claimed";
}): boolean {
  if (input.state !== "completed" && input.state !== "failed") {
    return false;
  }
  return input.nowMs - input.terminalAtMs >= HEADLESS_COMPLETED_OUTBOX_RETENTION_MS;
}

export type HeadlessR2LifecyclePolicyRuleSpec = {
  readonly id: string;
  readonly description: string;
  readonly prefixClass: "export_owned_temporary" | "export_owned_artifact";
  readonly expirationDays: number | null;
  readonly abortIncompleteMultipartUploadDays: number | null;
  readonly notes: string;
};

/**
 * Exact desired R2 lifecycle policy for a later controlled rollout phase.
 * This module does not configure providers — it only documents intent.
 */
export function buildHeadlessStagingR2LifecyclePolicySpec(): readonly HeadlessR2LifecyclePolicyRuleSpec[] {
  return Object.freeze([
    Object.freeze({
      id: "staging-artifact-download-retention",
      description:
        "Delete export-owned artifact objects after the 24-hour download window.",
      prefixClass: "export_owned_artifact",
      expirationDays: 1,
      abortIncompleteMultipartUploadDays: 1,
      notes:
        "Must remain consistent with HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS and durable expiresAtMs.",
    }),
    Object.freeze({
      id: "staging-abandoned-provisional-uploads",
      description:
        "Expire unfinalized export-owned staging uploads after 1 hour.",
      prefixClass: "export_owned_temporary",
      expirationDays: null,
      abortIncompleteMultipartUploadDays: 1,
      notes:
        "Durable authority still verifies ownership before delete; lifecycle is a backstop only.",
    }),
  ]);
}

/**
 * Cleanup and retention maintenance executes only in staging. Production and
 * unknown environments fail closed before any deletion authority is evaluated.
 */
export function assertHeadlessCleanupStagingEnvironment(
  envName: string | null | undefined,
):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "non_staging_environment" } {
  if (envName !== "staging") {
    return { ok: false, reason: "non_staging_environment" };
  }
  return { ok: true };
}
