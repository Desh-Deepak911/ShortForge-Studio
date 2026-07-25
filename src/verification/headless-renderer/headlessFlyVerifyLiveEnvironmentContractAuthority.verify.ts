/**
 * Sprint 11E Phase 2E.2D.7A.1 — Hosted Fly verifier QA environment contract authority.
 * Run: npm run test:headless-fly-verify-live-environment-contract-authority
 *
 * Deterministic — no Neon, R2, Upstash, or Fly contact.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessRenderDispatchOutboxAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";
import {
  classifyHeadlessNeonEnvironment,
  classifyHeadlessR2Environment,
  classifyHeadlessUpstashConsumerEnvironment,
  classifyHeadlessUpstashProducerEnvironment,
} from "@/features/headless-renderer/control-plane";

import { runFlyVerifyLiveHarness } from "./fly-verify-live/run-fly-verify-live-harness";
import { buildFlyVerifyLiveSchemaFingerprint } from "./fly-verify-live/evidence-authority";
import { createPassingFlyVerifyLiveCaseRunners } from "./fly-verify-live/live-matrix";
import {
  attributeFlyVerifyLiveEnvironment,
  createCanonicalFlyVerifyLiveQaConfiguredEnv,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_EXACT_KEYS,
  FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS,
  FLY_VERIFY_LIVE_QA_SECRET_KEYS,
  isFlyVerifyLiveConfigAttributionEligible,
  isFlyVerifyLiveGateEnvironmentEligible,
  parseFlyVerifyLiveQaBridgeKeyNames,
  validateFlyVerifyLiveQaBridgeKeyNames,
  validateFlyVerifyLiveQaEnvContract,
} from "./fly-verify-live/qa-secret-contract";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function noopSql(): HeadlessSqlExecutor {
  const client = {
    async query<T = Record<string, unknown>>() {
      return { rows: [{ n: "0" }] as T[] };
    },
  };
  return {
    async withClient(fn) {
      return fn(client as never);
    },
    async withTransaction(fn) {
      return fn(client as never);
    },
  };
}

function bridgeBodyFromKeys(keys: readonly string[]): string {
  return keys.map((k) => `${k}=placeholder_value`).join("\n");
}

function injectedHarnessDeps(env: Record<string, string>) {
  const streamQueue = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
  return {
    env,
    forceGateOn: true,
    injectedSql: noopSql(),
    injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
    injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    injectedDispatchOutbox: new MemoryHeadlessRenderDispatchOutboxAdapter(),
    injectedTcpConsumer: streamQueue as never,
    injectedRestProducer: streamQueue as never,
    injectedFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
    readFlyTopology: async () => ({
      verifyCount: 1,
      renderCount: 0,
      region: "iad",
      verifyMachineId: "abc12345",
      imageDigestSha256: "ae06963a0000000000000000000000000000000000000000000000000000",
    }),
    pollHostedVerifier: async () => ({
      finalized: true,
      claimCleared: true,
      coverageReconciled: true,
      coverageComplete: false,
      promoted: false,
      renderDispatchPresent: false,
      verifyPendingCleared: true,
      storeVersion: 1,
    }),
    cleanupRunner: async () => "ok" as const,
    caseRunners: createPassingFlyVerifyLiveCaseRunners(),
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A.1 — Fly verify live environment contract authority\n",
  );

  await test("canonical eleven-key contract is frozen", () => {
    assert.equal(FLY_VERIFY_LIVE_QA_SECRET_KEYS.length, 11);
    assert.deepEqual([...FLY_VERIFY_LIVE_QA_SECRET_KEYS], [
      "DATABASE_URL",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_ASSETS",
      "R2_BUCKET_ARTIFACTS",
      "R2_ENDPOINT",
      "HEADLESS_ALLOWED_ORIGINS",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "UPSTASH_REDIS_TCP_URL",
    ]);
  });

  await test("exact eleven bridge keys pass", () => {
    const keys = parseFlyVerifyLiveQaBridgeKeyNames(
      bridgeBodyFromKeys(FLY_VERIFY_LIVE_QA_SECRET_KEYS),
    );
    assert.equal(validateFlyVerifyLiveQaBridgeKeyNames(keys).ok, true);
  });

  await test("canonical configured env passes all production classifiers", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    assert.equal(classifyHeadlessNeonEnvironment(env), "configured");
    assert.equal(classifyHeadlessR2Environment(env), "configured");
    assert.equal(classifyHeadlessUpstashProducerEnvironment(env), "configured");
    assert.equal(classifyHeadlessUpstashConsumerEnvironment(env), "configured");
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, true);
    const attribution = attributeFlyVerifyLiveEnvironment(env);
    assert.equal(isFlyVerifyLiveConfigAttributionEligible(attribution), true);
    assert.equal(isFlyVerifyLiveGateEnvironmentEligible(env), true);
  });

  await test("missing R2_ACCOUNT_ID fails contract and classifiers", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    delete env.R2_ACCOUNT_ID;
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, false);
    assert.equal(classifyHeadlessR2Environment(env), "invalid");
    assert.equal(isFlyVerifyLiveGateEnvironmentEligible(env), false);
  });

  await test("R2_ALLOWED_ORIGINS cannot substitute for HEADLESS_ALLOWED_ORIGINS", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      HEADLESS_ALLOWED_ORIGINS: undefined,
      R2_ALLOWED_ORIGINS: "https://app.example.com",
    });
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, false);
    assert.equal(classifyHeadlessR2Environment(env), "invalid");
    assert.equal(isFlyVerifyLiveGateEnvironmentEligible(env), false);
  });

  await test("missing REST URL fails", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      UPSTASH_REDIS_REST_URL: undefined,
    });
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, false);
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment(env),
      "invalid",
    );
  });

  await test("missing REST token fails", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, false);
    assert.equal(
      classifyHeadlessUpstashProducerEnvironment(env),
      "invalid",
    );
  });

  await test("missing TCP URL fails", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      UPSTASH_REDIS_TCP_URL: undefined,
    });
    assert.equal(validateFlyVerifyLiveQaEnvContract(env).ok, false);
    assert.equal(
      classifyHeadlessUpstashConsumerEnvironment(env),
      "invalid",
    );
  });

  await test("extra bridge key fails", () => {
    const keys = [
      ...FLY_VERIFY_LIVE_QA_SECRET_KEYS,
      "EXTRA_SECRET",
    ];
    const result = validateFlyVerifyLiveQaBridgeKeyNames(keys);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "bridge_extra_key");
    }
  });

  await test("duplicate bridge key fails", () => {
    const keys = [
      ...FLY_VERIFY_LIVE_QA_SECRET_KEYS,
      "DATABASE_URL",
    ];
    const result = validateFlyVerifyLiveQaBridgeKeyNames(keys);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "bridge_duplicate_key");
    }
  });

  await test("forbidden R2_ALLOWED_ORIGINS bridge key fails", () => {
    const keys = FLY_VERIFY_LIVE_QA_SECRET_KEYS.map((k) =>
      k === "HEADLESS_ALLOWED_ORIGINS" ? "R2_ALLOWED_ORIGINS" : k,
    );
    const result = validateFlyVerifyLiveQaBridgeKeyNames(keys);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failClass, "bridge_forbidden_secret_key");
    }
  });

  await test("public gate key in bridge fails", () => {
    for (const gateKey of FLY_VERIFY_LIVE_QA_FORBIDDEN_BRIDGE_EXACT_KEYS) {
      const keys = [...FLY_VERIFY_LIVE_QA_SECRET_KEYS, gateKey];
      const result = validateFlyVerifyLiveQaBridgeKeyNames(keys);
      assert.equal(result.ok, false, gateKey);
    }
  });

  await test("gate-on wrong env cannot false-pass with injected providers", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-env-contract-"));
    const evidencePath = path.join(dir, "evidence.md");
    let connections = 0;
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      R2_ACCOUNT_ID: undefined,
      R2_ALLOWED_ORIGINS: "https://app.example.com",
    });
    const result = await runFlyVerifyLiveHarness({
      ...injectedHarnessDeps(env),
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.overall, "CONFIGURATION_UNAVAILABLE");
    assert.equal(connections, 0);
    const markdown = readFileSync(evidencePath, "utf8");
    assert.match(markdown, /CONFIGURATION_UNAVAILABLE/);
    assert.match(markdown, /neon_status=/);
    assert.match(markdown, /r2_status=/);
    assert.doesNotMatch(markdown, /postgresql:\/\//);
  });

  await test("gate-off → zero connections and preserved evidence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-env-contract-"));
    const evidencePath = path.join(dir, "evidence.md");
    let connections = 0;
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    delete env.HEADLESS_FLY_VERIFY_QA;
    const result = await runFlyVerifyLiveHarness({
      env,
      evidencePath,
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(connections, 0);
  });

  await test("attribution never names individual failing secrets", () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      R2_ACCOUNT_ID: undefined,
    });
    const attribution = attributeFlyVerifyLiveEnvironment(env);
    const serialized = JSON.stringify(attribution);
    assert.doesNotMatch(serialized, /R2_ACCOUNT_ID/);
    assert.doesNotMatch(serialized, /HEADLESS_ALLOWED_ORIGINS/);
    assert.doesNotMatch(serialized, /UPSTASH_REDIS_REST_URL/);
    for (const forbidden of FLY_VERIFY_LIVE_QA_FORBIDDEN_SECRET_KEYS) {
      assert.doesNotMatch(serialized, new RegExp(forbidden));
    }
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
