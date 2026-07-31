/**
 * Schema-008 artifact finalization root-cause closure regression coverage.
 * Run: npm run test:headless-schema-008-artifact-finalization-closure
 */

import assert from "node:assert/strict";

import { HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import { HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_IMAGE_RECORD } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import {
  classifyOwnedObjectFinalizeLiveFailure,
  classifyRejectedCleanupRuntimeLiveFinalizationFailure,
} from "@/features/headless-renderer/worker/runtime/classify-owned-object-finalize-live-failure";
import {
  buildSchema008FinalizationFieldClassComparison,
  runCorrectedFinalizeFailureBoundaryFixture,
  runLegacyUploadCatchFinalizeContainmentFixture,
  runPreFixFinalizeIntegrityRejectFixture,
  runPrivacySafeTelemetryFixture,
  runSchema008ProductionShapedFinalizeSuccessFixture,
  runStaleRevisionBeforeObserveFixture,
  runTerminalCleanupNotOnSuccessFixture,
} from "@/features/headless-renderer/worker/testing/schema-008-artifact-finalization-fixtures";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSchema-008 artifact finalization closure\n");

  await test("live failure privacy-safe classification is bounded", () => {
    const live = classifyRejectedCleanupRuntimeLiveFinalizationFailure();
    assert.equal(live.finalizeSubstage, "provider_finalize");
    assert.equal(live.actualLifecycleClass, "staging_with_verification_claim");
    assert.equal(live.revisionOutcome, "not_reached");
    assert.equal(live.exceptionClass, "unhandled_provider_exception");
  });

  await test("field-class comparison covers migration-008 integration deltas", () => {
    const rows = buildSchema008FinalizationFieldClassComparison();
    assert.equal(rows.length, 8);
    const finalizeRow = rows.find((row) => row.fieldClass === "finalize_revision_cas");
    assert.ok(finalizeRow);
    assert.equal(finalizeRow!.rejectedLiveClass, "not_reached");
    assert.equal(finalizeRow!.correctedLocalClass, "monotonic_store_version_commit");
  });

  await test("legacy upload catch reproduces live boundary incoherence", async () => {
    const legacy = await runLegacyUploadCatchFinalizeContainmentFixture();
    assert.equal(legacy.sequenceIncoherent, true);
    assert.equal(legacy.liveClassificationMatches, true);
    assert.deepEqual(legacy.observedBoundaries.slice(-2), [
      "artifact_upload_completed",
      "cleanup_completed",
    ]);
  });

  await test("integrity reject marks verification failed instead of leaving claim", async () => {
    const reject = await runPreFixFinalizeIntegrityRejectFixture();
    assert.equal(reject.finalizeCode, "OBJECT_INTEGRITY_FAILED");
    assert.equal(reject.verificationStateClass, "failed");
    assert.equal(
      reject.classification.finalizeSubstage,
      "finalized_coherence_assertion",
    );
    assert.equal(
      classifyOwnedObjectFinalizeLiveFailure({
        safeControlPlaneCode: "OBJECT_INTEGRITY_FAILED",
        durableStageClass: "staging",
      }).mismatchFieldClass,
      "content_digest",
    );
  });

  await test("production-shaped schema-008 artifact finalizes successfully", async () => {
    const success = await runSchema008ProductionShapedFinalizeSuccessFixture();
    assert.equal(success.stageClass, "finalized");
    assert.equal(success.sequenceCoherent, true);
    assert.equal(success.maintenanceDisabled, true);
    assert.ok(
      success.observedBoundaries.includes("owned_object_finalize_completed"),
    );
    assert.ok(
      success.observedBoundaries.includes("artifact_binding_validation_completed"),
    );
    assert.ok(success.observedBoundaries.includes("job_succeeded_cas_completed"));
  });

  await test("binding validation follows finalize success in boundary order", async () => {
    const success = await runSchema008ProductionShapedFinalizeSuccessFixture();
    const finalizeCompleted = success.observedBoundaries.indexOf(
      "owned_object_finalize_completed",
    );
    const bindingStarted = success.observedBoundaries.indexOf(
      "artifact_binding_validation_started",
    );
    const bindingCompleted = success.observedBoundaries.indexOf(
      "artifact_binding_validation_completed",
    );
    const casCompleted = success.observedBoundaries.indexOf(
      "job_succeeded_cas_completed",
    );
    assert.ok(finalizeCompleted >= 0);
    assert.ok(bindingStarted > finalizeCompleted);
    assert.ok(bindingCompleted > bindingStarted);
    assert.ok(casCompleted > bindingCompleted);
  });

  await test("terminal cleanup does not run on success path", async () => {
    const cleanup = await runTerminalCleanupNotOnSuccessFixture();
    assert.equal(cleanup.cleanupScheduled, false);
  });

  await test("corrected finalize failure preserves terminal CAS boundaries", async () => {
    const failure = await runCorrectedFinalizeFailureBoundaryFixture();
    assert.equal(failure.sequenceCoherent, true);
    assert.equal(failure.finalizeSubstage, "finalized_coherence_assertion");
    assert.deepEqual(failure.observedBoundaries.slice(-3), [
      "terminal_failure_cas_started",
      "terminal_failure_cas_completed",
      "cleanup_completed",
    ]);
  });

  await test("upload observation uses fresh store revision after concurrent bump", async () => {
    const observe = await runStaleRevisionBeforeObserveFixture();
    assert.equal(observe.failedWithStaleObserve, false);
    assert.equal(observe.succeededAfterFreshObserve, true);
  });

  await test("telemetry remains privacy-safe on finalize failure", async () => {
    await runPrivacySafeTelemetryFixture();
  });

  await test("e022 rejection and bridge authority remain preserved", () => {
    assert.match(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      /^e0224b93/,
    );
    assert.match(
      HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_IMAGE_RECORD
        .imageDigestSha256,
      /^7de23dbd/,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
