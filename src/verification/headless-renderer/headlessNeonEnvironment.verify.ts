/**
 * Sprint 11E Phase 2B.2 — Neon DATABASE_URL classification.
 * Run: npm run test:headless-neon-environment
 */

import assert from "node:assert/strict";

import {
  classifyHeadlessNeonEnvironment,
  HEADLESS_DATABASE_URL_MAX_LENGTH,
  isHeadlessNeonEnvironmentConfigured,
} from "@/features/headless-renderer/control-plane";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function main() {
  console.log("\nSprint 11E Phase 2B.2 — Neon environment classification\n");

  test("absent → unconfigured", () => {
    assert.equal(classifyHeadlessNeonEnvironment({}), "unconfigured");
    assert.equal(isHeadlessNeonEnvironmentConfigured({}), false);
  });

  test("valid postgres URL → configured", () => {
    const env = {
      DATABASE_URL: "postgresql://user:pass@ep-example.us-east-1.aws.neon.tech/neondb",
    };
    assert.equal(classifyHeadlessNeonEnvironment(env), "configured");
    assert.equal(isHeadlessNeonEnvironmentConfigured(env), true);
  });

  test("valid postgres:// protocol → configured", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({
        DATABASE_URL: "postgres://u:p@localhost:5432/db",
      }),
      "configured",
    );
  });

  test("blank / whitespace → invalid", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: "" }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: "   " }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonEnvironment({
        DATABASE_URL: "postgresql://u:p@host/db with space",
      }),
      "invalid",
    );
  });

  test("oversized → invalid", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({
        DATABASE_URL: "postgresql://u:p@h/" + "x".repeat(HEADLESS_DATABASE_URL_MAX_LENGTH),
      }),
      "invalid",
    );
  });

  test("unsupported protocol / malformed / missing host/db → invalid", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: "mysql://u:p@h/db" }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: "not-a-url" }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: "postgresql://u:p@/db" }),
      "invalid",
    );
    assert.equal(
      classifyHeadlessNeonEnvironment({
        DATABASE_URL: "postgresql://u:p@host/",
      }),
      "invalid",
    );
  });

  test("credentials-free invalid form → invalid", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({
        DATABASE_URL: "postgresql://host/db",
      }),
      "invalid",
    );
  });

  test("hostile env access → invalid", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("secret boom DATABASE_URL=postgresql://leak");
        },
      },
    );
    assert.equal(classifyHeadlessNeonEnvironment(hostile), "invalid");
  });

  test("non-string DATABASE_URL → invalid", () => {
    assert.equal(
      classifyHeadlessNeonEnvironment({ DATABASE_URL: 123 as unknown as string }),
      "invalid",
    );
  });

  test("classification never returns or echoes the URL", () => {
    const secret =
      "postgresql://neon_user:super-secret-pass@ep-hidden.neon.tech/neondb?sslmode=require";
    const status = classifyHeadlessNeonEnvironment({ DATABASE_URL: secret });
    assert.equal(status, "configured");
    assert.equal(typeof status === "string", true);
    assert.equal(status.includes("postgresql"), false);
    assert.equal(status.includes("secret"), false);
    assert.equal(status.includes("neon_user"), false);
    assert.equal(status.includes("ep-hidden"), false);
  });

  test("no connection attempt during classification", () => {
    // Classification is synchronous and does not import Pool.
    const before = Date.now();
    classifyHeadlessNeonEnvironment({
      DATABASE_URL: "postgresql://u:p@127.0.0.1:1/db",
    });
    assert.ok(Date.now() - before < 50);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main();
