/**
 * Sprint 11E Phase 2C.1 — Design B trusted full-object verification.
 * Run: npm run test:headless-r2-trusted-verification
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

async function seed(
  store: MemoryHeadlessOwnedObjectStoreAdapter,
  fake: FakeS3Client,
  opts: {
    bytes: Uint8Array;
    mime?: string;
    digest?: string;
    objectId?: string;
    expiresAtMs?: number | null;
  },
) {
  const objectId = opts.objectId ?? "obj_v1";
  const mime = opts.mime ?? "application/json";
  const digest = opts.digest ?? digestOf(opts.bytes);
  fake.putFixture("assets-bucket", OBJECT_KEY, opts.bytes, mime);
  const created = await store.createStagingRecord({
    objectId,
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: "job_1",
    operationId: "op_1",
    purpose: "manifest",
    slotKey: null,
    storeId: "assets",
    objectKey: OBJECT_KEY,
    expectedContentDigestClaim: digest,
    expectedByteLength: opts.bytes.byteLength,
    expectedMimeType: mime,
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 1_000_000,
    expiresAtMs: opts.expiresAtMs === undefined ? 9_000_000 : opts.expiresAtMs,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  return { objectId, digest, mime };
}

function io(fake: FakeS3Client) {
  return new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1 — trusted R2 verification\n");

  await test("happy path finalize + coverage callback", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode('{"ok":true}');
    const seeded = await seed(store, fake, { bytes });
    let coverageCalls = 0;

    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: seeded.objectId,
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: io(fake),
      updateCoverage: async () => {
        coverageCalls += 1;
        return { ok: true, value: true };
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.record.stage, "finalized");
    assert.equal(result.value.record.contentDigest, seeded.digest);
    assert.equal(result.value.coverageReconciled, true);
    assert.equal(coverageCalls, 1);

    // Replay finalize must fail closed.
    const replay = await verifyAndFinalizeR2OwnedObject({
      objectId: seeded.objectId,
      ownerId: "owner_1",
      nowMs: 3000,
      store,
      io: io(fake),
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) {
      assert.equal(replay.issues[0]?.code, "TERMINAL_IMMUTABLE");
    }
  });

  await test("digest mismatch → rejected + delete", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode("actual-bytes");
    await seed(store, fake, {
      bytes,
      digest: `sha256:${"00".repeat(32)}`,
      objectId: "obj_bad_digest",
    });
    // Overwrite fixture key with different content than claim — seed already put bytes
    // but claim digest is zeros; stream will hash actual bytes.
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_bad_digest",
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: io(fake),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "ASSET_DIGEST_MISMATCH");
    }
    const after = await store.getByObjectIdAndOwner({
      objectId: "obj_bad_digest",
      ownerId: "owner_1",
    });
    assert.equal(after.ok, true);
    if (after.ok && after.value) {
      assert.equal(after.value.record.stage, "rejected");
    }
    assert.equal(fake.hasObject("assets-bucket", OBJECT_KEY), false);
  });

  await test("MIME / expiry / overflow / abort", async () => {
    // MIME
    {
      const store = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const bytes = new TextEncoder().encode("png-bytes");
      await seed(store, fake, {
        bytes,
        mime: "image/png",
        objectId: "obj_mime",
      });
      // Put with mismatched ContentType
      fake.putFixture("assets-bucket", OBJECT_KEY, bytes, "text/html");
      const result = await verifyAndFinalizeR2OwnedObject({
        objectId: "obj_mime",
        ownerId: "owner_1",
        nowMs: 2000,
        store,
        io: io(fake),
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.issues[0]?.code, "ASSET_MIME_MISMATCH");
      }
    }

    // Expiry
    {
      const store = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const bytes = new TextEncoder().encode("exp");
      await seed(store, fake, {
        bytes,
        objectId: "obj_exp",
        expiresAtMs: 1500,
      });
      const result = await verifyAndFinalizeR2OwnedObject({
        objectId: "obj_exp",
        ownerId: "owner_1",
        nowMs: 2000,
        store,
        io: io(fake),
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.issues[0]?.code, "ASSET_EXPIRED");
    }

    // Overflow
    {
      const store = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const bytes = new Uint8Array(50);
      await seed(store, fake, { bytes, objectId: "obj_over" });
      const result = await verifyAndFinalizeR2OwnedObject({
        objectId: "obj_over",
        ownerId: "owner_1",
        nowMs: 2000,
        maxBytes: 10,
        store,
        io: io(fake),
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(
          result.issues[0]?.code === "ASSET_BYTES_OVERFLOW" ||
            result.issues[0]?.code === "ASSET_LENGTH_MISMATCH",
        );
      }
    }

    // Abort
    {
      const store = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      fake.getObjectDelayMs = 80;
      const bytes = new TextEncoder().encode("abort-me");
      await seed(store, fake, { bytes, objectId: "obj_abort" });
      const controller = new AbortController();
      const pending = verifyAndFinalizeR2OwnedObject({
        objectId: "obj_abort",
        ownerId: "owner_1",
        nowMs: 2000,
        store,
        io: io(fake),
        signal: controller.signal,
      });
      controller.abort();
      const result = await pending;
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.issues[0]?.code, "OPERATION_ABORTED");
      }
    }
  });

  await test("claim race — second acquire fails", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode("race");
    await seed(store, fake, { bytes, objectId: "obj_race" });
    const loaded = await store.getByObjectIdAndOwner({
      objectId: "obj_race",
      ownerId: "owner_1",
    });
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.value) return;
    const first = await store.acquireVerificationClaim({
      objectId: "obj_race",
      ownerId: "owner_1",
      claimToken: "claim-a",
      nowMs: 2000,
      expectedStoreVersion: loaded.value.storeVersion,
      claimLeaseMs: 120_000,
    });
    assert.equal(first.ok, true);
    const second = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_race",
      ownerId: "owner_1",
      nowMs: 2100,
      store,
      io: io(fake),
      claimLeaseMs: 120_000,
    });
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.issues[0]?.code, "CLAIM_REJECTED");
    }
  });

  await test("stale lease — reclaim then finalize", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode("stale-lease");
    await seed(store, fake, { bytes, objectId: "obj_stale" });
    const loaded = await store.getByObjectIdAndOwner({
      objectId: "obj_stale",
      ownerId: "owner_1",
    });
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !loaded.value) return;
    const first = await store.acquireVerificationClaim({
      objectId: "obj_stale",
      ownerId: "owner_1",
      claimToken: "claim-stale",
      nowMs: 2000,
      expectedStoreVersion: loaded.value.storeVersion,
      claimLeaseMs: 1000,
    });
    assert.equal(first.ok, true);
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_stale",
      ownerId: "owner_1",
      nowMs: 4000,
      store,
      io: io(fake),
      claimLeaseMs: 1000,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.record.stage, "finalized");
    }
  });

  await test("cleanup_pending path when deleteOnReject=false", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode("cleanup");
    await seed(store, fake, {
      bytes,
      digest: `sha256:${"11".repeat(32)}`,
      objectId: "obj_cleanup",
    });
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_cleanup",
      ownerId: "owner_1",
      nowMs: 2000,
      store,
      io: io(fake),
      deleteOnReject: false,
    });
    assert.equal(result.ok, false);
    const after = await store.getByObjectIdAndOwner({
      objectId: "obj_cleanup",
      ownerId: "owner_1",
    });
    assert.equal(after.ok, true);
    if (after.ok && after.value) {
      assert.equal(after.value.record.stage, "cleanup_pending");
    }
    assert.equal(fake.hasObject("assets-bucket", OBJECT_KEY), true);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
