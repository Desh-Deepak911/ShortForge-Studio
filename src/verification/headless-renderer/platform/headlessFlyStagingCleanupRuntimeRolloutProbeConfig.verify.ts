/**
 * Cleanup-runtime rollout probe credential surface fixtures.
 * Run: npm run test:headless-fly-staging-cleanup-runtime-rollout-probe-config
 */

import assert from "node:assert/strict";

import {
  FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS,
  deriveHostedWorkerBridgeLinesFromQaMaster,
  formatEnvAssignment,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-credential-authority";
import {
  buildCleanupRuntimeRolloutProbeConfigFixture,
  buildCleanupRuntimeRolloutProbeProcessEnvironment,
  classifyCleanupRuntimeRolloutProbeConfig,
  parseEnvBridgeLinesToRecord,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-probe-config-authority";
import { FLY_VERIFY_LIVE_QA_SECRET_KEYS } from "@/verification/headless-renderer/fly-verify-live/qa-secret-contract";
import { validateFlyRenderLiveQaEnvContract } from "@/verification/headless-renderer/fly-render-live/qa-secret-contract";
import { HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE } from "@/verification/headless-renderer/fly-render-live/claimed-render-execution-probe";

function buildCanonicalQaMasterBody(): string {
  return FLY_VERIFY_LIVE_QA_SECRET_KEYS.map((key) => {
    if (key === "DATABASE_URL") {
      return formatEnvAssignment(
        key,
        "postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
      );
    }
    if (key.startsWith("R2_")) {
      if (key === "R2_ACCOUNT_ID") return formatEnvAssignment(key, "a".repeat(32));
      if (key === "R2_ACCESS_KEY_ID") return formatEnvAssignment(key, "access_key_id_value");
      if (key === "R2_SECRET_ACCESS_KEY") {
        return formatEnvAssignment(key, "secret_access_key_value");
      }
      if (key === "R2_BUCKET_ASSETS") return formatEnvAssignment(key, "footie-assets-staging");
      if (key === "R2_BUCKET_ARTIFACTS") {
        return formatEnvAssignment(key, "footie-artifacts-staging");
      }
      return formatEnvAssignment(key, "https://accountid.r2.cloudflarestorage.com");
    }
    if (key === "HEADLESS_ALLOWED_ORIGINS") {
      return formatEnvAssignment(key, "https://staging.example.com");
    }
    if (key === "UPSTASH_REDIS_REST_URL") {
      return formatEnvAssignment(key, "https://example.upstash.io");
    }
    if (key === "UPSTASH_REDIS_REST_TOKEN") {
      return formatEnvAssignment(key, "rest_token_value");
    }
    return formatEnvAssignment(key, "rediss://default:pass@example.upstash.io:6379");
  }).join("\n");
}

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nCleanup-runtime rollout probe config authority\n");
  const qaMasterBody = buildCanonicalQaMasterBody();
  const workerBridgeLines = deriveHostedWorkerBridgeLinesFromQaMaster(qaMasterBody);
  const deploymentToml =
    'app = "shortforge-hw-staging-4def8fa0"\nHEADLESS_HOSTED_IMAGE_CLASS = "deployable_worker"\n';

  await test("eleven-key QA probe contract passes with public pins and probe gate", () => {
    const gate = classifyCleanupRuntimeRolloutProbeConfig({
      qaMasterBody,
      workerBridgeLines,
      deploymentToml,
    });
    assert.equal(gate.ok, true);
    const probeEnv = buildCleanupRuntimeRolloutProbeProcessEnvironment({ qaMasterBody });
    assert.equal(validateFlyRenderLiveQaEnvContract(probeEnv).ok, true);
    assert.equal(probeEnv.HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE, "1");
    assert.equal(probeEnv.HEADLESS_ENV_NAME, FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME);
    assert.equal(
      probeEnv.HEADLESS_FLY_STAGING_APP_NAME,
      FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME,
    );
  });

  await test("nine-key worker bridge fails probe contract locally", () => {
    const workerEnv = parseEnvBridgeLinesToRecord(workerBridgeLines);
    assert.equal(validateFlyRenderLiveQaEnvContract(workerEnv).ok, false);
    const gate = classifyCleanupRuntimeRolloutProbeConfig({
      qaMasterBody,
      workerBridgeLines,
      deploymentToml,
    });
    assert.equal(gate.ok, true);
  });

  await test("probe gate is absent from worker bridge materialization", () => {
    assert.equal(
      workerBridgeLines.some((line) =>
        line.startsWith(`${HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE_GATE}=`),
      ),
      false,
    );
  });

  await test("deployment toml must not contain QA secret keys", () => {
    const gate = classifyCleanupRuntimeRolloutProbeConfig({
      qaMasterBody,
      workerBridgeLines,
      deploymentToml: `${deploymentToml}\nDATABASE_URL = "leak"\n`,
    });
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.reasonId, "deployment_toml_credential_leak");
  });

  await test("fixture helper exposes isolated worker and probe surfaces", () => {
    const fixture = buildCleanupRuntimeRolloutProbeConfigFixture({ qaMasterBody });
    assert.equal(fixture.workerBridgeLines.length, 9);
    assert.equal(validateFlyRenderLiveQaEnvContract(fixture.probeEnv).ok, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
