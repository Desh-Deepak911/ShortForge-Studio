/**
 * Sprint 11E Phase 2C.1A — Neon owned-object store adapter parity.
 * Run: npm run test:headless-neon-owned-object-store
 */

import assert from "node:assert/strict";

import {
  InMemoryHeadlessSqlFixture,
  NeonHeadlessOwnedObjectStoreAdapter,
} from "@/features/headless-renderer/control-plane/testing";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${"ab".repeat(32)}`;
const OBJECT_KEY =
  "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

function seedOwnership(sql: InMemoryHeadlessSqlFixture) {
  sql.seedOwnership({
    project_id: "project_1",
    owner_id: "owner_1",
    created_at_ms: 1000,
  });
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1A — Neon owned-object store\n");

  await test("create staging + get + claim + finalize", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    seedOwnership(sql);
    const store = new NeonHeadlessOwnedObjectStoreAdapter(sql);

    const created = await store.createStagingRecord({
      objectId: "obj_1",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 12,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.value.storeVersion, 1);
    assert.equal(created.value.record.stage, "staging");

    const got = await store.getByObjectIdAndOwner({
      objectId: "obj_1",
      ownerId: "owner_1",
    });
    assert.equal(got.ok, true);
    if (!got.ok || !got.value) return;
    assert.equal(got.value.record.objectId, "obj_1");

    const claimed = await store.acquireVerificationClaim({
      objectId: "obj_1",
      ownerId: "owner_1",
      claimToken: "tok_1",
      nowMs: 2000,
      expectedStoreVersion: 1,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    assert.equal(claimed.value.storeVersion, 2);

    const finalized = await store.finalizeStagingRecord({
      objectId: "obj_1",
      ownerId: "owner_1",
      expectedStoreVersion: 2,
      verificationClaimToken: "tok_1",
      contentDigest: DIGEST,
      byteLength: 12,
      mimeType: "application/json",
      verifiedAtMs: 3000,
      expiresAtMs: 9_000_000,
      nowMs: 3000,
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    assert.equal(finalized.value.record.stage, "finalized");
    assert.equal(finalized.value.storeVersion, 3);
  });

  await test("idempotent same-identity create + conflict", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    seedOwnership(sql);
    const store = new NeonHeadlessOwnedObjectStoreAdapter(sql);
    const input = {
      objectId: "obj_idem",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest" as const,
      slotKey: null,
      storeId: "assets" as const,
      objectKey: OBJECT_KEY + "_idem",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 12,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    };
    const a = await store.createStagingRecord(input);
    assert.equal(a.ok, true);
    const b = await store.createStagingRecord(input);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(b.value.storeVersion, a.value.storeVersion);

    const conflict = await store.createStagingRecord({
      ...input,
      objectId: "obj_other",
      expectedByteLength: 99,
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) {
      assert.equal(conflict.issues[0]?.code, "IDEMPOTENCY_CONFLICT");
    }
  });

  await test("stale reclaim + cleanup complete + lists", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    seedOwnership(sql);
    const store = new NeonHeadlessOwnedObjectStoreAdapter(sql);
    const created = await store.createStagingRecord({
      objectId: "obj_lease",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_lease",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY + "_lease",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 12,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 1500,
      createdAtMs: 1000,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const c1 = await store.acquireVerificationClaim({
      objectId: "obj_lease",
      ownerId: "owner_1",
      claimToken: "old",
      nowMs: 1100,
      expectedStoreVersion: 1,
      claimLeaseMs: 100,
    });
    assert.equal(c1.ok, true);
    if (!c1.ok) return;

    const race = await store.acquireVerificationClaim({
      objectId: "obj_lease",
      ownerId: "owner_1",
      claimToken: "new",
      nowMs: 1150,
      expectedStoreVersion: 2,
      claimLeaseMs: 100,
    });
    assert.equal(race.ok, false);

    const reclaim = await store.acquireVerificationClaim({
      objectId: "obj_lease",
      ownerId: "owner_1",
      claimToken: "new",
      nowMs: 1300,
      expectedStoreVersion: 2,
      claimLeaseMs: 100,
    });
    assert.equal(reclaim.ok, true);

    await store.failVerificationClaim({
      objectId: "obj_lease",
      ownerId: "owner_1",
      claimToken: "new",
      expectedStoreVersion: 3,
      nowMs: 1400,
    });
    const pending = await store.markCleanupPending({
      objectId: "obj_lease",
      ownerId: "owner_1",
      expectedStoreVersion: 4,
      terminalReason: "digest_mismatch",
      cleanupScheduledAtMs: 1400,
      nowMs: 1400,
    });
    assert.equal(pending.ok, true);
    if (!pending.ok) return;

    const cleanupList = await store.listCleanupCandidates({
      limit: 10,
      nowMs: 2000,
    });
    assert.equal(cleanupList.ok, true);
    if (!cleanupList.ok) return;
    assert.ok(cleanupList.value.some((o) => o.record.objectId === "obj_lease"));

    const done = await store.completeCleanup({
      objectId: "obj_lease",
      ownerId: "owner_1",
      expectedStoreVersion: pending.value.storeVersion,
      nowMs: 2000,
    });
    assert.equal(done.ok, true);

    const after = await store.getByObjectIdAndOwner({
      objectId: "obj_lease",
      ownerId: "owner_1",
    });
    assert.equal(after.ok, true);
    if (after.ok) assert.equal(after.value, null);
  });

  await test("cross-owner denied", async () => {
    const sql = new InMemoryHeadlessSqlFixture();
    seedOwnership(sql);
    const store = new NeonHeadlessOwnedObjectStoreAdapter(sql);
    await store.createStagingRecord({
      objectId: "obj_x",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY + "_x",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 12,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const denied = await store.getByObjectIdAndOwner({
      objectId: "obj_x",
      ownerId: "owner_other",
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.issues[0]?.code, "FORBIDDEN");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
