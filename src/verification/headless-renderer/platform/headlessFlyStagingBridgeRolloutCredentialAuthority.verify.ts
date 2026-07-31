/**
 * Bridge rollout credential surface authority.
 * Run: npm run test:headless-fly-staging-bridge-rollout-credential-authority
 */

import assert from "node:assert/strict";

import {
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  createCanonicalFlyVerifyLiveQaConfiguredEnv,
} from "@/verification/headless-renderer/fly-verify-live/qa-secret-contract";
import {
  FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS,
  FLY_STAGING_HOSTED_WORKER_BRIDGE_FORBIDDEN_KEYS,
  FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS,
  classifyBridgeRolloutCredentialSurfaceCoherence,
  classifyPooledUrlCannotApplyMigrations,
  deriveHostedWorkerBridgeLinesFromQaMaster,
  validateBridgeRolloutQaMasterBody,
  validateHostedWorkerBridgeKeyNames,
  validateMigrationMasterBody,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-credential-authority";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function qaMasterBodyFromEnv(
  env: Record<string, string>,
): string {
  return FLY_VERIFY_LIVE_QA_SECRET_KEYS.map((key) => `${key}=${env[key] ?? ""}`).join(
    "\n",
  );
}

console.log("\nBridge rollout credential surface authority\n");

async function main(): Promise<void> {
await test("canonical eleven-key QA master passes validation", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
  const body = qaMasterBodyFromEnv(env);
  const result = validateBridgeRolloutQaMasterBody(body);
  assert.equal(result.ok, true);
});

await test("REST keys remain legal in QA master", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
  assert.ok(env.UPSTASH_REDIS_REST_URL.length > 0);
  assert.ok(env.UPSTASH_REDIS_REST_TOKEN.length > 0);
  const result = validateBridgeRolloutQaMasterBody(qaMasterBodyFromEnv(env));
  assert.equal(result.ok, true);
});

await test("derived nine-key worker bridge excludes REST and unpooled URL", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
  const body = qaMasterBodyFromEnv(env);
  const lines = deriveHostedWorkerBridgeLinesFromQaMaster(body);
  assert.equal(lines.length, FLY_STAGING_HOSTED_WORKER_BRIDGE_SECRET_KEYS.length);
  for (const forbidden of FLY_STAGING_HOSTED_WORKER_BRIDGE_FORBIDDEN_KEYS) {
    assert.equal(
      lines.some((line) => line.startsWith(`${forbidden}=`)),
      false,
    );
  }
  const keyNames = lines.map((line) => line.split("=")[0] ?? "");
  assert.equal(validateHostedWorkerBridgeKeyNames(keyNames).ok, true);
});

await test("app name is rejected inside QA master secret file", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
    HEADLESS_FLY_STAGING_APP_NAME: FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME,
  });
  const body = `${qaMasterBodyFromEnv(env)}\nHEADLESS_FLY_STAGING_APP_NAME=${env.HEADLESS_FLY_STAGING_APP_NAME}`;
  const result = validateBridgeRolloutQaMasterBody(body);
  assert.equal(result.ok, false);
});

await test("public pins are separate from secret membership", () => {
  assert.equal(
    FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_FLY_STAGING_APP_NAME,
    "shortforge-hw-staging-4def8fa0",
  );
  assert.equal(FLY_STAGING_BRIDGE_ROLLOUT_PUBLIC_PINS.HEADLESS_ENV_NAME, "staging");
  assert.equal(
    (FLY_VERIFY_LIVE_QA_SECRET_KEYS as readonly string[]).includes(
      "HEADLESS_FLY_STAGING_APP_NAME",
    ),
    false,
  );
});

await test("migration master accepts only direct unpooled URL assignment", () => {
  const result = validateMigrationMasterBody(
    "DATABASE_URL_UNPOOLED=postgresql://user:pass@ep-test.us-east-1.aws.neon.tech/neondb",
  );
  assert.equal(result.ok, true);
});

await test("migration master rejects pooler hostname", () => {
  const result = validateMigrationMasterBody(
    "DATABASE_URL_UNPOOLED=postgresql://user:pass@ep-test-pooler.us-east-1.aws.neon.tech/neondb",
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failClass, "migration_master_pooler_rejected");
});

await test("pooled DATABASE_URL cannot satisfy migration-only classification", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
    DATABASE_URL:
      "postgresql://user:pass@ep-test-pooler.us-east-1.aws.neon.tech/neondb",
  });
  const body = qaMasterBodyFromEnv(env);
  const result = classifyPooledUrlCannotApplyMigrations(body);
  assert.equal(result.ok, true);
});

await test("unpooled URL cannot enter derived worker bridge", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
  const body = qaMasterBodyFromEnv(env);
  const lines = deriveHostedWorkerBridgeLinesFromQaMaster(body);
  const coherence = classifyBridgeRolloutCredentialSurfaceCoherence({
    qaMasterBody: body,
    workerBridgeLines: [...lines, "DATABASE_URL_UNPOOLED=postgresql://direct/neondb"],
  });
  assert.equal(coherence.ok, false);
  if (!coherence.ok) assert.equal(coherence.failClass, "unpooled_url_in_worker_bridge");
});

await test("incoherent worker bridge blocks surface coherence", () => {
  const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
  const body = qaMasterBodyFromEnv(env);
  const lines = deriveHostedWorkerBridgeLinesFromQaMaster(body);
  const badLines = lines.map((line) =>
    line.startsWith("UPSTASH_REDIS_TCP_URL=")
      ? "UPSTASH_REDIS_REST_URL=https://example.upstash.io"
      : line,
  );
  const coherence = classifyBridgeRolloutCredentialSurfaceCoherence({
    qaMasterBody: body,
    workerBridgeLines: badLines,
  });
  assert.equal(coherence.ok, false);
});

console.log(`\n${passed} passed\n`);
}

main().catch(() => {
  process.exit(1);
});
