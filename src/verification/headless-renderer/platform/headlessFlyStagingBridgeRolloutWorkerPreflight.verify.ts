/**
 * Bridge worker preflight credential surface regression coverage.
 * Run: npm run test:headless-fly-staging-bridge-rollout-worker-preflight
 */

import assert from "node:assert/strict";

import { classifyHeadlessHostedWorkerEnvironment } from "@/features/headless-renderer/worker/hosted/hosted-environment";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  classifyHeadlessFlyStagingBridgeRolloutWorkerPreflight,
  isolateHeadlessFlyStagingWorkerBridgePreflightEnvironment,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-worker-preflight-authority";
import { mergeHeadlessFlyStagingOperatorPreflightEnvironment } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-public-environment";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function workerBridgeEnv(): Record<string, unknown> {
  return Object.freeze({
    HEADLESS_ENV_NAME: "staging",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    HEADLESS_WORKER_CONCURRENCY: "1",
    HEADLESS_WORKER_GRACEFUL_SHUTDOWN_MS: "25000",
    HEADLESS_WORKER_WORKSPACE_ROOT: "/tmp/footiebitz-headless-worker",
    HEADLESS_ALLOW_NO_SANDBOX_WITH_EXTERNAL_ISOLATION: "0",
    HEADLESS_EXPORT_MAINTENANCE_ENABLED: "0",
    HEADLESS_SCHEMA_PREFLIGHT_COMPATIBILITY_MODE: "rollback_bridge_007_008",
    DATABASE_URL: "postgresql://example",
    HEADLESS_R2_ACCOUNT_ID: "example",
    HEADLESS_R2_ACCESS_KEY_ID: "example",
    HEADLESS_R2_SECRET_ACCESS_KEY: "example",
    HEADLESS_R2_BUCKET: "example",
    UPSTASH_REDIS_HOST: "example",
    UPSTASH_REDIS_PORT: "6379",
    UPSTASH_REDIS_PASSWORD: "example",
  });
}

async function main() {
  console.log("\nBridge rollout worker preflight credential surface\n");

  await test("QA REST pollution alone yields hosted invalid", () => {
    const polluted = {
      ...workerBridgeEnv(),
      UPSTASH_REDIS_REST_URL: "https://example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    };
    const hosted = classifyHeadlessHostedWorkerEnvironment(
      mergeHeadlessFlyStagingOperatorPreflightEnvironment(polluted, {
        workerMode: "verify",
        applyPublicEnvironment: false,
      }),
    );
    assert.equal(hosted.status, "invalid");
    assert.equal(hosted.reasonId, "forbidden_upstash_rest_present");
  });

  await test("isolation removes QA-only keys without mutating source env", () => {
    const polluted = {
      ...workerBridgeEnv(),
      UPSTASH_REDIS_REST_URL: "https://example",
      UPSTASH_REDIS_REST_TOKEN: "token",
      HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE: "1",
    };
    const isolated = isolateHeadlessFlyStagingWorkerBridgePreflightEnvironment(
      polluted,
    );
    assert.equal(isolated.UPSTASH_REDIS_REST_URL, undefined);
    assert.equal(polluted.UPSTASH_REDIS_REST_URL, "https://example");
  });

  await test("operator preflight surface mismatch is classified before bridge recovery", () => {
    const polluted = {
      ...workerBridgeEnv(),
      UPSTASH_REDIS_REST_URL: "https://example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    };
    const result = classifyHeadlessFlyStagingBridgeRolloutWorkerPreflight({
      env: polluted,
      workerMode: "verify",
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected mismatch");
    assert.equal(result.reasonId, "operator_preflight_surface_mismatch");
    assert.ok(result.pollutedQaOnlyKeys.includes("UPSTASH_REDIS_REST_URL"));
  });

  await test("isolated worker bridge no longer reports forbidden REST", () => {
    const polluted = {
      ...workerBridgeEnv(),
      UPSTASH_REDIS_REST_URL: "https://example",
      UPSTASH_REDIS_REST_TOKEN: "token",
    };
    const isolated = isolateHeadlessFlyStagingWorkerBridgePreflightEnvironment(
      polluted,
    );
    const hosted = classifyHeadlessHostedWorkerEnvironment(
      mergeHeadlessFlyStagingOperatorPreflightEnvironment(isolated, {
        workerMode: "verify",
        applyPublicEnvironment: false,
      }),
    );
    assert.notEqual(hosted.reasonId, "forbidden_upstash_rest_present");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
