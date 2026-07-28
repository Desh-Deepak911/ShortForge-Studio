/**
 * Sprint 11D Phase 3.3A.1 — Durable orphan cleanup + test-hook isolation.
 * Run: npm run test:headless-artifact-cleanup
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createMemoryArtifactObjectIO } from "@/features/headless-renderer/control-plane/adapters/memory-artifact-object-io.adapter";
import { toHeadlessPublicJobView } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import { processHeadlessArtifactCleanupOnce } from "@/features/headless-renderer/control-plane/services/process-artifact-cleanup";
import { validateHeadlessArtifactCleanupIntent } from "@/features/headless-renderer/control-plane/services/validate-artifact-cleanup-intent";
import { stableHeadlessCleanupId } from "@/features/headless-renderer/control-plane/services/stable-cleanup-id";
import type { HeadlessArtifactCleanupIntentV1 } from "@/features/headless-renderer/control-plane/types/artifact-cleanup-intent";
import { buildHeadlessReferenceFixture } from "@/features/headless-renderer/worker/testing/build-reference-fixture";
import { seedAndCreateReferenceJob } from "@/features/headless-renderer/worker/testing/seed-reference-job";

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function testAsync(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 30_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("waitUntil timed out");
    }
    await sleep(20);
  }
}

/** Seed durable owned-object parity for memory-storage cleanup maintenance. */
async function seedFinalizedOwnedFromIntent(input: {
  store: MemoryHeadlessOwnedObjectStoreAdapter;
  intent: HeadlessArtifactCleanupIntentV1;
  operationId: string;
  byteLength: number;
  mimeType: string;
}) {
  const now = input.intent.createdAtMs;
  const staged = await input.store.createStagingRecord({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    projectId: input.intent.projectId,
    jobId: input.intent.jobId,
    operationId: input.operationId,
    purpose: "artifact",
    slotKey: null,
    storeId: "artifacts",
    objectKey: input.intent.storageLocator.objectKey,
    expectedContentDigestClaim: input.intent.contentDigest,
    expectedByteLength: input.byteLength,
    expectedMimeType: input.mimeType,
    uploadCapabilityIssuedAtMs: now,
    uploadCapabilityExpiresAtMs: input.intent.expiresAtMs,
    expiresAtMs: input.intent.expiresAtMs,
    createdAtMs: now,
  });
  assert.equal(staged.ok, true);
  if (!staged.ok) return;
  const observed = await input.store.markUploadedObserved({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    expectedStoreVersion: staged.value.storeVersion,
    uploadedObservedAtMs: now,
    nowMs: now,
  });
  assert.equal(observed.ok, true);
  if (!observed.ok) return;
  const claimToken = `vclaim_${randomUUID()}`;
  const claimed = await input.store.acquireVerificationClaim({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    claimToken,
    nowMs: now,
    expectedStoreVersion: observed.value.storeVersion,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;
  const finalized = await input.store.finalizeStagingRecord({
    objectId: input.intent.objectId,
    ownerId: input.intent.ownerId,
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: claimToken,
    contentDigest: input.intent.contentDigest,
    byteLength: input.byteLength,
    mimeType: input.mimeType,
    verifiedAtMs: now,
    expiresAtMs: input.intent.expiresAtMs,
    nowMs: now,
    verifiedBy: "trusted_worker_upload_stream",
  });
  assert.equal(finalized.ok, true);
}

async function cancelAfterFinalize(input: {
  idempotencyKey: string;
  deleteFail?: boolean;
  createCleanupFail?: boolean;
}) {
  let release!: () => void;
  let paused = false;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const fixture = buildHeadlessReferenceFixture({
    durationMs: 1000,
    audioMode: "silent",
    rendererProfile: {
      resolution: "720p",
      format: "webm",
      quality: "high",
    },
  });
  const seeded = await seedAndCreateReferenceJob({
    fixture,
    idempotencyKey: input.idempotencyKey,
    testHooks: {
      afterFinalizeBeforeSucceededCas: async () => {
        paused = true;
        await gate;
      },
    },
  });
  if (input.deleteFail) {
    seeded.stack.storage.testingDeleteFail = true;
  }
  if (input.createCleanupFail) {
    seeded.stack.artifactCleanup.testingCreateFail = true;
  }
  const runPromise = seeded.worker.processOnce(1);
  await waitUntil(() => paused);
  const cancelled = await seeded.stack.service.cancelJob({
    requestContext: {},
    jobId: seeded.jobId,
  });
  assert.equal(cancelled.ok, true);
  release();
  const result = await runPromise;
  seeded.stack.storage.testingDeleteFail = false;
  seeded.stack.artifactCleanup.testingCreateFail = false;
  return { ...seeded, result };
}

async function main() {
  console.log("\nSprint 11D Phase 3.3A.1 — Artifact cleanup authority\n");

  test("test-hook production isolation: barrels + routes", () => {
    const workerBarrel = readFileSync(
      join(process.cwd(), "src/features/headless-renderer/worker/index.ts"),
      "utf8",
    );
    assert.equal(workerBarrel.includes("create-test-local-worker-runner"), false);
    assert.equal(workerBarrel.includes("LocalHeadlessWorkerTestHooks"), false);
    assert.equal(workerBarrel.includes("testHooks"), false);

    const runner = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/local-worker-runner.ts",
      ),
      "utf8",
    );
    assert.equal(runner.includes("testHooks"), false);
    assert.equal(runner.includes("LocalHeadlessWorkerTestHooks"), false);
    assert.ok(runner.includes("afterFinalizeBeforeSucceededCas"));

    const prodCompose = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/runtime/compose-production-control-plane.ts",
      ),
      "utf8",
    );
    assert.equal(prodCompose.includes("testHooks"), false);
    assert.equal(prodCompose.includes("MemoryHeadless"), false);
    assert.equal(prodCompose.includes("create-test-local-worker-runner"), false);

    const cpBarrel = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.equal(cpBarrel.includes("memory-artifact-cleanup"), false);
    assert.equal(cpBarrel.includes("create-test-local-worker-runner"), false);

    const apiRoot = join(process.cwd(), "src/app/api/headless-render");
    for (const name of readdirSync(apiRoot, { recursive: true })) {
      const rel = String(name);
      if (!rel.endsWith(".ts")) continue;
      const src = readFileSync(join(apiRoot, rel), "utf8");
      assert.equal(
        src.includes("worker/testing"),
        false,
        `route ${rel} must not import worker/testing`,
      );
      assert.equal(src.includes("create-test-local-worker-runner"), false);
      assert.equal(src.includes("testHooks"), false);
    }

    const testingFactory = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/testing/create-test-local-worker-runner.ts",
      ),
      "utf8",
    );
    assert.ok(testingFactory.includes("LocalHeadlessWorkerTestHooks"));
    assert.ok(testingFactory.includes("createTestLocalHeadlessWorkerRunner"));
  });

  test("cleanup intent validator: total + opaque locator", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("leak https://evil/cap_token");
        },
      },
    );
    let threw = false;
    let result: ReturnType<typeof validateHeadlessArtifactCleanupIntent>;
    try {
      result = validateHeadlessArtifactCleanupIntent(hostile);
    } catch {
      threw = true;
      result = { ok: false, message: "threw" };
    }
    assert.equal(threw, false);
    assert.equal(result!.ok, false);
    if (!result!.ok) {
      assert.equal(result.message.includes("https://"), false);
      assert.equal(result.message.includes("cap_"), false);
    }

    const bad = validateHeadlessArtifactCleanupIntent({
      version: 1,
      cleanupId: "hci:job:a1:store:key",
      jobId: "job",
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      objectId: "art_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      storageLocator: {
        kind: "object_storage",
        storeId: "https://evil",
        objectKey: "k",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      reasonId: "SUCCEEDED_CAS_TERMINAL_LOCKED",
      createdAtMs: 1,
      expiresAtMs: 2,
    });
    assert.equal(bad.ok, false);
  });

  await testAsync(
    "cancel after finalize + immediate delete succeeds",
    async () => {
      const { stack, jobId, ownerId, result } = await cancelAfterFinalize({
        idempotencyKey: "p331-cancel-delete-ok",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.lastOrphanCleanup?.status, "deleted");
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob!.state, "cancelled");
      assert.equal(stored.value.artifactObjectBinding, null);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 0);
      assert.equal(stack.artifactCleanup.testingCountForOwner(ownerId), 0);
    },
  );

  await testAsync(
    "cancel after finalize + delete fails → cleanup intent created",
    async () => {
      const { stack, jobId, ownerId, result } = await cancelAfterFinalize({
        idempotencyKey: "p331-cancel-delete-fail",
        deleteFail: true,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
      const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob!.state, "cancelled");
      assert.equal(stored.value.artifactObjectBinding, null);
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);
      const intent = await stack.artifactCleanup.getByCleanupIdAndOwner(
        cleanupId,
        ownerId,
      );
      assert.equal(intent.ok, true);
      if (!intent.ok) return;
      assert.equal(intent.value.state, "pending");
      const view = toHeadlessPublicJobView(stored.value.canonicalJob);
      const viewJson = JSON.stringify(view);
      assert.equal(viewJson.includes("objectKey"), false);
      assert.equal(viewJson.includes("cleanupId"), false);
      assert.equal(viewJson.includes(cleanupId), false);
    },
  );

  await testAsync(
    "cleanup retry later deletes object and completes intent",
    async () => {
      const { stack, ownerId, result } = await cancelAfterFinalize({
        idempotencyKey: "p331-cleanup-retry",
        deleteFail: true,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);

      stack.storage.testingDeleteFail = false;
      const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
      const intentRow = await stack.artifactCleanup.getByCleanupIdAndOwner(
        cleanupId,
        ownerId,
      );
      assert.equal(intentRow.ok, true);
      if (!intentRow.ok) return;
      const storedJob = await stack.jobStore.getByJobIdAndOwner(
        intentRow.value.intent.jobId,
        ownerId,
      );
      assert.equal(storedJob.ok, true);
      if (!storedJob.ok) return;
      const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
      const peeked = stack.storage.testingPeekStoredObject(
        intentRow.value.intent.storageLocator,
      );
      assert.ok(peeked);
      await seedFinalizedOwnedFromIntent({
        store: ownedObjectStore,
        intent: intentRow.value.intent,
        operationId: storedJob.value.operationId,
        byteLength: peeked!.bytes.byteLength,
        mimeType: peeked!.metadata.mimeType,
      });
      const recovered = await processHeadlessArtifactCleanupOnce({
        cleanup: stack.artifactCleanup,
        ownedObjectStore,
        jobStore: stack.jobStore,
        objectIo: createMemoryArtifactObjectIO(stack.storage),
        ownerId,
        nowMs: () => 1_700_000_000_000,
        limit: 4,
      });
      assert.equal(recovered.ok, true);
      if (!recovered.ok) return;
      assert.equal(recovered.value.completed, 1);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 0);
      assert.equal(stack.artifactCleanup.testingCountPendingForOwner(ownerId), 0);
    },
  );

  await testAsync("stale CAS + delete failure schedules cleanup", async () => {
    let release!: () => void;
    let paused = false;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "silent",
      rendererProfile: {
        resolution: "720p",
        format: "webm",
        quality: "high",
      },
    });
    const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "p331-stale-delete-fail",
      testHooks: {
        afterFinalizeBeforeSucceededCas: async () => {
          paused = true;
          await gate;
        },
      },
    });
    stack.storage.testingDeleteFail = true;
    const runPromise = worker.processOnce(1);
    await waitUntil(() => paused);
    assert.equal(stack.jobStore.testingBumpStoreVersion(jobId), true);
    release();
    const result = await runPromise;
    stack.storage.testingDeleteFail = false;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    assert.equal(stored.value.artifactObjectBinding, null);
    assert.equal(stack.artifactCleanup.testingCountPendingForOwner(ownerId), 1);
  });

  await testAsync("thrown CAS + delete failure schedules cleanup", async () => {
    const fixture = buildHeadlessReferenceFixture({
      durationMs: 1000,
      audioMode: "silent",
      rendererProfile: {
        resolution: "720p",
        format: "webm",
        quality: "high",
      },
    });
    const { stack, worker, ownerId } = await seedAndCreateReferenceJob({
      fixture,
      idempotencyKey: "p331-throw-delete-fail",
      testHooks: { throwBeforeSucceededCas: true },
    });
    stack.storage.testingDeleteFail = true;
    const result = await worker.processOnce(1);
    stack.storage.testingDeleteFail = false;
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
    assert.equal(stack.artifactCleanup.testingCountPendingForOwner(ownerId), 1);
  });

  await testAsync(
    "cleanup-intent persistence failure → ARTIFACT_CLEANUP_UNCONFIRMED",
    async () => {
      const { stack, jobId, ownerId, result } = await cancelAfterFinalize({
        idempotencyKey: "p331-unconfirmed",
        deleteFail: true,
        createCleanupFail: true,
      });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.issues[0]?.code, "ARTIFACT_CLEANUP_UNCONFIRMED");
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.canonicalJob!.state, "cancelled");
      assert.equal(stored.value.artifactObjectBinding, null);
      assert.equal(stack.artifactCleanup.testingCountForOwner(ownerId), 0);
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);
    },
  );

  await testAsync("duplicate cleanup scheduling remains one intent", async () => {
    const { stack, ownerId, result } = await cancelAfterFinalize({
      idempotencyKey: "p331-dup-schedule",
      deleteFail: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
    const listed = await stack.artifactCleanup.listRetryableForOwner(ownerId);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    const first = listed.value[0]!;
    const again = await stack.artifactCleanup.createIfAbsent({
      idempotencyKey: first.idempotencyKey,
      intent: first.intent,
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.value.kind, "existing");
    assert.equal(again.value.record.intent.cleanupId, cleanupId);
    assert.equal(stack.artifactCleanup.testingCountForOwner(ownerId), 1);
  });

  await testAsync("concurrent cleanup claim race — one owner", async () => {
    const { stack, ownerId, result } = await cancelAfterFinalize({
      idempotencyKey: "p331-claim-race",
      deleteFail: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
    const a = await stack.artifactCleanup.claimPending({
      cleanupId,
      ownerId,
      claimToken: randomUUID(),
      nowMs: 1_700_000_000_000,
      claimLeaseMs: 60_000,
    });
    const b = await stack.artifactCleanup.claimPending({
      cleanupId,
      ownerId,
      claimToken: randomUUID(),
      nowMs: 1_700_000_000_001,
      claimLeaseMs: 60_000,
    });
    assert.equal(a.ok && a.value.kind === "claimed", true);
    assert.equal(b.ok && b.value.kind === "rejected", true);
  });

  await testAsync("cross-owner cleanup rejected", async () => {
    const { stack, result } = await cancelAfterFinalize({
      idempotencyKey: "p331-cross-owner",
      deleteFail: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const cleanupId = result.value.lastOrphanCleanup!.cleanupId!;
    const other = await stack.artifactCleanup.getByCleanupIdAndOwner(
      cleanupId,
      "other-owner",
    );
    assert.equal(other.ok, false);
    const claim = await stack.artifactCleanup.claimPending({
      cleanupId,
      ownerId: "other-owner",
      claimToken: randomUUID(),
      nowMs: 1_700_000_000_000,
      claimLeaseMs: 60_000,
    });
    assert.equal(claim.ok, false);
  });

  await testAsync(
    "succeeded CAS creates no cleanup intent and preserves object/binding",
    async () => {
      const fixture = buildHeadlessReferenceFixture({
        durationMs: 1000,
        audioMode: "silent",
        rendererProfile: {
          resolution: "720p",
          format: "webm",
          quality: "high",
        },
      });
      const { stack, worker, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p331-success-no-cleanup",
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 1);
      assert.equal(result.value.lastOrphanCleanup, null);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.ok(stored.value.artifactObjectBinding);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 1);
      assert.equal(stack.artifactCleanup.testingCountForOwner(ownerId), 0);
      const expectedId = stableHeadlessCleanupId({
        jobId,
        attempt: stored.value.canonicalJob!.attempt,
        storageLocator: stored.value.artifactObjectBinding!.storageLocator,
      });
      const missing = await stack.artifactCleanup.getByCleanupIdAndOwner(
        expectedId,
        ownerId,
      );
      assert.equal(missing.ok, false);
    },
  );

  await testAsync(
    "public job view and diagnostics never expose cleanup locator",
    async () => {
      const { stack, jobId, ownerId, result } = await cancelAfterFinalize({
        idempotencyKey: "p331-privacy",
        deleteFail: true,
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const view = toHeadlessPublicJobView(stored.value.canonicalJob);
      const blob = JSON.stringify({
        view,
        evidence: result.value.lastEvidence,
        orphan: result.value.lastOrphanCleanup,
      });
      assert.equal(blob.includes("objectKey"), false);
      assert.equal(blob.includes("capability"), false);
      assert.equal(view.artifactAvailable, false);
    },
  );

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
