/**
 * Prospective cleanup-runtime Fly staging authority fixtures.
 * Run: npm run test:headless-fly-staging-cleanup-runtime-authority
 */

import assert from "node:assert/strict";

import { embeddedSchemaFingerprintAsPreflightSources } from "@/features/headless-renderer/control-plane/migrations/embedded-schema-fingerprint";
import {
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
  HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_ID,
} from "@/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_TEMPORARY_CURRENT_IMAGE_RECORD,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_CAPABILITY_VERSION,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PLACEHOLDER_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
  buildHeadlessFlyStagingCleanupRuntimePublicEnvironment,
  classifyHeadlessFlyStagingCleanupRuntimeImageRecord,
  isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";
import {
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_PROSPECTIVE_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS,
  classifyCurrentFlyStagingImageEligibility,
  classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority,
  resolveCurrentFlyStagingAcceptedImageRecord,
  resolveProspectiveFlyStagingRolloutImageRecord,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";
import { readFileSync } from "node:fs";
import path from "node:path";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nCleanup-runtime prospective Fly staging authority\n");

  await test("renderer build ID resolves from source constant", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
      HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    );
    assert.equal(
      HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
      "headless-local-chromium-ffmpeg-11e-phase2g.25-cleanup-runtime",
    );
  });

  await test("schema fingerprint binds exact eight migrations including 008", () => {
    const sources = embeddedSchemaFingerprintAsPreflightSources();
    assert.equal(sources.length, 8);
    assert.deepEqual(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.migrationIds,
      sources.map((entry) => entry.migrationId),
    );
    assert.equal(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.checksumSha256.at(-1),
      HEADLESS_SCHEMA_PREFLIGHT_MIGRATION_008_CHECKSUM_SHA256,
    );
  });

  await test("live finalization failed record is permanently rejected", () => {
    const record = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_PROSPECTIVE_IMAGE_RECORD;
    assert.equal(record.lifecycle, "rejected");
    assert.equal(record.maintenanceEnabled, false);
    assert.equal(record.eligibleForDeploy, false);
    assert.equal(record.eligibleForProbe, false);
    assert.equal(record.rejectionReasonId, "live_owned_object_finalization_failure");
    assert.equal(isHeadlessFlyStagingPlaceholderCleanupRuntimeDigest(record.imageDigestSha256), false);
    assert.equal(classifyHeadlessFlyStagingCleanupRuntimeImageRecord().ok, false);
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    );
    assert.notEqual(
      record.imageDigestSha256,
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    );
  });

  await test("rejected record remains permanently undeployable", () => {
    const record = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_RECORD;
    assert.equal(record.lifecycle, "rejected");
    assert.equal(record.eligibleForDeploy, false);
    assert.equal(record.rejectionReasonId, "invalid_renderer_build_id_packaged_worker");
    assert.equal(classifyHeadlessFlyStagingCleanupRuntimeImageRecord(record).ok, false);
  });

  await test("versioned live-finalization-failed record is not rollout eligible", () => {
    const versioned =
      HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_PROSPECTIVE_IMAGE_RECORD;
    assert.equal(versioned.lifecycle, "historical");
    assert.equal(versioned.eligibleForRenderLiveHarness, false);
    assert.equal(versioned.eligibleForCurrentStagingReadiness, false);
    const eligibility = classifyCurrentFlyStagingImageEligibility({
      imageDigestSha256: versioned.imageDigestSha256,
      schemaMigrationIds:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.migrationIds,
    });
    assert.equal(eligibility.eligible, false);
    const probe = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256: versioned.imageDigestSha256,
    });
    assert.equal(probe.ok, false);
  });

  await test("bridge temporary current authority remains rollback-eligible", () => {
    const bridge = resolveCurrentFlyStagingAcceptedImageRecord();
    assert.equal(bridge.recordId, "post_007_2g24e_bridge008_rollback_bridge");
    assert.equal(bridge.lifecycle, "current");
    assert.equal(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_TEMPORARY_CURRENT_IMAGE_RECORD.eligibleForRollbackSelection,
      true,
    );
    assert.notEqual(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_IMAGE_DIGEST,
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    );
  });

  await test("rollout selector no longer exposes deployable cleanup runtime target", () => {
    assert.equal(
      resolveProspectiveFlyStagingRolloutImageRecord().recordId,
      "post_007_2g25_cleanup_runtime_live_finalization_failed",
    );
    assert.equal(
      resolveCurrentFlyStagingAcceptedImageRecord().recordId,
      "post_007_2g24e_bridge008_rollback_bridge",
    );
  });

  await test("public environment keeps maintenance disabled", () => {
    const env = buildHeadlessFlyStagingCleanupRuntimePublicEnvironment();
    assert.equal(env.HEADLESS_EXPORT_MAINTENANCE_ENABLED, "0");
    assert.equal(env.HEADLESS_RENDERER_BUILD_ID, HEADLESS_CLEANUP_RUNTIME_RENDERER_BUILD_ID);
  });

  await test("deployment pair materializes strict schema-008 cleanup environment", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    const templateToml = readFileSync(
      path.join(repoRoot, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
      "utf8",
    );
    const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
      templateToml,
      appName: "shortforge-hw-staging-test",
      pair: HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
    });
    assert.equal(materialized.status, "ok");
    if (materialized.status === "ok" && materialized.toml != null) {
      assert.equal(
        materialized.rendererBuildId,
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
      );
      assert.equal(materialized.toml.includes("rollback_bridge_007_008"), false);
    }
  });

  await test("versioned records include rejected and live-finalization-failed entries", () => {
    const rejected = HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS.filter(
      (record) => record.recordId === "post_007_2g25_cleanup_runtime_rejected",
    );
    const liveFailed = HEADLESS_FLY_STAGING_VERSIONED_IMAGE_RECORDS.filter(
      (record) =>
        record.recordId === "post_007_2g25_cleanup_runtime_live_finalization_failed",
    );
    assert.equal(rejected.length, 1);
    assert.equal(liveFailed.length, 1);
    assert.equal(
      liveFailed[0]?.hostedWorkerArtifactSha256,
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_HOSTED_WORKER_ARTIFACT_SHA256,
    );
    assert.equal(
      liveFailed[0]?.hostedPageArtifactSha256,
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    );
    assert.notEqual(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PLACEHOLDER_IMAGE_DIGEST,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
