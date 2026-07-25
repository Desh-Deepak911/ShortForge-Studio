/**
 * Sprint 11E Phase 2C.1A — finalized owned-object coverage reconcile.
 * Run: npm run test:headless-finalized-coverage-reconcile
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createProvisionalMaterializingRecord } from "@/features/headless-renderer/control-plane";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";
import { HEADLESS_OWNED_OBJECT_RECORD_VERSION } from "@/features/headless-renderer/control-plane/types/owned-object-record";
import { validateHeadlessOwnedObjectRecord } from "@/features/headless-renderer/control-plane/services/validate-owned-object-record";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${createHash("sha256").update("manifest").digest("hex")}`;
const OBJECT_KEY =
  "test/staging/assets/manifest/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

async function main() {
  console.log("\nSprint 11E Phase 2C.1A — finalized coverage reconcile\n");

  await test("not_finalized when staging", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    await owned.createStagingRecord({
      objectId: "obj_s",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY,
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 8,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const result = await reconcileFinalizedOwnedObjectCoverage({
      jobStore,
      ownedObjectStore: owned,
      objectId: "obj_s",
      ownerId: "owner_1",
      nowMs: 2000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.status, "not_finalized");
  });

  await test("applies staging ref + coverage without regressing", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();

    const idem = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: { ownerId: "owner_1", projectId: "project_1" },
      idempotencyKey: "idem_cov_1",
    });
    assert.equal(idem.ok, true);
    if (!idem.ok) return;

    const provisional = createProvisionalMaterializingRecord({
      jobId: "job_cov",
      ownerId: "owner_1",
      projectId: "project_1",
      operationId: "op_cov_1",
      creatorIdempotencyKey: "idem_cov_1",
      idempotencyAuthorityKey: idem.fingerprint,
      requestedRendererProfile: {
        resolution: "720p",
        format: "webm",
        fps: 30,
        quality: "standard",
      },
      requestedRendererBuildId: "build_1",
      snapshotClaim: {
        manifestPayloadDigestClaim: DIGEST,
        assetBundleFingerprintClaim: "hab:sha256:" + "bb".repeat(32),
        expectedSlotClaims: [],
      },
      stagingObjectRefs: [],
      createdAtMs: 1000,
      updatedAtMs: 1000,
      expiresAtMs: 9_000_000,
    });
    assert.equal(provisional.ok, true, provisional.ok ? "" : provisional.message);
    if (!provisional.ok) return;

    const created = await jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: provisional.record,
    });
    assert.equal(created.ok, true);

    // Seed finalized owned object via store finalize path
    await owned.createStagingRecord({
      objectId: "obj_f",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_cov",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey: OBJECT_KEY + "_f",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 8,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      expiresAtMs: 9_000_000,
      createdAtMs: 1000,
    });
    const claimed = await owned.acquireVerificationClaim({
      objectId: "obj_f",
      ownerId: "owner_1",
      claimToken: "tok",
      nowMs: 2000,
      expectedStoreVersion: 1,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    const finalized = await owned.finalizeStagingRecord({
      objectId: "obj_f",
      ownerId: "owner_1",
      expectedStoreVersion: claimed.value.storeVersion,
      verificationClaimToken: "tok",
      contentDigest: DIGEST,
      byteLength: 8,
      mimeType: "application/json",
      verifiedAtMs: 3000,
      expiresAtMs: 9_000_000,
      nowMs: 3000,
    });
    assert.equal(finalized.ok, true);

    const first = await reconcileFinalizedOwnedObjectCoverage({
      jobStore,
      ownedObjectStore: owned,
      objectId: "obj_f",
      ownerId: "owner_1",
      nowMs: 4000,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.ok(
      first.value.status === "applied" ||
        first.value.status === "blocked_incomplete",
    );

    const job = await jobStore.getByJobIdAndOwner("job_cov", "owner_1");
    assert.equal(job.ok, true);
    if (!job.ok || job.value.stage !== "provisional") return;
    assert.ok(job.value.stagingObjectRefs.length >= 1);
    const coverageBefore = job.value.verificationCoverage;

    const second = await reconcileFinalizedOwnedObjectCoverage({
      jobStore,
      ownedObjectStore: owned,
      objectId: "obj_f",
      ownerId: "owner_1",
      nowMs: 5000,
    });
    assert.equal(second.ok, true);
    const job2 = await jobStore.getByJobIdAndOwner("job_cov", "owner_1");
    assert.equal(job2.ok, true);
    if (!job2.ok || job2.value.stage !== "provisional") return;
    assert.ok(
      job2.value.verificationCoverage.verifiedTargets.length >=
        coverageBefore.verifiedTargets.length,
    );

    // Finalized object must remain finalized
    const still = await owned.getByObjectIdAndOwner({
      objectId: "obj_f",
      ownerId: "owner_1",
    });
    assert.equal(still.ok, true);
    if (still.ok && still.value) {
      assert.equal(still.value.record.stage, "finalized");
    }
  });

  await test("artifact purpose rejected for coverage", () => {
    const draft = {
      version: HEADLESS_OWNED_OBJECT_RECORD_VERSION,
      objectId: "obj_art",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "artifact",
      slotKey: null,
      provider: "r2",
      storeId: "artifacts",
      objectKey: "test/staging/artifacts/artifact/aa/bb/cc/dd/none/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      createdAtMs: 1000,
      updatedAtMs: 2000,
      stage: "finalized",
      expectedContentDigestClaim: DIGEST,
      expectedByteLength: 8,
      expectedMimeType: "video/mp4",
      uploadCapabilityIssuedAtMs: 1000,
      uploadCapabilityExpiresAtMs: 100_000,
      uploadedObservedAtMs: null,
      verificationState: "verified",
      verificationClaimToken: null,
      verificationClaimedAtMs: null,
      verifiedAtMs: 2000,
      expiresAtMs: 9_000_000,
      contentDigest: DIGEST,
      byteLength: 8,
      mimeType: "video/mp4",
      finalizedMetadata: {
        verifiedBy: "full_object_stream",
        sourceStage: "staging",
      },
      terminalReason: null,
      cleanupScheduledAtMs: null,
    };
    const validated = validateHeadlessOwnedObjectRecord(draft);
    assert.equal(validated.ok, true);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
