#!/usr/bin/env -S npx tsx
/**
 * Materialize a bridge build-only Fly config for an existing verify=1/render=1 app.
 * Never deploys — writes a toml file only. QA / operator scripts only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../src/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";

const [command, outPath, appName] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

function materializeBridgeBuildOnlyToml(targetAppName: string): string {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const templateToml = readFileSync(
    path.join(repoRoot, HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH),
    "utf8",
  );
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml,
    appName: targetAppName,
    pair: HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  });
  if (
    materialized.status !== "ok" ||
    materialized.toml == null ||
    materialized.rendererBuildId == null
  ) {
    die("bridge_build_materialize_failed");
  }
  if (
    materialized.rendererBuildId !==
    HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR.rendererBuildId
  ) {
    die("bridge_build_id_incoherent");
  }
  const compatibilityLine = `${HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV} = "${HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE}"`;
  const maintenanceLine = 'HEADLESS_EXPORT_MAINTENANCE_ENABLED = "0"';
  if (materialized.toml.includes(compatibilityLine)) {
    die("bridge_build_duplicate_compatibility_mode");
  }
  const injected = materialized.toml.replace(
    'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
    `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${compatibilityLine}\n  ${maintenanceLine}`,
  );
  if (!injected.includes(compatibilityLine) || !injected.includes(maintenanceLine)) {
    die("bridge_build_env_injection_failed");
  }
  if (/\[\[services\]\]|\[http_service\]/.test(injected)) {
    die("bridge_build_public_service_forbidden");
  }
  return injected;
}

switch (command) {
  case "write": {
    if (typeof outPath !== "string" || outPath.length === 0) die("hostile_input");
    if (typeof appName !== "string" || appName.length === 0) die("hostile_input");
    writeFileSync(outPath, materializeBridgeBuildOnlyToml(appName), "utf8");
    console.log("bridge_build_materialize=PASS");
    break;
  }
  case "print-checksum": {
    const toml = materializeBridgeBuildOnlyToml(
      appName ?? "shortforge-hw-staging-example0000",
    );
    let hash = 0;
    for (let i = 0; i < toml.length; i += 1) {
      hash = (hash * 31 + toml.charCodeAt(i)) >>> 0;
    }
    console.log(`bridge_build_materialize_checksum=${hash.toString(16)}`);
    break;
  }
  default:
    die("hostile_input");
}
