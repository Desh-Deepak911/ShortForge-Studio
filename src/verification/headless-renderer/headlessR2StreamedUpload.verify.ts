/**
 * Sprint 11E Phase 2E.2A — true streamed R2 PutObject (no chunk concat).
 * Run: npm run test:headless-r2-streamed-upload
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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

function adapter(fake: FakeS3Client) {
  return new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
}

async function* chunkBytes(
  bytes: Uint8Array,
  size: number,
): AsyncGenerator<Uint8Array> {
  for (let i = 0; i < bytes.byteLength; i += size) {
    yield bytes.subarray(i, Math.min(i + size, bytes.byteLength));
  }
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2A — R2 streamed upload\n");

  await test("source has no parts.push / concatUint8 on upload path", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/r2-storage.adapter.ts",
      ),
      "utf8",
    );
    const uploadFnStart = src.indexOf("async writeUploadStream(input: {");
    assert.ok(uploadFnStart > 0);
    const uploadFnEnd = src.indexOf("async deleteObject(", uploadFnStart);
    assert.ok(uploadFnEnd > uploadFnStart);
    const uploadSrc = src.slice(uploadFnStart, uploadFnEnd);
    assert.equal(uploadSrc.includes("parts.push"), false);
    assert.equal(uploadSrc.includes("concatUint8"), false);
    assert.equal(uploadSrc.includes("Readable.from"), true);
    assert.equal(uploadSrc.includes("ContentLength: input.expectedByteLength"), true);
    assert.equal(uploadSrc.includes("transformToByteArray"), false);
    assert.equal(uploadSrc.includes("readFileSync"), false);
    assert.equal(/readFile\s*\(/.test(uploadSrc), false);
    assert.equal(src.includes("function concatUint8"), false);
  });

  await test("exact length success with incremental chunks", async () => {
    const fake = new FakeS3Client();
    const a = adapter(fake);
    const body = new TextEncoder().encode("abcdefghij");
    const written = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "art/1" },
      ownerId: "owner_1",
      contentType: "video/mp4",
      expectedByteLength: 10,
      maxBytes: 10,
      chunks: chunkBytes(body, 3),
    });
    assert.equal(written.ok, true);
    if (!written.ok) return;
    assert.equal(written.value.byteLength, 10);
    assert.equal(written.value.chunkCount, 4);
    assert.equal(fake.exactByteLength("artifacts-bucket", "art/1"), 10);
    assert.ok(a.testingLastPeakRetainedChunks <= 1);
  });

  await test("slow sink backpressure — adapter peak retained ≤ 1", async () => {
    const fake = new FakeS3Client();
    fake.putObjectChunkDelayMs = 15;
    const a = adapter(fake);
    const body = new Uint8Array(64 * 1024);
    body.fill(7);
    const written = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "art/slow" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: body.byteLength,
      maxBytes: body.byteLength,
      chunks: chunkBytes(body, 8 * 1024),
    });
    assert.equal(written.ok, true);
    assert.ok(a.testingLastPeakRetainedChunks <= 1);
    assert.ok(fake.testingPeakInflightPutChunks <= 1);
  });

  await test("zero-byte / underflow / overflow rejected", async () => {
    const fake = new FakeS3Client();
    const a = adapter(fake);
    const zero = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "z" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 0,
      maxBytes: 10,
      chunks: (async function* () {})(),
    });
    assert.equal(zero.ok, false);

    const under = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "u" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 4,
      maxBytes: 4,
      chunks: (async function* () {
        yield new Uint8Array([1, 2]);
      })(),
    });
    assert.equal(under.ok, false);
    if (!under.ok) {
      assert.equal(under.issues[0]?.code, "OBJECT_INTEGRITY_FAILED");
    }

    const over = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "o" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 2,
      maxBytes: 2,
      chunks: (async function* () {
        yield new Uint8Array([1, 2, 3]);
      })(),
    });
    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.equal(over.issues[0]?.code, "ASSET_BYTES_OVERFLOW");
    }
  });

  await test("abort mid-stream and iterator failure", async () => {
    const fake = new FakeS3Client();
    fake.putObjectChunkDelayMs = 30;
    const a = adapter(fake);
    const controller = new AbortController();
    const upload = a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "abort" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 100,
      maxBytes: 100,
      signal: controller.signal,
      chunks: (async function* () {
        yield new Uint8Array(40);
        controller.abort();
        yield new Uint8Array(40);
        yield new Uint8Array(20);
      })(),
    });
    const aborted = await upload;
    assert.equal(aborted.ok, false);
    if (!aborted.ok) {
      assert.equal(aborted.issues[0]?.code, "OPERATION_ABORTED");
    }

    const failed = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "iter" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 4,
      maxBytes: 4,
      chunks: (async function* () {
        yield new Uint8Array([1]);
        throw new Error("source boom");
      })(),
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.issues[0]?.code, "INTERNAL_ERROR");
      const msg = failed.issues.map((i) => i.message).join(" ");
      assert.equal(msg.includes("boom"), false);
      assert.equal(msg.includes("artifacts-bucket"), false);
    }
  });

  await test("provider failure maps to safe code", async () => {
    const fake = new FakeS3Client();
    fake.forceSendError = Object.assign(new Error("AccessDenied secret"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const a = adapter(fake);
    const result = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "deny" },
      ownerId: "owner_1",
      contentType: "application/octet-stream",
      expectedByteLength: 2,
      maxBytes: 2,
      chunks: (async function* () {
        yield new Uint8Array([1, 2]);
      })(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "REMOTE_FETCH_FORBIDDEN");
      const msg = result.issues.map((i) => i.message).join(" ");
      assert.equal(msg.includes("secret"), false);
      assert.equal(msg.includes("deny"), false);
    }
  });

  await test("digest of uploaded body matches source", async () => {
    const fake = new FakeS3Client();
    const a = adapter(fake);
    const body = new TextEncoder().encode("stream-digest-check");
    const expected = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    const written = await a.writeUploadStream({
      locator: { storeId: "artifacts", objectKey: "dig" },
      ownerId: "owner_1",
      contentType: "text/plain",
      expectedByteLength: body.byteLength,
      maxBytes: body.byteLength,
      chunks: chunkBytes(body, 5),
    });
    assert.equal(written.ok, true);
    const stored = fake.getFixture("artifacts-bucket", "dig");
    assert.ok(stored);
    const actual = `sha256:${createHash("sha256").update(stored!.body).digest("hex")}`;
    assert.equal(actual, expected);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
