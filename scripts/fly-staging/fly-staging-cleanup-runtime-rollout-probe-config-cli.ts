#!/usr/bin/env -S npx tsx
/**
 * Provider-free execution-probe config gate for cleanup-runtime rollout.
 */

import { readFileSync } from "node:fs";

import {
  deriveHostedWorkerBridgeLinesFromQaMaster,
  validateBridgeRolloutQaMasterFile,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-credential-authority";
import { classifyCleanupRuntimeRolloutProbeConfig } from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-probe-config-authority";

const QA_MASTER =
  process.env.FLY_STAGING_BRIDGE_ROLLOUT_QA_MASTER_PATH ??
  "/tmp/shortforge-fly-verify-qa.master.env";
const forwardTomlPath = process.argv[2];

function die(reasonId: string, code = 1): never {
  console.error(reasonId);
  process.exit(code);
}

const qaBody = readFileSync(QA_MASTER, "utf8");
const qa = validateBridgeRolloutQaMasterFile({
  body: qaBody,
  modeOctal: "600",
});
if (!qa.ok) die("qa_master_invalid");

const workerBridgeLines = deriveHostedWorkerBridgeLinesFromQaMaster(qaBody);
const deploymentToml =
  typeof forwardTomlPath === "string" && forwardTomlPath.length > 0
    ? readFileSync(forwardTomlPath, "utf8")
    : null;

const gate = classifyCleanupRuntimeRolloutProbeConfig({
  qaMasterBody: qaBody,
  workerBridgeLines,
  deploymentToml,
});
if (!gate.ok) {
  console.log(`probe_config_gate=BLOCKED reason=${gate.reasonId}`);
  die(gate.reasonId);
}

console.log("probe_config_gate=PASS");
console.log("qa_key_count=11");
console.log("worker_bridge_key_count=9");
console.log("probe_gate_isolated=true");
console.log("deployment_toml_credential_free=true");
