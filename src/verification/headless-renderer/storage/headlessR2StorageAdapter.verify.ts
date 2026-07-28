/**
 * Sprint 11E Phase 2C.1 — R2 storage adapter with FakeS3 (no network).
 * Run: npm run test:headless-r2-storage-adapter
 */

import assert from "node:assert/strict";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
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

async function main() {
  console.log("\nSprint 11E Phase 2C.1 — R2 storage adapter\n");

  await test("HeadObject / stream / put / delete with FakeS3", async () => {
    const fake = new FakeS3Client();
    const body = new TextEncoder().encode("abcdefghij");
    fake.putFixture("assets-bucket", "k1", body, "application/octet-stream");

    const adapter = new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });

    const meta = await adapter.readObjectMetadata(
      { storeId: "assets", objectKey: "k1" },
      "owner_1",
    );
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    assert.equal(meta.value.byteLength, 10);

    const chunks: Uint8Array[] = [];
    const stream = adapter.streamFullObject({
      locator: { storeId: "assets", objectKey: "k1" },
      ownerId: "owner_1",
      maxBytes: 100,
    });
    let result = await stream.next();
    while (!result.done) {
      chunks.push(result.value);
      result = await stream.next();
    }
    assert.equal(result.value.ok, true);
    if (!result.value.ok) return;
    assert.equal(result.value.value.byteLength, 10);
    const joined = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString(
      "utf8",
    );
    assert.equal(joined, "abcdefghij");

    const written = await adapter.writeUploadStream({
      locator: { storeId: "assets", objectKey: "k2" },
      ownerId: "owner_1",
      contentType: "text/plain",
      expectedByteLength: 4,
      maxBytes: 100,
      chunks: (async function* () {
        yield new TextEncoder().encode("hi");
        yield new TextEncoder().encode("!!");
      })(),
    });
    assert.equal(written.ok, true);
    assert.equal(fake.exactByteLength("assets-bucket", "k2"), 4);

    const deleted = await adapter.deleteObject(
      { storeId: "assets", objectKey: "k2" },
      "owner_1",
    );
    assert.equal(deleted.ok, true);
    assert.equal(fake.hasObject("assets-bucket", "k2"), false);
  });

  await test("overflow and abort", async () => {
    const fake = new FakeS3Client();
    fake.putFixture(
      "assets-bucket",
      "big",
      new Uint8Array(20),
      "application/octet-stream",
    );
    const adapter = new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });

    const stream = adapter.streamFullObject({
      locator: { storeId: "assets", objectKey: "big" },
      ownerId: "owner_1",
      maxBytes: 5,
    });
    const first = await stream.next();
    // May fail at ContentLength check before yielding, or during.
    if (!first.done) {
      const rest = await stream.next();
      assert.equal(rest.done, true);
      if (rest.done) {
        assert.equal(rest.value.ok, false);
        if (!rest.value.ok) {
          assert.equal(rest.value.issues[0]?.code, "ASSET_BYTES_OVERFLOW");
        }
      }
    } else {
      assert.equal(first.value.ok, false);
      if (!first.value.ok) {
        assert.equal(first.value.issues[0]?.code, "ASSET_BYTES_OVERFLOW");
      }
    }

    const controller = new AbortController();
    fake.getObjectDelayMs = 50;
    const abortStream = adapter.streamFullObject({
      locator: { storeId: "assets", objectKey: "big" },
      ownerId: "owner_1",
      maxBytes: 1000,
      signal: controller.signal,
    });
    controller.abort();
    const aborted = await abortStream.next();
    assert.equal(aborted.done, true);
    if (aborted.done) {
      assert.equal(aborted.value.ok, false);
      if (!aborted.value.ok) {
        assert.equal(aborted.value.issues[0]?.code, "OPERATION_ABORTED");
      }
    }
  });

  await test("errors never include bucket/key/secret", async () => {
    const fake = new FakeS3Client();
    const adapter = new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });
    const missing = await adapter.readObjectMetadata(
      { storeId: "assets", objectKey: "missing-key-xyz" },
      "owner_1",
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      const msg = missing.issues.map((i) => i.message).join(" ");
      assert.equal(msg.includes("assets-bucket"), false);
      assert.equal(msg.includes("missing-key-xyz"), false);
      assert.equal(msg.includes("supersecret"), false);
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
