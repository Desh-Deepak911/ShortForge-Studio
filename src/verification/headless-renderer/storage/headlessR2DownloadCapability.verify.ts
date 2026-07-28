/**
 * Sprint 11E Phase 2C.1 — R2 download capability (injected, no network).
 * Run: npm run test:headless-r2-download-capability
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { R2DownloadCapabilityAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-download-capability.adapter";
import { UnavailableHeadlessDownloadCapabilityAdapter } from "@/features/headless-renderer/control-plane";
import type { HeadlessDownloadCapabilityPort } from "@/features/headless-renderer/control-plane/ports/download-capability.port";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { cpFail, cpOk } from "@/features/headless-renderer/control-plane";
import { HEADLESS_OWNED_OBJECT_RECORD_VERSION } from "@/features/headless-renderer/control-plane";
import { validateHeadlessOwnedObjectRecord } from "@/features/headless-renderer/control-plane";
import {
  contentDispositionForHeadlessDownload,
  resolveHeadlessDownloadFilename,
} from "@/features/headless-renderer/control-plane/services/headless-download-filename";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DIGEST = `sha256:${createHash("sha256").update("artifact").digest("hex")}`;
const OBJECT_KEY =
  "test/finalized/artifacts/artifact/aa/bb/cc/dd/none/ffffffffffffffffffffffffffffffff";

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

function stubJobStore(state: "succeeded" | "failed"): HeadlessJobStorePort {
  return {
    async getByJobIdAndOwner(jobId: string, ownerId: string) {
      if (jobId !== "job_dl" || ownerId !== "owner_1") {
        return cpFail("JOB_NOT_FOUND", "Job not found for owner.");
      }
      return cpOk({
        version: 1,
        stage: "canonical" as const,
        storeVersion: 1,
        jobId,
        ownerId,
        projectId: "project_1",
        createdAtMs: 1,
        updatedAtMs: 1,
        idempotencyAuthorityKey: `hid:sha256:${"ab".repeat(32)}`,
        operationId: "op_1",
        canonicalJob: {
          state,
          rendererProfile: { format: "webm" },
        } as never,
        canonicalRequest: {
          manifest: {
            output: { filename: "my narrated comeback.webm" },
          },
        } as never,
        claimToken: null,
        claimedAtMs: null,
        artifactObjectBinding:
          state === "succeeded"
            ? {
                version: 1 as const,
                jobId,
                attempt: 1,
                ownerId,
                projectId: "project_1",
                storageLocator: {
                  kind: "object_storage" as const,
                  storeId: "artifacts",
                  objectKey: OBJECT_KEY,
                },
                contentDigest: DIGEST,
                byteLength: 8,
                mimeType: "video/webm",
                artifactFingerprint: `hra:sha256:${"cd".repeat(32)}`,
                requestFingerprint: `hrr:sha256:${"ef".repeat(32)}`,
                expiresAtMs: 9_000_000,
              }
            : null,
      });
    },
  } as unknown as HeadlessJobStorePort;
}

async function seedFinalizedArtifact(
  store: MemoryHeadlessOwnedObjectStoreAdapter,
) {
  const created = await store.createStagingRecord({
    objectId: "obj_art_1",
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: "job_dl",
    operationId: "op_1",
    purpose: "artifact",
    slotKey: null,
    storeId: "artifacts",
    objectKey: OBJECT_KEY,
    expectedContentDigestClaim: DIGEST,
    expectedByteLength: 8,
    expectedMimeType: "video/webm",
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 2000,
    expiresAtMs: 9_000_000,
    createdAtMs: 1000,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const claimed = await store.acquireVerificationClaim({
    objectId: "obj_art_1",
    ownerId: "owner_1",
    claimToken: "c1",
    nowMs: 1500,
    expectedStoreVersion: created.value.storeVersion,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  const finalized = await store.finalizeStagingRecord({
    objectId: "obj_art_1",
    ownerId: "owner_1",
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: "c1",
    contentDigest: DIGEST,
    byteLength: 8,
    mimeType: "video/webm",
    verifiedAtMs: 1600,
    expiresAtMs: 9_000_000,
    nowMs: 1600,
  });
  assert.equal(finalized.ok, true);
  if (finalized.ok) {
    const validated = validateHeadlessOwnedObjectRecord(finalized.value.record);
    assert.equal(validated.ok, true);
    assert.equal(finalized.value.record.version, HEADLESS_OWNED_OBJECT_RECORD_VERSION);
  }
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1 — R2 download capability\n");

  await test("unavailable adapter", async () => {
    const adapter: HeadlessDownloadCapabilityPort =
      new UnavailableHeadlessDownloadCapabilityAdapter();
    const result = await adapter.issueArtifactGetCapability({
      ownerId: "owner_1",
      jobId: "job_dl",
      nowMs: 2000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.issues[0]?.code, "CONFIGURATION_UNAVAILABLE");
    }
  });

  await test("issues getUrl for succeeded job via inject", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await seedFinalizedArtifact(store);
    const adapter = new R2DownloadCapabilityAdapter({
      ownedObjectStore: store,
      jobStore: stubJobStore("succeeded"),
      configOverride: CONFIG,
      createPresignedGetUrl: async (input) => {
        assert.equal(input.bucket, "artifacts-bucket");
        assert.equal(input.objectKey, OBJECT_KEY);
        assert.equal(input.filename, "my-narrated-comeback.webm");
        return "https://signed.example/get-only-at-issuance";
      },
    });
    const issued = await adapter.issueArtifactGetCapability({
      ownerId: "owner_1",
      jobId: "job_dl",
      nowMs: 2000,
      ttlMs: 60_000,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    assert.equal(issued.value.getUrl, "https://signed.example/get-only-at-issuance");
    assert.equal(JSON.stringify(issued.value).includes("supersecret"), false);
    assert.equal(JSON.stringify(issued.value).includes(OBJECT_KEY), false);
  });

  await test("normalizes requested filename and rejects traversal syntax", () => {
    assert.equal(
      resolveHeadlessDownloadFilename({
        requestedFilename: "../My narrated comeback.mp4",
        format: "webm",
      }),
      "My-narrated-comeback.webm",
    );
    assert.equal(
      resolveHeadlessDownloadFilename({
        requestedFilename: "\r\n",
        format: "mp4",
      }),
      "shortforge-export.mp4",
    );
    assert.equal(
      contentDispositionForHeadlessDownload("safe.webm"),
      'attachment; filename="safe.webm"',
    );
  });

  await test("default presigner binds attachment filename into the signed URL", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await seedFinalizedArtifact(store);
    const adapter = new R2DownloadCapabilityAdapter({
      ownedObjectStore: store,
      jobStore: stubJobStore("succeeded"),
      configOverride: CONFIG,
    });
    const issued = await adapter.issueArtifactGetCapability({
      ownerId: "owner_1",
      jobId: "job_dl",
      nowMs: 2000,
      ttlMs: 60_000,
    });
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const url = new URL(issued.value.getUrl);
    assert.equal(
      url.searchParams.get("response-content-disposition"),
      'attachment; filename="my-narrated-comeback.webm"',
    );
    assert.equal(url.searchParams.get("X-Amz-Content-Sha256"), "UNSIGNED-PAYLOAD");
  });

  await test("rejects non-succeeded job", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    await seedFinalizedArtifact(store);
    const adapter = new R2DownloadCapabilityAdapter({
      ownedObjectStore: store,
      jobStore: stubJobStore("failed"),
      configOverride: CONFIG,
      createPresignedGetUrl: async () => "https://x",
    });
    const result = await adapter.issueArtifactGetCapability({
      ownerId: "owner_1",
      jobId: "job_dl",
      nowMs: 2000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.issues[0]?.code, "FORBIDDEN");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
