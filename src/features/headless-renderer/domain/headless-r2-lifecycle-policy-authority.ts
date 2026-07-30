/**
 * Typed R2 lifecycle policy generation for staging headless export storage.
 *
 * Lifecycle rules are a storage backstop only — durable database authority remains
 * the source of truth for deletion eligibility. Bucket-wide expiration must never
 * target project source prefixes.
 */

import { HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS } from "./headless-export-retention-authority";
import { buildHeadlessStagingArtifactPrefixPattern } from "../control-plane/services/headless-r2-lifecycle-prefix-authority";

export type HeadlessR2LifecycleBucketClass = "assets" | "artifacts";

export type HeadlessR2LifecycleRuleSpec = {
  readonly ruleId: string;
  readonly bucketClass: HeadlessR2LifecycleBucketClass;
  readonly prefixClassification: "staging_export_artifact" | "none";
  readonly expirationDays: number | null;
  readonly abortIncompleteMultipartUploadDays: number | null;
  readonly description: string;
};

/**
 * Application retention is 24 hours; lifecycle uses two days so provider timing
 * cannot delete before the database download boundary.
 */
export const HEADLESS_R2_ARTIFACT_LIFECYCLE_EXPIRATION_DAYS = 2 as const;

/**
 * Builds the exact desired lifecycle policy for staging buckets.
 * Does not contact providers — comparison tooling uses this spec only.
 */
export function buildHeadlessStagingR2LifecyclePolicyRules(): readonly HeadlessR2LifecycleRuleSpec[] {
  const artifactPrefix = buildHeadlessStagingArtifactPrefixPattern();
  return Object.freeze([
    Object.freeze({
      ruleId: "staging-artifacts-export-prefix-expiration",
      bucketClass: "artifacts",
      prefixClassification: "staging_export_artifact",
      expirationDays: HEADLESS_R2_ARTIFACT_LIFECYCLE_EXPIRATION_DAYS,
      abortIncompleteMultipartUploadDays: 1,
      description:
        "Expire finalized staging export artifacts under the canonical prefix only.",
    }),
    Object.freeze({
      ruleId: "staging-artifacts-abort-incomplete-multipart",
      bucketClass: "artifacts",
      prefixClassification: "staging_export_artifact",
      expirationDays: null,
      abortIncompleteMultipartUploadDays: 1,
      description: "Abort stale multipart uploads for staging artifact prefix.",
    }),
    Object.freeze({
      ruleId: "staging-assets-abort-incomplete-multipart-only",
      bucketClass: "assets",
      prefixClassification: "none",
      expirationDays: null,
      abortIncompleteMultipartUploadDays: 1,
      description:
        "Abort incomplete multipart uploads without expiring completed project or export-owned objects.",
    }),
  ]);
}

export type HeadlessR2LifecyclePolicyComparison = {
  readonly expectedRuleIds: readonly string[];
  readonly matches: boolean;
  readonly mismatchedRuleIds: readonly string[];
};

/**
 * Compares a sanitized live policy snapshot to the expected staging rules.
 * Inputs must not contain bucket names, account IDs, or credentials.
 */
export function compareHeadlessStagingR2LifecyclePolicy(input: {
  readonly liveRuleIds: readonly string[];
}): HeadlessR2LifecyclePolicyComparison {
  const expected = buildHeadlessStagingR2LifecyclePolicyRules().map((r) => r.ruleId);
  const live = new Set(input.liveRuleIds);
  const mismatched = expected.filter((id) => !live.has(id));
  return Object.freeze({
    expectedRuleIds: expected,
    matches: mismatched.length === 0,
    mismatchedRuleIds: Object.freeze(mismatched),
  });
}

/**
 * Ensures lifecycle expiration cannot precede application download retention.
 */
export function assertHeadlessR2LifecycleTimingSafe(): boolean {
  return (
    HEADLESS_R2_ARTIFACT_LIFECYCLE_EXPIRATION_DAYS * 86_400_000 >=
    HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS
  );
}
