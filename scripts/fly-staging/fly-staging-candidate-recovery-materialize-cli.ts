#!/usr/bin/env -S npx tsx
/**
 * Materialize candidate-recovery and bridge-rollback Fly configs.
 * Uses the sealed correction pair under protocol-recovery authorization only.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV,
  HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE,
} from "../../src/features/headless-renderer/control-plane/runtime/headless-schema-preflight-compatibility-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_2G24E_BRIDGE008_ROLLBACK_BRIDGE_DEPLOYMENT_PAIR,
  HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_DEPLOYMENT_PAIR,
  materializeHeadlessFlyStagingTomlForDeploymentPair,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION,
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-deployed-validation-candidate-authority";
import {
  classifyHeadlessFlyStagingCandidateRecoveryDeployBudget,
  loadHeadlessFlyStagingCandidateRecoveryLedger,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-candidate-recovery-ledger-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import { HEADLESS_FLY_STAGING_TEMPLATE_RELATIVE_PATH } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-template";
import { buildHeadlessFlyStagingMaterializedConfigAttemptIdentity } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-controlled-rollout-attempt-authority";

const [command, outPath, appName] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(`fail_class=${reasonId}`);
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
  if (toml.includes(maintenanceLine)) die("duplicate_maintenance_line");
  return toml.replace(
    'HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"',
    `HEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n  ${maintenanceLine}`,
  );
}

function injectBridgeCompatibilityMode(toml: string): string {
  const compatibilityLine = `${HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV} = "${HEADLESS_SCHEMA_PREFLIGHT_ROLLBACK_BRIDGE_007_008_MODE}"`;
  if (toml.includes(compatibilityLine)) die("duplicate_compatibility_mode");
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

function assertRecoveryAuthorized(app: string): void {
  if (
    HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION
      .recoveryDecision !==
    HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION
  ) {
    die("recovery_decision_mismatch");
  }
  const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
    footiebitzRoot: repoRoot(),
    appName: app,
  });
  if (process.env.HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_CONTINUE === "1") {
    const accepted = ledger.entries.some(
      (entry) =>
        entry.kind === "one_time_candidate_recovery" &&
        entry.acceptancePassed === true,
    );
    if (!accepted) die("continue_requires_accepted_recovery_deploy");
    return;
  }
  const budget = classifyHeadlessFlyStagingCandidateRecoveryDeployBudget({
    ledger,
  });
  if (!budget.ok) die(budget.reasonId);
}

function materializeCandidate(app: string): string {
  assertRecoveryAuthorized(app);
  const materialized = materializeHeadlessFlyStagingTomlForDeploymentPair({
    templateToml: readTemplate(),
    appName: app,
    pair: HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_DEPLOYMENT_PAIR,
  });
  if (
    materialized.status !== "ok" ||
    materialized.toml == null ||
    materialized.rendererBuildId !== HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
  ) {
    die("candidate_materialize_failed");
  }
  if (materialized.toml.includes(HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE_ENV)) {
    die("candidate_compatibility_mode_forbidden");
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
  case "write-candidate": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeCandidate(appName), "utf8");
    console.log(
      `candidate_digest=${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST}`,
    );
    console.log(
      `candidate_renderer_build=${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID}`,
    );
    console.log("candidate_recovery_materialize=PASS");
    break;
  }
  case "write-rollback-bridge": {
    if (typeof outPath !== "string" || typeof appName !== "string") die("hostile_input");
    writeFileSync(outPath, materializeBridgeRollback(appName), "utf8");
    console.log(`rollback_digest=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST}`);
    console.log(
      `rollback_renderer_build=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID}`,
    );
    console.log("bridge_rollback_materialize=PASS");
    break;
  }
  case "identity": {
    const kind = outPath;
    const sequence = Number(appName ?? "1");
    if (kind !== "candidate" && kind !== "rollback") die("hostile_input");
    const digest =
      kind === "candidate"
        ? HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST
        : HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
    const identity = buildHeadlessFlyStagingMaterializedConfigAttemptIdentity({
      footiebitzRoot: repoRoot(),
      attemptKind: kind === "candidate" ? "forward" : "rollback",
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
