#!/usr/bin/env -S npx tsx
/**
 * Materialize a cleanup-runtime build-only Fly config for an existing verify=1/render=1 app.
 * Never deploys — writes a toml file only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import { HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";

const [command, outPath, appName] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

function materializeCleanupRuntimeBuildOnlyToml(targetAppName: string): string {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const templateToml = readFileSync(
    path.join(repoRoot, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
    "utf8",
  );
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml,
    appName: targetAppName,
    pair: HEADLESS_FLY_STAGING_POST_007_2G25_CLEANUP_RUNTIME_DEPLOYMENT_PAIR,
  });
  if (
    materialized.status !== "ok" ||
    materialized.toml == null ||
    materialized.rendererBuildId == null
  ) {
    die("cleanup_runtime_build_materialize_failed");
  }
  if (
    materialized.rendererBuildId !==
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
  ) {
    die("cleanup_runtime_build_id_incoherent");
  }
  const maintenanceLine = 'HEADLESS_EXPORT_MAINTENANCE_ENABLED = "0"';
  if (materialized.toml.includes("HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE")) {
    die("cleanup_runtime_compatibility_mode_forbidden");
  }
  if (materialized.toml.includes(maintenanceLine)) {
    die("cleanup_runtime_duplicate_maintenance_line");
  }
  const injected = materialized.toml.replace(
    'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
    `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${maintenanceLine}`,
  );
  if (!injected.includes(maintenanceLine)) {
    die("cleanup_runtime_env_injection_failed");
  }
  if (/\[\[services\]\]|\[http_service\]/.test(injected)) {
    die("cleanup_runtime_public_service_forbidden");
  }
  return injected;
}

switch (command) {
  case "write": {
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (typeof appName !== "string" || appName.length === 0) die("hostile_input");
    writeFileSync(outPath, materializeCleanupRuntimeBuildOnlyToml(appName), "utf8");
    console.log("cleanup_runtime_build_materialize=PASS");
    break;
  }
  default:
    die("hostile_input");
}
