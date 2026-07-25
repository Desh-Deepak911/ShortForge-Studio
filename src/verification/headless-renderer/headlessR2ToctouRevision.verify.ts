/**
 * Sprint 11E Phase 2C.1A — R2 TOCTOU revision authority.
 * Run: npm run test:headless-r2-toctou-revision
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import { verifyAndFinalizeR2OwnedObject } from "@/features/headless-renderer/control-plane";
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
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

const OBJECT_KEY =
  "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1A — R2 TOCTOU revision\n");

  await test("HeadObject captures etag revision (not sha256)", async () => {
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode('{"ok":true}');
    fake.putFixture("assets-bucket", OBJECT_KEY, bytes, "application/json");
    const adapter = new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });
    const meta = await adapter.readObjectMetadata(
      { storeId: "assets", objectKey: OBJECT_KEY },
      "owner_1",
    );
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    assert.equal(meta.value.revisionAuthority, "etag");
    assert.ok(meta.value.providerRevisionId);
    assert.equal(meta.value.providerRevisionId?.startsWith("sha256:"), false);
  });

  await test("revision unavailable → OBJECT_REVISION_UNAVAILABLE", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    fake.omitRevisionOnHead = true;
    const bytes = new TextEncoder().encode('{"ok":true}');
    fake.putFixture("assets-bucket", OBJECT_KEY, bytes, "application/json");
    await store.createStagingRecord({
      objectId: "obj_rev",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: digestOf(bytes),
      expectedByteLength: bytes.byteLength,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_rev",
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "OBJECT_REVISION_UNAVAILABLE");
    }
  });

  await test("mutate between HEAD and GET → OBJECT_REVISION_MISMATCH", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode('{"ok":true}');
    fake.putFixture("assets-bucket", OBJECT_KEY, bytes, "application/json");
    fake.mutateBetweenHeadAndGet = (bucket, key) => {
      fake.putFixture(
        bucket,
        key,
        new TextEncoder().encode('{"mutated":true}'),
        "application/json",
      );
    };
    await store.createStagingRecord({
      objectId: "obj_mut",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: digestOf(bytes),
      expectedByteLength: bytes.byteLength,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_mut",
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "OBJECT_REVISION_MISMATCH");
    }
    const after = await store.getByObjectIdAndOwner({
      objectId: "obj_mut",
      ownerId: "owner_1",
    });
    assert.equal(after.ok, true);
    if (after.ok && after.value) {
      assert.notEqual(after.value.record.stage, "finalized");
    }
  });

  await test("conditional stream happy path still digests bytes", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode('{"ok":true}');
    fake.putFixture("assets-bucket", OBJECT_KEY, bytes, "application/json");
    await store.createStagingRecord({
      objectId: "obj_ok",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: digestOf(bytes),
      expectedByteLength: bytes.byteLength,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 1_000_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_ok",
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.record.stage, "finalized");
    assert.equal(result.value.coverageReconciled, true);
    assert.equal(result.value.record.contentDigest, digestOf(bytes));
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
