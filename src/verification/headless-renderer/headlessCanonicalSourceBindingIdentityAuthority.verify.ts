/**
 * Sprint 11E Phase 2E.2D.8G.1 — canonical source-binding durable identity authority.
 * Run: npm run test:headless-canonical-source-binding-identity-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import {
  createProvisionalMaterializingRecord,
  deriveRequiredVerificationTargets,
  isCanonicalStoredJobRecord,
  materializeCanonicalFromFinalizedCoverage,
} from "@/features/headless-renderer/control-plane";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "@/features/headless-renderer/control-plane/types/owned-object-record";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import type { HeadlessAssetBundleV1 } from "@/features/headless-renderer/domain";
import { finalizeHeadlessAssetBundle, headlessSourceSlotKey } from "@/features/headless-renderer/domain";
import type { HeadlessStorageLocatorIdentity } from "@/features/headless-renderer/domain/headless-render.types";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import {
  resolveProviderBackedSourceBinding,
} from "@/features/headless-renderer/worker/runtime/source-binding-resolution";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./fly-render-live/smoke-workload";
import { deriveFlyRenderJobCreateStagingPayloads } from "./fly-render-live/job-create-fixture-identity";
import { runOwnedObjectStagingRecordChain } from "./fly-render-live/owned-object-staging-chain";
import type { StagedOwnedObjectRecord } from "./fly-render-live/owned-object-staging-chain";
import { runOwnedObjectFinalizeChain } from "./fly-render-live/owned-object-finalize-chain";
import { buildLiveDraft } from "./neon-live/live-fixtures";
import type { R2LiveMatrixContext } from "./r2-live/types";

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

const CLOCK = 1_700_000_200_000;

type IdentityFixture = {
  readonly ctx: R2LiveMatrixContext;
  readonly fake: FakeS3Client;
  readonly ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  readonly jobStore: MemoryHeadlessJobStoreAdapter;
  readonly staged: readonly StagedOwnedObjectRecord[];
  readonly unalignedBundle: HeadlessAssetBundleV1;
  readonly draftCtx: Awaited<ReturnType<typeof buildLiveDraft>>;
  readonly jobId: string;
  readonly operationId: string;
  readonly ownerId: string;
  readonly projectId: string;
};

function alignBundleToFinalizedStaging(input: {
  readonly bundle: HeadlessAssetBundleV1;
  readonly manifest: import("@/features/export/domain").ExportManifestV3;
  readonly staged: readonly StagedOwnedObjectRecord[];
  readonly payloads: readonly import("./fly-render-live/job-create-fixture-identity").FlyRenderJobCreateStagingPayload[];
}): HeadlessAssetBundleV1 {
  const locatorBySlot = new Map<string, HeadlessStorageLocatorIdentity>();
  for (let i = 0; i < input.payloads.length; i += 1) {
    const payload = input.payloads[i]!;
    const staged = input.staged[i]!;
    if (payload.purpose !== "asset_bytes" || payload.slotKey == null) continue;
    locatorBySlot.set(payload.slotKey, {
      kind: "object_storage",
      storeId: staged.storeId,
      objectKey: staged.objectKey,
    });
  }
  const assets = input.bundle.assets.map((asset) => {
    const slotKey = headlessSourceSlotKey(asset.sourceIdentity);
    const locator = locatorBySlot.get(slotKey);
    if (locator == null) return asset;
    return { ...asset, storageLocator: locator };
  });
  const rebuilt = finalizeHeadlessAssetBundle({
    bundleId: input.bundle.bundleId,
    manifest: input.manifest,
    assets,
  });
  if (!rebuilt.ok) throw new Error("bundle realign failed");
  return rebuilt.bundle;
}

async function buildIdentityFixture(): Promise<IdentityFixture> {
  const runId = randomUUID();
  const draftCtx = await buildLiveDraft({
    runId,
    ownerId: `owner-${runId.slice(0, 8)}`,
  });
  buildHeadlessFlyRenderLiveSmokeBoundary();
  const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx);
  const fake = new FakeS3Client();
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const jobStore = new MemoryHeadlessJobStoreAdapter();
  const ctx: R2LiveMatrixContext = {
    runId,
    ownerId: draftCtx.ownerId,
    projectId: draftCtx.projectId,
    nowMs: CLOCK,
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    }),
    ownedObjectStore,
    jobStore,
    createdObjectIds: [],
    createdJobIds: [],
    createdProjectIds: [],
    createdR2Locators: [],
  };

  const staged = await runOwnedObjectStagingRecordChain({
    ctx,
    payloads,
    jobId: draftCtx.jobId,
    operationId: draftCtx.operationId,
  });
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error("staging failed");

  const finalized = await runOwnedObjectFinalizeChain({
    ctx,
    staged: staged.staged,
    payloads,
  });
  assert.equal(finalized.ok, true);
  if (!finalized.ok) throw new Error("finalize failed");

  return {
    ctx,
    fake,
    ownedObjectStore,
    jobStore,
    staged: staged.staged,
    unalignedBundle: draftCtx.seeded.bundle,
    draftCtx,
    jobId: draftCtx.jobId,
    operationId: draftCtx.operationId,
    ownerId: draftCtx.ownerId,
    projectId: draftCtx.projectId,
  };
}

async function seedProvisionalWithCoverage(input: {
  readonly fixture: IdentityFixture;
  readonly draft: Awaited<ReturnType<typeof buildLiveDraft>>;
}): Promise<void> {
  const targets = deriveRequiredVerificationTargets(input.draft.draft.snapshotClaim);
  const provisional = createProvisionalMaterializingRecord({
    jobId: input.fixture.jobId,
    ownerId: input.fixture.ownerId,
    projectId: input.fixture.projectId,
    operationId: input.fixture.operationId,
    creatorIdempotencyKey: input.draft.draft.creatorIdempotencyKey,
    idempotencyAuthorityKey: input.draft.draft.idempotencyAuthorityKey,
    requestedRendererProfile: input.draft.draft.requestedRendererProfile,
    requestedRendererBuildId: input.draft.draft.requestedRendererBuildId,
    snapshotClaim: input.draft.draft.snapshotClaim,
    stagingObjectRefs: input.draft.draft.stagingObjectRefs,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    expiresAtMs: CLOCK + 7_200_000,
  });
  assert.equal(provisional.ok, true);
  if (!provisional.ok) throw new Error(provisional.message);

  const created = await input.fixture.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: input.draft.draft.idempotencyAuthorityKey,
    record: {
      ...provisional.record,
      verificationCoverage: {
        requiredTargets: targets,
        verifiedTargets: [...targets],
        complete: true,
      },
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("provisional create failed");
}

function createStorage(input: {
  readonly fixture: IdentityFixture;
  readonly allowedLocators: readonly HeadlessStorageLocatorIdentity[];
}) {
  return createR2JobBoundStorageAdapter({
    r2: input.fixture.ctx.io,
    ownedObjectStore: input.fixture.ownedObjectStore,
    jobStore: input.fixture.jobStore,
    context: {
      ownerId: input.fixture.ownerId,
      projectId: input.fixture.projectId,
      jobId: input.fixture.jobId,
      operationId: input.fixture.operationId,
      attempt: 1,
      environmentNamespace: "test",
      artifactExpiresAtMs: CLOCK + 600_000,
      allowedSourceLocators: input.allowedLocators,
      nowMs: () => CLOCK,
    },
  });
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8G.1 — canonical source-binding durable identity authority\n",
  );

  await test("locator drift: unaligned canonical bundle fails source binding", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });

    const payloads = deriveFlyRenderJobCreateStagingPayloads(fixture.draftCtx);
    const driftedBundle = alignBundleToFinalizedStaging({
      bundle: fixture.unalignedBundle,
      manifest: fixture.draftCtx.manifest,
      staged: fixture.staged,
      payloads,
    });
    const driftedAssets = driftedBundle.assets.map((asset, index) => ({
      ...asset,
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "assets" as const,
        objectKey: `client/upload/locator/drift/${index}/${randomUUID()}`,
      },
    }));
    const drifted = finalizeHeadlessAssetBundle({
      bundleId: driftedBundle.bundleId,
      manifest: fixture.draftCtx.manifest,
      assets: driftedAssets,
    });
    assert.equal(drifted.ok, true);
    if (!drifted.ok) throw new Error("drift bundle failed");

    const allowed = drifted.bundle.assets.map((a) => a.storageLocator);
    const storage = createStorage({ fixture, allowedLocators: allowed });
    const opened = await storage.openOwnedObject(
      allowed[0]!,
      fixture.ownerId,
      CLOCK,
    );
    const attribution = storage.consumeLastSourceBindingAttribution();
    assert.equal(opened.ok, false);
    assert.equal(attribution?.sourceBindingSubstage, "owned_object_load");
    assert.equal(attribution?.sourceBindingResultClass, "record_missing");
  });

  await test("materialize rebinds canonical locators to finalized owned-object authority", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });

    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) {
      throw new Error(`${materialized.issues[0]?.code}: ${materialized.issues[0]?.message}`);
    }

    const canonicalLocators = materialized.value.canonicalRequest.assetBundle.assets.map(
      (a) => a.storageLocator,
    );
    const listed = await fixture.ownedObjectStore.listByJobIdAndOwner({
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("list failed");
    const finalizedAssets = listed.value
      .map((s) => s.record)
      .filter(
        (r): r is HeadlessFinalizedOwnedObjectRecordV1 =>
          r.stage === "finalized" && r.purpose === "asset_bytes",
      );

    for (const locator of canonicalLocators) {
      const match = finalizedAssets.some(
        (row) =>
          row.storeId === locator.storeId && row.objectKey === locator.objectKey,
      );
      assert.equal(match, true, "canonical locator must match finalized row");
    }

    assert.equal(
      materialized.value.canonicalRequest.assetBundle.fingerprint,
      fixture.draftCtx.draft.snapshotClaim.assetBundleFingerprintClaim,
    );
  });

  await test("promotion→source-open→materialize full provider-shaped chain", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });

    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error("materialize failed");

    const promoted = await fixture.jobStore.promoteProvisionalToCanonical({
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      expectedStoreVersion: materialized.value.provisional.storeVersion,
      expectedOperationId: fixture.operationId,
      canonicalJob: materialized.value.canonicalJob,
      canonicalRequest: materialized.value.canonicalRequest,
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok) throw new Error("promote failed");
    assert.equal(promoted.value.kind, "updated");

    const allowed = materialized.value.canonicalRequest.assetBundle.assets.map(
      (a) => a.storageLocator,
    );
    const storage = createStorage({ fixture, allowedLocators: allowed });
    const workspace = createHeadlessWorkerWorkspace({
      jobId: fixture.jobId,
      attempt: 1,
    });
    const materializeAssets = await materializeOwnedAssets({
      storage,
      ownerId: fixture.ownerId,
      bundle: materialized.value.canonicalRequest.assetBundle,
      workspace,
      nowMs: CLOCK,
      maxTotalAssetBytes: 32 * 1024 * 1024,
    });
    workspace.cleanup();
    assert.equal(materializeAssets.ok, true);
    if (!materializeAssets.ok) throw new Error(materializeAssets.message);
  });

  await test("exact replay resolves same objects without duplicate bindings", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });

    const first = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    const second = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error("materialize replay failed");
    assert.deepEqual(
      first.value.canonicalRequest.assetBundle.assets.map((a) => a.storageLocator),
      second.value.canonicalRequest.assetBundle.assets.map((a) => a.storageLocator),
    );
    assert.equal(
      first.value.canonicalRequest.assetBundle.fingerprint,
      second.value.canonicalRequest.assetBundle.fingerprint,
    );
  });

  await test("wrong operationId at resolution → record_missing with attribution", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });
    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error("materialize failed");
    const locator =
      materialized.value.canonicalRequest.assetBundle.assets[0]!.storageLocator;
    const resolved = await resolveProviderBackedSourceBinding({
      locator,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
      ownedObjectStore: fixture.ownedObjectStore,
      context: {
        ownerId: fixture.ownerId,
        projectId: fixture.projectId,
        jobId: fixture.jobId,
        operationId: randomUUID(),
        attempt: 1,
        allowedSourceLocators: [locator],
        expectedPurpose: "asset_bytes",
      },
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.attribution.sourceBindingResultClass, "record_missing");
  });

  await test("incomplete coverage blocks materialize", async () => {
    const fixture = await buildIdentityFixture();
    const targets = deriveRequiredVerificationTargets(
      fixture.draftCtx.draft.snapshotClaim,
    );
    const provisional = createProvisionalMaterializingRecord({
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      projectId: fixture.projectId,
      operationId: fixture.operationId,
      creatorIdempotencyKey: fixture.draftCtx.draft.creatorIdempotencyKey,
      idempotencyAuthorityKey: fixture.draftCtx.draft.idempotencyAuthorityKey,
      requestedRendererProfile: fixture.draftCtx.draft.requestedRendererProfile,
      requestedRendererBuildId: fixture.draftCtx.draft.requestedRendererBuildId,
      snapshotClaim: fixture.draftCtx.draft.snapshotClaim,
      stagingObjectRefs: fixture.draftCtx.draft.stagingObjectRefs,
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      expiresAtMs: CLOCK + 7_200_000,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) throw new Error(provisional.message);
    await fixture.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: fixture.draftCtx.draft.idempotencyAuthorityKey,
      record: {
        ...provisional.record,
        verificationCoverage: {
          requiredTargets: targets,
          verifiedTargets: targets.slice(0, -1),
          complete: false,
        },
      },
    });
    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, false);
  });

  await test("concurrent promotion converges without duplicate canonical rows", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });
    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error("materialize failed");

    const promoteInput = {
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      expectedStoreVersion: materialized.value.provisional.storeVersion,
      expectedOperationId: fixture.operationId,
      canonicalJob: materialized.value.canonicalJob,
      canonicalRequest: materialized.value.canonicalRequest,
    };
    const [a, b] = await Promise.all([
      fixture.jobStore.promoteProvisionalToCanonical(promoteInput),
      fixture.jobStore.promoteProvisionalToCanonical(promoteInput),
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) throw new Error("promote failed");
    const kinds = new Set([a.value.kind, b.value.kind]);
    assert.equal(kinds.has("updated") || kinds.has("already_promoted"), true);
    const loaded = await fixture.jobStore.getByJobIdAndOwner(
      fixture.jobId,
      fixture.ownerId,
    );
    assert.equal(loaded.ok, true);
    if (!loaded.ok) throw new Error("load failed");
    assert.equal(isCanonicalStoredJobRecord(loaded.value), true);
  });

  await test("promote after materialize preserves rebound locators on canonical row", async () => {
    const fixture = await buildIdentityFixture();
    await seedProvisionalWithCoverage({ fixture, draft: fixture.draftCtx });

    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore: fixture.jobStore,
      ownedObjectStore: fixture.ownedObjectStore,
      io: fixture.ctx.io,
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error("materialize failed");

    const promoted = await fixture.jobStore.promoteProvisionalToCanonical({
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
      expectedStoreVersion: materialized.value.provisional.storeVersion,
      expectedOperationId: fixture.operationId,
      canonicalJob: materialized.value.canonicalJob,
      canonicalRequest: materialized.value.canonicalRequest,
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok || promoted.value.kind !== "updated") {
      throw new Error("promote failed");
    }

    const listed = await fixture.ownedObjectStore.listByJobIdAndOwner({
      jobId: fixture.jobId,
      ownerId: fixture.ownerId,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("list failed");
    const canonicalLocator =
      promoted.value.record.canonicalRequest.assetBundle.assets[0]!.storageLocator;
    const finalized = listed.value
      .map((s) => s.record)
      .find(
        (r) =>
          r.stage === "finalized" &&
          r.purpose === "asset_bytes" &&
          r.objectKey === canonicalLocator.objectKey,
      );
    assert.ok(finalized != null);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
