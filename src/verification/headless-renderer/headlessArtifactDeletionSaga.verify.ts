/**
 * Sprint 11E Phase 2E.2A.2 — artifact deletion saga + cleanup execution authority.
 * Run: npm run test:headless-artifact-deletion-saga
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createR2ArtifactObjectIO } from "@/features/headless-renderer/control-plane/adapters/r2-artifact-object-io.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { deleteArtifactUnderDurableAuthority } from "@/features/headless-renderer/control-plane/services/delete-artifact-under-durable-authority";
import { processHeadlessArtifactCleanupOnce } from "@/features/headless-renderer/control-plane/services/process-artifact-cleanup";
import {
  deriveAttemptBoundArtifactLocator,
  deriveAttemptBoundArtifactObjectId,
} from "@/features/headless-renderer/control-plane/services/attempt-bound-artifact-key";
import {
  stableHeadlessCleanupId,
  stableHeadlessCleanupIdempotencyKey,
} from "@/features/headless-renderer/control-plane/services/stable-cleanup-id";
import { HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION } from "@/features/headless-renderer/control-plane/types/artifact-cleanup-intent";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";

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

function makePorts(fake = new FakeS3Client()) {
  const r2 = new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter();
  const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
  const objectIo = createR2ArtifactObjectIO(r2);
  return { fake, r2, ownedObjectStore, jobStore, cleanup, objectIo };
}

async function seedStagingArtifact(input: {
  ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  bytes: Uint8Array;
  putInR2?: FakeS3Client;
}) {
  const digest = digestOf(input.bytes);
  const objectId = deriveAttemptBoundArtifactObjectId({
    jobId: "job_a",
    operationId: "op_a",
    attempt: 1,
  })!;
  const derived = deriveAttemptBoundArtifactLocator({
    environmentNamespace: "test",
    ownerId: "owner_a",
    projectId: "project_a",
    jobId: "job_a",
    operationId: "op_a",
    attempt: 1,
  });
  assert.equal(derived.ok, true);
  if (!derived.ok) throw new Error("locator");
  const now = 1_700_000_000_000;
  const staged = await input.ownedObjectStore.createStagingRecord({
    objectId,
    ownerId: "owner_a",
    projectId: "project_a",
    jobId: "job_a",
    operationId: "op_a",
    purpose: "artifact",
    slotKey: null,
    storeId: "artifacts",
    objectKey: derived.locator.objectKey,
    expectedContentDigestClaim: digest,
    expectedByteLength: input.bytes.byteLength,
    expectedMimeType: "application/octet-stream",
    uploadCapabilityIssuedAtMs: now,
    uploadCapabilityExpiresAtMs: now + 60_000,
    expiresAtMs: now + 60_000,
    createdAtMs: now,
  });
  assert.equal(staged.ok, true);
  if (input.putInR2) {
    input.putInR2.putFixture(
      "artifacts-bucket",
      derived.locator.objectKey,
      input.bytes,
    );
  }
  return { objectId, locator: derived.locator, digest, now };
}

async function seedFinalizedArtifact(input: {
  ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  bytes: Uint8Array;
  putInR2?: FakeS3Client;
}) {
  const base = await seedStagingArtifact(input);
  const claimToken = `vclaim_${randomUUID()}`;
  const cur = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: base.objectId,
    ownerId: "owner_a",
  });
  assert.equal(cur.ok && cur.value != null, true);
  if (!cur.ok || cur.value == null) throw new Error("missing");
  await input.ownedObjectStore.markUploadedObserved({
    objectId: base.objectId,
    ownerId: "owner_a",
    expectedStoreVersion: cur.value.storeVersion,
    uploadedObservedAtMs: base.now,
    nowMs: base.now,
  });
  const afterObs = await input.ownedObjectStore.getByObjectIdAndOwner({
    objectId: base.objectId,
    ownerId: "owner_a",
  });
  assert.equal(afterObs.ok && afterObs.value != null, true);
  if (!afterObs.ok || afterObs.value == null) throw new Error("missing");
  const claimed = await input.ownedObjectStore.acquireVerificationClaim({
    objectId: base.objectId,
    ownerId: "owner_a",
    claimToken,
    nowMs: base.now,
    expectedStoreVersion: afterObs.value.storeVersion,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) throw new Error("claim");
  const finalized = await input.ownedObjectStore.finalizeStagingRecord({
    objectId: base.objectId,
    ownerId: "owner_a",
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: claimToken,
    contentDigest: base.digest,
    byteLength: input.bytes.byteLength,
    mimeType: "application/octet-stream",
    verifiedAtMs: base.now,
    expiresAtMs: base.now + 60_000,
    nowMs: base.now,
    verifiedBy: "trusted_worker_upload_stream",
  });
  assert.equal(finalized.ok, true);
  return base;
}

function intentFor(input: {
  objectId: string;
  locator: { kind: "object_storage"; storeId: string; objectKey: string };
  digest: string;
  attempt?: number;
  reasonId?: "UPLOAD_SESSION_ORPHAN" | "SUCCEEDED_CAS_STALE";
}) {
  const attempt = input.attempt ?? 1;
  return {
    version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
    cleanupId: stableHeadlessCleanupId({
      jobId: "job_a",
      attempt,
      storageLocator: input.locator as never,
    }),
    jobId: "job_a",
    attempt,
    ownerId: "owner_a",
    projectId: "project_a",
    objectId: input.objectId,
    storageLocator: input.locator,
    contentDigest: input.digest,
    reasonId: input.reasonId ?? ("UPLOAD_SESSION_ORPHAN" as const),
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_360_000,
  };
}

function stubJob(input: {
  state: string;
  attempt?: number;
  binding?: {
    storageLocator: { kind: "object_storage"; storeId: string; objectKey: string };
    contentDigest: string;
  } | null;
  stage?: "canonical" | "provisional";
}) {
  return {
    async getByJobIdAndOwner() {
      if (input.stage === "provisional") {
        return {
          ok: true as const,
          value: {
            stage: "provisional" as const,
            jobId: "job_a",
            ownerId: "owner_a",
            projectId: "project_a",
            operationId: "op_a",
            storeVersion: 1,
          },
        };
      }
      return {
        ok: true as const,
        value: {
          stage: "canonical" as const,
          jobId: "job_a",
          ownerId: "owner_a",
          projectId: "project_a",
          operationId: "op_a",
          storeVersion: 1,
          artifactObjectBinding:
            input.binding == null
              ? null
              : {
                  version: 1 as const,
                  jobId: "job_a",
                  attempt: input.attempt ?? 1,
                  ownerId: "owner_a",
                  projectId: "project_a",
                  storageLocator: input.binding.storageLocator,
                  contentDigest: input.binding.contentDigest,
                  byteLength: 4,
                  mimeType: "application/octet-stream",
                  artifactFingerprint: `sha256:${"22".repeat(32)}`,
                  requestFingerprint: `sha256:${"11".repeat(32)}`,
                  expiresAtMs: 1_700_000_360_000,
                },
          canonicalJob: {
            state: input.state,
            attempt: input.attempt ?? 1,
          },
        },
      };
    },
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2A.2 — artifact deletion saga\n");

  await test("defect: deleteObject ordered R2-before-metadata (source gone)", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("deleteArtifactUnderDurableAuthority"), true);
    // Old false-success pattern must not remain as the delete body.
    assert.equal(
      /const deleted = await this\.r2\.deleteObject[\s\S]*if \(marked\.ok\) \{\s*await this\.ownedObjectStore\.completeCleanup/.test(
        src,
      ),
      false,
    );
  });

  await test("defect: processHeadlessArtifactCleanupOnce no longer locator-only", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/process-artifact-cleanup.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("deleteArtifactUnderDurableAuthority"), true);
    assert.equal(src.includes("ownedObjectStore"), true);
    assert.equal(src.includes("input.storage.deleteObject"), false);
  });

  await test("pre-delete CAS failure → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    ownedObjectStore.testingFailMarkCleanupPending = true;
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "retryable");
    assert.equal(result.externalDeleteAttempted, false);
    assert.equal(fake.testingDeleteObjectCalls, 0);
    assert.equal(fake.hasObject("artifacts-bucket", seeded.locator.objectKey), true);
  });

  await test("succeeded binding → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "protected");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("live finalized artifact → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "uploading", binding: null }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "protected");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("intent/objectId mismatch → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: {
        ...intentFor(seeded),
        objectId: "art_ffffffffffffffffffffffffffffffff",
      },
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.ok(result.status === "rejected" || result.status === "unconfirmed");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("intent/digest mismatch → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: {
        ...intentFor(seeded),
        contentDigest: digestOf(new Uint8Array([9, 9, 9, 9])),
      },
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "rejected");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("attempt mismatch → zero R2 deletes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor({ ...seeded, attempt: 2 }),
      ownedObjectStore,
      jobStore: stubJob({ state: "failed", attempt: 1 }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "rejected");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("R2 delete failure → cleanup_pending + retryable", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    fake.forceSendError = Object.assign(new Error("deny"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "cancelled" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "retryable");
    assert.equal(result.externalDeleteAttempted, true);
    const durable = await ownedObjectStore.getByObjectIdAndOwner({
      objectId: seeded.objectId,
      ownerId: "owner_a",
    });
    assert.equal(durable.ok && durable.value?.record.stage, "cleanup_pending");
  });

  await test("R2 delete success + metadata completion failure → unconfirmed", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    ownedObjectStore.testingFailCompleteCleanup = true;
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "unconfirmed");
    assert.equal(fake.hasObject("artifacts-bucket", seeded.locator.objectKey), false);
    const durable = await ownedObjectStore.getByObjectIdAndOwner({
      objectId: seeded.objectId,
      ownerId: "owner_a",
    });
    assert.equal(durable.ok && durable.value?.record.stage, "cleanup_pending");
  });

  await test("R2 already absent + valid retry → metadata and intent complete", async () => {
    const ports = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore: ports.ownedObjectStore,
      bytes,
      putInR2: ports.fake,
    });
    ports.ownedObjectStore.testingFailCompleteCleanup = true;
    await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore: ports.ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo: ports.objectIo,
      nowMs: seeded.now,
    });
    ports.ownedObjectStore.testingFailCompleteCleanup = false;
    // Object already absent; retry completes metadata.
    const retry = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore: ports.ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo: ports.objectIo,
      nowMs: seeded.now,
    });
    assert.equal(retry.status, "completed");
    const after = await ports.ownedObjectStore.getByObjectIdAndOwner({
      objectId: seeded.objectId,
      ownerId: "owner_a",
    });
    assert.equal(after.ok && after.value, null);
  });

  await test("exact absence probe failure → not complete", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    // After delete, force Head probe to fail (unknown).
    const originalDelete = objectIo.deleteExactObject.bind(objectIo);
    let deletedOnce = false;
    const wrapped = {
      deleteExactObject: async (input: Parameters<typeof originalDelete>[0]) => {
        deletedOnce = true;
        return originalDelete(input);
      },
      probeExactObjectPresence: async (
        input: Parameters<typeof objectIo.probeExactObjectPresence>[0],
      ) => {
        if (deletedOnce) {
          return {
            ok: false as const,
            issues: [
              {
                code: "INTERNAL_ERROR" as const,
                message: "probe failed",
              },
            ],
          };
        }
        return objectIo.probeExactObjectPresence(input);
      },
    };
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo: wrapped,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "unconfirmed");
  });

  await test("happy path terminal unbound cleanup completes", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "cancelled" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.status, "completed");
    assert.equal(fake.hasObject("artifacts-bucket", seeded.locator.objectKey), false);
    const after = await ownedObjectStore.getByObjectIdAndOwner({
      objectId: seeded.objectId,
      ownerId: "owner_a",
    });
    assert.equal(after.ok && after.value, null);
  });

  await test("process cleanup: intent complete after saga; concurrent one claim", async () => {
    const ports = makePorts();
    const bytes = new Uint8Array([5, 5, 5, 5]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore: ports.ownedObjectStore,
      bytes,
      putInR2: ports.fake,
    });
    // Real memory job store with cancelled terminal job via stub wrapper on process.
    const jobStore = stubJob({ state: "cancelled" });
    const intent = intentFor(seeded);
    const created = await ports.cleanup.createIfAbsent({
      idempotencyKey: stableHeadlessCleanupIdempotencyKey({
        jobId: intent.jobId,
        attempt: intent.attempt,
        storageLocator: intent.storageLocator as never,
      }),
      intent: intent as never,
    });
    assert.equal(created.ok, true);

    const a = processHeadlessArtifactCleanupOnce({
      cleanup: ports.cleanup,
      ownedObjectStore: ports.ownedObjectStore,
      jobStore: jobStore as never,
      objectIo: ports.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
      limit: 4,
    });
    const b = processHeadlessArtifactCleanupOnce({
      cleanup: ports.cleanup,
      ownedObjectStore: ports.ownedObjectStore,
      jobStore: jobStore as never,
      objectIo: ports.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
      limit: 4,
    });
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(ra.ok && rb.ok, true);
    if (!ra.ok || !rb.ok) return;
    assert.equal(ra.value.completed + rb.value.completed, 1);
    assert.equal(ports.fake.testingDeleteObjectCalls, 1);
    const listed = await ports.cleanup.listRetryableForOwner("owner_a");
    assert.equal(listed.ok && listed.value.length, 0);
  });

  await test("provisional/missing job rejection; cross-owner rejected", async () => {
    const { fake, ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({
      ownedObjectStore,
      bytes,
      putInR2: fake,
    });
    const provisional = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({ state: "queued", stage: "provisional" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(provisional.status, "rejected");
    assert.equal(fake.testingDeleteObjectCalls, 0);

    const missing = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: {
        async getByJobIdAndOwner() {
          return {
            ok: false as const,
            issues: [{ code: "JOB_NOT_FOUND" as const, message: "missing" }],
          };
        },
      } as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(missing.status, "rejected");

    const cross = await deleteArtifactUnderDurableAuthority({
      intent: { ...intentFor(seeded), ownerId: "other_owner" },
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.ok(cross.status === "rejected" || cross.status === "unconfirmed");
    assert.equal(fake.testingDeleteObjectCalls, 0);
  });

  await test("job-bound deleteObject uses saga; no false success on CAS fail", async () => {
    const { fake, r2, ownedObjectStore } = makePorts();
    const bytes = new Uint8Array([8, 8, 8, 8]);
    const digest = digestOf(bytes);
    const storage = createR2JobBoundStorageAdapter({
      r2,
      ownedObjectStore,
      jobStore: stubJob({ state: "failed" }) as never,
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
    ownedObjectStore.testingFailMarkCleanupPending = true;
    const deleted = await storage.deleteObject(session.value.locator, "owner_a");
    assert.equal(deleted.ok, false);
    assert.equal(fake.testingDeleteObjectCalls, 0);
    assert.equal(
      fake.hasObject("artifacts-bucket", session.value.locator.objectKey),
      true,
    );
  });

  await test("no public leakage of keys in saga messages", async () => {
    const { ownedObjectStore, objectIo } = makePorts();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalizedArtifact({ ownedObjectStore, bytes });
    const result = await deleteArtifactUnderDurableAuthority({
      intent: intentFor(seeded),
      ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo,
      nowMs: seeded.now,
    });
    assert.equal(result.message.includes(seeded.locator.objectKey), false);
    assert.equal(result.message.includes("cap_"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
