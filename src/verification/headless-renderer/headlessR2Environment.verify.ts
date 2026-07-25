/**
 * Sprint 11E Phase 2C.1 — R2 environment classification.
 * Run: npm run test:headless-r2-environment
 */

import assert from "node:assert/strict";

import {
  classifyHeadlessR2Environment,
  HEADLESS_R2_ACCOUNT_ID_MAX_LENGTH,
  HEADLESS_R2_ALLOWED_ORIGINS_MAX_LENGTH,
  HEADLESS_R2_ENDPOINT_MAX_LENGTH,
  isHeadlessR2EnvironmentConfigured,
  readConfiguredHeadlessAllowedOrigins,
} from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function validEnv(overrides: Record<string, string> = {}) {
  return {
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
    R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
    R2_BUCKET_ASSETS: "footie-assets-staging",
    R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
    R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
    HEADLESS_ALLOWED_ORIGINS: "https://app.example.com,https://staging.example.com",
    ...overrides,
  };
}

function main() {
  console.log("\nSprint 11E Phase 2C.1 — R2 environment classification\n");

  test("all absent → unconfigured", () => {
    assert.equal(classifyHeadlessR2Environment({}), "unconfigured");
    assert.equal(isHeadlessR2EnvironmentConfigured({}), false);
  });

  test("all present and valid → configured", () => {
    const env = validEnv();
    assert.equal(classifyHeadlessR2Environment(env), "configured");
    assert.equal(isHeadlessR2EnvironmentConfigured(env), true);
    const origins = readConfiguredHeadlessAllowedOrigins(env);
    assert.deepEqual(origins, [
      "https://app.example.com",
      "https://staging.example.com",
    ]);
  });

  test("subset present → invalid", () => {
    assert.equal(
      classifyHeadlessR2Environment({ R2_ACCOUNT_ID: "abc" }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment({
        R2_ACCOUNT_ID: "abc",
        R2_ACCESS_KEY_ID: "key",
      }),
      "invalid",
    );
  });

  test("blank / whitespace → invalid", () => {
    assert.equal(
      classifyHeadlessR2Environment(validEnv({ R2_ACCOUNT_ID: "" })),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(validEnv({ R2_BUCKET_ASSETS: "  bad  " })),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ R2_ENDPOINT: "https://host.example.com/path with space" }),
      ),
      "invalid",
    );
  });

  test("oversized → invalid", () => {
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ R2_ACCOUNT_ID: "x".repeat(HEADLESS_R2_ACCOUNT_ID_MAX_LENGTH + 1) }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({
          R2_ENDPOINT:
            "https://h.example.com/" +
            "x".repeat(HEADLESS_R2_ENDPOINT_MAX_LENGTH),
        }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({
          HEADLESS_ALLOWED_ORIGINS:
            "https://a.com," + "https://b.com".repeat(HEADLESS_R2_ALLOWED_ORIGINS_MAX_LENGTH),
        }),
      ),
      "invalid",
    );
  });

  test("http endpoint / userinfo / same buckets → invalid", () => {
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ R2_ENDPOINT: "http://accountid.r2.cloudflarestorage.com" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({
          R2_ENDPOINT: "https://user:pass@accountid.r2.cloudflarestorage.com",
        }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({
          R2_BUCKET_ASSETS: "same-bucket",
          R2_BUCKET_ARTIFACTS: "same-bucket",
        }),
      ),
      "invalid",
    );
  });

  test("origins: wildcard / path / empty segment / credential-like → invalid", () => {
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ HEADLESS_ALLOWED_ORIGINS: "https://*.example.com" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ HEADLESS_ALLOWED_ORIGINS: "https://app.example.com/path" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ HEADLESS_ALLOWED_ORIGINS: "https://a.com,,https://b.com" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ HEADLESS_ALLOWED_ORIGINS: "sk_live_abc" }),
      ),
      "invalid",
    );
    assert.equal(
      classifyHeadlessR2Environment(
        validEnv({ HEADLESS_ALLOWED_ORIGINS: "https://hasSECRETin.com" }),
      ),
      "invalid",
    );
  });

  test("hostile env Proxy → invalid", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("secret boom R2_SECRET_ACCESS_KEY=leak");
        },
      },
    );
    assert.equal(classifyHeadlessR2Environment(hostile), "invalid");
    assert.equal(readConfiguredHeadlessAllowedOrigins(hostile), null);
  });

  test("readConfiguredHeadlessAllowedOrigins null unless configured", () => {
    assert.equal(readConfiguredHeadlessAllowedOrigins({}), null);
    assert.equal(
      readConfiguredHeadlessAllowedOrigins({ R2_ACCOUNT_ID: "x" }),
      null,
    );
  });

  test("classifier never returns secret material", () => {
    const status = classifyHeadlessR2Environment(validEnv());
    assert.equal(typeof status, "string");
    assert.equal(JSON.stringify(status).includes("secretvalue"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
