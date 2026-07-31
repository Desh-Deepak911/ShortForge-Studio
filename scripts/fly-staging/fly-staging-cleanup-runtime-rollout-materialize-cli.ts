#!/usr/bin/env -S npx tsx
/**
 * Materialize forward cleanup-runtime or rollback-bridge Fly configs for controlled rollout.
 * Writes toml only — deploy is a separate gated step.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../src/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REJECTED_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
  resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import { classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";
import { buildHeadlessFlyStagingMaterializedConfigAttemptIdentity } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-controlled-rollout-attempt-authority";

const [command, outPath, appName, attemptSequenceRaw] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../..");
}

function readTemplate(): string {
  return readFileSync(
    path.join(repoRoot(), HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
    "utf8",
  );
}

function injectMaintenanceDisabled(toml: string): string {
  const maintenanceLine = 'HEADLESS_EXPORT_MAINTENANCE_ENABLED = "0"';
  if (toml.includes(maintenanceLine)) {
    die("duplicate_maintenance_line");
  }
  return toml.replace(
    'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
    `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${maintenanceLine}`,
  );
}

function injectBridgeCompatibilityMode(toml: string): string {
  const compatibilityLine = `${HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV} = "${HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE}"`;
  if (toml.includes(compatibilityLine)) {
    die("duplicate_compatibility_mode");
  }
  return toml.replace(
    'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
    `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${compatibilityLine}`,
  );
}

function assertNoPublicServices(toml: string): void {
  if (/\[\[services\]\]|\[http_service\]/.test(toml)) {
    die("public_service_forbidden");
  }
}

function materializeCleanupForward(app: string): string {
  const deployGate = classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility({
    imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  });
  if (!deployGate.deployable) {
    die(deployGate.reasonId);
  }
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml: readTemplate(),
    appName: app,
    pair: HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REPLACEMENT_DEPLOYMENT_PAIR,
  });
  if (
    materialized.status !== "ok" ||
    materialized.toml == null ||
    materialized.rendererBuildId !== HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
  ) {
    die("cleanup_forward_materialize_failed");
  }
  if (materialized.toml.includes(HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV)) {
    die("cleanup_forward_compatibility_mode_forbidden");
  }
  const injected = injectMaintenanceDisabled(materialized.toml);
  assertNoPublicServices(injected);
  return injected;
}

function materializeBridgeRollback(app: string): string {
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml: readTemplate(),
    appName: app,
    pair: HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  });
  if (
    materialized.status !== "ok" ||
    materialized.toml == null ||
    materialized.rendererBuildId !== HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID
  ) {
    die("bridge_rollback_materialize_failed");
  }
  let injected = injectBridgeCompatibilityMode(materialized.toml);
  injected = injectMaintenanceDisabled(injected);
  assertNoPublicServices(injected);
  return injected;
}

switch (command) {
  case "write-forward": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeCleanupForward(appName), "utf8");
    console.log(`forward_digest=${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST}`);
    console.log(`forward_renderer_build=${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID}`);
    console.log("cleanup_forward_materialize=PASS");
    break;
  }
  case "write-rollback-bridge": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeBridgeRollback(appName), "utf8");
    console.log(`rollback_digest=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST}`);
    console.log(`rollback_renderer_build=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID}`);
    console.log("bridge_rollback_materialize=PASS");
    break;
  }
  case "validate-pairs": {
    const rejectedGate = classifyHeadlessFlyStagingRejectedCleanupRuntimeDeployEligibility({
      imageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    });
    if (rejectedGate.deployable) die("rejected_cleanup_digest_not_blocked");
    const rejectedPair = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    );
    if (
      rejectedPair.ok ||
      rejectedPair.reasonId !== "rejected_permanent_digest"
    ) {
      die("rejected_pair_incoherent");
    }
    if (
      HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_REJECTED_DEPLOYMENT_PAIR.pairId !==
      "post_007_2g25_cleanup_runtime_rejected_pair"
    ) {
      die("rejected_pair_incoherent");
    }
    const cleanupPair = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
    );
    if (
      !cleanupPair.ok ||
      cleanupPair.pair.pairId !== "post_007_2g25_cleanup_runtime_replacement_prospective_pair"
    ) {
      die("cleanup_pair_incoherent");
    }
    const bridgePair = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    );
    if (!bridgePair.ok || bridgePair.pair.pairId !== "post_007_2g24e_bridge008_rollback_bridge_pair") {
      die("bridge_pair_incoherent");
    }
    const forbidden = resolveHeadlessFlyStagingDeploymentPairByImageDigestSha256(
      HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR.imageDigestSha256,
    );
    if (!forbidden.ok || forbidden.pair.role !== "forward_target") {
      die("forbidden_2g24_pair_missing");
    }
    console.log("deployment_pair_coherence=PASS");
    console.log("forbidden_2g24_rollback_candidate=REJECTED");
    break;
  }
  case "identity": {
    const kind = outPath;
    const sequence = Number(appName ?? "1");
    if (kind !== "forward" && kind !== "rollback") die("hostile_input");
    const digest =
      kind === "forward"
        ? HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST
        : HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
    const identity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: repoRoot(),
      attemptKind: kind,
      imageDigestSha256: digest,
      attemptSequence: sequence,
    });
    console.log(`materialized_token=${identity.token}`);
    console.log(`materialized_relative_path=${identity.relativePath}`);
    break;
  }
  default:
    die("hostile_input");
}
