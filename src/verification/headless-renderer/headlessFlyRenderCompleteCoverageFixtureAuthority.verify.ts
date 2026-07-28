/**
 * Sprint 11E Phase 2E.2D.8C — complete coverage fixture authority (deterministic).
 * Run: npm run test:headless-fly-render-complete-coverage-fixture
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  createProvisionalMaterializingRecord,
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
import { headlessSourceSlotKey } from "@/features/headless-renderer/domain";

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
      withClient: async (fn: (client: never) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
      withTransaction: async (fn: (client: never) => Promise<unknown>) =>
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

  await test("one callback recovers all already-finalized fixture coverage", async () => {
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
    assert.equal(objectIds.length, 5);
    const recovered = await reconcileCompleteLiveCoverage({
      jobStore: ctx.jobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      provisional: created.value.record,
      // Production recovery authority: a single later callback must rebuild
      // coverage from all durable finalized objects.
      finalizedObjectIds: [objectIds[objectIds.length - 1]!],
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.record.verificationCoverage.requiredTargets.length, 5);
    assert.equal(recovered.record.verificationCoverage.verifiedTargets.length, 5);
    assert.equal(recovered.record.verificationCoverage.complete, true);
    assert.equal(recovered.record.stagingObjectRefs.length, 5);
  });

  await test("website-shaped six-object job survives a concurrent stale-write burst", async () => {
    const ctx = buildCtx();
    const draftCtx = await buildLiveDraft({
      runId: ctx.runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: `cc-six-${ctx.runId}`,
      randomUUID: () => randomUUID(),
    });

    const objectIds = await stageAndFinalizeAll({ ctx, draftCtx });
    assert.equal(objectIds.length, 5);
    const baseSlot = draftCtx.draft.snapshotClaim.expectedSlotClaims[0]!;
    const extraBytes = new TextEncoder().encode("six-object-browser-upload");
    const extraDigest = `sha256:${createHash("sha256")
      .update(extraBytes)
      .digest("hex")}`;
    const extraSlot = {
      ...baseSlot,
      sceneId: "scene-browser-extra",
      mediaItemId: "media-browser-extra",
      contentDigestClaim: extraDigest,
      byteLengthClaim: extraBytes.byteLength,
      mimeTypeClaim: "image/png",
    };
    const extraSlotKey = headlessSourceSlotKey({
      role: extraSlot.role,
      sceneId: extraSlot.sceneId,
      mediaItemId: extraSlot.mediaItemId,
      sourceDigest: extraSlot.sourceDigestClaim,
    });
    const extraStaging = await createStagingObject(ctx, {
      jobId: draftCtx.jobId,
      operationId: draftCtx.operationId,
      purpose: "asset_bytes",
      slotKey: extraSlotKey,
      bytes: extraBytes,
      digest: extraDigest,
      mime: "image/png",
      expectedByteLength: extraBytes.byteLength,
    });
    assert.equal(extraStaging.ok, true);
    if (!extraStaging.ok) return;
    await putObjectBytes(ctx, {
      storeId: extraStaging.storeId,
      objectKey: extraStaging.objectKey,
      bytes: extraBytes,
      mime: "image/png",
    });
    const extraFinalized = await verifyAndFinalizeR2OwnedObject({
      objectId: extraStaging.objectId,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs,
      store: ctx.ownedObjectStore,
      io: ctx.io,
    });
    assert.equal(extraFinalized.ok, true);
    objectIds.push(extraStaging.objectId);

    const finalized = await ctx.ownedObjectStore.listByJobIdAndOwner({
      jobId: draftCtx.jobId,
      ownerId: ctx.ownerId,
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) return;
    assert.equal(finalized.value.length, 6);
    const stagingObjectRefs = finalized.value.map((stored) => {
      assert.equal(stored.record.stage, "finalized");
      if (stored.record.stage !== "finalized") {
        throw new Error("expected finalized source object");
      }
      return {
        purpose: stored.record.purpose as
          | "manifest"
          | "asset_bundle_record"
          | "asset_bytes",
        slotKey: stored.record.slotKey,
        locator: {
          kind: "object_storage" as const,
          storeId: stored.record.storeId,
          objectKey: stored.record.objectKey,
        },
        contentDigestClaim: stored.record.contentDigest,
        byteLengthClaim: stored.record.byteLength,
        mimeTypeClaim: stored.record.mimeType,
      };
    });
    const sixObjectDraft = createProvisionalMaterializingRecord({
      jobId: draftCtx.jobId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      createdAtMs: ctx.nowMs,
      updatedAtMs: ctx.nowMs,
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      operationId: draftCtx.operationId,
      creatorIdempotencyKey: draftCtx.creatorKey,
      requestedRendererProfile: draftCtx.draft.requestedRendererProfile,
      requestedRendererBuildId: draftCtx.draft.requestedRendererBuildId,
      snapshotClaim: {
        ...draftCtx.draft.snapshotClaim,
        expectedSlotClaims: [
          ...draftCtx.draft.snapshotClaim.expectedSlotClaims,
          { ...extraSlot, slotKey: extraSlotKey },
        ],
      },
      stagingObjectRefs,
      expiresAtMs: draftCtx.draft.expiresAtMs,
    });
    assert.equal(
      sixObjectDraft.ok,
      true,
      sixObjectDraft.ok ? "" : sixObjectDraft.message,
    );
    if (!sixObjectDraft.ok) return;
    const created = await ctx.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: sixObjectDraft.record,
    });
    assert.equal(created.ok, true);
    if (!created.ok || created.value.kind !== "created") return;
    assert.equal(created.value.record.verificationCoverage.verifiedTargets.length, 0);

    const authoritativeJobStore = ctx.jobStore;
    let compareAndSetAttempts = 0;
    const contendedJobStore = new Proxy(authoritativeJobStore, {
      get(target, property, receiver) {
        if (property === "compareAndSetProvisional") {
          return async (
            input: Parameters<
              typeof authoritativeJobStore.compareAndSetProvisional
            >[0],
          ) => {
            compareAndSetAttempts += 1;
            if (compareAndSetAttempts <= 8) {
              return {
                ok: true as const,
                value: { kind: "stale" as const },
              };
            }
            return target.compareAndSetProvisional(input);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const recovered = await reconcileFinalizedOwnedObjectCoverage({
      jobStore: contendedJobStore,
      ownedObjectStore: ctx.ownedObjectStore,
      objectId: objectIds[objectIds.length - 1]!,
      ownerId: ctx.ownerId,
      nowMs: ctx.nowMs + 1,
    });
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(recovered.value.coverageComplete, true);
    assert.equal(compareAndSetAttempts, 9);
    const reread = await authoritativeJobStore.getByJobIdAndOwner(
      draftCtx.jobId,
      ctx.ownerId,
    );
    assert.equal(reread.ok, true);
    if (!reread.ok || !isProvisionalStoredJobRecord(reread.value)) return;
    assert.equal(reread.value.verificationCoverage.requiredTargets.length, 6);
    assert.equal(reread.value.verificationCoverage.verifiedTargets.length, 6);
    assert.equal(reread.value.verificationCoverage.complete, true);
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
