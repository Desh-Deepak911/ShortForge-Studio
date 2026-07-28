/**
 * Sprint 11E Phase 2E.2A.1 — durable job-bound HeadlessStoragePort.
 * Run: npm run test:headless-r2-job-bound-storage
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import {
  deriveAttemptBoundArtifactLocator,
  deriveAttemptBoundArtifactObjectId,
} from "@/features/headless-renderer/control-plane/services/attempt-bound-artifact-key";
import { deleteOrScheduleArtifactCleanup } from "@/features/headless-renderer/control-plane/services/schedule-artifact-cleanup";
import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { HEADLESS_OWNED_OBJECT_RECORD_VERSION } from "@/features/headless-renderer/control-plane/types/owned-object-record";

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

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function makeStack(fake: FakeS3Client = new FakeS3Client()) {
  const r2 = new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter();
  const storage = createR2JobBoundStorageAdapter({
    r2,
    ownedObjectStore,
    jobStore,
    context: {
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
      environmentNamespace: "test",
      artifactExpiresAtMs: Date.now() + 60_000,
      allowedSourceLocators: [],
      nowMs: () => Date.now(),
    },
  });
  return { fake, r2, ownedObjectStore, jobStore, storage };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2A.1 — durable job-bound R2 storage\n");

  await test("defect: process-memory maps are not durable authority (source)", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("testingProtectFinalizedSucceeded"), false);
    assert.equal(src.includes("testingAuthorizeCleanupDelete"), false);
    assert.equal(src.includes("private readonly finalized"), false);
    assert.equal(src.includes("createStagingRecord"), true);
    assert.equal(src.includes("deleteArtifactUnderDurableAuthority"), true);
    assert.equal(src.includes("trusted_worker_upload_stream"), true);
  });

  await test("pre-upload durable staging; no PutObject without persist", async () => {
    const { fake, ownedObjectStore, storage } = makeStack();
    const bytes = new TextEncoder().encode("pre-upload");
    const digest = digestOf(bytes);
    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    });
    assert.ok(objectId);

    const before = await ownedObjectStore.getByObjectIdAndOwner({
      objectId: objectId!,
      ownerId: "owner_a",
    });
    assert.equal(before.ok, true);
    if (before.ok) assert.equal(before.value, null);

    const session = await storage.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;

    const staged = await ownedObjectStore.getByObjectIdAndOwner({
      objectId: objectId!,
      ownerId: "owner_a",
    });
    assert.equal(staged.ok, true);
    if (!staged.ok || staged.value == null) return;
    assert.equal(staged.value.record.stage, "staging");
    assert.equal(staged.value.record.purpose, "artifact");
    assert.equal(staged.value.record.storeId, "artifacts");
    assert.equal(fake.hasObject("artifacts-bucket", session.value.locator.objectKey), false);

    const written = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: bytes.byteLength,
      maxBytes: bytes.byteLength,
      chunks: (async function* () {
        yield bytes;
      })(),
    });
    assert.equal(written.ok, true);
    assert.equal(fake.hasObject("artifacts-bucket", session.value.locator.objectKey), true);
  });

  await test("create replay converges; semantic mismatch conflicts", async () => {
    const { ownedObjectStore, storage } = makeStack();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = digestOf(bytes);
    const input = {
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact" as const,
      mimeType: "application/octet-stream",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: 4,
    };
    const a = await storage.createUploadSession(input);
    const b = await storage.createUploadSession(input);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(a.value.locator.objectKey, b.value.locator.objectKey);

    const conflict = await storage.createUploadSession({
      ...input,
      expectedContentDigest: digestOf(new Uint8Array([9, 9, 9, 9])),
    });
    assert.equal(conflict.ok, false);

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    })!;
    const listed = await ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: "owner_a",
    });
    assert.equal(listed.ok, true);
    if (!listed.ok || listed.value == null) return;
    assert.equal(listed.value.record.expectedContentDigestClaim, digest);
  });

  await test("fresh adapter recovers durable identity; finalize is durable", async () => {
    const { fake, ownedObjectStore, jobStore } = makeStack();
    const bytes = new TextEncoder().encode("recover-me");
    const digest = digestOf(bytes);
    const storage1 = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const session = await storage1.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    await storage1.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: bytes.byteLength,
      maxBytes: bytes.byteLength,
      chunks: (async function* () {
        yield bytes;
      })(),
    });
    const finalized = await storage1.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });
    assert.equal(finalized.ok, true);

    // Fresh adapter — no capability map — reads durable finalized metadata.
    const storage2 = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const meta = await storage2.readObjectMetadata(
      session.value.locator,
      "owner_a",
    );
    assert.equal(meta.ok, true);
    if (!meta.ok) return;
    assert.equal(meta.value.finalized, true);
    assert.equal(meta.value.contentDigest, digest);

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    })!;
    const durable = await ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: "owner_a",
    });
    assert.equal(durable.ok, true);
    if (!durable.ok || durable.value == null) return;
    assert.equal(durable.value.record.stage, "finalized");
    if (durable.value.record.stage === "finalized") {
      assert.equal(
        durable.value.record.finalizedMetadata.verifiedBy,
        "trusted_worker_upload_stream",
      );
    }
  });

  await test("succeeded binding delete rejected after restart", async () => {
    const { fake, ownedObjectStore, storage } = makeStack();
    const bytes = new Uint8Array([5, 5, 5, 5]);
    const digest = digestOf(bytes);
    const session = await storage.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "application/octet-stream",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: 4,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: 4,
      maxBytes: 4,
      chunks: (async function* () {
        yield bytes;
      })(),
    });
    await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });

    const bindingLocator = session.value.locator;
    const guardedJobStore = {
      async getByJobIdAndOwner() {
        return {
          ok: true as const,
          value: {
            stage: "canonical" as const,
            jobId: "job_a",
            ownerId: "owner_a",
            projectId: "project_a",
            operationId: "op_a",
            storeVersion: 1,
            artifactObjectBinding: {
              version: 1 as const,
              jobId: "job_a",
              attempt: 1,
              ownerId: "owner_a",
              projectId: "project_a",
              storageLocator: bindingLocator,
              contentDigest: digest,
              byteLength: 4,
              mimeType: "application/octet-stream",
              artifactFingerprint: `sha256:${"22".repeat(32)}`,
              requestFingerprint: `sha256:${"11".repeat(32)}`,
              expiresAtMs: Date.now() + 60_000,
            },
            canonicalJob: {
              state: "succeeded",
              attempt: 1,
            },
          },
        };
      },
    };

    const fresh = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore: guardedJobStore as never,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });

    const deleted = await fresh.deleteObject(bindingLocator, "owner_a");
    assert.equal(deleted.ok, false);
    if (!deleted.ok) {
      assert.equal(deleted.issues[0]?.code, "FORBIDDEN");
    }
    assert.equal(
      fake.hasObject("artifacts-bucket", bindingLocator.objectKey),
      true,
    );
    void HEADLESS_OWNED_OBJECT_RECORD_VERSION;
  });

  await test("delete failure schedules cleanup with objectId; short PutObject leaves staging", async () => {
    const { fake, ownedObjectStore, jobStore, storage } = makeStack();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = digestOf(bytes);
    const session = await storage.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "application/octet-stream",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: 4,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;

    const under = await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: 4,
      maxBytes: 4,
      chunks: (async function* () {
        yield new Uint8Array([1, 2]);
      })(),
    });
    assert.equal(under.ok, false);

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    })!;
    const staged = await ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: "owner_a",
    });
    assert.equal(staged.ok, true);
    if (!staged.ok || staged.value == null) return;
    assert.equal(staged.value.record.stage, "staging");

    fake.forceSendError = Object.assign(new Error("deny"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const outcome = await deleteOrScheduleArtifactCleanup({
      storage,
      cleanup,
      locator: session.value.locator,
      objectId,
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      attempt: 1,
      contentDigest: digest,
      reasonId: "UPLOAD_SESSION_ORPHAN",
      nowMs: 1_700_000_000_000,
      expiresAtMs: 1_700_000_360_000,
    });
    assert.equal(outcome.status, "scheduled");
    if (outcome.status === "scheduled") {
      assert.equal(outcome.record.intent.objectId, objectId);
    }
    void jobStore;
  });

  await test("capability one-use + cross-owner rejected", async () => {
    const { storage } = makeStack();
    const bytes = new TextEncoder().encode("cap-one");
    const digest = digestOf(bytes);
    const session = await storage.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: bytes.byteLength,
      maxBytes: bytes.byteLength,
      chunks: (async function* () {
        yield bytes;
      })(),
    });
    const finalized = await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });
    assert.equal(finalized.ok, true);
    const reuse = await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });
    assert.equal(reuse.ok, false);

    const bad = await storage.createUploadSession({
      ownerId: "other",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(bad.ok, false);
  });

  await test("attempt-bound locator deterministic; no client key", () => {
    const a = deriveAttemptBoundArtifactLocator({
      environmentNamespace: "test",
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    });
    const b = deriveAttemptBoundArtifactLocator({
      environmentNamespace: "test",
      ownerId: "owner_a",
      projectId: "project_a",
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(a.locator.objectKey, b.locator.objectKey);
    assert.equal(a.locator.storeId, "artifacts");
  });

  await test("crash after staging before PutObject — durable recovery + no R2 object", async () => {
    const { fake, ownedObjectStore, jobStore } = makeStack();
    const bytes = new TextEncoder().encode("staged-only");
    const digest = digestOf(bytes);
    const storage1 = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const session = await storage1.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    assert.equal(fake.hasObject("artifacts-bucket", session.value.locator.objectKey), false);

    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    })!;
    // Fresh process: capability gone; durable staging remains.
    const storage2 = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const durable = await ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: "owner_a",
    });
    assert.equal(durable.ok, true);
    if (!durable.ok || durable.value == null) return;
    assert.equal(durable.value.record.stage, "staging");
    assert.equal(durable.value.record.objectKey, session.value.locator.objectKey);

    const replay = await storage2.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "video/mp4",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: bytes.byteLength,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.value.locator.objectKey, session.value.locator.objectKey);
  });

  await test("live job finalized delete rejected; terminal unbound cleanup allowed", async () => {
    const { fake, ownedObjectStore } = makeStack();
    const bytes = new Uint8Array([7, 7, 7, 7]);
    const digest = digestOf(bytes);
    const liveJobStore = {
      async getByJobIdAndOwner() {
        return {
          ok: true as const,
          value: {
            stage: "canonical" as const,
            jobId: "job_a",
            ownerId: "owner_a",
            projectId: "project_a",
            operationId: "op_a",
            storeVersion: 1,
            artifactObjectBinding: null,
            canonicalJob: { state: "uploading", attempt: 1 },
          },
        };
      },
    };
    const storage = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore: liveJobStore as never,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const session = await storage.createUploadSession({
      ownerId: "owner_a",
      projectId: "project_a",
      purpose: "artifact",
      mimeType: "application/octet-stream",
      expiresAtMs: Date.now() + 60_000,
      expectedContentDigest: digest,
      expectedByteLength: 4,
    });
    assert.equal(session.ok, true);
    if (!session.ok) return;
    await storage.writeUploadStream({
      capabilityToken: session.value.capabilityToken,
      expectedByteLength: 4,
      maxBytes: 4,
      chunks: (async function* () {
        yield bytes;
      })(),
    });
    await storage.finalizeUploadedObject({
      capabilityToken: session.value.capabilityToken,
      expectedContentDigest: digest,
    });
    const liveDelete = await storage.deleteObject(session.value.locator, "owner_a");
    assert.equal(liveDelete.ok, false);

    const failedJobStore = {
      async getByJobIdAndOwner() {
        return {
          ok: true as const,
          value: {
            stage: "canonical" as const,
            jobId: "job_a",
            ownerId: "owner_a",
            projectId: "project_a",
            operationId: "op_a",
            storeVersion: 2,
            artifactObjectBinding: null,
            canonicalJob: { state: "failed", attempt: 1 },
          },
        };
      },
    };
    const cleanupStorage = createR2JobBoundStorageAdapter({
      r2: new R2StorageAdapter({
        configOverride: CONFIG,
        s3Client: fake,
        authorizeOwner: () => true,
      }),
      ownedObjectStore,
      jobStore: failedJobStore as never,
      context: {
        ownerId: "owner_a",
        projectId: "project_a",
        jobId: "job_a",
        operationId: "op_a",
        attempt: 1,
        environmentNamespace: "test",
        artifactExpiresAtMs: Date.now() + 60_000,
        allowedSourceLocators: [],
        nowMs: () => Date.now(),
      },
    });
    const unboundDelete = await cleanupStorage.deleteObject(
      session.value.locator,
      "owner_a",
    );
    assert.equal(unboundDelete.ok, true);
    assert.equal(
      fake.hasObject("artifacts-bucket", session.value.locator.objectKey),
      false,
    );
    const objectId = deriveAttemptBoundArtifactObjectId({
      jobId: "job_a",
      operationId: "op_a",
      attempt: 1,
    })!;
    const after = await ownedObjectStore.getByObjectIdAndOwner({
      objectId,
      ownerId: "owner_a",
    });
    assert.equal(after.ok, true);
    if (after.ok) {
      assert.equal(after.value, null);
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
