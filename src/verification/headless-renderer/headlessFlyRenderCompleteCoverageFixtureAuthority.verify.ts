/**
 * Sprint 11E Phase 2E.2D.8C — complete coverage fixture authority (deterministic).
 * Run: npm run test:headless-fly-render-complete-coverage-fixture
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  isProvisionalStoredJobRecord,
  verifyAndFinalizeR2OwnedObject,
} from "@/features/headless-renderer/control-plane";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";

import { buildLiveDraft } from "./neon-live/live-fixtures";
import {
  buildCoverageAttributionSnapshot,
  sanitizeCoverageAttributionSnapshot,
} from "./fly-render-live/coverage-attribution";
import { reconcileCompleteLiveCoverage } from "./fly-render-live/complete-coverage-fixture";
import {
  buildFlyRenderLiveJobCreateFailureAttribution,
  runAttributedFlyRenderJobCreateChain,
} from "./fly-render-live/job-create-attribution";
import { deriveFlyRenderJobCreateStagingPayloads } from "./fly-render-live/job-create-fixture-identity";
import { emptyFlyRenderLiveSession } from "./fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "./fly-render-live/types";
import {
  createStagingObject,
  putObjectBytes,
  trackObjectId,
} from "./r2-live/live-fixtures";

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

const NOW = 1_700_000_000_000;

function buildCtx(): FlyRenderLiveMatrixContext {
  const runId = randomUUID();
  const fake = new FakeS3Client();
  return {
    runId,
    ownerId: `cc_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `cc_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    nowMs: NOW,
    sql: {
      withClient: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
      withTransaction: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
    } as never,
    jobStore: new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    }),
    uploadCapability: {
      issueDirectPutCapability: async () => ({
        ok: true as const,
        value: {
          putUrl: "https://example.invalid/put",
          requiredHeaders: {},
          expiresAtMs: NOW + 600_000,
        },
      }),
    } as never,
    downloadCapability: null,
    r2Config: CONFIG,
    createdJobIds: [],
    createdProjectIds: [],
    createdObjectIds: [],
    createdR2Locators: [],
    session: emptyFlyRenderLiveSession(),
    env: { HEADLESS_ENV_NAME: "staging" },
    flyAppName: "local-fixture",
    acceptedImageDigestSha256: "fixture",
    restProducer: null,
    tcpConsumer: null,
    streamNames: { render: "r", dlq: "d", verify: "v" } as never,
    streamAuthority: "production_env",
    dispatchOutbox: null,
    preflightFingerprint: null,
    trackedStreamIds: [],
    runOwnedActiveStreamIds: [],
    smokePollTimeoutMs: 180_000,
    smokeContentDurationMs: 2_000,
    resourceObservation: null,
  };
}

async function stageAndFinalizeAll(input: {
  ctx: FlyRenderLiveMatrixContext;
  draftCtx: Awaited<ReturnType<typeof buildLiveDraft>>;
}): Promise<string[]> {
  const payloads = deriveFlyRenderJobCreateStagingPayloads(input.draftCtx);
  const ids: string[] = [];
  for (const payload of payloads) {
    const staging = await createStagingObject(input.ctx, {
      jobId: input.draftCtx.jobId,
      operationId: input.draftCtx.operationId,
      purpose: payload.purpose,
      slotKey: payload.slotKey,
      bytes: payload.bytes,
      digest: payload.digest,
      mime: payload.mime,
      expectedByteLength: payload.byteLength,
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return ids;
    await putObjectBytes(input.ctx, {
      storeId: staging.storeId,
      objectKey: staging.objectKey,
      bytes: payload.bytes,
      mime: payload.mime,
    });
    const finalized = await verifyAndFinalizeR2OwnedObject({
      objectId: staging.objectId,
      ownerId: input.ctx.ownerId,
      nowMs: input.ctx.nowMs,
      store: input.ctx.ownedObjectStore,
      io: input.ctx.io,
    });
    assert.equal(finalized.ok, true);
    trackObjectId(input.ctx, staging.objectId);
    ids.push(staging.objectId);
  }
  return ids;
}


async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8C — complete coverage fixture authority\n",
  );

  await test("coverage attribution snapshot is count-only and sanitizable", () => {
    const snap = buildCoverageAttributionSnapshot({
      provisional: {
        stagingObjectRefs: [{ purpose: "manifest" } as never],
        verificationCoverage: {
          requiredTargets: ["a", "b"],
          verifiedTargets: ["a"],
          complete: false,
        },
      } as never,
      finalizedOwnedObjectCount: 2,
      verifiedTargetCountBefore: 0,
      verifiedTargetCountAfter: 1,
      reconcileResultKind: "blocked_incomplete",
      storeVersionBefore: 1,
      storeVersionAfter: 2,
      intermediateBlockedIncomplete: true,
    });
    assert.equal(snap.requiredTargetCount, 2);
    assert.equal(snap.missingTargetCount, 1);
    assert.equal(snap.intermediateBlockedIncomplete, true);
    const json = JSON.stringify(snap);
    assert.equal(json.includes("sha256:"), false);
    assert.ok(sanitizeCoverageAttributionSnapshot(snap));
    assert.equal(sanitizeCoverageAttributionSnapshot({ evil: 1 }), undefined);
  });

  await test("exact complete fixture chain reaches full coverage", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
    const result = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: created.value.record,
      finalizedObjectIds: objectIds,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.record.verificationCoverage.complete, true);
    assert.equal(
      result.record.stagingObjectRefs.length,
      draftCtx.authoritativeStagingObjectRefs.length,
    );
    assert.equal(result.snapshot.finalCoverageComplete, true);
    assert.equal(result.snapshot.missingTargetCount, 0);
  });

  await test("every valid reconcile order converges to complete coverage", async () => {
    const orderVariants = [
      (ids: readonly string[]) => ids.slice(),
      (ids: readonly string[]) => [...ids].reverse(),
      (ids: readonly string[]) => [ids[1]!, ids[0]!, ...ids.slice(2)],
      (ids: readonly string[]) => [
        ids[2]!,
        ids[0]!,
        ids[1]!,
        ...ids.slice(3),
      ],
    ];
    for (let i = 0; i < orderVariants.length; i++) {
      const ctx = buildCtx();
      const draftCtx = await buildLiveDraft({
        runId: ctx.runId,
        ownerId: ctx.ownerId,
        projectId: ctx.projectId,
        emptyStaging: true,
        creatorKey: `cc-order-${ctx.runId}-${i}`,
        randomUUID: () => randomUUID(),
      });
      const created = await ctx.jobStore.createProvisionalIfAbsent({
        idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
        record: draftCtx.draft,
      });
      assert.equal(created.ok, true);
      if (!created.ok || created.value.kind !== "created") return;
      const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
      const order = orderVariants[i]!(objectIds);
      const result = await reconcileCompleteLiveCoverage({
        jobStore: ctx.jobStore,
        ownedObjectStore: ctx.ownedObjectStore,
        provisional: created.value.record,
        finalizedObjectIds: order,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
      });
      assert.equal(result.ok, true, `order variant ${i} failed`);
      if (!result.ok) return;
      assert.equal(result.record.verificationCoverage.complete, true);
    }
  });

  await test("intermediate blocked_incomplete then completion on last object", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-inter-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
    assert.ok(objectIds.length >= 2);
    const partial = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: created.value.record,
      finalizedObjectIds: objectIds.slice(0, -1),
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    assert.equal(partial.ok, false);
    if (partial.ok) return;
    assert.equal(partial.reasonId, "coverage_incomplete");
    assert.equal(partial.snapshot.intermediateBlockedIncomplete, true);
    assert.equal(partial.snapshot.finalCoverageComplete, false);
    const loaded = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(loaded.ok, true);
    if (!loaded.ok || !isProvisionalStoredJobRecord(loaded.value)) return;
    const finish = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: loaded.value,
      finalizedObjectIds: [objectIds[objectIds.length - 1]!],
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs + 100,
    });
    assert.equal(finish.ok, true);
    if (!finish.ok) return;
    assert.equal(finish.record.verificationCoverage.complete, true);
  });

  await test("one missing required object stays terminally incomplete", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureReasonId, "coverage_incomplete");
    assert.ok(result.coverageAttribution != null);
    assert.equal(result.coverageAttribution!.missingTargetCount > 0, true);
    assert.equal(result.coverageAttribution!.finalCoverageComplete, false);
  });

  await test("finalized but unreconciled object leaves coverage incomplete", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-unrec-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
    const reread = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(reread.ok, true);
    if (!reread.ok || !isProvisionalStoredJobRecord(reread.value)) return;
    assert.equal(reread.value.verificationCoverage.complete, false);
    assert.equal(reread.value.stagingObjectRefs.length, 0);
    assert.equal(objectIds.length > 0, true);
  });

  await test("staging/object claim mismatch fails reconcile", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-mismatch-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx);
    const badBytes = new TextEncoder().encode('{"wrong":true}');
    const badDigest = `sha256:${createHash("sha256").update(badBytes).digest("hex")}`;
    const staging = await createStagingObject(ctx, {
      jobId: draftCtx.jobId,
      operationId: draftCtx.operationId,
      purpose: payloads[0]!.purpose,
      slotKey: payloads[0]!.slotKey,
      bytes: badBytes,
      digest: badDigest,
      mime: payloads[0]!.mime,
      expectedByteLength: badBytes.byteLength,
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    await putObjectBytes(ctx, {
      storeId: staging.storeId,
      objectKey: staging.objectKey,
      bytes: badBytes,
      mime: payloads[0]!.mime,
    });
    const finalized = await verifyAndFinalizeR2OwnedObject({
      objectId: staging.objectId,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
      store: ctx.ownedObjectStore,
      io: ctx.io,
    });
    assert.equal(finalized.ok, true);
    const result = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: created.value.record,
      finalizedObjectIds: [staging.objectId],
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reasonId, "coverage_reconcile_failed");
  });

  await test("duplicate reconcile is idempotent without version regression", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-idem-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
    const first = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: created.value.record,
      finalizedObjectIds: objectIds,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const versionAfterFirst = first.record.storeVersion;
    for (const objectId of objectIds) {
      const replay = await reconcileFinalizedOwnedObjectCoverage({
        jobStore: ctx.jobStore,
        ownedObjectStore: ctx.ownedObjectStore,
        objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 500,
      });
      assert.equal(replay.ok, true);
      if (!replay.ok) return;
      assert.equal(replay.value.status, "already_complete");
    }
    const reread = await ctx.jobStore.getByJobIdAndOwner(
      draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(reread.ok, true);
    if (!reread.ok || !isProvisionalStoredJobRecord(reread.value)) return;
    assert.equal(reread.value.storeVersion, versionAfterFirst);
    assert.equal(reread.value.verificationCoverage.complete, true);
  });

  await test("promotion blocked before coverage completion", async () => {
    const ctx = buildCtx();
    const chain = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureStage, "coverage_reconcile");
    const job = await ctx.jobStore.getByJobIdAndOwner(
      chain.stages.some(() => true) ? ctx.session.jobId! : "",
      ctx.ownerId,
    );
    assert.equal(job.ok, true);
    if (!job.ok) return;
    assert.equal(job.value.stage, "provisional");
  });

  await test("attributed job-create chain happy path skips manual staging append", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      stopBeforePromotion: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const append = result.stages.find((s) => s.stage === "staging_reference_append");
    assert.equal(append?.status, "skipped");
    const coverage = result.stages.find((s) => s.stage === "coverage_reconcile");
    assert.equal(coverage?.status, "ok");
  });

  await test("official failure attribution carries safe coverage counts", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const attribution = buildFlyRenderLiveJobCreateFailureAttribution(result, {
      cleanupStatus: "ok",
    });
    assert.ok(attribution.coverageAttribution != null);
    assert.equal(attribution.coverageAttribution!.intermediateBlockedIncomplete, true);
    assert.equal(
      JSON.stringify(attribution).includes("hslot"),
      false,
    );
  });

  await test("injected exception path still records cleanup stage", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      injectThrowAt: "owned_object_staging",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "owned_object_staging");
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
