/**
 * R2 lifecycle merge authority regression coverage.
 * Run: npm run test:headless-r2-lifecycle-merge-authority
 */

import assert from "node:assert/strict";

import {
  buildHeadlessStagingR2LifecyclePolicyRules,
  HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
  HEADLESS_R2_OWNED_ASSETS_RULE_ID,
} from "@/features/headless-renderer/domain/headless-r2-lifecycle-policy-authority";
import { dryRunHeadlessStagingR2LifecycleMerge } from "@/features/headless-renderer/control-plane/services/headless-r2-lifecycle-policy-merge";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nHeadless R2 lifecycle merge authority\n");

  test("owned lifecycle policy contains exactly two rules", () => {
    const rules = buildHeadlessStagingR2LifecyclePolicyRules();
    assert.equal(rules.length, 2);
    assert.equal(rules[0]?.ruleId, HEADLESS_R2_OWNED_ARTIFACT_RULE_ID);
    assert.equal(rules[1]?.ruleId, HEADLESS_R2_OWNED_ASSETS_RULE_ID);
    assert.equal(rules[0]?.expirationDays, 2);
    assert.equal(rules[0]?.abortIncompleteMultipartUploadDays, 1);
    assert.equal(rules[1]?.expirationDays, null);
    assert.equal(rules[1]?.abortIncompleteMultipartUploadDays, 1);
  });

  test("merge preserves unrelated live rules", () => {
    const dryRun = dryRunHeadlessStagingR2LifecycleMerge({
      liveRules: [
        {
          ruleId: "vendor-backup-retention",
          bucketClass: "unknown",
          prefixClassification: "unknown",
          expirationDays: 30,
          abortIncompleteMultipartUploadDays: null,
          classification: "unrelated",
        },
        {
          ruleId: HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
          bucketClass: "artifacts",
          prefixClassification: "staging_export_artifact",
          expirationDays: 2,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_export_artifact",
        },
        {
          ruleId: HEADLESS_R2_OWNED_ASSETS_RULE_ID,
          bucketClass: "assets",
          prefixClassification: "none",
          expirationDays: null,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_assets",
        },
      ],
    });
    assert.deepEqual(dryRun.preservedUnrelatedRuleIds, ["vendor-backup-retention"]);
    assert.equal(dryRun.matches, true);
  });

  test("duplicate owned rule is rejected", () => {
    const dryRun = dryRunHeadlessStagingR2LifecycleMerge({
      liveRules: [
        {
          ruleId: HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
          bucketClass: "artifacts",
          prefixClassification: "staging_export_artifact",
          expirationDays: 2,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_export_artifact",
        },
        {
          ruleId: HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
          bucketClass: "artifacts",
          prefixClassification: "staging_export_artifact",
          expirationDays: 2,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_export_artifact",
        },
        {
          ruleId: HEADLESS_R2_OWNED_ASSETS_RULE_ID,
          bucketClass: "assets",
          prefixClassification: "none",
          expirationDays: null,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_assets",
        },
      ],
    });
    assert.equal(dryRun.rejectedOwnedRuleIds.includes("duplicate_owned_rule"), true);
    assert.equal(dryRun.matches, false);
  });

  test("production prefix classification rejects owned artifact rule", () => {
    const dryRun = dryRunHeadlessStagingR2LifecycleMerge({
      liveRules: [
        {
          ruleId: HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
          bucketClass: "artifacts",
          prefixClassification: "production_rejected",
          expirationDays: 2,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_export_artifact",
        },
        {
          ruleId: HEADLESS_R2_OWNED_ASSETS_RULE_ID,
          bucketClass: "assets",
          prefixClassification: "none",
          expirationDays: null,
          abortIncompleteMultipartUploadDays: 1,
          classification: "owned_staging_assets",
        },
      ],
    });
    assert.equal(
      dryRun.rejectedOwnedRuleIds.includes(HEADLESS_R2_OWNED_ARTIFACT_RULE_ID),
      true,
    );
  });

  test("dry-run output contains classifications only", () => {
    const dryRun = dryRunHeadlessStagingR2LifecycleMerge({ liveRules: [] });
    const serialized = JSON.stringify(dryRun);
    assert.equal(/bucket|account|credential|objectKey|url/i.test(serialized), false);
    assert.deepEqual(dryRun.expectedOwnedRuleIds, [
      HEADLESS_R2_OWNED_ARTIFACT_RULE_ID,
      HEADLESS_R2_OWNED_ASSETS_RULE_ID,
    ]);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
