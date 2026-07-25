/**
 * Sprint 11E Phase 2E.2D.8G — provider-backed source binding resolution authority.
 * Run: npm run test:headless-source-binding-resolution-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { createR2JobBoundStorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-job-bound-storage.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessFinalizedOwnedObjectRecordV1 } from "@/features/headless-renderer/control-plane/types/owned-object-record";
import {
  FakeDeleteObjectCommand,
  FakeS3Client,
} from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import type { HeadlessAssetBundleV1 } from "@/features/headless-renderer/domain";
import { finalizeHeadlessAssetBundle, headlessSourceSlotKey } from "@/features/headless-renderer/domain";
import type { HeadlessStorageLocatorIdentity } from "@/features/headless-renderer/domain/headless-render.types";
import { materializeOwnedAssets } from "@/features/headless-renderer/worker/assets/materialize-owned-assets";
import { createHeadlessWorkerWorkspace } from "@/features/headless-renderer/worker/assets/workspace";
import {
  executionAttributionToSafeTelemetryFacts,
  sanitizeExecutionAttributionFromTelemetryFacts,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import {
  buildSourceBindingAttribution,
  resolveProviderBackedSourceBinding,
  sanitizeSourceBindingAttributionFromTelemetryFacts,
  sourceBindingAttributionToTelemetryFacts,
  type SourceBindingAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/source-binding-resolution";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./fly-render-live/smoke-workload";
import { deriveFlyRenderJobCreateStagingPayloads } from "./fly-render-live/job-create-fixture-identity";
import { runOwnedObjectStagingRecordChain } from "./fly-render-live/owned-object-staging-chain";
import type { StagedOwnedObjectRecord } from "./fly-render-live/owned-object-staging-chain";
import { runOwnedObjectFinalizeChain } from "./fly-render-live/owned-object-finalize-chain";
import { buildLiveCanonicalPair, buildLiveDraft } from "./neon-live/live-fixtures";
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

const CLOCK = 1_700_000_100_000;

type ProviderFixture = {
  readonly ctx: R2LiveMatrixContext;
  readonly fake: FakeS3Client;
  readonly ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  readonly storage: ReturnType<typeof createR2JobBoundStorageAdapter>;
  readonly allowedLocators: readonly HeadlessStorageLocatorIdentity[];
  readonly assetLocators: readonly HeadlessStorageLocatorIdentity[];
  readonly bundle: HeadlessAssetBundleV1;
  readonly jobId: string;
  readonly operationId: string;
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

async function buildProviderFixture(input?: {
  readonly omitFinalize?: boolean;
  readonly mutateFinalized?: (
    record: HeadlessFinalizedOwnedObjectRecordV1,
  ) => HeadlessFinalizedOwnedObjectRecordV1;
}): Promise<ProviderFixture> {
  const runId = randomUUID();
  const draftCtx = await buildLiveDraft({
    runId,
    ownerId: `owner-${runId.slice(0, 8)}`,
  });
  buildHeadlessFlyRenderLiveSmokeBoundary();
  assert.ok(draftCtx.seeded.bundle.assets.length > 0);

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

  if (!input?.omitFinalize) {
    const finalized = await runOwnedObjectFinalizeChain({
      ctx,
      staged: staged.staged,
      payloads,
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) throw new Error("finalize failed");
  }

  if (input?.mutateFinalized != null) {
    const listed = await ownedObjectStore.listByJobIdAndOwner({
      jobId: draftCtx.jobId,
      ownerId: draftCtx.ownerId,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) throw new Error("list failed");
    const internal = ownedObjectStore as unknown as {
      byId: Map<string, { record: HeadlessFinalizedOwnedObjectRecordV1 }>;
    };
    for (const stored of listed.value) {
      if (stored.record.stage !== "finalized") continue;
      if (stored.record.purpose !== "asset_bytes") continue;
      const entry = internal.byId.get(stored.record.objectId);
      if (entry != null) {
        entry.record = input.mutateFinalized(stored.record);
      }
    }
  }

  const canonical = buildLiveCanonicalPair(
    draftCtx.manifest,
    alignBundleToFinalizedStaging({
      bundle: draftCtx.seeded.bundle,
      manifest: draftCtx.manifest,
      staged: staged.staged,
      payloads,
    }),
    draftCtx.draft,
  );
  assert.equal(canonical.ok, true);
  if (!canonical.ok) throw new Error("canonical pair failed");

  const allowedLocators = canonical.request.assetBundle.assets.map(
    (asset) => asset.storageLocator,
  );

  const storage = createR2JobBoundStorageAdapter({
    r2: ctx.io,
    ownedObjectStore,
    jobStore,
    context: {
      ownerId: draftCtx.ownerId,
      projectId: draftCtx.projectId,
      jobId: draftCtx.jobId,
      operationId: draftCtx.operationId,
      attempt: 1,
      environmentNamespace: "test",
      artifactExpiresAtMs: CLOCK + 600_000,
      allowedSourceLocators: allowedLocators,
      nowMs: () => CLOCK,
    },
  });

  return {
    ctx,
    fake,
    ownedObjectStore,
    storage,
    allowedLocators,
    assetLocators: allowedLocators,
    bundle: canonical.request.assetBundle,
    jobId: draftCtx.jobId,
    operationId: draftCtx.operationId,
  };
}

function consumeBinding(
  storage: ReturnType<typeof createR2JobBoundStorageAdapter>,
): SourceBindingAttributionSnapshot | null {
  return storage.consumeLastSourceBindingAttribution();
}

async function openFirstAsset(fixture: ProviderFixture) {
  const locator = fixture.assetLocators[0]!;
  const opened = await fixture.storage.openOwnedObject(
    locator,
    fixture.ctx.ownerId,
    CLOCK,
  );
  return {
    opened,
    attribution: consumeBinding(fixture.storage),
  };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8G — provider-backed source binding resolution authority\n",
  );

  await test("coherent provider-backed binding resolves through openOwnedObject", async () => {
    const fixture = await buildProviderFixture();
    const { opened, attribution } = await openFirstAsset(fixture);
    assert.equal(opened.ok, true);
    assert.equal(attribution?.sourceBindingSubstage, "source_stream_ready");
  });

  await test("coherent binding materializes owned assets via R2 job-bound adapter", async () => {
    const fixture = await buildProviderFixture();
    const workspace = createHeadlessWorkerWorkspace({
      jobId: fixture.jobId,
      attempt: 1,
    });
    const materialized = await materializeOwnedAssets({
      storage: fixture.storage,
      ownerId: fixture.ctx.ownerId,
      bundle: fixture.bundle,
      workspace,
      nowMs: CLOCK,
      maxTotalAssetBytes: 32 * 1024 * 1024,
    });
    workspace.cleanup();
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error(materialized.message);
    assert.ok(materialized.assets.length > 0);
  });

  await test("missing durable binding → owned_object_load / record_missing", async () => {
    const fixture = await buildProviderFixture({ omitFinalize: true });
    const { opened, attribution } = await openFirstAsset(fixture);
    assert.equal(opened.ok, false);
    assert.equal(attribution?.sourceBindingSubstage, "owned_object_load");
    assert.equal(attribution?.sourceBindingResultClass, "record_missing");
    assert.equal(attribution?.safeControlPlaneCode, "MANIFEST_NOT_FOUND");
  });

  await test("live failure regression: allowlisted locators without finalized rows", async () => {
    const fixture = await buildProviderFixture({ omitFinalize: true });
    const resolved = await resolveProviderBackedSourceBinding({
      locator: fixture.assetLocators[0]!,
      ownerId: fixture.ctx.ownerId,
      nowMs: CLOCK,
      ownedObjectStore: fixture.ownedObjectStore,
      context: {
        ownerId: fixture.ctx.ownerId,
        projectId: fixture.ctx.projectId,
        jobId: fixture.jobId,
        operationId: fixture.operationId,
        attempt: 1,
        allowedSourceLocators: fixture.allowedLocators,
        expectedPurpose: "asset_bytes",
      },
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.attribution.sourceBindingSubstage, "owned_object_load");
    assert.equal(resolved.attribution.sourceBindingResultClass, "record_missing");
  });

  await test("wrong owner → authority_rejected", async () => {
    const fixture = await buildProviderFixture();
    const resolved = await resolveProviderBackedSourceBinding({
      locator: fixture.assetLocators[0]!,
      ownerId: "wrong-owner",
      nowMs: CLOCK,
      ownedObjectStore: fixture.ownedObjectStore,
      context: {
        ownerId: fixture.ctx.ownerId,
        projectId: fixture.ctx.projectId,
        jobId: fixture.jobId,
        operationId: fixture.operationId,
        attempt: 1,
        allowedSourceLocators: fixture.allowedLocators,
        expectedPurpose: "asset_bytes",
      },
    });
    assert.equal(resolved.ok, false);
    assert.equal(
      resolved.attribution.sourceBindingResultClass,
      "authority_rejected",
    );
  });

  await test("wrong operationId → record_missing", async () => {
    const fixture = await buildProviderFixture();
    const resolved = await resolveProviderBackedSourceBinding({
      locator: fixture.assetLocators[0]!,
      ownerId: fixture.ctx.ownerId,
      nowMs: CLOCK,
      ownedObjectStore: fixture.ownedObjectStore,
      context: {
        ownerId: fixture.ctx.ownerId,
        projectId: fixture.ctx.projectId,
        jobId: fixture.jobId,
        operationId: randomUUID(),
        attempt: 1,
        allowedSourceLocators: fixture.allowedLocators,
        expectedPurpose: "asset_bytes",
      },
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.attribution.sourceBindingResultClass, "record_missing");
  });

  await test("forged locator outside allowlist → binding_missing", async () => {
    const fixture = await buildProviderFixture();
    const forged: HeadlessStorageLocatorIdentity = {
      kind: "object_storage",
      storeId: "assets",
      objectKey: "forged/object/key",
    };
    const resolved = await resolveProviderBackedSourceBinding({
      locator: forged,
      ownerId: fixture.ctx.ownerId,
      nowMs: CLOCK,
      ownedObjectStore: fixture.ownedObjectStore,
      context: {
        ownerId: fixture.ctx.ownerId,
        projectId: fixture.ctx.projectId,
        jobId: fixture.jobId,
        operationId: fixture.operationId,
        attempt: 1,
        allowedSourceLocators: fixture.allowedLocators,
        expectedPurpose: "asset_bytes",
      },
    });
    assert.equal(resolved.ok, false);
    assert.equal(resolved.attribution.sourceBindingResultClass, "binding_missing");
  });

  await test("provisional staging row does not satisfy source open", async () => {
    const fixture = await buildProviderFixture({ omitFinalize: true });
    const { attribution } = await openFirstAsset(fixture);
    assert.equal(attribution?.sourceBindingObjectStageClass, "staging");
  });

  await test("purpose mismatch → owned_object_coherence / record_incoherent", async () => {
    const fixture = await buildProviderFixture({
      mutateFinalized: (record) => ({ ...record, purpose: "manifest" }),
    });
    const { opened, attribution } = await openFirstAsset(fixture);
    assert.equal(opened.ok, false);
    assert.equal(attribution?.sourceBindingSubstage, "owned_object_coherence");
    assert.equal(attribution?.sourceBindingResultClass, "record_incoherent");
  });

  await test("digest mismatch → owned_object_coherence", async () => {
    const fixture = await buildProviderFixture({
      mutateFinalized: (record) => ({
        ...record,
        contentDigest: `sha256:${"f".repeat(64)}`,
        expectedContentDigestClaim: record.expectedContentDigestClaim,
      }),
    });
    const { opened, attribution } = await openFirstAsset(fixture);
    assert.equal(opened.ok, false);
    assert.equal(attribution?.sourceBindingDigestClass, "mismatch");
  });

  await test("stream unavailable when R2 bytes deleted", async () => {
    const fixture = await buildProviderFixture();
    const locator = fixture.assetLocators[0]!;
    await fixture.fake.send(
      FakeDeleteObjectCommand({
        Bucket: locator.storeId === "assets" ? "assets-bucket" : "artifacts-bucket",
        Key: locator.objectKey,
      }),
    );
    const { opened, attribution } = await openFirstAsset(fixture);
    assert.equal(opened.ok, false);
    assert.equal(attribution?.sourceBindingSubstage, "source_stream_open");
    assert.equal(attribution?.sourceStreamCapabilityClass, "unavailable");
  });

  await test("attribution telemetry is privacy-safe", () => {
    const snapshot = buildSourceBindingAttribution({
      substage: "owned_object_load",
      resultClass: "record_missing",
      locator: {
        kind: "object_storage",
        storeId: "assets",
        objectKey: "secret/object/key",
      },
      safeControlPlaneCode: "MANIFEST_NOT_FOUND",
    });
    const facts = sourceBindingAttributionToTelemetryFacts(snapshot);
    const serialized = JSON.stringify(facts);
    assert.equal(serialized.includes("secret/object/key"), false);
    assert.equal(serialized.includes("assets-bucket"), false);
  });

  await test("execution attribution round-trips source-binding facts", () => {
    const snapshot = buildSourceBindingAttribution({
      substage: "owned_object_load",
      resultClass: "record_missing",
      safeControlPlaneCode: "MANIFEST_NOT_FOUND",
    });
    const execution = sanitizeExecutionAttributionFromTelemetryFacts({
      execution_substage: "source_binding_resolution",
      disposition_kind: "terminal_failure",
      durable_job_state_class: "failed",
      claim_token_coherence_class: "cleared_after_terminal",
      cleanup_scheduled_class: "not_applicable",
      binary_component_class: "storage",
      bounded_duration_class: "sub_second",
      ...sourceBindingAttributionToTelemetryFacts(snapshot),
    });
    assert.ok(execution != null);
    assert.equal(
      execution!.sourceBindingAttribution?.sourceBindingSubstage,
      "owned_object_load",
    );
    const hosted = executionAttributionToSafeTelemetryFacts(execution!);
    assert.equal(hosted.source_binding_substage, "owned_object_load");
    assert.equal(hosted.binary_component_class, "storage");
    const roundTrip = sanitizeSourceBindingAttributionFromTelemetryFacts(hosted);
    assert.equal(roundTrip?.sourceBindingSubstage, "owned_object_load");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
