/**
 * Sprint 11D Phase 3.3A — Durable artifact binding + post-finalization race authority.
 * Run: npm run test:headless-artifact-binding
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { toHeadlessPublicJobView } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import {
  isCanonicalStoredJobRecord,
  type HeadlessCanonicalStoredJobRecord,
  type HeadlessStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import {
  assertStoredBindingStateRules,
  buildValidatedArtifactObjectBinding,
  validateHeadlessArtifactObjectBinding,
} from "@/features/headless-renderer/control-plane/services/validate-artifact-object-binding";
import {
  assertClaimedRenderCleanupWiringComplete,
  readClaimedRenderCleanupWiringSources,
  runClaimedRenderCleanupReleaseBehaviorFixtures,
  validateClaimedRenderCleanupWiring,
} from "@/features/headless-renderer/worker/testing/claimed-render-artifact-cleanup-release-authority";
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

function requireCanonicalStoredJobRecord(
  record: HeadlessStoredJobRecord,
  scenario: string,
): HeadlessCanonicalStoredJobRecord {
  if (!isCanonicalStoredJobRecord(record)) {
    throw new Error(`expected canonical stored job: ${scenario}`);
  }
  return record;
}

async function main() {
  console.log("\nSprint 11D Phase 3.3A — Artifact binding authority\n");

  test("privacy: binding types absent from safe job view + public artifact", () => {
    const viewSrc = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/safe-job-view.ts",
      ),
      "utf8",
    );
    assert.equal(viewSrc.includes("artifactObjectBinding"), false);
    assert.equal(viewSrc.includes("storageLocator"), false);

    const types = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/domain/headless-render.types.ts",
      ),
      "utf8",
    );
    assert.equal(types.includes("artifactObjectBinding"), false);
    assert.ok(types.includes("HeadlessRenderArtifactV1"));

    const runner = readFileSync(
      join(
        process.cwd(),
        "src/features/headless-renderer/worker/runtime/local-worker-runner.ts",
      ),
      "utf8",
    );
    assert.equal(runner.includes("executeClaimedRender"), true);
    assert.equal(runner.includes("testHooks"), false);
    assert.equal(runner.includes("LocalHeadlessWorkerTestHooks"), false);

    assert.doesNotThrow(() => assertClaimedRenderCleanupWiringComplete());
  });

  test("claimed render cleanup wiring gate rejects stripped executor source", () => {
    const sources = readClaimedRenderCleanupWiringSources();
    const stripped = {
      ...sources,
      executeClaimedRender: sources.executeClaimedRender.replace(
        /createClaimedRenderTerminalCleanupSession/g,
        "",
      ),
    };
    const validation = validateClaimedRenderCleanupWiring(stripped);
    assert.equal(validation.ok, false);
    if (validation.ok) return;
    assert.ok(validation.missing.includes("terminal_cleanup_session_factory"));
  });

  await testAsync("artifact cleanup release behavior fixtures", async () => {
    const behavior = await runClaimedRenderCleanupReleaseBehaviorFixtures();
    assert.equal(behavior.successPathNoOrphanCleanup, true);
    assert.equal(behavior.finalizeFailureSequenceCoherent, true);
    assert.equal(behavior.bindingFailureWiringPresent, true);
    assert.equal(behavior.deleteFailureSchedulesDurableWork, true);
    assert.equal(behavior.idempotentAbsentCleanupOk, true);
    assert.equal(behavior.projectSourceProtected, true);
    assert.equal(behavior.privacySafe, true);
  });

  test("binding validator: total hostile-input safe (no throw)", () => {
    const traps = [
      "getPrototypeOf",
      "ownKeys",
      "getOwnPropertyDescriptor",
      "get",
      "has",
    ] as const;
    for (const trap of traps) {
      const target = {};
      const hostile = new Proxy(target, {
        [trap]() {
          throw new Error(`hostile_${trap}_LEAK_https://evil.example/cap_token`);
        },
      });
      let threw = false;
      let result: ReturnType<typeof validateHeadlessArtifactObjectBinding>;
      try {
        result = validateHeadlessArtifactObjectBinding(hostile);
      } catch {
        threw = true;
        result = { ok: false, message: "threw" };
      }
      assert.equal(threw, false, `trap ${trap} must not throw`);
      assert.equal(result!.ok, false);
      if (!result!.ok) {
        assert.equal(result.message.includes("https://"), false);
        assert.equal(result.message.includes("cap_"), false);
        assert.equal(result.message.includes("LEAK"), false);
      }
    }

    const cyclic: Record<string, unknown> = { version: 1 };
    cyclic.self = cyclic;
    const cyclicResult = validateHeadlessArtifactObjectBinding(cyclic);
    assert.equal(cyclicResult.ok, false);

    const nullProto = Object.create(null);
    Object.assign(nullProto, {
      version: 1,
      jobId: "job_x",
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "memory-store",
        objectKey: "artifact/o/p/x",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: 1,
    });
    // Null prototype alone is allowed for plain objects; missing freeze path ok.
    const nullProtoResult = validateHeadlessArtifactObjectBinding(nullProto);
    assert.equal(nullProtoResult.ok, true);

    const proto = {
      jobId: "inherited_job",
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "memory-store",
        objectKey: "k",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: 1,
      version: 1,
    };
    const inheritedOnly = Object.create(proto);
    const inheritedResult = validateHeadlessArtifactObjectBinding(inheritedOnly);
    assert.equal(inheritedResult.ok, false);

    const oversized = validateHeadlessArtifactObjectBinding({
      version: 1,
      jobId: "j".repeat(10_000),
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "memory-store",
        objectKey: "k",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: 1,
    });
    assert.equal(oversized.ok, false);

    const badNum = validateHeadlessArtifactObjectBinding({
      version: 1,
      jobId: "job_x",
      attempt: 1.5,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "memory-store",
        objectKey: "k",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: Number.NaN,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: -1,
    });
    assert.equal(badNum.ok, false);
  });

  test("binding validator: exact-key + URL/capability rejection", () => {
    const badUrl = validateHeadlessArtifactObjectBinding({
      version: 1,
      jobId: "job_x",
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "https://evil.example",
        objectKey: "k",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: 1,
    });
    assert.equal(badUrl.ok, false);

    const extra = validateHeadlessArtifactObjectBinding({
      version: 1,
      jobId: "job_x",
      attempt: 1,
      ownerId: "o",
      projectId: "p",
      storageLocator: {
        kind: "object_storage",
        storeId: "memory-store",
        objectKey: "artifact/o/p/x",
      },
      contentDigest: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      mimeType: "video/webm",
      artifactFingerprint: `hra:sha256:${"b".repeat(64)}`,
      requestFingerprint: `hrr:sha256:${"c".repeat(64)}`,
      expiresAtMs: 1,
      capabilityToken: "cap_leak",
    });
    assert.equal(extra.ok, false);

    const nonSucceeded = assertStoredBindingStateRules({
      job: { state: "cancelled", artifact: null } as never,
      request: {} as never,
      binding: { version: 1 } as never,
    });
    assert.equal(nonSucceeded.ok, false);
  });

  await testAsync(
    "success CAS preserves object + binding; download-ready after workspace gone",
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
        idempotencyKey: "p33a-success-bind",
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 1);

      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "success CAS preserves object + binding",
      );
      const canonicalJob = canonicalRecord.canonicalJob;
      assert.equal(canonicalJob.state, "succeeded");
      assert.ok(canonicalRecord.artifactObjectBinding);
      const binding = canonicalRecord.artifactObjectBinding!;
      assert.equal(binding.jobId, jobId);
      assert.equal(binding.ownerId, ownerId);
      assert.equal(
        binding.contentDigest,
        canonicalJob.artifact!.contentDigest,
      );
      assert.equal(binding.byteLength, canonicalJob.artifact!.byteLength);

      const opened = await stack.storage.openOwnedObject(
        binding.storageLocator,
        ownerId,
      );
      assert.equal(opened.ok, true);
      if (!opened.ok) return;
      assert.equal(opened.value.metadata.contentDigest, binding.contentDigest);
      assert.equal(opened.value.metadata.byteLength, binding.byteLength);
      assert.equal(opened.value.metadata.mimeType, binding.mimeType);

      const publicView = toHeadlessPublicJobView(canonicalJob);
      assert.equal(publicView.artifactAvailable, true);
      const publicJson = JSON.stringify(publicView);
      assert.equal(publicJson.includes("storageLocator"), false);
      assert.equal(publicJson.includes("objectKey"), false);
      assert.equal(publicJson.includes("capability"), false);
      assert.equal(publicJson.includes("artifactObjectBinding"), false);

      // Workspace lease disposed — no path leakage in evidence.
      const evBlob = JSON.stringify(result.value.lastEvidence);
      assert.equal(evBlob.includes("footiebitz-headless"), false);
      assert.equal(evBlob.includes(binding.storageLocator.objectKey), false);
    },
  );

  await testAsync(
    "cancel after finalize / before succeeded CAS — terminal lock + orphan delete",
    async () => {
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
        idempotencyKey: "p33a-cancel-race",
        testHooks: {
          afterFinalizeBeforeSucceededCas: async () => {
            paused = true;
            await gate;
          },
        },
      });

      const runPromise = worker.processOnce(1);
      await waitUntil(() => paused);

      // Object finalized while paused.
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);

      const cancelled = await stack.service.cancelJob({
        requestContext: {},
        jobId,
      });
      assert.equal(cancelled.ok, true);
      if (!cancelled.ok) return;
      assert.equal(cancelled.value.state, "cancelled");

      release();
      const result = await runPromise;
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 0);

      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "cancel after finalize race",
      );
      const canonicalJob = canonicalRecord.canonicalJob;
      assert.equal(canonicalJob.state, "cancelled");
      assert.equal(canonicalRecord.artifactObjectBinding, null);
      assert.equal(canonicalJob.artifact, null);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 0);

      const publicView = toHeadlessPublicJobView(canonicalJob);
      assert.equal(publicView.artifactAvailable, false);
    },
  );

  await testAsync(
    "stale store version after finalize deletes orphan; no binding",
    async () => {
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
        idempotencyKey: "p33a-stale-race",
        testHooks: {
          afterFinalizeBeforeSucceededCas: async () => {
            paused = true;
            await gate;
          },
        },
      });

      const runPromise = worker.processOnce(1);
      await waitUntil(() => paused);
      assert.equal(stack.jobStore.testingBumpStoreVersion(jobId), true);
      release();
      const result = await runPromise;
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 0);

      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "stale store version after finalize",
      );
      assert.notEqual(canonicalRecord.canonicalJob!.state, "succeeded");
      assert.equal(canonicalRecord.artifactObjectBinding, null);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 0);
    },
  );

  await testAsync(
    "thrown CAS after finalize deletes orphan",
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
        idempotencyKey: "p33a-throw-cas",
        testHooks: {
          throwBeforeSucceededCas: true,
        },
      });
      const result = await worker.processOnce(1);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.succeeded, 0);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      assert.equal(stored.value.artifactObjectBinding, null);
      assert.equal(stack.storage.testingCountFinalizedArtifacts(ownerId), 0);
    },
  );

  await testAsync(
    "delete failure schedules durable cleanup (covered fully by test:headless-artifact-cleanup)",
    async () => {
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
        idempotencyKey: "p33a-delete-fail",
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
      await stack.service.cancelJob({ requestContext: {}, jobId });
      release();
      const result = await runPromise;
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.value.lastOrphanCleanup?.status, "scheduled");
      assert.equal(result.value.lastOrphanCleanup?.cleanupId, null);

      stack.storage.testingDeleteFail = false;
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "delete failure schedules durable cleanup",
      );
      assert.equal(canonicalRecord.canonicalJob!.state, "cancelled");
      assert.equal(canonicalRecord.artifactObjectBinding, null);
      assert.equal(stack.artifactCleanup.testingCountPendingForOwner(ownerId), 1);
      assert.ok(stack.storage.testingCountFinalizedArtifacts(ownerId) >= 1);
    },
  );

  await testAsync("duplicate delivery cannot create a second artifact object", async () => {
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
      idempotencyKey: "p33a-dup-delivery",
    });
    const first = await worker.processOnce(1);
    assert.equal(first.ok && first.value.succeeded === 1, true);
    const countAfterFirst = stack.storage.testingCountFinalizedArtifacts(ownerId);
    assert.equal(countAfterFirst, 1);

    // Re-enqueue a duplicate-style delivery for the same terminal job.
    const enqueued = await stack.queue.enqueue({
      deliveryId: `dup_${jobId}`,
      jobId,
      ownerId,
      attempt: 1,
      enqueuedAtMs: Date.now(),
    });
    assert.equal(enqueued.ok, true);
    const second = await worker.processOnce(1);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.value.succeeded, 0);
    assert.equal(
      stack.storage.testingCountFinalizedArtifacts(ownerId),
      countAfterFirst,
    );
  });

  await testAsync("cross-owner binding lookup/delete rejected", async () => {
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
      idempotencyKey: "p33a-cross-owner",
    });
    const result = await worker.processOnce(1);
    assert.equal(result.ok && result.value.succeeded === 1, true);
    const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
    assert.equal(stored.ok, true);
    if (!stored.ok) return;
    const binding = stored.value.artifactObjectBinding!;
    const crossGet = await stack.jobStore.getByJobIdAndOwner(jobId, "other-owner");
    assert.equal(crossGet.ok, false);
    const crossOpen = await stack.storage.openOwnedObject(
      binding.storageLocator,
      "other-owner",
    );
    assert.equal(crossOpen.ok, false);
    const crossDelete = await stack.storage.deleteObject(
      binding.storageLocator,
      "other-owner",
    );
    assert.equal(crossDelete.ok, false);
    assert.equal(
      stack.storage.testingHasObject(binding.storageLocator),
      true,
    );
  });

  await testAsync(
    "failed/cancelled jobs have no retrievable binding",
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
      const { stack, jobId, ownerId } = await seedAndCreateReferenceJob({
        fixture,
        idempotencyKey: "p33a-cancelled-no-bind",
      });
      const cancelled = await stack.service.cancelJob({
        requestContext: {},
        jobId,
      });
      assert.equal(cancelled.ok, true);
      const stored = await stack.jobStore.getByJobIdAndOwner(jobId, ownerId);
      assert.equal(stored.ok, true);
      if (!stored.ok) return;
      const canonicalRecord = requireCanonicalStoredJobRecord(
        stored.value,
        "failed/cancelled jobs have no retrievable binding",
      );
      assert.equal(canonicalRecord.artifactObjectBinding, null);
      assert.equal(
        toHeadlessPublicJobView(canonicalRecord.canonicalJob).artifactAvailable,
        false,
      );
    },
  );

  test("binding builder rejects digest/locator mismatch vs finalized metadata", () => {
    const built = buildValidatedArtifactObjectBinding({
      job: {
        state: "succeeded",
        jobId: "job_1",
        attempt: 1,
        ownership: { ownerId: "o", projectId: "p" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
        artifact: {
          contentDigest: `sha256:${"a".repeat(64)}`,
          byteLength: 10,
          mimeType: "video/webm",
          fingerprint: `hra:sha256:${"b".repeat(64)}`,
          expiresAtMs: 99,
        },
      } as never,
      request: {
        ownership: { ownerId: "o", projectId: "p" },
        requestFingerprint: `hrr:sha256:${"1".repeat(64)}`,
      } as never,
      artifact: {
        contentDigest: `sha256:${"a".repeat(64)}`,
        byteLength: 10,
        mimeType: "video/webm",
        fingerprint: `hra:sha256:${"b".repeat(64)}`,
        expiresAtMs: 99,
      } as never,
      finalized: {
        finalized: true,
        purpose: "artifact",
        ownerId: "o",
        projectId: "p",
        locator: {
          kind: "object_storage",
          storeId: "memory-store",
          objectKey: "artifact/o/p/x",
        },
        contentDigest: `sha256:${"d".repeat(64)}`,
        byteLength: 10,
        mimeType: "video/webm",
        expiresAtMs: 99,
      },
    });
    assert.equal(built.ok, false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
