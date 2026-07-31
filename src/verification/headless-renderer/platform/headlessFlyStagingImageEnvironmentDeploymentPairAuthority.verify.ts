/**
 * Sprint 11E Phase 2G.24G.1 — image/environment deployment pair + controlled rollout attempt authority.
 * Run: npm run test:headless-fly-staging-image-environment-deployment-pair-authority
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_AUTHORITY_VERSION,
  HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_CONTRACT,
  HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CURRENT_DEPLOYMENT_PAIR,
  buildHeadlessFlyStagingPublicEnvironmentForDeploymentPair,
  buildHeadlessFlyStagingPublicEnvironmentForImageDigestSha256,
  classifyHeadlessFlyStagingDeploymentProviderContactGate,
  classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence,
  extractHeadlessFlyStagingMaterializedRendererBuildId,
  materializeHeadlessFlyStagingTomlForImageDigestSha256,
  resolveHeadlessFlyStagingCurrentForwardDeploymentPair,
  resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256,
  validateHeadlessFlyStagingImageEnvironmentDeploymentPairTable,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_2G24G_CONTROLLED_ROLLOUT_INCIDENT_RECORD,
  buildHeadlessFlyStaging2G24GRecoveredAttemptLedger,
  buildHeadlessFlyStagingMaterializedConfigAttemptIdentity,
  classifyHeadlessFlyStagingMaterializedConfigCleanupContract,
  classifyHeadlessFlyStagingMaterializedConfigCrossAttemptReuse,
  classifyHeadlessFlyStagingSecondForwardAttemptProtocolCompliance,
  mergeHeadlessFlyStagingControlledRolloutAttemptLedgers,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-controlled-rollout-attempt-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const TEMPLATE = readFileSync(
  path.join(ROOT, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
  "utf8",
);
const APP = "shortforge-hw-staging-4def8fa0";
const INCOHERENT_24D = "headless-local-chromium-ffmpeg-11e-phase2g.24d";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2G.24G.1 — Fly staging image/environment deployment pair authority\n",
  );

  await test("deployment pair authority version frozen at 6 with unique digest table", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_AUTHORITY_VERSION,
      6,
    );
    assert.equal(validateHeadlessFlyStagingImageEnvironmentDeploymentPairTable().ok, true);
  });

  await test("2G.24G incident record preserves honest multi-attempt history", () => {
    const incident = HEADLESS_FLY_STAGING_2G24G_CONTROLLED_ROLLOUT_INCIDENT_RECORD;
    assert.equal(incident.firstForwardRolloutAttempted, true);
    assert.equal(incident.firstAcceptanceFailed, true);
    assert.equal(incident.rollbackAttempted, true);
    assert.equal(incident.rollbackImageEnvironmentMismatchOccurred, true);
    assert.equal(incident.bothMachinesStoppedAfterBadRollback, true);
    assert.equal(incident.manualRecoveryPerformed, true);
    assert.equal(incident.secondForwardRolloutSucceeded, true);
    assert.equal(incident.forwardAttemptCountTotal, 2);
    assert.equal(incident.rollbackAttemptCountTotal, 1);
    assert.equal(incident.manualRecoveryPerformedFlag, true);
    assert.equal(incident.finalRuntimeState, "healthy");
    assert.equal(incident.rolloutResult, "pass_after_recovery");
    assert.equal(incident.protocolCompliance, "deviated");
    assert.equal(
      incident.finalRuntimeDigestSha256,
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    );
  });

  await test("1: Phase 2G.24 forward digest resolves to .24e", () => {
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    );
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.pair.rendererBuildId, HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID);
    }
  });

  await test("2: Phase 2G.23 rollback digest resolves to .13", () => {
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    );
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.pair.rendererBuildId, HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID);
    }
  });

  await test("3: Phase 2G.23 digest paired with .24d is rejected", () => {
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: INCOHERENT_24D,
    });
    assert.equal(coherence.ok, false);
    if (!coherence.ok) {
      assert.equal(coherence.reasonId, "image_environment_authority_incoherent");
    }
  });

  await test("4: Phase 2G.23 digest paired with .24e is rejected", () => {
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
    });
    assert.equal(coherence.ok, false);
    if (!coherence.ok) {
      assert.equal(coherence.reasonId, "image_environment_authority_incoherent");
    }
  });

  await test("5: Phase 2G.24 digest paired with .13 is rejected", () => {
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
    });
    assert.equal(coherence.ok, false);
    if (!coherence.ok) {
      assert.equal(coherence.reasonId, "image_environment_authority_incoherent");
    }
  });

  await test("6: unknown digest is rejected", () => {
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      "f".repeat(64),
    );
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.equal(resolved.reasonId, "unknown_digest");
    }
  });

  await test("6b: rejected cleanup-runtime live-finalization digest is not deployable", () => {
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR.imageDigestSha256,
    );
    assert.equal(resolved.ok, false);
    if (!resolved.ok) {
      assert.equal(resolved.reasonId, "rejected_permanent_digest");
    }
  });

  await test("6c: promoted cleanup-runtime finalization correction digest resolves to current forward pair", () => {
    const resolved = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CURRENT_DEPLOYMENT_PAIR.imageDigestSha256,
    );
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(
        resolved.pair.pairId,
        "post_008_2g25_cleanup_runtime_finalization_correction_current_pair",
      );
    }
    assert.deepEqual(
      resolveHeadlessFlyStagingCurrentForwardDeploymentPair(),
      HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_CURRENT_DEPLOYMENT_PAIR,
    );
  });

  await test("7: missing build ID is rejected", () => {
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      rendererBuildId: null,
    });
    assert.equal(coherence.ok, false);
    if (!coherence.ok) {
      assert.equal(coherence.reasonId, "missing_renderer_build_id");
    }
  });

  await test("8: duplicate digest authority is rejected", () => {
    const pairs = [
      HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
      HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
    ];
    const seen = new Set<string>();
    let duplicate = false;
    for (const pair of pairs) {
      if (seen.has(pair.imageDigestSha256)) duplicate = true;
      seen.add(pair.imageDigestSha256);
    }
    assert.equal(duplicate, true);
    assert.equal(validateHeadlessFlyStagingImageEnvironmentDeploymentPairTable().ok, true);
  });

  await test("9: stale materialized config cannot be reused", () => {
    const prior = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "forward",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    const next = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "forward",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    const reuse = classifyHeadlessFlyStagingMaterializedConfigCrossAttemptReuse({
      priorIdentity: prior,
      nextIdentity: next,
    });
    assert.equal(reuse.ok, false);
    assert.equal(reuse.reasonId, "stale_materialized_config_reuse");
  });

  await test("10: forward and rollback configs use separate attempt identities", () => {
    const forward = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "forward",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    const rollback = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "rollback",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    assert.notEqual(forward.relativePath, rollback.relativePath);
    assert.match(forward.relativePath, /^fly\.staging\.forward-/);
    assert.match(rollback.relativePath, /^fly\.staging\.rollback-/);
  });

  await test("11: cleanup runs after forward failure", () => {
    const identity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "forward",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    const cleanup = classifyHeadlessFlyStagingMaterializedConfigCleanupContract({
      materializedRelativePaths: [identity.relativePath],
      pathsStillPresent: [],
    });
    assert.equal(cleanup.ok, true);
  });

  await test("12: cleanup runs after rollback failure", () => {
    const identity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: ROOT,
      attemptKind: "rollback",
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      attemptSequence: 1,
    });
    const cleanup = classifyHeadlessFlyStagingMaterializedConfigCleanupContract({
      materializedRelativePaths: [identity.relativePath],
      pathsStillPresent: [],
    });
    assert.equal(cleanup.ok, true);
  });

  await test("13: complete attempt totals survive recovery-script boundaries", () => {
    const segmentA = buildHeadlessFlyStaging2G24GRecoveredAttemptLedger().slice(0, 3);
    const segmentB = buildHeadlessFlyStaging2G24GRecoveredAttemptLedger().slice(3);
    const totals = mergeHeadlessFlyStagingControlledRolloutAttemptLedgers(
      [segmentA, segmentB],
      "healthy",
    );
    assert.equal(totals.forwardAttempts, 2);
    assert.equal(totals.rollbackAttempts, 1);
    assert.equal(totals.recoveryAttempts, 2);
    assert.equal(totals.failedAcceptanceChecks, 3);
    assert.equal(totals.finalRuntimeState, "healthy");
  });

  await test("14: second forward attempt is classified as protocol deviation", () => {
    const compliance = classifyHeadlessFlyStagingSecondForwardAttemptProtocolCompliance({
      singleForwardAttemptPolicy: true,
      forwardAttemptSequence: 2,
    });
    assert.equal(compliance.ok, false);
    assert.equal(compliance.reasonId, "protocol_deviation_second_forward_attempt");
  });

  await test("15: final healthy runtime does not erase earlier failure history", () => {
    const ledger = buildHeadlessFlyStaging2G24GRecoveredAttemptLedger();
    assert.equal(ledger[0]?.acceptancePassed, false);
    assert.equal(ledger[1]?.acceptancePassed, false);
    assert.equal(ledger[4]?.acceptancePassed, true);
    assert.equal(
      HEADLESS_FLY_STAGING_2G24G_CONTROLLED_ROLLOUT_INCIDENT_RECORD.firstAcceptanceFailed,
      true,
    );
  });

  await test("16: no provider connection occurs when coherence validation fails", () => {
    const coherence = classifyHeadlessFlyStagingImageEnvironmentDeploymentCoherence({
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
    });
    const gate = classifyHeadlessFlyStagingDeploymentProviderContactGate({
      coherence,
      providerContactAttempted: true,
    });
    assert.equal(gate.ok, false);
    assert.equal(gate.reasonId, "provider_contact_forbidden_before_coherence");
  });

  await test("forward materialization injects .24e from digest authority", () => {
    const materialized = materializeHeadlessFlyStagingTomlForImageDigestSha256({
      templateToml: TEMPLATE,
      appName: APP,
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    });
    assert.equal(materialized.ok, true);
    if (materialized.ok) {
      assert.equal(materialized.rendererBuildId, HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID);
      assert.equal(
        extractHeadlessFlyStagingMaterializedRendererBuildId(materialized.toml),
        HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
      );
    }
  });

  await test("rollback materialization injects .13 from digest authority", () => {
    const materialized = materializeHeadlessFlyStagingTomlForImageDigestSha256({
      templateToml: TEMPLATE,
      appName: APP,
      imageDigestSha256: HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    });
    assert.equal(materialized.ok, true);
    if (materialized.ok) {
      assert.equal(materialized.rendererBuildId, HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID);
    }
  });

  await test("public environment derives renderer build ID from deployment pair", () => {
    const env = buildHeadlessFlyStagingPublicEnvironmentForDeploymentPair(
      HEADLESS_FLY_STAGING_POST_007_2G23_ROLLBACK_DEPLOYMENT_PAIR,
    );
    assert.equal(env.HEADLESS_RENDERER_BUILD_ID, HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID);
    const byDigest = buildHeadlessFlyStagingPublicEnvironmentForImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    );
    assert.equal(byDigest.ok, true);
    if (byDigest.ok) {
      assert.equal(
        byDigest.publicEnvironment.HEADLESS_RENDERER_BUILD_ID,
        HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
      );
    }
  });

  await test("deployment pair contract forbids shell/stale-toml derivation", () => {
    assert.equal(
      HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_CONTRACT.deriveEnvironmentFromShell,
      false,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_CONTRACT.deriveEnvironmentFromStaleMaterializedToml,
      false,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_IMAGE_ENVIRONMENT_DEPLOYMENT_PAIR_CONTRACT.failClosedReasonId,
      "image_environment_authority_incoherent",
    );
  });

  await test("fly-staging-common.sh binds public environment to digest-resolving CLI", () => {
    const common = readFileSync(
      path.join(ROOT, "scripts/fly-staging/fly-staging-common.sh"),
      "utf8",
    );
    assert.match(common, /fly_staging_apply_public_environment_for_digest/);
    assert.match(common, /fly-staging-deployment-pair-cli\.ts/);
    assert.match(common, /fly_staging_validate_image_environment_coherence/);
    assert.match(common, /fly_staging_materialized_config_identity_for_digest/);
  });

  await test("deployment pair CLI exists for shell orchestrators", () => {
    assert.equal(
      existsSync(path.join(ROOT, "scripts/fly-staging/fly-staging-deployment-pair-cli.ts")),
      true,
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
