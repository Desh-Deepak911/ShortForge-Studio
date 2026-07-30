/**
 * Typed R2 lifecycle policy generation for staging headless export storage.
 *
 * Lifecycle rules are a storage backstop only — durable database authority remains
 * the source of truth for deletion eligibility. Unrelated provider lifecycle rules
 * are preserved during merge; only application-owned rules are compared or updated.
 */

import { HEADLESS_ARTIFACT_DOWNLOAD_RETENTION_MS } from "./headless-export-retention-authority";

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

export const HEADLESS_R2_OWNED_ARTIFACT_RULE_ID =
  "staging-artifacts-export-prefix-lifecycle" as const;

export const HEADLESS_R2_OWNED_ASSETS_RULE_ID =
  "staging-assets-abort-incomplete-multipart-only" as const;

/**
 * Builds the exact two owned lifecycle rules for staging buckets.
 * Does not contact providers — comparison tooling uses this spec only.
 */
export function buildHeadlessStagingR2LifecyclePolicyRules(): readonly HeadlessR2LifecycleRuleSpec[] {
  return Object.freeze([
    Object.freeze({
      ruleId: HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
      bucketClass: "artifacts",
      prefixClassification: "staging_export_artifact",
      expirationDays: HEADLESS_R2_ARTIFACT_LIFECYCLE_EXPIRATION_DAYS,
      abortIncompleteMultipartUploadDays: 1,
      description:
        "Expire finalized staging export artifacts under the canonical prefix and abort stale multipart uploads.",
    }),
    Object.freeze({
      ruleId: HEADLESS_R2_OWNED_ASSETS_RULE_ID,
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
 * Compares a sanitized live policy snapshot to the expected owned staging rules.
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
