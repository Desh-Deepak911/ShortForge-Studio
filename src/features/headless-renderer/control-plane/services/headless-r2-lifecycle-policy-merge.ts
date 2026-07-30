/**
 * R2 lifecycle merge authority for owned staging export rules.
 *
 * Unrelated provider lifecycle rules are preserved. Only rules owned by this
 * application are compared, replaced, or rejected when misconfigured.
 */

import {
  buildHeadlessStagingR2LifecyclePolicyRules,
  HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
  HEADLESS_R2_OWNED_ASSETS_RULE_ID,
  type HeadlessR2LifecycleBucketClass,
} from "../../domain/headless-r2-lifecycle-policy-authority";

export type HeadlessR2LifecycleRuleClassification =
  | "owned_staging_export_artifact"
  | "owned_staging_assets"
  | "unrelated";

export type HeadlessR2LifecycleSanitizedLiveRule = {
  readonly ruleId: string;
  readonly bucketClass: HeadlessR2LifecycleBucketClass | "unknown";
  readonly prefixClassification:
    | "staging_export_artifact"
    | "none"
    | "production_rejected"
    | "unknown";
  readonly expirationDays: number | null;
  readonly abortIncompleteMultipartUploadDays: number | null;
  readonly classification: HeadlessR2LifecycleRuleClassification;
};

export type HeadlessR2LifecycleMergeDryRun = {
  readonly expectedOwnedRuleIds: readonly string[];
  readonly preservedUnrelatedRuleIds: readonly string[];
  readonly replacedOwnedRuleIds: readonly string[];
  readonly rejectedOwnedRuleIds: readonly string[];
  readonly matches: boolean;
};

const OWNED_RULE_IDS = new Set<string>([
  HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
  HEADLESS_R2_OWNED_ASSETS_RULE_ID,
]);

export function classifyHeadlessR2LifecycleLiveRule(input: {
  readonly ruleId: string;
  readonly bucketClass: HeadlessR2LifecycleBucketClass | "unknown";
  readonly prefixClassification:
    | "staging_export_artifact"
    | "none"
    | "production_rejected"
    | "unknown";
}): HeadlessR2LifecycleRuleClassification {
  if (input.prefixClassification === "production_rejected") {
    return "unrelated";
  }
  if (input.ruleId === HEADLESS_R2_OWNED_ARTIFACT_RULE_ID) {
    return "owned_staging_export_artifact";
  }
  if (input.ruleId === HEADLESS_R2_OWNED_ASSETS_RULE_ID) {
    return "owned_staging_assets";
  }
  return "unrelated";
}

/**
 * Validates owned rules and produces a dry-run merge plan without provider contact.
 */
export function dryRunHeadlessStagingR2LifecycleMerge(input: {
  readonly liveRules: readonly HeadlessR2LifecycleSanitizedLiveRule[];
}): HeadlessR2LifecycleMergeDryRun {
  const expected = buildHeadlessStagingR2LifecyclePolicyRules();
  const expectedOwnedRuleIds = expected.map((rule) => rule.ruleId);
  const preservedUnrelatedRuleIds: string[] = [];
  const replacedOwnedRuleIds: string[] = [];
  const rejectedOwnedRuleIds: string[] = [];

  const ownedLive = input.liveRules.filter((rule) =>
    OWNED_RULE_IDS.has(rule.ruleId),
  );
  const unrelatedLive = input.liveRules.filter(
    (rule) => !OWNED_RULE_IDS.has(rule.ruleId),
  );
  for (const rule of unrelatedLive) {
    preservedUnrelatedRuleIds.push(rule.ruleId);
  }

  const ownedById = new Map(ownedLive.map((rule) => [rule.ruleId, rule]));
  if (ownedById.size !== ownedLive.length) {
    rejectedOwnedRuleIds.push("duplicate_owned_rule");
  }

  for (const rule of ownedLive) {
    if (rule.prefixClassification === "production_rejected") {
      rejectedOwnedRuleIds.push(rule.ruleId);
      continue;
    }
    if (
      rule.ruleId === HEADLESS_R2_OWNED_ARTIFACT_RULE_ID &&
      rule.bucketClass !== "artifacts"
    ) {
      rejectedOwnedRuleIds.push(rule.ruleId);
      continue;
    }
    if (
      rule.ruleId === HEADLESS_R2_OWNED_ASSETS_RULE_ID &&
      rule.bucketClass !== "assets"
    ) {
      rejectedOwnedRuleIds.push(rule.ruleId);
    }
  }

  for (const expectedRule of expected) {
    const live = ownedById.get(expectedRule.ruleId);
    if (live == null) {
      replacedOwnedRuleIds.push(expectedRule.ruleId);
      continue;
    }
    if (
      live.expirationDays !== expectedRule.expirationDays ||
      live.abortIncompleteMultipartUploadDays !==
        expectedRule.abortIncompleteMultipartUploadDays ||
      live.bucketClass !== expectedRule.bucketClass
    ) {
      replacedOwnedRuleIds.push(expectedRule.ruleId);
    }
  }

  return Object.freeze({
    expectedOwnedRuleIds,
    preservedUnrelatedRuleIds: Object.freeze(preservedUnrelatedRuleIds),
    replacedOwnedRuleIds: Object.freeze(replacedOwnedRuleIds),
    rejectedOwnedRuleIds: Object.freeze(rejectedOwnedRuleIds),
    matches:
      rejectedOwnedRuleIds.length === 0 &&
      replacedOwnedRuleIds.length === 0 &&
      ownedLive.length === expected.length,
  });
}
