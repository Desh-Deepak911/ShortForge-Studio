/**
 * Sprint 11E Phase 2E.2A.3 — terminal cleanup-intent disposition authority.
 * Run: npm run test:headless-cleanup-terminal-disposition
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { MemoryHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-cleanup.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { NeonHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-artifact-cleanup.adapter";
import { createR2ArtifactObjectIO } from "@/features/headless-renderer/control-plane/adapters/r2-artifact-object-io.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
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
import { ScriptedHeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/testing/fake-sql-executor";

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

function makeStack(fake = new FakeS3Client()) {
  const r2 = new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
  return {
    fake,
    r2,
    ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    cleanup: new MemoryHeadlessArtifactCleanupAdapter(),
    objectIo: createR2ArtifactObjectIO(r2),
  };
}

async function seedFinalized(input: {
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
  if (!staged.ok) throw new Error("stage");
  const observed = await input.ownedObjectStore.markUploadedObserved({
    objectId,
    ownerId: "owner_a",
    expectedStoreVersion: staged.value.storeVersion,
    uploadedObservedAtMs: now,
    nowMs: now,
  });
  assert.equal(observed.ok, true);
  if (!observed.ok) throw new Error("obs");
  const claimToken = `vclaim_${randomUUID()}`;
  const claimed = await input.ownedObjectStore.acquireVerificationClaim({
    objectId,
    ownerId: "owner_a",
    claimToken,
    nowMs: now,
    expectedStoreVersion: observed.value.storeVersion,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) throw new Error("claim");
  const finalized = await input.ownedObjectStore.finalizeStagingRecord({
    objectId,
    ownerId: "owner_a",
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: claimToken,
    contentDigest: digest,
    byteLength: input.bytes.byteLength,
    mimeType: "application/octet-stream",
    verifiedAtMs: now,
    expiresAtMs: now + 60_000,
    nowMs: now,
    verifiedBy: "trusted_worker_upload_stream",
  });
  assert.equal(finalized.ok, true);
  if (input.putInR2) {
    input.putInR2.putFixture(
      "artifacts-bucket",
      derived.locator.objectKey,
      input.bytes,
    );
  }
  return { objectId, locator: derived.locator, digest, now };
}

function intentFor(seeded: {
  objectId: string;
  locator: { kind: "object_storage"; storeId: string; objectKey: string };
  digest: string;
}) {
  return {
    version: HEADLESS_ARTIFACT_CLEANUP_INTENT_VERSION,
    cleanupId: stableHeadlessCleanupId({
      jobId: "job_a",
      attempt: 1,
      storageLocator: seeded.locator as never,
    }),
    jobId: "job_a",
    attempt: 1,
    ownerId: "owner_a",
    projectId: "project_a",
    objectId: seeded.objectId,
    storageLocator: seeded.locator,
    contentDigest: seeded.digest,
    reasonId: "UPLOAD_SESSION_ORPHAN" as const,
    createdAtMs: 1_700_000_000_000,
    expiresAtMs: 1_700_000_360_000,
  };
}

function stubJob(input: {
  state: string;
  binding?: {
    storageLocator: { kind: "object_storage"; storeId: string; objectKey: string };
    contentDigest: string;
  } | null;
}) {
  return {
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
          artifactObjectBinding:
            input.binding == null
              ? null
              : {
                  version: 1 as const,
                  jobId: "job_a",
                  attempt: 1,
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
          canonicalJob: { state: input.state, attempt: 1 },
        },
      };
    },
  };
}

async function scheduleIntent(
  cleanup: MemoryHeadlessArtifactCleanupAdapter,
  intent: ReturnType<typeof intentFor>,
) {
  const created = await cleanup.createIfAbsent({
    idempotencyKey: stableHeadlessCleanupIdempotencyKey({
      jobId: intent.jobId,
      attempt: intent.attempt,
      storageLocator: intent.storageLocator as never,
    }),
    intent: intent as never,
  });
  assert.equal(created.ok, true);
  return created;
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2A.3 — cleanup terminal disposition\n");

  await test("source: processor no longer failClaims protected/rejected", () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/process-artifact-cleanup.ts",
      ),
      "utf8",
    );
    assert.equal(src.includes("resolveWithoutDelete"), true);
    assert.equal(src.includes("void released"), false);
    assert.equal(src.includes("unconfirmed"), true);
  });

  await test("protected succeeded binding terminalizes without R2 delete", async () => {
    const stack = makeStack();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes,
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(stack.cleanup, intent);
    const deletesBefore = stack.fake.testingDeleteObjectCalls;
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup: stack.cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.protected, 1);
    assert.equal(result.value.completed, 0);
    assert.equal(stack.fake.testingDeleteObjectCalls, deletesBefore);
    assert.equal(
      stack.fake.hasObject("artifacts-bucket", seeded.locator.objectKey),
      true,
    );
    const stored = await stack.cleanup.getByCleanupIdAndOwner(
      intent.cleanupId,
      "owner_a",
    );
    assert.equal(stored.ok && stored.value.state, "protected");
  });

  await test("protected intent absent from later retry listings", async () => {
    const stack = makeStack();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes,
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(stack.cleanup, intent);
    await processHeadlessArtifactCleanupOnce({
      cleanup: stack.cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    const listed = await stack.cleanup.listRetryableForOwner("owner_a");
    assert.equal(listed.ok && listed.value.length, 0);
    const reclaim = await stack.cleanup.claimPending({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken: randomUUID(),
      nowMs: seeded.now + 1,
      claimLeaseMs: 60_000,
    });
    assert.equal(reclaim.ok && reclaim.value.kind, "already_terminal");
  });

  await test("rejected incoherent intent terminalizes without delete", async () => {
    const stack = makeStack();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes,
      putInR2: stack.fake,
    });
    const intent = {
      ...intentFor(seeded),
      contentDigest: digestOf(new Uint8Array([9, 9, 9, 9])),
    };
    await scheduleIntent(stack.cleanup, intent);
    const deletesBefore = stack.fake.testingDeleteObjectCalls;
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup: stack.cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({ state: "failed", binding: null }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.rejected, 1);
    assert.equal(stack.fake.testingDeleteObjectCalls, deletesBefore);
    const stored = await stack.cleanup.getByCleanupIdAndOwner(
      intent.cleanupId,
      "owner_a",
    );
    assert.equal(stored.ok && stored.value.state, "rejected");
    const listed = await stack.cleanup.listRetryableForOwner("owner_a");
    assert.equal(listed.ok && listed.value.length, 0);
  });

  await test("exact terminal replay is idempotent without storeVersion bump", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    const claimToken = randomUUID();
    const claimed = await cleanup.claimPending({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      nowMs: seeded.now,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind, "claimed");
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const first = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      expectedStoreVersion: claimed.value.record.storeVersion,
      nowMs: seeded.now + 1,
      disposition: "protected",
    });
    assert.equal(first.ok && first.value.kind, "resolved");
    if (!first.ok || first.value.kind !== "resolved") return;
    const version = first.value.record.storeVersion;
    const replay = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      expectedStoreVersion: version,
      nowMs: seeded.now + 2,
      disposition: "protected",
    });
    assert.equal(replay.ok && replay.value.kind, "already_terminal");
    if (!replay.ok || replay.value.kind !== "already_terminal") return;
    assert.equal(replay.value.record.storeVersion, version);
    assert.equal(replay.value.record.state, "protected");
  });

  await test("forged owner/token/version/disposition fails closed", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    const claimToken = randomUUID();
    const claimed = await cleanup.claimPending({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      nowMs: seeded.now,
      claimLeaseMs: 60_000,
    });
    assert.equal(claimed.ok && claimed.value.kind, "claimed");
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const sv = claimed.value.record.storeVersion;

    const badOwner = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "other",
      claimToken,
      expectedStoreVersion: sv,
      nowMs: seeded.now,
      disposition: "protected",
    });
    assert.equal(badOwner.ok, false);

    const badToken = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken: randomUUID(),
      expectedStoreVersion: sv,
      nowMs: seeded.now,
      disposition: "protected",
    });
    assert.equal(badToken.ok && badToken.value.kind, "rejected");

    const badVersion = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      expectedStoreVersion: sv + 99,
      nowMs: seeded.now,
      disposition: "protected",
    });
    assert.equal(badVersion.ok && badVersion.value.kind, "stale");

    const resolved = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      expectedStoreVersion: sv,
      nowMs: seeded.now,
      disposition: "protected",
    });
    assert.equal(resolved.ok && resolved.value.kind, "resolved");
    const mismatch = await cleanup.resolveWithoutDelete({
      cleanupId: intent.cleanupId,
      ownerId: "owner_a",
      claimToken,
      expectedStoreVersion: sv + 1,
      nowMs: seeded.now,
      disposition: "rejected",
    });
    assert.equal(mismatch.ok && mismatch.value.kind, "rejected");
  });

  await test("resolveWithoutDelete CAS failure cannot report durable protected", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    cleanup.testingFailResolveWithoutDelete = true;
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.protected, 0);
    assert.equal(result.value.unconfirmed, 1);
    const stored = await cleanup.getByCleanupIdAndOwner(
      intent.cleanupId,
      "owner_a",
    );
    assert.equal(stored.ok && stored.value.state, "claimed");
  });

  await test("failClaim failure reports unconfirmed; no durable retry release", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    cleanup.testingFailFailClaim = true;
    // Force retryable saga path: R2 delete denied after cleanup_pending.
    stack.fake.forceSendError = Object.assign(new Error("deny"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({ state: "failed", binding: null }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.retryableFailed, 0);
    assert.equal(result.value.unconfirmed, 1);
  });

  await test("complete-intent failure + failed release → unconfirmed", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    cleanup.testingFailComplete = true;
    cleanup.testingFailFailClaim = true;
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({ state: "cancelled", binding: null }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.completed, 0);
    assert.equal(result.value.unconfirmed, 1);
  });

  await test("retryable delete failure returns pending only after confirmed failClaim", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    stack.fake.forceSendError = Object.assign(new Error("deny"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
    const result = await processHeadlessArtifactCleanupOnce({
      cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({ state: "failed", binding: null }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.retryableFailed, 1);
    assert.equal(result.value.unconfirmed, 0);
    const stored = await cleanup.getByCleanupIdAndOwner(
      intent.cleanupId,
      "owner_a",
    );
    assert.equal(stored.ok && stored.value.state, "pending");
    const listed = await cleanup.listRetryableForOwner("owner_a");
    assert.equal(listed.ok && listed.value.length, 1);
  });

  await test("terminal states immutable under concurrent claims", async () => {
    const cleanup = new MemoryHeadlessArtifactCleanupAdapter();
    const stack = makeStack();
    const seeded = await seedFinalized({
      ownedObjectStore: stack.ownedObjectStore,
      bytes: new Uint8Array([1, 2, 3, 4]),
      putInR2: stack.fake,
    });
    const intent = intentFor(seeded);
    await scheduleIntent(cleanup, intent);
    await processHeadlessArtifactCleanupOnce({
      cleanup,
      ownedObjectStore: stack.ownedObjectStore,
      jobStore: stubJob({
        state: "succeeded",
        binding: {
          storageLocator: seeded.locator,
          contentDigest: seeded.digest,
        },
      }) as never,
      objectIo: stack.objectIo,
      ownerId: "owner_a",
      nowMs: () => seeded.now,
    });
    const [a, b] = await Promise.all([
      cleanup.claimPending({
        cleanupId: intent.cleanupId,
        ownerId: "owner_a",
        claimToken: randomUUID(),
        nowMs: seeded.now + 10,
        claimLeaseMs: 60_000,
      }),
      cleanup.claimPending({
        cleanupId: intent.cleanupId,
        ownerId: "owner_a",
        claimToken: randomUUID(),
        nowMs: seeded.now + 10,
        claimLeaseMs: 60_000,
      }),
    ]);
    assert.equal(a.ok && a.value.kind, "already_terminal");
    assert.equal(b.ok && b.value.kind, "already_terminal");
  });

  await test("Neon resolveWithoutDelete + already_terminal replay parity", async () => {
    const i = intentFor({
      objectId: "art_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      locator: {
        kind: "object_storage",
        storeId: "artifacts",
        objectKey: "test/finalized/artifacts/artifact/aa/bb/cc/dd/none/abcdabcdabcdabcdabcdabcdabcdabcd",
      },
      digest: `sha256:${"ab".repeat(32)}`,
    });
    const claimed = {
      cleanup_id: i.cleanupId,
      version: i.version,
      job_id: i.jobId,
      attempt: String(i.attempt),
      owner_id: i.ownerId,
      project_id: i.projectId,
      object_id: i.objectId,
      locator_kind: i.storageLocator.kind,
      store_id: i.storageLocator.storeId,
      object_key: i.storageLocator.objectKey,
      content_digest: i.contentDigest,
      reason_id: i.reasonId,
      state: "claimed",
      claim_token: "claim_token_aaaaaaaa",
      claimed_at_ms: "1700000001000",
      expires_at_ms: String(i.expiresAtMs),
      store_version: "2",
      idempotency_key: "idem_cleanup_aaaaaaaa",
      created_at_ms: String(i.createdAtMs),
      completed_at_ms: null,
    };
    const protectedRow = {
      ...claimed,
      state: "protected",
      claim_token: null,
      completed_at_ms: "1700000002000",
      store_version: "3",
    };
    const resolveSql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [claimed] },
      { kind: "rows", rows: [protectedRow] },
    ]);
    const adapter = new NeonHeadlessArtifactCleanupAdapter(resolveSql);
    const resolved = await adapter.resolveWithoutDelete({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      expectedStoreVersion: 2,
      nowMs: 1_700_000_002_000,
      disposition: "protected",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.value.kind, "resolved");
    if (resolved.value.kind !== "resolved") return;
    assert.equal(resolved.value.record.state, "protected");

    const replaySql = new ScriptedHeadlessSqlExecutor([
      { kind: "rows", rows: [protectedRow] },
    ]);
    const replayAdapter = new NeonHeadlessArtifactCleanupAdapter(replaySql);
    const replay = await replayAdapter.resolveWithoutDelete({
      cleanupId: i.cleanupId,
      ownerId: i.ownerId,
      claimToken: "claim_token_aaaaaaaa",
      expectedStoreVersion: 3,
      nowMs: 1_700_000_003_000,
      disposition: "protected",
    });
    assert.equal(replay.ok && replay.value.kind, "already_terminal");
    if (!replay.ok || replay.value.kind !== "already_terminal") return;
    assert.equal(replay.value.record.storeVersion, 3);
  });

  await test("SQL schema enforces protected/rejected terminal coherence", () => {
    const sql = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/migrations/005_headless_cleanup_intents.sql",
      ),
      "utf8",
    );
    assert.match(sql, /headless_cleanup_intents_protected_payload/);
    assert.match(sql, /headless_cleanup_intents_rejected_payload/);
    assert.match(sql, /'protected'/);
    assert.match(sql, /'rejected'/);
    assert.match(
      sql,
      /WHERE state IN \('pending', 'claimed'\)/,
    );
  });

  await test("safe views / barrels expose no private cleanup disposition payload", () => {
    const safeView = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/safe-job-view.ts",
      ),
      "utf8",
    );
    assert.equal(safeView.includes("cleanup"), false);
    assert.equal(safeView.includes("resolveWithoutDelete"), false);
    const productBarrel = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/product/index.ts",
      ),
      "utf8",
    );
    assert.equal(productBarrel.includes("ArtifactCleanup"), false);
    assert.equal(productBarrel.includes("resolveWithoutDelete"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
