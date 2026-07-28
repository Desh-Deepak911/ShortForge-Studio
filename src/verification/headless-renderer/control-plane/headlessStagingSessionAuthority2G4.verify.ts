import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  classifyStagingSessionEnvironment,
  readStagingSessionConfiguration,
} from "../../../features/headless-renderer/control-plane/runtime/staging-session-environment";
import {
  mintStagingSessionToken,
  verifyStagingSessionToken,
} from "../../../features/headless-renderer/control-plane/runtime/staging-session-token";
import { StagingSessionPrincipalAdapter } from "../../../features/headless-renderer/control-plane/adapters/staging-session-principal.adapter";

const codeA = "a".repeat(64);
const codeB = "b".repeat(64);
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const env = {
  HEADLESS_STAGING_SESSION_SECRET: "c".repeat(64),
  HEADLESS_STAGING_TESTER_HASHES: `stg_primary=${hash(codeA)},stg_collaborator=${hash(codeB)}`,
};

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

async function main() {
await test("configuration requires exactly two bounded testers", () => {
  assert.equal(classifyStagingSessionEnvironment({}), "absent");
  assert.equal(classifyStagingSessionEnvironment(env), "configured");
  assert.equal(
    classifyStagingSessionEnvironment({
      ...env,
      HEADLESS_STAGING_TESTER_HASHES: `stg_primary=${hash(codeA)}`,
    }),
    "invalid",
  );
});

await test("signed token resolves only the allowlisted owner", () => {
  const configuration = readStagingSessionConfiguration(env);
  assert.ok(configuration);
  const token = mintStagingSessionToken({
    configuration,
    ownerId: "stg_primary",
    nowMs: 1_000_000,
    sessionId: "d".repeat(32),
  });
  assert.ok(token);
  assert.deepEqual(
    verifyStagingSessionToken({
      configuration,
      token,
      nowMs: 1_001_000,
    }),
    { ownerId: "stg_primary", sessionId: "d".repeat(32) },
  );
  assert.equal(
    mintStagingSessionToken({
      configuration,
      ownerId: "unknown",
      nowMs: 1_000_000,
    }),
    null,
  );
});

await test("tampering and expiration fail closed", () => {
  const configuration = readStagingSessionConfiguration(env);
  assert.ok(configuration);
  const token = mintStagingSessionToken({
    configuration,
    ownerId: "stg_primary",
    nowMs: 1_000_000,
    sessionId: "d".repeat(32),
  });
  assert.ok(token);
  assert.equal(
    verifyStagingSessionToken({
      configuration,
      token: `${token.slice(0, -1)}x`,
      nowMs: 1_001_000,
    }),
    null,
  );
  assert.equal(
    verifyStagingSessionToken({
      configuration,
      token,
      nowMs: 1_000_000 + 8 * 24 * 60 * 60 * 1000,
    }),
    null,
  );
});

await test("request adapter authenticates cookie and rejects missing cookie", async () => {
  const configuration = readStagingSessionConfiguration(env);
  assert.ok(configuration);
  const token = mintStagingSessionToken({
    configuration,
    ownerId: "stg_collaborator",
    nowMs: 1_000_000,
    sessionId: "e".repeat(32),
  });
  assert.ok(token);
  const adapter = new StagingSessionPrincipalAdapter(
    configuration,
    () => 1_001_000,
  );
  const resolved = await adapter.resolvePrincipal(
    new Request("https://staging.example.test/api", {
      headers: {
        cookie: `__Host-shortforge_staging_session=${token}`,
      },
    }),
  );
  assert.equal(resolved.ok, true);
  if (resolved.ok) assert.equal(resolved.value.ownerId, "stg_collaborator");
  assert.equal(
    (
      await adapter.resolvePrincipal(
        new Request("https://staging.example.test/api"),
      )
    ).ok,
    false,
  );
});

console.log(`\n${passed}/4 PASS`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
