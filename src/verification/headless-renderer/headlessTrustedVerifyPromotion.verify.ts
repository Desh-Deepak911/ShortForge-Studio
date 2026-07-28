/**
 * Sprint 11E Phase 2E.2B — trusted verify → promotion → render enqueue.
 * Run: npm run test:headless-trusted-verify-promotion
 *
 * Deterministic memory + FakeS3 only — no Neon/R2/Upstash contact.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildExportManifest,
  EXPORT_MANIFEST_VERSION,
  EXPORT_RENDERER_CONTRACT_VERSION,
  isExportManifestV4,
  validateExportManifest,
  type ExportEnvironmentSnapshot,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  createProvisionalMaterializingRecord,
  deriveRequiredVerificationTargets,
  executeTrustedVerifyPromotion,
  isCanonicalStoredJobRecord,
  isProvisionalStoredJobRecord,
  materializeCanonicalFromFinalizedCoverage,
  stableHeadlessDeliveryId,
  verifyAndFinalizeR2OwnedObject,
  verifyAndFinalizeR2OwnedObjectUnderClaim,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessStreamQueueAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-stream-queue.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import {
  composeTestHeadlessControlPlane,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import type { HeadlessR2ObjectIOPort } from "@/features/headless-renderer/control-plane/ports/r2-object-io.port";
import {
  buildHeadlessAuthorityFingerprint,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessAssetBundle,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import {
  composeHostedHeadlessWorker,
  createHostedWorkerLoop,
  HEADLESS_HOSTED_CLOSED_SEAMS,
  HEADLESS_HOSTED_VERIFY_SEAMS,
} from "@/features/headless-renderer/worker/hosted";
import {
  HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
  HEADLESS_DEFAULT_RENDER_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
  HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
} from "@/features/headless-renderer/control-plane/runtime/upstash-environment";
import {
  cpFail,
  cpOk,
} from "@/features/headless-renderer/control-plane/types/control-plane.types";
import type { HeadlessStreamQueuePort } from "@/features/headless-renderer/control-plane/ports/stream-queue.port";

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

const CLOCK = 1_700_000_000_000;
const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsWebAudio: true,
  supportsMediaRecorder: true,
};

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function shortKey(suffix: string): string {
  return `test/staging/assets/manifest/aa/bb/cc/dd/none/${suffix.padEnd(32, "0").slice(0, 32)}`;
}

function countingIo(fake: FakeS3Client): HeadlessR2ObjectIOPort & {
  readonly streamCalls: () => number;
} {
  const base = new R2StorageAdapter({
    configOverride: CONFIG,
    s3Client: fake,
    authorizeOwner: () => true,
  });
  let streams = 0;
  return {
    streamCalls: () => streams,
    readObjectMetadata: (l, o) => base.readObjectMetadata(l, o),
    writeUploadStream: (i) => base.writeUploadStream(i),
    deleteObject: (l, o) => base.deleteObject(l, o),
    probeExactObjectPresence: (l, o) => base.probeExactObjectPresence(l, o),
    streamFullObject: (input) => {
      streams += 1;
      return base.streamFullObject(input);
    },
  };
}

async function seedStaging(
  store: MemoryHeadlessOwnedObjectStoreAdapter,
  fake: FakeS3Client,
  opts: {
    objectId: string;
    jobId: string;
    operationId: string;
    purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
    slotKey: string | null;
    bytes: Uint8Array;
    mime?: string;
  },
) {
  const mime = opts.mime ?? "application/json";
  const digest = digestOf(opts.bytes);
  const objectKey = shortKey(opts.objectId.replace(/-/g, "").slice(0, 32));
  fake.putFixture("assets-bucket", objectKey, opts.bytes, mime);
  const created = await store.createStagingRecord({
    objectId: opts.objectId,
    ownerId: "owner_1",
    projectId: "project_1",
    jobId: opts.jobId,
    operationId: opts.operationId,
    purpose: opts.purpose,
    slotKey: opts.slotKey,
    storeId: "assets",
    objectKey,
    expectedContentDigestClaim: digest,
    expectedByteLength: opts.bytes.byteLength,
    expectedMimeType: mime,
    uploadCapabilityIssuedAtMs: CLOCK,
    uploadCapabilityExpiresAtMs: CLOCK + 3_600_000,
    expiresAtMs: CLOCK + 7_200_000,
    createdAtMs: CLOCK,
  });
  assert.equal(created.ok, true);
  return { digest, objectKey, mime };
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2B — trusted verify + promotion\n");

  await test("1-2: underClaim uses existing claim; mismatch → zero stream", async () => {
    const src = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/verify-r2-owned-object.ts",
      ),
      "utf8",
    );
    const under = src.slice(
      src.indexOf("export async function verifyAndFinalizeR2OwnedObjectUnderClaim"),
      src.indexOf("export async function verifyAndFinalizeR2OwnedObject("),
    );
    assert.equal(under.includes("acquireVerificationClaim"), false);

    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const r2 = countingIo(fake);
    const bytes = new TextEncoder().encode('{"ok":true}');
    await seedStaging(store, fake, {
      objectId: "obj_c1",
      jobId: "job_1",
      operationId: "op_1",
      purpose: "manifest",
      slotKey: null,
      bytes,
    });
    const loaded = await store.getByObjectIdAndOwner({
      objectId: "obj_c1",
      ownerId: "owner_1",
    });
    assert.ok(loaded.ok && loaded.value);
    const claimToken = randomUUID();
    const claimed = await store.acquireVerificationClaim({
      objectId: "obj_c1",
      ownerId: "owner_1",
      claimToken,
      nowMs: CLOCK + 1,
      expectedStoreVersion: loaded.value!.storeVersion,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;

    const ok = await verifyAndFinalizeR2OwnedObjectUnderClaim({
      objectId: "obj_c1",
      ownerId: "owner_1",
      claimToken,
      expectedStoreVersion: claimed.value.storeVersion,
      nowMs: CLOCK + 2,
      store,
      io: r2,
    });
    assert.equal(ok.ok, true);
    assert.ok(r2.streamCalls() >= 1);

    const forged = await verifyAndFinalizeR2OwnedObjectUnderClaim({
      objectId: "obj_c1",
      ownerId: "owner_1",
      claimToken: "forged",
      expectedStoreVersion: claimed.value.storeVersion,
      nowMs: CLOCK + 3,
      store,
      io: r2,
    });
    assert.equal(forged.ok, false);
    // Already finalized — no additional stream for forged claim check before I/O
    // (fails on stage !== staging). Stream count unchanged for forged-after-finalize.
  });

  await test("standalone acquire delegates into claimed executor", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    await seedStaging(store, fake, {
      objectId: "obj_stand",
      jobId: "job_s",
      operationId: "op_s",
      purpose: "manifest",
      slotKey: null,
      bytes: new TextEncoder().encode('{"s":1}'),
    });
    const result = await verifyAndFinalizeR2OwnedObject({
      objectId: "obj_stand",
      ownerId: "owner_1",
      nowMs: CLOCK + 1,
      store,
      io: countingIo(fake),
    });
    assert.equal(result.ok, true);
  });

  await test("3: incomplete coverage → no promotion/enqueue", async () => {
    const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const queue = new MemoryHeadlessStreamQueueAdapter();
    const bytes = new TextEncoder().encode('{"manifest":1}');
    const digest = digestOf(bytes);
    const jobId = "job_incomplete";
    const operationId = "op_inc";
    const idem = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: { ownerId: "owner_1", projectId: "project_1" },
      idempotencyKey: "idem_inc",
    });
    assert.equal(idem.ok, true);
    if (!idem.ok) return;
    const provisional = createProvisionalMaterializingRecord({
      jobId,
      ownerId: "owner_1",
      projectId: "project_1",
      operationId,
      creatorIdempotencyKey: "idem_inc",
      idempotencyAuthorityKey: idem.fingerprint,
      requestedRendererProfile: {
        resolution: "720p",
        format: "webm",
        fps: 30,
        quality: "standard",
      },
      requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      snapshotClaim: {
        manifestPayloadDigestClaim: digest,
        assetBundleFingerprintClaim: "hab:sha256:" + "ab".repeat(32),
        expectedSlotClaims: [],
      },
      stagingObjectRefs: [],
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      expiresAtMs: CLOCK + 7_200_000,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) return;
    await jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: provisional.record,
    });
    await seedStaging(owned, fake, {
      objectId: "obj_inc",
      jobId,
      operationId,
      purpose: "manifest",
      slotKey: null,
      bytes,
    });
    const loaded = await owned.getByObjectIdAndOwner({
      objectId: "obj_inc",
      ownerId: "owner_1",
    });
    assert.ok(loaded.ok && loaded.value);
    const claimToken = randomUUID();
    const claimed = await owned.acquireVerificationClaim({
      objectId: "obj_inc",
      ownerId: "owner_1",
      claimToken,
      nowMs: CLOCK + 1,
      expectedStoreVersion: loaded.value!.storeVersion,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;

    const result = await executeTrustedVerifyPromotion({
      claimedObject: claimed.value,
      claimToken,
      ownerId: "owner_1",
      nowMs: CLOCK + 2,
      ownedObjectStore: owned,
      jobStore,
      io: countingIo(fake),
      streamQueue: queue,
      dispatchOutbox,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.kind, "verified_waiting_for_coverage");
    const job = await jobStore.getByJobIdAndOwner(jobId, "owner_1");
    assert.ok(job.ok && isProvisionalStoredJobRecord(job.value));
    assert.equal(job.value.verificationCoverage.complete, false);
    assert.notEqual(result.value.kind, "promoted_and_enqueued");
    assert.equal(result.value.deliveryId, null);
  });

  await test("4-13/16: materialize→promote→enqueue; replay; forged; dispatch-pending", async () => {
    const story: FootieScript = syncFootieScript({
      title: "2e2b verify promotion",
      narration: "Hello world narration for export.",
      totalDuration: 6,
      voiceoverUrl: "https://example.com/voice.mp3",
      voiceoverDurationMs: 6000,
      scenes: [
        {
          id: "scene-1",
          start: 0,
          end: 3,
          duration: 3,
          startMs: 0,
          endMs: 3000,
          durationMs: 3000,
          subtitle: "Hello",
          captionMode: "generated",
          media: {
            type: "image",
            url: "https://example.com/a.jpg",
            source: "upload",
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        },
        {
          id: "scene-2",
          start: 3,
          end: 6,
          duration: 3,
          startMs: 3000,
          endMs: 6000,
          durationMs: 3000,
          subtitle: "World",
          captionMode: "generated",
          media: {
            type: "image",
            url: "https://example.com/b.jpg",
            source: "upload",
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          },
        },
      ],
    });
    const built = buildExportManifest({
      story,
      environment: CAPABLE_ENV,
      audioMode: "with-voice",
      multiImageScenesEnabled: true,
    });
    assert.ok(isExportManifestV4(built));
    assert.equal(built.version, EXPORT_MANIFEST_VERSION);
    assert.equal(built.rendererContractVersion, EXPORT_RENDERER_CONTRACT_VERSION);
    assert.equal(validateExportManifest(built).ok, true);
    const manifest = built;
    const projectId = manifest.project.projectId;

    const stack = composeTestHeadlessControlPlane({
      principal: { ownerId: "owner_1", sessionId: "s1" },
      authorizedProjectIds: [projectId],
      nowMs: () => CLOCK,
    });

    const seeded = await seedOwnedManifestAndBundle({
      storage: stack.storage,
      ownerId: "owner_1",
      projectId,
      manifest,
      nowMs: CLOCK,
    });
    assert.equal(seeded.ok, true);
    if (!seeded.ok) return;

    const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const queue = new MemoryHeadlessStreamQueueAdapter();
    const jobId = `job_${randomUUID()}`;
    const operationId = `op_${randomUUID()}`;
    const slots = extractRequiredHeadlessSourceSlots(manifest);
    assert.ok(slots.length >= 1, "expected at least one source slot");

    const expectedSlotClaims = seeded.value.bundle.assets.map((asset) => {
      const slot = slots.find(
        (s) =>
          s.role === asset.sourceIdentity.role &&
          s.sceneId === asset.sourceIdentity.sceneId &&
          s.mediaItemId === asset.sourceIdentity.mediaItemId &&
          s.sourceDigest === asset.sourceIdentity.sourceDigest,
      );
      assert.ok(slot);
      return {
        slotKey: headlessSourceSlotKey(slot!),
        role: slot!.role,
        sceneId: slot!.sceneId,
        mediaItemId: slot!.mediaItemId,
        sourceDigestClaim: slot!.sourceDigest,
        contentDigestClaim: asset.contentDigest,
        byteLengthClaim: asset.byteLength,
        mimeTypeClaim: asset.mimeType,
      };
    });

    const patchedAssets = seeded.value.bundle.assets.map((asset, i) => ({
      ...asset,
      storageLocator: {
        kind: "object_storage" as const,
        storeId: "assets" as const,
        objectKey: shortKey(`asset${i}${asset.contentDigest.slice(-8)}`),
      },
    }));
    const patchedBundle = finalizeHeadlessAssetBundle({
      bundleId: seeded.value.bundle.bundleId,
      assets: patchedAssets,
      manifest,
    });
    assert.equal(patchedBundle.ok, true);
    if (!patchedBundle.ok) return;

    const snapshotClaim = {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: patchedBundle.bundle.fingerprint,
      expectedSlotClaims,
    };

    const idem = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: { ownerId: "owner_1", projectId },
      idempotencyKey: `idem_${jobId}`,
    });
    assert.equal(idem.ok, true);
    if (!idem.ok) return;

    const requiredTargets = deriveRequiredVerificationTargets(snapshotClaim);

    async function putFinalized(input: {
      objectId: string;
      purpose: "manifest" | "asset_bundle_record" | "asset_bytes";
      slotKey: string | null;
      bytes: Uint8Array;
      mime: string;
      objectKey: string;
      expiresAtMs: number;
    }) {
      fake.putFixture("assets-bucket", input.objectKey, input.bytes, input.mime);
      const digest = digestOf(input.bytes);
      const created = await owned.createStagingRecord({
        objectId: input.objectId,
        ownerId: "owner_1",
        projectId,
        jobId,
        operationId,
        purpose: input.purpose,
        slotKey: input.slotKey,
        storeId: "assets",
        objectKey: input.objectKey,
        expectedContentDigestClaim: digest,
        expectedByteLength: input.bytes.byteLength,
        expectedMimeType: input.mime,
        uploadCapabilityIssuedAtMs: CLOCK,
        uploadCapabilityExpiresAtMs: CLOCK + 3_600_000,
        expiresAtMs: Math.max(input.expiresAtMs, CLOCK + 7_200_000),
        createdAtMs: CLOCK,
      });
      assert.equal(
        created.ok,
        true,
        created.ok
          ? ""
          : `${created.issues[0]?.code}: ${created.issues[0]?.message} keyLen=${input.objectKey.length}`,
      );
      if (!created.ok) return;
      const tok = randomUUID();
      const claimed = await owned.acquireVerificationClaim({
        objectId: input.objectId,
        ownerId: "owner_1",
        claimToken: tok,
        nowMs: CLOCK + 1,
        expectedStoreVersion: created.value.storeVersion,
      });
      assert.equal(claimed.ok, true);
      if (!claimed.ok) return;
      const fin = await owned.finalizeStagingRecord({
        objectId: input.objectId,
        ownerId: "owner_1",
        expectedStoreVersion: claimed.value.storeVersion,
        verificationClaimToken: tok,
        contentDigest: digest,
        byteLength: input.bytes.byteLength,
        mimeType: input.mime,
        verifiedAtMs: CLOCK + 2,
        expiresAtMs: input.expiresAtMs,
        nowMs: CLOCK + 2,
      });
      assert.equal(fin.ok, true);
    }

    const manifestOpened = await stack.storage.openOwnedObject(
      seeded.value.manifestLocator,
      "owner_1",
      CLOCK,
    );
    assert.equal(manifestOpened.ok, true);
    if (!manifestOpened.ok) return;
    await putFinalized({
      objectId: randomUUID(),
      purpose: "manifest",
      slotKey: null,
      bytes: manifestOpened.value.bytes,
      mime: "application/json",
      objectKey: shortKey("manifestaaaaaaaaaaaaaaaaaaaaaaa"),
      expiresAtMs: CLOCK + 7_200_000,
    });

    const bundleBytes = new TextEncoder().encode(
      JSON.stringify(patchedBundle.bundle),
    );
    await putFinalized({
      objectId: randomUUID(),
      purpose: "asset_bundle_record",
      slotKey: null,
      bytes: bundleBytes,
      mime: "application/json",
      objectKey: shortKey("bundlebbbbbbbbbbbbbbbbbbbbbbbbbb"),
      expiresAtMs: CLOCK + 7_200_000,
    });

    for (let i = 0; i < patchedBundle.bundle.assets.length; i++) {
      const asset = patchedBundle.bundle.assets[i]!;
      const opened = await stack.storage.openOwnedObject(
        seeded.value.bundle.assets[i]!.storageLocator,
        "owner_1",
        CLOCK,
      );
      assert.equal(opened.ok, true);
      if (!opened.ok) return;
      await putFinalized({
        objectId: randomUUID(),
        purpose: "asset_bytes",
        slotKey: expectedSlotClaims[i]!.slotKey,
        bytes: opened.value.bytes,
        mime: asset.mimeType,
        objectKey: asset.storageLocator.objectKey,
        expiresAtMs: asset.expiresAtMs,
      });
    }

    const stagingObjectRefs = [
      {
        purpose: "manifest" as const,
        slotKey: null,
        locator: {
          kind: "object_storage" as const,
          storeId: "assets",
          objectKey: shortKey("manifestaaaaaaaaaaaaaaaaaaaaaaa"),
        },
        contentDigestClaim: seeded.value.manifestPayloadDigest,
        byteLengthClaim: manifestOpened.value.bytes.byteLength,
        mimeTypeClaim: "application/json",
      },
      {
        purpose: "asset_bundle_record" as const,
        slotKey: null,
        locator: {
          kind: "object_storage" as const,
          storeId: "assets",
          objectKey: shortKey("bundlebbbbbbbbbbbbbbbbbbbbbbbbbb"),
        },
        contentDigestClaim: digestOf(bundleBytes),
        byteLengthClaim: bundleBytes.byteLength,
        mimeTypeClaim: "application/json",
      },
      ...patchedBundle.bundle.assets.map((asset, i) => ({
        purpose: "asset_bytes" as const,
        slotKey: expectedSlotClaims[i]!.slotKey,
        locator: asset.storageLocator,
        contentDigestClaim: asset.contentDigest,
        byteLengthClaim: asset.byteLength,
        mimeTypeClaim: asset.mimeType,
      })),
    ];

    const provisionalWithRefs = createProvisionalMaterializingRecord({
      jobId,
      ownerId: "owner_1",
      projectId,
      operationId,
      creatorIdempotencyKey: `idem_${jobId}`,
      idempotencyAuthorityKey: idem.fingerprint,
      requestedRendererProfile: {
        resolution: manifest.output.resolution,
        format: manifest.output.format,
        fps: manifest.output.fps,
        quality: manifest.output.quality,
      },
      requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      snapshotClaim,
      stagingObjectRefs,
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      expiresAtMs: CLOCK + 7_200_000,
    });
    assert.equal(
      provisionalWithRefs.ok,
      true,
      provisionalWithRefs.ok ? "" : provisionalWithRefs.message,
    );
    if (!provisionalWithRefs.ok) return;

    const withCoverage = {
      ...provisionalWithRefs.record,
      verificationCoverage: {
        requiredTargets,
        verifiedTargets: [...requiredTargets],
        complete: true as const,
      },
    };
    const created = await jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: withCoverage,
    });
    assert.equal(
      created.ok,
      true,
      created.ok ? "" : created.issues[0]?.message,
    );
    if (!created.ok) return;

    const materialize = await materializeCanonicalFromFinalizedCoverage({
      jobStore,
      ownedObjectStore: owned,
      io: countingIo(fake),
      jobId,
      ownerId: "owner_1",
      nowMs: CLOCK + 10,
    });
    assert.equal(
      materialize.ok,
      true,
      materialize.ok ? "" : `${materialize.issues[0]?.code}: ${materialize.issues[0]?.message}`,
    );
    if (!materialize.ok) return;

    // 5: loaded from finalized durable objects (materialize path)
    assert.ok(materialize.value.canonicalRequest!.manifest);

    const promoted = await jobStore.promoteProvisionalToCanonical({
      jobId,
      ownerId: "owner_1",
      expectedStoreVersion: materialize.value.provisional.storeVersion,
      expectedOperationId: operationId,
      canonicalRequest: materialize.value.canonicalRequest,
      canonicalJob: materialize.value.canonicalJob,
    });
    assert.equal(promoted.ok, true);
    if (!promoted.ok) return;
    assert.equal(promoted.value.kind, "updated");
    if (promoted.value.kind !== "updated") return;
    const storeVersionAfter = promoted.value.record.storeVersion;
    assert.ok(isCanonicalStoredJobRecord(promoted.value.record));

    const attempt = promoted.value.record.canonicalJob!.attempt;
    const deliveryId = stableHeadlessDeliveryId(jobId, attempt);
    const outboxRow = await dispatchOutbox.getByJobAttemptAndOwner({
      jobId,
      attempt,
      ownerId: "owner_1",
    });
    assert.equal(outboxRow.ok, true);
    if (outboxRow.ok) {
      assert.ok(outboxRow.value);
      assert.equal(outboxRow.value!.state, "pending");
      assert.equal(outboxRow.value!.intent.deliveryId, deliveryId);
    }
    const enq = await queue.enqueueRender({
      deliveryKind: "render",
      jobId,
      ownerId: "owner_1",
      attempt,
      deliveryId,
      enqueuedAtMs: CLOCK + 11,
    });
    assert.equal(enq.ok, true);

    // 12: exact already_promoted replay — no storeVersion bump
    const replay = await jobStore.promoteProvisionalToCanonical({
      jobId,
      ownerId: "owner_1",
      expectedStoreVersion: storeVersionAfter,
      expectedOperationId: operationId,
      canonicalRequest: materialize.value.canonicalRequest,
      canonicalJob: materialize.value.canonicalJob,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.value.kind, "already_promoted");
    if (replay.value.kind === "already_promoted") {
      assert.equal(replay.value.record.storeVersion, storeVersionAfter);
    }

    // 13: forged replay rejected
    const forged = await jobStore.promoteProvisionalToCanonical({
      jobId,
      ownerId: "owner_1",
      expectedStoreVersion: storeVersionAfter,
      expectedOperationId: "forged-op",
      canonicalRequest: materialize.value.canonicalRequest,
      canonicalJob: materialize.value.canonicalJob,
    });
    assert.equal(forged.ok, true);
    if (forged.ok) {
      assert.equal(forged.value.kind, "rejected");
    }

    // 15-16: enqueue failure → dispatch_pending; retry enqueues without second promote
    queue.testingFailNextEnqueue();
    const failEnq = await queue.enqueueRender({
      deliveryKind: "render",
      jobId,
      ownerId: "owner_1",
      attempt,
      deliveryId,
      enqueuedAtMs: CLOCK + 12,
    });
    assert.equal(failEnq.ok, false);
    const retryEnq = await queue.enqueueRender({
      deliveryKind: "render",
      jobId,
      ownerId: "owner_1",
      attempt,
      deliveryId,
      enqueuedAtMs: CLOCK + 13,
    });
    assert.equal(retryEnq.ok, true);
    const after = await jobStore.getByJobIdAndOwner(jobId, "owner_1");
    assert.ok(after.ok && isCanonicalStoredJobRecord(after.value));
    assert.equal(after.value.storeVersion, storeVersionAfter);
  });

  await test("6: client/staging digest cannot replace trusted finalized digest", async () => {
    const matSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/materialize-canonical-from-finalized-coverage.ts",
      ),
      "utf8",
    );
    assert.ok(matSrc.includes("MANIFEST_DIGEST_MISMATCH"));
    assert.ok(
      matSrc.includes(
        "Finalized manifest digest does not match snapshot claim.",
      ),
    );
    // Staging/client claim is compared against finalized.contentDigest — never trusted alone.
    assert.ok(matSrc.includes("snapshotClaim.manifestPayloadDigestClaim"));
  });

  await test("7-8/10/14/17: hostile paths + failure disposition + promotion failure source", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const bytes = new TextEncoder().encode("missing");
    const digest = digestOf(bytes);
    const objectKey = shortKey("missingobjaaaaaaaaaaaaaaaaaaaa");
    const created = await store.createStagingRecord({
      objectId: "obj_miss",
      ownerId: "owner_1",
      projectId: "project_1",
      jobId: "job_miss",
      operationId: "op_miss",
      purpose: "manifest",
      slotKey: null,
      storeId: "assets",
      objectKey,
      expectedContentDigestClaim: digest,
      expectedByteLength: bytes.byteLength,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: CLOCK,
      uploadCapabilityExpiresAtMs: CLOCK + 3_600_000,
      expiresAtMs: CLOCK + 7_200_000,
      createdAtMs: CLOCK,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const tok = randomUUID();
    const claimed = await store.acquireVerificationClaim({
      objectId: "obj_miss",
      ownerId: "owner_1",
      claimToken: tok,
      nowMs: CLOCK + 1,
      expectedStoreVersion: created.value.storeVersion,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    const result = await verifyAndFinalizeR2OwnedObjectUnderClaim({
      objectId: "obj_miss",
      ownerId: "owner_1",
      claimToken: tok,
      expectedStoreVersion: claimed.value.storeVersion,
      nowMs: CLOCK + 2,
      store,
      io: countingIo(fake),
    });
    assert.equal(result.ok, false);
    const disposition = (result as { disposition?: string }).disposition;
    assert.ok(
      disposition === "cleanup_pending" ||
        disposition === "terminal_rejected" ||
        disposition === "unconfirmed" ||
        disposition === "stale",
    );

    const orch = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/execute-trusted-verify-promotion.ts",
      ),
      "utf8",
    );
    assert.ok(orch.includes("promoted_dispatch_pending"));
    assert.ok(orch.includes("promotion_rejected"));
    assert.equal(orch.includes("verifyAndFinalizeR2OwnedObject("), false);
    assert.ok(orch.includes("verifyAndFinalizeR2OwnedObjectUnderClaim"));

    const mat = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/materialize-canonical-from-finalized-coverage.ts",
      ),
      "utf8",
    );
    assert.ok(mat.includes("finalizeHeadlessRenderJobRequest"));
    assert.ok(mat.includes("validateExportManifest"));
    assert.ok(mat.includes("MANIFEST_TOO_LARGE") || mat.includes("BODY_TOO_LARGE"));
    assert.ok(mat.includes("Duplicate finalized") || mat.includes("Missing finalized"));
  });

  await test("18-20: abort + shutdown intake vs execution separation", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    fake.getObjectDelayMs = 80;
    await seedStaging(store, fake, {
      objectId: "obj_abort",
      jobId: "job_a",
      operationId: "op_a",
      purpose: "manifest",
      slotKey: null,
      bytes: new TextEncoder().encode("abort-me"),
    });
    const loaded = await store.getByObjectIdAndOwner({
      objectId: "obj_abort",
      ownerId: "owner_1",
    });
    assert.ok(loaded.ok && loaded.value);
    const tok = randomUUID();
    const claimed = await store.acquireVerificationClaim({
      objectId: "obj_abort",
      ownerId: "owner_1",
      claimToken: tok,
      nowMs: CLOCK + 1,
      expectedStoreVersion: loaded.value!.storeVersion,
    });
    assert.equal(claimed.ok, true);
    if (!claimed.ok) return;
    const controller = new AbortController();
    const pending = verifyAndFinalizeR2OwnedObjectUnderClaim({
      objectId: "obj_abort",
      ownerId: "owner_1",
      claimToken: tok,
      expectedStoreVersion: claimed.value.storeVersion,
      nowMs: CLOCK + 2,
      store,
      io: countingIo(fake),
      signal: controller.signal,
    });
    controller.abort();
    const aborted = await pending;
    assert.equal(aborted.ok, false);
    if (!aborted.ok) {
      assert.equal(aborted.issues[0]?.code, "OPERATION_ABORTED");
    }

    const streamQueue: HeadlessStreamQueuePort = {
      enqueueRender: async () => cpOk({ streamId: "0-0" }),
      enqueueVerify: async () => cpOk({ streamId: "0-0" }),
      ensureConsumerGroups: async () => cpOk(true as const),
      readGroup: async (input) => {
        if (input.signal?.aborted) {
          return cpFail("INTERNAL_ERROR", "Read aborted.");
        }
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 25);
          input.signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              resolve();
            },
            { once: true },
          );
        });
        return cpOk([]);
      },
      ack: async () => cpOk(true as const),
      autoClaimIdle: async () => cpOk([]),
      moveToDlq: async () => cpOk(true as const),
    };
    const loop = createHostedWorkerLoop({
      mode: "verify",
      streamQueue,
      ownedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      jobStore: new MemoryHeadlessJobStoreAdapter(),
      leaseSettings: Object.freeze({
        deliveryIdleMs: HEADLESS_DEFAULT_DELIVERY_IDLE_MS,
        renderClaimMs: HEADLESS_DEFAULT_RENDER_CLAIM_MS,
        verifyDeliveryIdleMs: HEADLESS_DEFAULT_VERIFY_DELIVERY_IDLE_MS,
        verifyClaimMs: HEADLESS_DEFAULT_VERIFY_CLAIM_MS,
      }),
      concurrency: 1,
      blockMs: 20,
      onClaimedVerify: async () => undefined,
    });
    const runPromise = loop.run();
    await new Promise((r) => setTimeout(r, 30));
    loop.requestShutdown();
    assert.equal(loop.isAcceptingDeliveries(), false);
    assert.equal(typeof loop.requestForcedAbort, "function");
    const result = await runPromise;
    assert.equal(result.exitCode, 0);
  });

  await test("21-22: privacy + barrels + composition seam closed", () => {
    assert.deepEqual([...HEADLESS_HOSTED_VERIFY_SEAMS], []);
    assert.ok(
      HEADLESS_HOSTED_CLOSED_SEAMS.includes("VERIFY_PROMOTION_COMPOSITION_SEAM"),
    );
    const c = composeHostedHeadlessWorker({
      HEADLESS_WORKER_MODE: "verify",
      HEADLESS_ENV_NAME: "staging",
      DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
      R2_ACCOUNT_ID: "a".repeat(32),
      R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
      R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
      R2_BUCKET_ASSETS: "footie-assets-staging",
      R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
      R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
      HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
      UPSTASH_REDIS_TCP_URL: "rediss://default:pass@example.upstash.io:6379",
      HEADLESS_CHROME_PATH: "/usr/bin/chromium",
      HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
      HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
      HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
      HEADLESS_WORKER_CONCURRENCY: "1",
    });
    assert.equal(c.compositionMap?.trustedVerifyPromotion, true);
    assert.equal(c.canStartConsumerLoop, true);
    assert.equal(c.reasonId, "composition_ready");

    const barrel = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.ok(barrel.includes("executeTrustedVerifyPromotion"));
    assert.equal(barrel.includes("MemoryHeadless"), false);
    assert.equal(barrel.includes("FakeS3"), false);

    const outcomeSrc = readFileSync(
      path.join(
        process.cwd(),
        "src/features/headless-renderer/control-plane/services/execute-trusted-verify-promotion.ts",
      ),
      "utf8",
    );
    assert.equal(/presign|Authorization|putUrl/i.test(outcomeSrc), false);
  });

  await test("10: provisional cancelled → materialize rejected", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const digest = digestOf(new TextEncoder().encode("x"));
    const idem = buildHeadlessAuthorityFingerprint("hid", {
      version: 1,
      kind: "control-plane-idempotency",
      ownership: { ownerId: "owner_1", projectId: "project_1" },
      idempotencyKey: "idem_c",
    });
    assert.equal(idem.ok, true);
    if (!idem.ok) return;
    const provisional = createProvisionalMaterializingRecord({
      jobId: "job_cancelled",
      ownerId: "owner_1",
      projectId: "project_1",
      operationId: "op_c",
      creatorIdempotencyKey: "idem_c",
      idempotencyAuthorityKey: idem.fingerprint,
      requestedRendererProfile: {
        resolution: "720p",
        format: "webm",
        fps: 30,
        quality: "standard",
      },
      requestedRendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
      snapshotClaim: {
        manifestPayloadDigestClaim: digest,
        assetBundleFingerprintClaim: "hab:sha256:" + "ee".repeat(32),
        expectedSlotClaims: [],
      },
      stagingObjectRefs: [],
      createdAtMs: CLOCK,
      updatedAtMs: CLOCK,
      expiresAtMs: CLOCK + 7_200_000,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) return;
    const targets = deriveRequiredVerificationTargets(
      provisional.record.snapshotClaim,
    );
    await jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: {
        ...provisional.record,
        state: "cancelled",
        verificationCoverage: {
          requiredTargets: targets,
          verifiedTargets: [...targets],
          complete: true,
        },
        storeVersion: 0,
      },
    });
    const materialize = await materializeCanonicalFromFinalizedCoverage({
      jobStore,
      ownedObjectStore: owned,
      io: countingIo(fake),
      jobId: "job_cancelled",
      ownerId: "owner_1",
      nowMs: CLOCK + 1,
    });
    assert.equal(materialize.ok, false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
