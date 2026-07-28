/**
 * Sprint 11E Phase 2C.1B — same-snapshot R2 fixture authority (deterministic).
 * Run: npm run test:headless-r2-same-snapshot-fixture
 *
 * Proves mismatched provisional/upload ordering fails reconcile, and corrected
 * bytes→digest→provisional→staging→put→verify→reconcile succeeds with
 * blocked_incomplete. Memory adapters + FakeS3 only — no remote contact.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  createProvisionalMaterializingRecord,
  HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
  HEADLESS_VERIFICATION_TARGET_MANIFEST,
  isProvisionalStoredJobRecord,
  verifyAndFinalizeR2OwnedObject,
} from "@/features/headless-renderer/control-plane";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain";

import {
  createMinimalProvisionalJob,
  digestOf,
  makeSyntheticJsonBytes,
  putObjectBytes,
  trackObjectId,
  trackR2Locator,
} from "./r2-live/live-fixtures";
import type { R2LiveMatrixContext, R2LiveSessionState } from "./r2-live/types";

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

/**
 * Staging-ref locator validation caps objectKey at HEADLESS_MAX_ID_LENGTH (128).
 * Derived live keys can exceed that; fixture uses a short canonical-shaped key
 * (same pattern as headlessFinalizedCoverageReconcile.verify.ts).
 */
function shortFixtureObjectKey(suffix: string): string {
  return `test/staging/assets/manifest/aa/bb/cc/dd/none/${suffix.padEnd(32, "0").slice(0, 32)}`;
}

function emptySession(): R2LiveSessionState {
  return {
    jobId: null,
    operationId: null,
    objectId: null,
    objectKey: null,
    storeId: null,
    bytes: null,
    digest: null,
    mime: "application/json",
    expectedByteLength: 0,
    artifactObjectId: null,
    artifactObjectKey: null,
    uploadCapabilityIssued: false,
  };
}

function buildCtx(options: {
  jobStore: MemoryHeadlessJobStoreAdapter;
  ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  fake: FakeS3Client;
  runId?: string;
}): R2LiveMatrixContext {
  const runId = options.runId ?? randomUUID();
  return {
    runId,
    ownerId: "owner_same_snap",
    otherOwnerId: "owner_other",
    projectId: "project_same_snap",
    nowMs: 5_000,
    sql: {
      withClient: async () => ({ rows: [], rowCount: 0 }),
      withTransaction: async (fn: (client: never) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [], rowCount: 0 }) } as never),
    } as never,
    jobStore: options.jobStore,
    ownedObjectStore: options.ownedObjectStore,
    projectAuthorization: {
      claimUnownedProject: async () => ({ ok: true as const, value: true as const }),
      assertProjectAccess: async () => ({ ok: true as const, value: true as const }),
    } as never,
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: options.fake,
      authorizeOwner: () => true,
    }),
    uploadCapability: {
      issueDirectPutCapability: async () => ({
        ok: true as const,
        value: {
          putUrl: "https://example.invalid/put",
          requiredHeaders: {},
          expiresAtMs: 9_000,
        },
      }),
    } as never,
    downloadCapability: null,
    r2Config: CONFIG,
    createdJobIds: [],
    createdProjectIds: [],
    createdObjectIds: [],
    createdR2Locators: [],
    session: emptySession(),
  };
}

async function createShortKeyStaging(
  ctx: R2LiveMatrixContext,
  input: {
    jobId: string;
    operationId: string;
    bytes: Uint8Array;
    digest: string;
    mime?: string;
    keySuffix: string;
  },
): Promise<
  | {
      ok: true;
      objectId: string;
      objectKey: string;
      storeId: "assets";
      digest: string;
      mime: string;
    }
  | { ok: false; message: string }
