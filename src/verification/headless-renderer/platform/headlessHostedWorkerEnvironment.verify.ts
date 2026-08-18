/**
 * Sprint 11E Phase 2E.1 — Hosted worker hostile environment classification.
 * Run: npm run test:headless-hosted-worker-environment
 */

import assert from "node:assert/strict";

import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import {
  classifyHeadlessHostedWorkerEnvironment,
  HEADLESS_HOSTED_FLY_SECRET_NAMES,
  isHeadlessHostedWorkerEnvironmentConfigured,
} from "@/features/headless-renderer/worker/hosted";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function validHostedEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    HEADLESS_WORKER_MODE: "render",
    HEADLESS_ENV_NAME: "staging",
    DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
    UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
    HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
    HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
    HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
    HEADLESS_WORKER_CONCURRENCY: "1",
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

function main() {
  console.log("\nSprint 11E Phase 2E.1 — Hosted worker environment\n");

  test("empty → unconfigured", () => {
    const c = classifyHeadlessHostedWorkerEnvironment({});
    assert.equal(c.status, "unconfigured");
    assert.equal(isHeadlessHostedWorkerEnvironmentConfigured({}), false);
  });

  test("web Neon alone does not configure hosted worker", () => {
    const c = classifyHeadlessHostedWorkerEnvironment({
      DATABASE_URL: "postgresql://user:pass@ep.example/neondb",
    });
    assert.equal(c.status, "unconfigured");
  });

  test("partial hosted surface without mode → invalid", () => {
    const c = classifyHeadlessHostedWorkerEnvironment({
      HEADLESS_CHROME_PATH: "/usr/bin/chromium",
    });
    assert.equal(c.status, "invalid");
    assert.equal(c.reasonId, "partial_configuration");
  });

  test("valid staging render → configured", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(validHostedEnv());
    assert.equal(c.status, "configured");
    assert.equal(c.config?.mode, "render");
    assert.equal(c.config?.envName, "staging");
    assert.equal(c.config?.concurrency, 1);
  });

  test("valid staging verify → configured", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({ HEADLESS_WORKER_MODE: "verify" }),
    );
    assert.equal(c.status, "configured");
    assert.equal(c.config?.mode, "verify");
  });

  test("mode mismatch / hostile → invalid", () => {
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ HEADLESS_WORKER_MODE: "both" }),
      ).status,
      "invalid",
    );
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ HEADLESS_WORKER_MODE: " render" }),
      ).status,
      "invalid",
    );
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment({
        ...validHostedEnv(),
        HEADLESS_WORKER_MODE: { nested: true } as unknown as string,
      }).status,
      "invalid",
    );
  });

  test("local env name rejected for hosted", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({ HEADLESS_ENV_NAME: "local" }),
    );
    assert.equal(c.status, "invalid");
  });

  test("render concurrency != 1 → invalid", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({ HEADLESS_WORKER_CONCURRENCY: "2" }),
    );
    assert.equal(c.status, "invalid");
    assert.equal(c.reasonId, "invalid_concurrency");
  });

  test("wrong renderer build id → invalid", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({ HEADLESS_RENDERER_BUILD_ID: "wrong-build" }),
    );
    assert.equal(c.status, "invalid");
    assert.equal(c.reasonId, "invalid_renderer_build_id");
  });

  test("caption/trim parity build id is accepted additively", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({
        HEADLESS_RENDERER_BUILD_ID:
          "headless-local-chromium-ffmpeg-11e-phase2g.26-caption-trim-parity",
      }),
    );
    assert.equal(c.status, "configured");
  });

  test("Clerk / Vercel / REST token presence → invalid", () => {
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ CLERK_SECRET_KEY: "sk_test_x" }),
      ).reasonId,
      "forbidden_clerk_present",
    );
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ VERCEL_URL: "https://x.vercel.app" }),
      ).reasonId,
      "forbidden_vercel_present",
    );
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ UPSTASH_REDIS_REST_TOKEN: "tok" }),
      ).reasonId,
      "forbidden_upstash_rest_present",
    );
  });

  test("mixed staging/prod bucket identity → invalid", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(
      validHostedEnv({
        R2_BUCKET_ASSETS: "footiebitz-assets-prod",
        R2_BUCKET_ARTIFACTS: "footiebitz-artifacts-staging",
      }),
    );
    assert.equal(c.status, "invalid");
    assert.equal(c.reasonId, "mixed_environment_identity");
  });

  test("oversized path / blank → invalid", () => {
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ HEADLESS_CHROME_PATH: "relative/chrome" }),
      ).status,
      "invalid",
    );
    assert.equal(
      classifyHeadlessHostedWorkerEnvironment(
        validHostedEnv({ HEADLESS_CHROME_PATH: `/${"a".repeat(2000)}` }),
      ).status,
      "invalid",
    );
  });

  test("classification never returns secret values", () => {
    const c = classifyHeadlessHostedWorkerEnvironment(validHostedEnv());
    const json = JSON.stringify(c);
    assert.equal(json.includes("secret_access_key"), false);
    assert.equal(json.includes("rediss://"), false);
    assert.equal(json.includes("postgresql://"), false);
    assert.ok(HEADLESS_HOSTED_FLY_SECRET_NAMES.includes("DATABASE_URL"));
  });

  console.log(`\n${passed} passed\n`);
}

main();
