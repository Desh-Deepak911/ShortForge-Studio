#!/usr/bin/env -S npx tsx
/**
 * Materialize forward or rollback Fly configs for controlled bridge rollout.
 * Writes toml only — deploy is a separate gated step.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../src/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
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

function materializeForward(app: string): string {
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
    die("forward_materialize_failed");
  }
  let injected = injectBridgeCompatibilityMode(materialized.toml);
  injected = injectMaintenanceDisabled(injected);
  assertNoPublicServices(injected);
  return injected;
}

function materializeRollback(app: string): string {
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml: readTemplate(),
    appName: app,
    pair: HEADLESS_FLY_STAGING_POST_007_2G24_FORWARD_DEPLOYMENT_PAIR,
  });
  if (materialized.status !== "ok" || materialized.toml == null) {
    die("rollback_materialize_failed");
  }
  if (materialized.toml.includes(HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV)) {
    die("rollback_compatibility_mode_forbidden");
  }
  const injected = injectMaintenanceDisabled(materialized.toml);
  assertNoPublicServices(injected);
  return injected;
}

switch (command) {
  case "write-forward": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeForward(appName), "utf8");
    console.log(`forward_digest=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST}`);
    console.log(`forward_renderer_build=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID}`);
    console.log("forward_materialize=PASS");
    break;
  }
  case "write-rollback": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeRollback(appName), "utf8");
    console.log(`rollback_digest=${HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST}`);
    console.log("rollback_materialize=PASS");
    break;
  }
  case "identity": {
    const kind = outPath;
    const sequence = Number(appName ?? "1");
    if (kind !== "forward" && kind !== "rollback") die("hostile_input");
    const digest =
      kind === "forward"
        ? HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST
        : HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST;
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