> {
  const objectId = randomUUID();
  const objectKey = shortFixtureObjectKey(input.keySuffix);
  const mime = input.mime ?? "application/json";
  const created = await ctx.ownedObjectStore.createStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId: input.jobId,
    operationId: input.operationId,
    purpose: "manifest",
    slotKey: null,
    storeId: "assets",
    objectKey,
    expectedContentDigestClaim: input.digest,
    expectedByteLength: input.bytes.byteLength,
    expectedMimeType: mime,
    uploadCapabilityIssuedAtMs: ctx.nowMs,
    uploadCapabilityExpiresAtMs: ctx.nowMs + 600_000,
    expiresAtMs: ctx.nowMs + 3_600_000,
    createdAtMs: ctx.nowMs,
  });
  if (!created.ok) {
    return {
      ok: false,
      message: created.issues[0]?.message ?? "staging create failed",
    };
  }
  trackObjectId(ctx, objectId);
  trackR2Locator(ctx, { storeId: "assets", objectKey });
  return {
    ok: true,
    objectId,
    objectKey,
    storeId: "assets",
    digest: input.digest,
    mime,
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2C.1B — same-snapshot R2 fixture authority\n");

  await test(
    "prior mismatched ordering (wrong provisional digest vs uploaded bytes) fails reconcile",
    async () => {
      const jobStore = new MemoryHeadlessJobStoreAdapter();
      const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const ctx = buildCtx({ jobStore, ownedObjectStore: owned, fake });

      const bytes = makeSyntheticJsonBytes(ctx.runId);
      const bytesDigest = digestOf(bytes);
      const wrongDigest = `sha256:${createHash("sha256")
        .update("fallback-wrong-digest")
        .digest("hex")}`;
      assert.notEqual(wrongDigest, bytesDigest);

      const jobId = randomUUID();
      const operationId = randomUUID();

      // Old/broken ordering: provisional bound to fallback digest, staging/upload use real bytes.
      const provisional = await createMinimalProvisionalJob(ctx, {
        jobId,
        operationId,
        creatorKey: `mismatch-${ctx.runId}`,
        manifestPayloadDigestClaim: wrongDigest,
      });
      assert.equal(provisional.ok, true);

      const staging = await createShortKeyStaging(ctx, {
        jobId,
        operationId,
        bytes,
        digest: bytesDigest,
        mime: "application/json",
        keySuffix: "mismatchaaaaaaaaaaaaaaaaaaaaaa",
      });
      assert.equal(staging.ok, true);
      if (!staging.ok) return;

      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime: staging.mime,
      });
      assert.equal(put.ok, true);

      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: owned,
        io: ctx.io,
      });
      assert.equal(verified.ok, true);

      const reconcile = await reconcileFinalizedOwnedObjectCoverage({
        jobStore,
        ownedObjectStore: owned,
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
      });
      assert.equal(reconcile.ok, false);
      if (!reconcile.ok) {
        assert.match(
          reconcile.issues[0]?.message ?? "",
          /digest|snapshot|Manifest staging/i,
        );
      }
    },
  );

  await test(
    "corrected same-payload construction succeeds with blocked_incomplete",
    async () => {
      const jobStore = new MemoryHeadlessJobStoreAdapter();
      const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const ctx = buildCtx({ jobStore, ownedObjectStore: owned, fake });

      const bytes = makeSyntheticJsonBytes(ctx.runId);
      const digest = digestOf(bytes);
      const mime = "application/json";
      const jobId = randomUUID();
      const operationId = randomUUID();

      // Correct ordering: bytes → digest → provisional → staging (same digest).
      const provisional = await createMinimalProvisionalJob(ctx, {
        jobId,
        operationId,
        creatorKey: `same-${ctx.runId}`,
        manifestPayloadDigestClaim: digest,
      });
      assert.equal(provisional.ok, true);

      const staging = await createShortKeyStaging(ctx, {
        jobId,
        operationId,
        bytes,
        digest,
        mime,
        keySuffix: "samepayloadaaaaaaaaaaaaaaaaaaaa",
      });
      assert.equal(staging.ok, true);
      if (!staging.ok) return;

      const put = await putObjectBytes(ctx, {
        storeId: staging.storeId,
        objectKey: staging.objectKey,
        bytes,
        mime,
      });
      assert.equal(put.ok, true);

      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: owned,
        io: ctx.io,
      });
      assert.equal(verified.ok, true);
      if (!verified.ok) return;
      assert.equal(verified.value.record.contentDigest, digest);

      const reconcile = await reconcileFinalizedOwnedObjectCoverage({
        jobStore,
        ownedObjectStore: owned,
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
      });
      assert.equal(reconcile.ok, true);
      if (!reconcile.ok) return;
      assert.equal(reconcile.value.status, "blocked_incomplete");
      assert.equal(reconcile.value.coverageComplete, false);

      const job = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
      assert.equal(job.ok, true);
      if (!job.ok || !isProvisionalStoredJobRecord(job.value)) {
        assert.fail("expected provisional job");
      }
      const manifestRefs = job.value.stagingObjectRefs.filter(
        (r) => r.purpose === "manifest",
      );
      assert.equal(manifestRefs.length, 1);
      assert.equal(
        job.value.verificationCoverage.verifiedTargets.includes(
          HEADLESS_VERIFICATION_TARGET_MANIFEST,
        ),
        true,
      );
      assert.equal(
        job.value.verificationCoverage.requiredTargets.includes(
          HEADLESS_VERIFICATION_TARGET_ASSET_BUNDLE_RECORD,
        ),
        true,
      );
      assert.equal(job.value.verificationCoverage.complete, false);

      // Idempotent reconcile — still one manifest ref, still incomplete.
      const replay = await reconcileFinalizedOwnedObjectCoverage({
        jobStore,
        ownedObjectStore: owned,
        objectId: staging.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 2,
      });
      assert.equal(replay.ok, true);
      const afterReplay = await jobStore.getByJobIdAndOwner(jobId, ctx.ownerId);
      assert.equal(afterReplay.ok, true);
      if (!afterReplay.ok || !isProvisionalStoredJobRecord(afterReplay.value)) {
        assert.fail("expected provisional after replay");
      }
      assert.equal(
        afterReplay.value.stagingObjectRefs.filter((r) => r.purpose === "manifest")
          .length,
        1,
      );
      assert.equal(afterReplay.value.verificationCoverage.complete, false);
    },
  );

  await test(
    "second independently generated payload fails snapshot bind / reconcile",
    async () => {
      const jobStore = new MemoryHeadlessJobStoreAdapter();
      const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const ctx = buildCtx({ jobStore, ownedObjectStore: owned, fake });

      const bytesA = makeSyntheticJsonBytes(`${ctx.runId}-a`);
      const digestA = digestOf(bytesA);
      const jobId = randomUUID();
      const operationId = randomUUID();

      const provisional = await createMinimalProvisionalJob(ctx, {
        jobId,
        operationId,
        creatorKey: `ind-${ctx.runId}`,
        manifestPayloadDigestClaim: digestA,
      });
      assert.equal(provisional.ok, true);

      // Independently generated second payload — different digest.
      const bytesB = makeSyntheticJsonBytes(`${ctx.runId}-b`);
      const digestB = digestOf(bytesB);
      assert.notEqual(digestA, digestB);

      const stagingB = await createShortKeyStaging(ctx, {
        jobId,
        operationId,
        bytes: bytesB,
        digest: digestB,
        mime: "application/json",
        keySuffix: "secondpayloadaaaaaaaaaaaaaaaaaaa",
      });
      assert.equal(stagingB.ok, true);
      if (!stagingB.ok) return;

      const put = await putObjectBytes(ctx, {
        storeId: stagingB.storeId,
        objectKey: stagingB.objectKey,
        bytes: bytesB,
        mime: stagingB.mime,
      });
      assert.equal(put.ok, true);

      const verified = await verifyAndFinalizeR2OwnedObject({
        objectId: stagingB.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs,
        store: owned,
        io: ctx.io,
      });
      assert.equal(verified.ok, true);

      const reconcile = await reconcileFinalizedOwnedObjectCoverage({
        jobStore,
        ownedObjectStore: owned,
        objectId: stagingB.objectId,
        ownerId: ctx.ownerId,
        nowMs: ctx.nowMs + 1,
      });
      assert.equal(reconcile.ok, false);
      if (!reconcile.ok) {
        assert.match(
          reconcile.issues[0]?.message ?? "",
          /digest|snapshot|Manifest staging/i,
        );
      }
    },
  );

  await test(
    "createMinimalProvisionalJob rejects missing / invalid digest claim",
    async () => {
      const jobStore = new MemoryHeadlessJobStoreAdapter();
      const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
      const fake = new FakeS3Client();
      const ctx = buildCtx({ jobStore, ownedObjectStore: owned, fake });

      const bad = await createMinimalProvisionalJob(ctx, {
        jobId: randomUUID(),
        operationId: randomUUID(),
        creatorKey: "bad-digest",
        manifestPayloadDigestClaim: "not-a-digest",
      });
      assert.equal(bad.ok, false);

      // Direct lifecycle with a valid-looking but unrelated claim still creates;
      // fixture helper is the authority that requires explicit digest.
      const idem = buildHeadlessAuthorityFingerprint("hid", {
        version: 1,
        kind: "control-plane-idempotency",
        ownership: { ownerId: ctx.ownerId, projectId: ctx.projectId },
        idempotencyKey: "direct",
      });
      assert.equal(idem.ok, true);
      if (!idem.ok) return;
      const digest = digestOf(new TextEncoder().encode("x"));
      const record = createProvisionalMaterializingRecord({
        jobId: randomUUID(),
        ownerId: ctx.ownerId,
        projectId: ctx.projectId,
        operationId: randomUUID(),
        creatorIdempotencyKey: "direct",
        idempotencyAuthorityKey: idem.fingerprint,
        requestedRendererProfile: {
          resolution: "720p",
          format: "webm",
          fps: 30,
          quality: "standard",
        },
        requestedRendererBuildId: "build",
        snapshotClaim: {
          manifestPayloadDigestClaim: digest,
          assetBundleFingerprintClaim: `hab:sha256:${"ab".repeat(32)}`,
          expectedSlotClaims: [],
        },
        stagingObjectRefs: [],
        createdAtMs: ctx.nowMs,
        updatedAtMs: ctx.nowMs,
        expiresAtMs: ctx.nowMs + 3_600_000,
      });
      assert.equal(record.ok, true);
    },
  );

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
