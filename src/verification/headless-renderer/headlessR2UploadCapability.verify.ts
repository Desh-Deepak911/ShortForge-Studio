/**
 * Sprint 11E Phase 2C.1 — R2 upload capability adapter (injected, no network).
 * Run: npm run test:headless-r2-upload-capability
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { R2UploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import { UnavailableHeadlessUploadCapabilityAdapter } from "@/features/headless-renderer/control-plane";
import type { HeadlessUploadCapabilityPort } from "@/features/headless-renderer/control-plane/ports/upload-capability.port";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${createHash("sha256").update("hello").digest("hex")}`;

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

async function seedStaging(store: MemoryHeadlessOwnedObjectStoreAdapter) {
  return store.createStagingRecord({
    objectId: "obj_up_1",
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: "job_1",
    operationId: "op_1",
    purpose: "manifest",
    slotKey: null,
    storeId: "assets",
    objectKey: "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    expectedContentDigestClaim: DIGEST,
    expectedByteLength: 5,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 1_000_000,
    expiresAtMs: 2_000_000,
    createdAtMs: 1000,
  });
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1 — R2 upload capability\n");

  await test("unavailable adapter returns CONFIGURATION_UNAVAILABLE", async () => {
    const adapter: HeadlessUploadCapabilityPort =
      new UnavailableHeadlessUploadCapabilityAdapter();
    const result = await adapter.issueDirectPutCapability({
      ownerId: "o",
      projectId: "p",
      jobId: "j",
      operationId: "op",
      objectId: "x",
      expectedByteLength: 1,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  await test("issues putUrl via inject without network", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const seeded = await seedStaging(store);
    assert.equal(seeded.ok, true);

    let captured: Record<string, unknown> | null = null;
    const adapter = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      configOverride: CONFIG,
      createPresignedPutUrl: async (input) => {
        captured = { ...input };
        return "https://signed.example/put-only-at-issuance";
      },
    });

    const issued = await adapter.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_up_1",
      expectedByteLength: 5,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 5000,
      ttlMs: 60_000,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.value.putUrl, "https://signed.example/put-only-at-issuance");
    assert.equal(issued.value.requiredHeaders["Content-Length"], "5");
    assert.equal(captured?.bucket, "assets-bucket");
    assert.equal(
      captured?.objectKey,
      "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    );
    // Secret must not appear in issuance result JSON.
    assert.equal(JSON.stringify(issued.value).includes("supersecret"), false);
  });

  await test("forbidden origin / unconfigured env", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await seedStaging(store);
    const adapter = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      configOverride: CONFIG,
      createPresignedPutUrl: async () => "https://x",
    });
    const forbidden = await adapter.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_up_1",
      expectedByteLength: 5,
      expectedMimeType: "application/json",
      allowedOrigin: "https://evil.example.com",
      nowMs: 5000,
    });
    assert.equal(forbidden.ok, false);
    if (!forbidden.ok) assert.equal(forbidden.issues[0]?.code, "FORBIDDEN");

    const unconfigured = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      env: {},
      createPresignedPutUrl: async () => "https://x",
    });
    const missing = await unconfigured.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_up_1",
      expectedByteLength: 5,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 5000,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
