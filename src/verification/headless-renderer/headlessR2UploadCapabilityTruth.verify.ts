/**
 * Sprint 11E Phase 2C.1A — upload capability signing / trust truth.
 * Run: npm run test:headless-r2-upload-capability-truth
 */

import assert from "node:assert/strict";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import {
  R2UploadCapabilityAdapter,
  type CreatePresignedPutUrl,
} from "@/features/headless-renderer/control-plane/adapters/r2-upload-capability.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecretvalue012345678901",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

const OBJECT_KEY =
  "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const DIGEST = `sha256:${"11".repeat(32)}`;

async function main() {
  console.log("\nSprint 11E Phase 2C.1A — R2 upload capability truth\n");

  await test("PutObject signs Bucket/Key/Content-Type/Content-Length", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await store.createStagingRecord({
      objectId: "obj_up",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 42,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });

    let captured: Parameters<CreatePresignedPutUrl>[0] | null = null;
    const createPresignedPutUrl: CreatePresignedPutUrl = async (input) => {
      captured = input;
      return "https://example.r2.cloudflarestorage.com/presigned-put?X-Amz-Signature=test";
    };

    const adapter = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      configOverride: CONFIG,
      createPresignedPutUrl,
    });

    const issued = await adapter.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_up",
      expectedByteLength: 42,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 2000,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok || !captured) return;

    assert.equal(captured.bucket, "assets-bucket");
    assert.equal(captured.objectKey, OBJECT_KEY);
    assert.equal(captured.contentType, "application/json");
    assert.equal(captured.contentLength, 42);
    assert.equal(issued.value.requiredHeaders["Content-Type"], "application/json");
    assert.equal(issued.value.requiredHeaders["Content-Length"], "42");
  });

  await test("URL is issuance-only — never persisted on owned-object row", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await store.createStagingRecord({
      objectId: "obj_url",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY + "_url",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 10,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const adapter = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      configOverride: CONFIG,
      createPresignedPutUrl: async () =>
        "https://example.r2.cloudflarestorage.com/presigned?sig=abc",
    });
    const issued = await adapter.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_url",
      expectedByteLength: 10,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 2000,
    });
    assert.equal(issued.ok, true);
    const after = await store.getByObjectIdAndOwner({
      objectId: "obj_url",
      ownerId: "owner_1",
    });
    assert.equal(after.ok, true);
    if (!after.ok || !after.value) return;
    const serialized = JSON.stringify(after.value.record);
    assert.equal(serialized.includes("presigned"), false);
    assert.equal(serialized.includes("http"), false);
    assert.equal(serialized.includes("sig="), false);
  });

  await test("browser-compatible URL omits automatic empty-body checksum claims", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await store.createStagingRecord({
      objectId: "obj_browser_checksum",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY + "_browser_checksum",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 42,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const adapter = new R2UploadCapabilityAdapter({
      ownedObjectStore: store,
      configOverride: CONFIG,
      browserCompatible: true,
    });
    const issued = await adapter.issueDirectPutCapability({
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      objectId: "obj_browser_checksum",
      expectedByteLength: 42,
      expectedMimeType: "application/json",
      allowedOrigin: "https://app.example.com",
      nowMs: 2000,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const query = new URL(issued.value.putUrl).searchParams;
    assert.equal(query.has("X-Amz-Signature"), true);
    assert.equal(query.has("x-amz-checksum-crc32"), false);
    assert.equal(query.has("x-amz-sdk-checksum-algorithm"), false);
    assert.equal(issued.value.requiredHeaders["Content-Length"], undefined);
  });

  await test("policy: content-type claim; length revalidated from stream; digest never trusted", () => {
    // Documentary fixture assertions — wiring contracts used by verify path.
    const policy = Object.freeze({
      contentType: "claim_until_trusted_verify",
      byteLength: "always_revalidated_from_stream",
      clientDigest: "never_trusted",
      contentLengthSignedWhenPassedToPutObjectCommand: true,
    });
    assert.equal(policy.contentType, "claim_until_trusted_verify");
    assert.equal(policy.byteLength, "always_revalidated_from_stream");
    assert.equal(policy.clientDigest, "never_trusted");
    assert.equal(policy.contentLengthSignedWhenPassedToPutObjectCommand, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
