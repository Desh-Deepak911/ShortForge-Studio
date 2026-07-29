/**
 * Sprint 11E Phase 2E.2D.8H.1 — semantic asset-bundle fingerprint authority.
 * Run: npm run test:headless-asset-bundle-fingerprint-semantic-authority
 *
 * Proves hab: fingerprints bind semantic content identity only — never storage locators.
 * No renderer build-ID bump: fingerprint authority is orthogonal to Phase 3.2 worker identity.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  buildHeadlessAssetBundleFingerprint,
  validateHeadlessAssetBundle,
  verifyHeadlessAssetBundleFingerprintCoherence,
  HEADLESS_ASSET_BUNDLE_VERSION,
  HEADLESS_ASSET_DESCRIPTOR_VERSION,
  type HeadlessAssetDescriptorV1,
} from "@/features/headless-renderer/domain";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain/headless-stable-hash";
import { HEADLESS_PHASE3_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/renderer-build-id";
import { buildLiveDraft } from "../neon-live/live-fixtures";
import { deriveFlyRenderJobCreateStagingPayloads } from "../fly-render-live/job-create-fixture-identity";
import { materializeCanonicalFromFinalizedCoverage } from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import {
  createProvisionalMaterializingRecord,
  deriveRequiredVerificationTargets,
} from "@/features/headless-renderer/control-plane";
import { runOwnedObjectStagingRecordChain } from "../fly-render-live/owned-object-staging-chain";
import { runOwnedObjectFinalizeChain } from "../fly-render-live/owned-object-finalize-chain";

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

const CLOCK = 1_700_000_400_000;

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function descriptor(input: {
  readonly assetId: string;
  readonly slotKey: string;
  readonly digest: string;
  readonly storeId?: string;
  readonly objectKey?: string;
}): HeadlessAssetDescriptorV1 {
  return {
    version: HEADLESS_ASSET_DESCRIPTOR_VERSION,
    assetId: input.assetId,
    sourceIdentity: {
      role: "scene_media",
      sceneId: "scene-1",
      mediaItemId: "item-1",
      sourceDigest: input.digest,
      classification: "other",
    },
    contentDigest: `sha256:${"aa".repeat(32)}`,
    byteLength: 100,
    mimeType: "image/jpeg",
    mediaKind: "image",
    storageLocator: {
      kind: "object_storage",
      storeId: input.storeId ?? "assets",
      objectKey: input.objectKey ?? `objects/${input.assetId}`,
    },
    expiresAtMs: CLOCK + 600_000,
  };
}

function legacyLocatorInclusiveFingerprint(
  bundleId: string,
  assets: readonly HeadlessAssetDescriptorV1[],
): string {
  const sorted = [...assets]
    .map((asset) => ({
      version: asset.version,
      assetId: asset.assetId,
      sourceIdentity: asset.sourceIdentity,
      contentDigest: asset.contentDigest,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
      mediaKind: asset.mediaKind,
      storageLocator: asset.storageLocator,
    }))
    .sort((a, b) => a.assetId.localeCompare(b.assetId));
  const built = buildHeadlessAuthorityFingerprint("hab", {
    version: 1,
    bundleId,
    assets: sorted,
  });
  if (!built.ok) throw new Error("legacy fingerprint failed");
  return built.fingerprint;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8H.1 — semantic asset-bundle fingerprint authority\n",
  );

  await test("renderer build ID unchanged — fingerprint correction is additive", () => {
    assert.equal(
      HEADLESS_PHASE3_RENDERER_BUILD_ID,
      "headless-local-chromium-ffmpeg-11e-phase2g.24e",
    );
  });

  await test("identical content + different finalized locator → same fingerprint", () => {
    const a = descriptor({
      assetId: "asset-a",
      slotKey: "slot-a",
      digest: "digest-a",
      objectKey: "staging/client/a",
    });
    const b = descriptor({
      assetId: "asset-a",
      slotKey: "slot-a",
      digest: "digest-a",
      objectKey: "finalized/owned/b",
    });
    const fpA = buildHeadlessAssetBundleFingerprint("bundle-1", [a]);
    const fpB = buildHeadlessAssetBundleFingerprint("bundle-1", [b]);
    assert.equal(fpA.ok, true);
    assert.equal(fpB.ok, true);
    if (!fpA.ok || !fpB.ok) throw new Error("fingerprint failed");
    assert.equal(fpA.fingerprint, fpB.fingerprint);
  });

  await test("changed content digest → different fingerprint", () => {
    const base = descriptor({
      assetId: "asset-a",
      slotKey: "slot-a",
      digest: "digest-a",
    });
    const changed = {
      ...base,
      contentDigest: `sha256:${"bb".repeat(32)}`,
    };
    const fpBase = buildHeadlessAssetBundleFingerprint("bundle-1", [base]);
    const fpChanged = buildHeadlessAssetBundleFingerprint("bundle-1", [changed]);
    assert.equal(fpBase.ok, true);
    assert.equal(fpChanged.ok, true);
    if (!fpBase.ok || !fpChanged.ok) throw new Error("fingerprint failed");
    assert.notEqual(fpBase.fingerprint, fpChanged.fingerprint);
  });

  await test("changed byte length → different fingerprint", () => {
    const base = descriptor({
      assetId: "asset-a",
      slotKey: "slot-a",
      digest: "digest-a",
    });
    const changed = { ...base, byteLength: base.byteLength + 1 };
    const fpBase = buildHeadlessAssetBundleFingerprint("bundle-1", [base]);
    const fpChanged = buildHeadlessAssetBundleFingerprint("bundle-1", [changed]);
    assert.equal(fpBase.ok, true);
    assert.equal(fpChanged.ok, true);
    if (!fpBase.ok || !fpChanged.ok) throw new Error("fingerprint failed");
    assert.notEqual(fpBase.fingerprint, fpChanged.fingerprint);
  });

  await test("changed MIME → different fingerprint", () => {
    const base = descriptor({
      assetId: "asset-a",
      slotKey: "slot-a",
      digest: "digest-a",
    });
    const changed = { ...base, mimeType: "image/png" };
    const fpBase = buildHeadlessAssetBundleFingerprint("bundle-1", [base]);
    const fpChanged = buildHeadlessAssetBundleFingerprint("bundle-1", [changed]);
    assert.equal(fpBase.ok, true);
    assert.equal(fpChanged.ok, true);
    if (!fpBase.ok || !fpChanged.ok) throw new Error("fingerprint failed");
    assert.notEqual(fpBase.fingerprint, fpChanged.fingerprint);
  });

  await test("canonical asset ordering is stable regardless of input order", () => {
    const one = descriptor({
      assetId: "asset-1",
      slotKey: "slot-1",
      digest: "digest-1",
    });
    const two = descriptor({
      assetId: "asset-2",
      slotKey: "slot-2",
      digest: "digest-2",
    });
    const forward = buildHeadlessAssetBundleFingerprint("bundle-1", [one, two]);
    const reverse = buildHeadlessAssetBundleFingerprint("bundle-1", [two, one]);
    assert.equal(forward.ok, true);
    assert.equal(reverse.ok, true);
    if (!forward.ok || !reverse.ok) throw new Error("fingerprint failed");
    assert.equal(forward.fingerprint, reverse.fingerprint);
  });

  await test("provisional snapshot claim matches rebound canonical bundle fingerprint", async () => {
    const runId = randomUUID();
    const draftCtx = await buildLiveDraft({
      runId,
      ownerId: `owner-${runId.slice(0, 8)}`,
    });
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draftCtx);
    const fake = new FakeS3Client();
    const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const io = new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });
    const staged = await runOwnedObjectStagingRecordChain({
      ctx: {
        runId,
        ownerId: draftCtx.ownerId,
        projectId: draftCtx.projectId,
        nowMs: CLOCK,
        io,
        ownedObjectStore,
        jobStore,
        createdObjectIds: [],
        createdJobIds: [],
        createdProjectIds: [],
        createdR2Locators: [],
      } as never,
      payloads,
      jobId: draftCtx.jobId,
      operationId: draftCtx.operationId,
    });
    assert.equal(staged.ok, true);
    if (!staged.ok) throw new Error("staging failed");
    const finalized = await runOwnedObjectFinalizeChain({
      ctx: {
        runId,
        ownerId: draftCtx.ownerId,
        projectId: draftCtx.projectId,
        nowMs: CLOCK,
        io,
        ownedObjectStore,
        jobStore,
        createdObjectIds: [],
        createdJobIds: [],
        createdProjectIds: [],
        createdR2Locators: [],
      } as never,
      staged: staged.staged,
      payloads,
    });
    assert.equal(finalized.ok, true);
    if (!finalized.ok) throw new Error("finalize failed");
    const targets = deriveRequiredVerificationTargets(draftCtx.draft.snapshotClaim);
    const provisional = createProvisionalMaterializingRecord({
      jobId: draftCtx.jobId,
      ownerId: draftCtx.ownerId,
      projectId: draftCtx.projectId,
      operationId: draftCtx.operationId,
      creatorIdempotencyKey: draftCtx.draft.creatorIdempotencyKey,
      idempotencyAuthorityKey: draftCtx.draft.idempotencyAuthorityKey,
      requestedRendererProfile: draftCtx.draft.requestedRendererProfile,
      requestedRendererBuildId: draftCtx.draft.requestedRendererBuildId,
      snapshotClaim: draftCtx.draft.snapshotClaim,
      stagingObjectRefs: draftCtx.draft.stagingObjectRefs,
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      expiresAtMs: CLOCK + 7_200_000,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) throw new Error("provisional failed");
    await jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.draft.idempotencyAuthorityKey,
      record: {
        ...provisional.record,
        verificationCoverage: {
          requiredTargets: targets,
          verifiedTargets: [...targets],
          complete: true,
        },
      },
    });
    const materialized = await materializeCanonicalFromFinalizedCoverage({
      jobStore,
      ownedObjectStore,
      io,
      jobId: draftCtx.jobId,
      ownerId: draftCtx.ownerId,
      nowMs: CLOCK,
    });
    assert.equal(materialized.ok, true);
    if (!materialized.ok) throw new Error("materialize failed");
    assert.equal(
      materialized.value.canonicalRequest!.assetBundle.fingerprint,
      draftCtx.draft.snapshotClaim.assetBundleFingerprintClaim,
    );
    assert.equal(
      verifyHeadlessAssetBundleFingerprintCoherence(
        materialized.value.canonicalRequest!.assetBundle,
      ),
      true,
    );
  });

  await test("canonical 142-character R2 object keys validate after finalized rebind", async () => {
    const runId = randomUUID();
    const draftCtx = await buildLiveDraft({
      runId,
      ownerId: `owner-${runId.slice(0, 8)}`,
    });
    const longKey = `staging/staging/assets/asset_bytes/${"a".repeat(107)}`;
    assert.equal(longKey.length, 142);
    const assets = draftCtx.seeded.bundle.assets.map((asset, index) => ({
      ...asset,
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "assets",
        objectKey: `${longKey.slice(0, -2)}${String(index).padStart(2, "0")}`,
      },
    }));
    const fingerprint = buildHeadlessAssetBundleFingerprint(
      draftCtx.seeded.bundle.bundleId,
      assets,
    );
    assert.equal(fingerprint.ok, true);
    if (!fingerprint.ok) throw new Error("fingerprint failed");
    const validated = validateHeadlessAssetBundle(
      {
        ...draftCtx.seeded.bundle,
        assets,
        fingerprint: fingerprint.fingerprint,
      },
      draftCtx.manifest,
    );
    assert.equal(validated.ok, true);
  });

  await test("object-key validator remains fail-closed above 1024 and for unsafe keys", async () => {
    const runId = randomUUID();
    const draftCtx = await buildLiveDraft({
      runId,
      ownerId: `owner-${runId.slice(0, 8)}`,
    });
    const base = draftCtx.seeded.bundle.assets[0]!;
    for (const objectKey of [
      `assets/${"k".repeat(1018)}`,
      "assets/../escape",
      "assets/has whitespace",
    ]) {
      const assets = [
        {
          ...base,
          storageLocator: {
            kind: "object_storage" as const,
            storeId: "assets",
            objectKey,
          },
        },
        ...draftCtx.seeded.bundle.assets.slice(1),
      ];
      const fingerprint = buildHeadlessAssetBundleFingerprint(
        draftCtx.seeded.bundle.bundleId,
        assets,
      );
      assert.equal(fingerprint.ok, true);
      if (!fingerprint.ok) throw new Error("fingerprint failed");
      const validated = validateHeadlessAssetBundle(
        {
          ...draftCtx.seeded.bundle,
          assets,
          fingerprint: fingerprint.fingerprint,
        },
        draftCtx.manifest,
      );
      assert.equal(validated.ok, false);
    }
  });

  await test("replay stability: same inputs → same fingerprint", () => {
    const one = descriptor({
      assetId: "asset-1",
      slotKey: "slot-1",
      digest: "digest-1",
      objectKey: "replay/a",
    });
    const two = descriptor({
      assetId: "asset-2",
      slotKey: "slot-2",
      digest: "digest-2",
      objectKey: "replay/b",
    });
    const first = buildHeadlessAssetBundleFingerprint("bundle-replay", [one, two]);
    const second = buildHeadlessAssetBundleFingerprint("bundle-replay", [one, two]);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) throw new Error("fingerprint failed");
    assert.equal(first.fingerprint, second.fingerprint);
  });

  await test("forged bundle fingerprint fails coherence closed", () => {
    const asset = descriptor({
      assetId: "asset-forge",
      slotKey: "slot-forge",
      digest: "digest-forge",
    });
    const built = buildHeadlessAssetBundleFingerprint("bundle-forge", [asset]);
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("fingerprint failed");
    const forged = {
      version: HEADLESS_ASSET_BUNDLE_VERSION,
      bundleId: "bundle-forge",
      assets: [asset],
      fingerprint: "hab:sha256:" + "ff".repeat(32),
    };
    assert.equal(verifyHeadlessAssetBundleFingerprintCoherence(forged), false);
    assert.notEqual(forged.fingerprint, built.fingerprint);
  });

  await test("legacy locator-inclusive fingerprint drifts on rebind — explicit rejection path", () => {
    const staging = descriptor({
      assetId: "asset-hist",
      slotKey: "slot-hist",
      digest: "digest-hist",
      objectKey: "staging/client/a",
    });
    const finalized = descriptor({
      assetId: "asset-hist",
      slotKey: "slot-hist",
      digest: "digest-hist",
      objectKey: "finalized/owned/b",
    });
    const semanticStaging = buildHeadlessAssetBundleFingerprint("bundle-hist", [staging]);
    const semanticFinal = buildHeadlessAssetBundleFingerprint("bundle-hist", [finalized]);
    assert.equal(semanticStaging.ok, true);
    assert.equal(semanticFinal.ok, true);
    if (!semanticStaging.ok || !semanticFinal.ok) throw new Error("fingerprint failed");
    assert.equal(semanticStaging.fingerprint, semanticFinal.fingerprint);
    const legacyStaging = legacyLocatorInclusiveFingerprint("bundle-hist", [staging]);
    const legacyFinal = legacyLocatorInclusiveFingerprint("bundle-hist", [finalized]);
    assert.notEqual(legacyStaging, legacyFinal);
    assert.notEqual(legacyFinal, semanticFinal.fingerprint);
  });

  await test("forged locator cannot bypass semantic durable source binding", () => {
    const trusted = descriptor({
      assetId: "asset-trust",
      slotKey: "slot-trust",
      digest: "digest-trust",
      objectKey: "finalized/owned/trusted",
    });
    const forged = descriptor({
      assetId: "asset-trust",
      slotKey: "slot-trust",
      digest: "digest-trust",
      objectKey: "attacker/forged/object",
    });
    const trustedFp = buildHeadlessAssetBundleFingerprint("bundle-trust", [trusted]);
    const forgedFp = buildHeadlessAssetBundleFingerprint("bundle-trust", [forged]);
    assert.equal(trustedFp.ok, true);
    assert.equal(forgedFp.ok, true);
    if (!trustedFp.ok || !forgedFp.ok) throw new Error("fingerprint failed");
    assert.equal(trustedFp.fingerprint, forgedFp.fingerprint);
    assert.notEqual(trusted.storageLocator.objectKey, forged.storageLocator.objectKey);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
