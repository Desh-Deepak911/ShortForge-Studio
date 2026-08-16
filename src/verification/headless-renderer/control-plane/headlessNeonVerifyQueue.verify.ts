/**
 * Neon trusted-verification queue: upload-complete, claim-next, wake, idle stop.
 * Run: npm run test:headless-neon-verify-queue
 *
 * Deterministic memory adapters only — no Neon/R2/Upstash/Fly contact.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import {
  cancelProvisionalRecord,
  classifyHeadlessQueueProvider,
  createProvisionalMaterializingRecord,
  dispatchVerifyWakeAfterObservedUpload,
  executeTrustedVerifyPromotion,
  isCanonicalStoredJobRecord,
  isProvisionalStoredJobRecord,
  shouldConstructUpstashRestProducer,
} from "@/features/headless-renderer/control-plane";
import { classifyHeadlessHostedWorkerEnvironment } from "@/features/headless-renderer/worker/hosted";
import { materializeHostedWorkerAdapters } from "@/features/headless-renderer/worker/hosted/materialize-hosted-worker-adapters";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessWorkerWakeAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-worker-wake.adapter";
import { TestHeadlessPrincipalAdapter } from "@/features/headless-renderer/control-plane/adapters/test-principal.adapter";
import { TestHeadlessProjectAuthorizationAdapter } from "@/features/headless-renderer/control-plane/adapters/test-project-authorization.adapter";
import { UnavailableHeadlessDownloadCapabilityAdapter } from "@/features/headless-renderer/control-plane/ports/download-capability.port";
import { UnavailableHeadlessUploadCapabilityAdapter } from "@/features/headless-renderer/control-plane/ports/upload-capability.port";
import type { ProductionHeadlessControlPlaneComposition } from "@/features/headless-renderer/control-plane/runtime/compose-production-control-plane";
import { completeStagingOwnedUpload } from "@/features/headless-renderer/control-plane/services/staging-owned-upload.service";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker";
import { createNeonVerifyWorkerLoop } from "@/features/headless-renderer/worker/hosted/neon-verify-worker-loop";
import { cpFail, cpOk } from "@/features/headless-renderer/control-plane/types/control-plane.types";

const CLOCK = 1_700_000_000_000;
const OWNER = "owner-neon-verify";
const PROJECT = "project-neon-verify";

const R2_CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "supersecret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function digestOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function objectKeyFor(objectId: string): string {
  return `test/staging/assets/manifest/aa/bb/cc/dd/none/${objectId.replace(/-/g, "").padEnd(32, "0").slice(0, 32)}`;
}

function throwingStreamQueue() {
  const refuse = async () => {
    throw new Error("Upstash stream queue must not be used in Neon mode");
  };
  return {
    enqueueRender: refuse,
    enqueueVerify: refuse,
  };
}

function neonComposition(input: {
  readonly jobStore: MemoryHeadlessJobStoreAdapter;
  readonly ownedObjectStore: MemoryHeadlessOwnedObjectStoreAdapter;
  readonly verifyWake: MemoryHeadlessWorkerWakeAdapter | null;
  readonly restCalls?: string[];
}): ProductionHeadlessControlPlaneComposition {
  const restCalls = input.restCalls;
  return {
    productionAvailable: true,
    canCreateJob: true,
    reason: "CONFIGURATION_UNAVAILABLE",
    activationStatus: "active",
    stagingSessionConfigured: true,
    stagingSessionEnvironmentStatus: "configured",
    neonDatabaseConfigured: true,
    neonEnvironmentStatus: "configured",
    r2EnvironmentStatus: "configured",
    r2Configured: true,
    upstashProducerEnvironmentStatus: "unconfigured",
    upstashProducerConfigured: false,
    queueProvider: {
      status: "configured",
      provider: "neon",
      envName: "staging",
    },
    upstashRestProducer: {
      enqueueVerify: async () => {
        restCalls?.push("enqueueVerify");
        throw new Error("Upstash enqueueVerify must not run in Neon mode");
      },
      enqueueRender: async () => {
        restCalls?.push("enqueueRender");
        throw new Error("Upstash enqueueRender must not run in Neon mode");
      },
    } as never,
    principal: new TestHeadlessPrincipalAdapter({
      ownerId: OWNER,
      sessionId: "sess-neon-verify",
    }),
    projectAuthorization: new TestHeadlessProjectAuthorizationAdapter({
      ownerId: OWNER,
      allowedProjectIds: [PROJECT],
    }),
    jobStore: input.jobStore,
    ownedObjectStore: input.ownedObjectStore,
    uploadCapability: new UnavailableHeadlessUploadCapabilityAdapter(),
    downloadCapability: new UnavailableHeadlessDownloadCapabilityAdapter(),
    verifyWake: input.verifyWake,
  };
}

async function seedObservedObject(input: {
  readonly jobStore: MemoryHeadlessJobStoreAdapter;
  readonly owned: MemoryHeadlessOwnedObjectStoreAdapter;
  readonly objectId: string;
  readonly jobId?: string;
  readonly operationId?: string;
  readonly nowMs?: number;
  readonly fake?: FakeS3Client;
}) {
  const nowMs = input.nowMs ?? CLOCK;
  const jobId = input.jobId ?? `job_${randomUUID()}`;
  const operationId = input.operationId ?? `op_${randomUUID()}`;
  const bytes = new TextEncoder().encode(`{"manifest":"${jobId}"}`);
  const digest = digestOf(bytes);
  const objectKey = objectKeyFor(input.objectId);
  const idem = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId: OWNER, projectId: PROJECT },
    idempotencyKey: `idem_${jobId}`,
  });
  assert.equal(idem.ok, true);
  if (!idem.ok) throw new Error("idem");
  const existing = await input.jobStore.getByJobIdAndOwner(jobId, OWNER);
  if (!existing.ok) {
    const provisional = createProvisionalMaterializingRecord({
      jobId,
      ownerId: OWNER,
      projectId: PROJECT,
      operationId,
      creatorIdempotencyKey: `idem_${jobId}`,
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
      stagingObjectRefs: [
        {
          purpose: "manifest",
          slotKey: null,
          locator: { kind: "object_storage", storeId: "assets", objectKey },
          contentDigestClaim: digest,
          byteLengthClaim: bytes.byteLength,
          mimeTypeClaim: "application/json",
        },
      ],
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      expiresAtMs: nowMs + 7_200_000,
    });
    assert.equal(provisional.ok, true);
    if (!provisional.ok) throw new Error("provisional");
    const created = await input.jobStore.createProvisionalIfAbsent({
      idempotencyAuthorityKey: idem.fingerprint,
      record: provisional.record,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
  }
  const staged = await input.owned.createStagingRecord({
    objectId: input.objectId,
    ownerId: OWNER,
    projectId: PROJECT,
    jobId,
    operationId,
    purpose: "manifest",
    slotKey: null,
    storeId: "assets",
    objectKey,
    expectedContentDigestClaim: digest,
    expectedByteLength: bytes.byteLength,
    expectedMimeType: "application/json",
    uploadCapabilityIssuedAtMs: nowMs,
    uploadCapabilityExpiresAtMs: nowMs + 3_600_000,
    expiresAtMs: nowMs + 7_200_000,
    createdAtMs: nowMs,
  });
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error("stage");
  const marked = await input.owned.markUploadedObserved!({
    objectId: input.objectId,
    ownerId: OWNER,
    expectedStoreVersion: staged.value.storeVersion,
    uploadedObservedAtMs: nowMs,
    nowMs,
  });
  assert.equal(marked.ok, true);
  if (!marked.ok) throw new Error("observe");
  input.fake?.putFixture("assets-bucket", objectKey, bytes, "application/json");
  return { jobId, operationId, digest, bytes, objectKey, stored: marked.value };
}

async function main() {
  console.log("\nNeon verify queue\n");

  await test("neon upload-complete records observation and never calls Upstash", async () => {
    const restCalls: string[] = [];
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const objectId = `obj_${randomUUID()}`;
    const seeded = await seedObservedObject({
      jobStore,
      owned,
      objectId,
    });
    const listed = await owned.listByJobIdAndOwner({
      jobId: seeded.jobId,
      ownerId: OWNER,
    });
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    const composition = neonComposition({
      jobStore,
      ownedObjectStore: owned,
      verifyWake: wake,
      restCalls,
    });
    const completed = await completeStagingOwnedUpload({
      composition,
      principal: { ownerId: OWNER, sessionId: "sess-neon-verify" },
      jobId: seeded.jobId,
      body: {
        version: 1,
        operationId: seeded.operationId,
        objectIds: listed.value.map((row) => row.record.objectId),
      },
    });
    assert.equal(completed.ok, true);
    assert.deepEqual(restCalls, []);
    assert.equal(wake.wakeCalls, 1);
    const after = await owned.getByObjectIdAndOwner({
      objectId,
      ownerId: OWNER,
    });
    assert.equal(after.ok && after.value != null, true);
    if (!after.ok || after.value == null) return;
    assert.equal(typeof after.value.record.uploadedObservedAtMs, "number");
    assert.equal(after.value.record.verificationState, "unclaimed");
    assert.equal(after.value.record.verificationClaimToken, null);
    assert.equal(JSON.stringify(completed).includes("rediss://"), false);
    assert.equal(JSON.stringify(completed).includes("supersecret"), false);
  });

  await test("duplicate verify wake is harmless; Fly start failure stays recoverable", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const objectId = `obj_${randomUUID()}`;
    await seedObservedObject({ jobStore, owned, objectId });
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const first = await dispatchVerifyWakeAfterObservedUpload({
      ownedObjectStore: owned,
      wake,
      ownerId: OWNER,
      nowMs: CLOCK + 1,
    });
    const second = await dispatchVerifyWakeAfterObservedUpload({
      ownedObjectStore: owned,
      wake,
      ownerId: OWNER,
      nowMs: CLOCK + 2,
    });
    assert.equal(first.ok && first.value.kind === "woken", true);
    assert.equal(second.ok && second.value.kind === "already_running", true);
    assert.equal(wake.wakeCalls, 2);

    const failWake = new MemoryHeadlessWorkerWakeAdapter();
    failWake.testingFailNextWake();
    const failed = await dispatchVerifyWakeAfterObservedUpload({
      ownedObjectStore: owned,
      wake: failWake,
      ownerId: OWNER,
      nowMs: CLOCK + 3,
    });
    assert.equal(failed.ok && failed.value.kind === "failed_queued", true);
    const still = await owned.getByObjectIdAndOwner({ objectId, ownerId: OWNER });
    assert.equal(still.ok && still.value != null, true);
    if (!still.ok || still.value == null) return;
    assert.equal(still.value.record.verificationState, "unclaimed");
    assert.equal(still.value.record.verificationClaimToken, null);
    assert.equal(JSON.stringify(failed).includes("secret"), false);
  });

  await test("two workers cannot verify the same object concurrently", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    await seedObservedObject({
      jobStore,
      owned,
      objectId: `obj_${randomUUID()}`,
    });
    const [a, b] = await Promise.all([
      owned.claimNextVerification!({
        claimToken: "neon-vfy-aaaa",
        nowMs: CLOCK + 10,
        claimLeaseMs: 120_000,
      }),
      owned.claimNextVerification!({
        claimToken: "neon-vfy-bbbb",
        nowMs: CLOCK + 10,
        claimLeaseMs: 120_000,
      }),
    ]);
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    const kinds = [a.value.kind, b.value.kind].sort();
    assert.deepEqual(kinds, ["claimed", "empty"]);
    const claimed = a.value.kind === "claimed" ? a.value : b.value;
    assert.equal(claimed.kind, "claimed");
    if (claimed.kind !== "claimed") return;
    assert.ok(
      claimed.stored.record.verificationClaimToken === "neon-vfy-aaaa" ||
        claimed.stored.record.verificationClaimToken === "neon-vfy-bbbb",
    );
  });

  await test("worker failure before verify is reclaimed after lease expiry", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const objectId = `obj_${randomUUID()}`;
    await seedObservedObject({ jobStore, owned, objectId });
    const first = await owned.claimNextVerification!({
      claimToken: "neon-vfy-dead",
      nowMs: CLOCK + 20,
      claimLeaseMs: 1_000,
    });
    assert.equal(first.ok && first.value.kind === "claimed", true);
    const live = await owned.claimNextVerification!({
      claimToken: "neon-vfy-live",
      nowMs: CLOCK + 500,
      claimLeaseMs: 1_000,
    });
    assert.equal(live.ok && live.value.kind === "empty", true);
    const recovered = await owned.claimNextVerification!({
      claimToken: "neon-vfy-recovered",
      nowMs: CLOCK + 20 + 1_000,
      claimLeaseMs: 1_000,
    });
    assert.equal(recovered.ok && recovered.value.kind === "claimed", true);
    if (!recovered.ok || recovered.value.kind !== "claimed") return;
    assert.equal(recovered.value.stored.record.objectId, objectId);
    assert.equal(
      recovered.value.stored.record.verificationClaimToken,
      "neon-vfy-recovered",
    );
  });

  await test("heartbeat renews lease without bumping store_version", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const objectId = `obj_${randomUUID()}`;
    await seedObservedObject({ jobStore, owned, objectId });
    const claimed = await owned.claimNextVerification!({
      claimToken: "neon-vfy-hb",
      nowMs: CLOCK + 30,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const version = claimed.value.stored.storeVersion;
    const renewed = await owned.renewVerificationClaim!({
      objectId,
      ownerId: OWNER,
      claimToken: "neon-vfy-hb",
      nowMs: CLOCK + 42,
    });
    assert.equal(renewed.ok && renewed.value != null, true);
    if (!renewed.ok || renewed.value == null) return;
    assert.equal(renewed.value.storeVersion, version);
    assert.equal(renewed.value.record.verificationClaimedAtMs, CLOCK + 42);
  });

  await test("successful verify promotes once and wakes render without Upstash", async () => {
    const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const objectId = `obj_${randomUUID()}`;
    const seeded = await seedObservedObject({
      jobStore,
      owned,
      objectId,
      fake,
    });
    const claimed = await owned.claimNextVerification!({
      claimToken: "neon-vfy-promote",
      nowMs: CLOCK + 50,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const io = new R2StorageAdapter({
      configOverride: R2_CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });
    const first = await executeTrustedVerifyPromotion({
      claimedObject: claimed.value.stored,
      claimToken: "neon-vfy-promote",
      ownerId: OWNER,
      nowMs: CLOCK + 51,
      ownedObjectStore: owned,
      jobStore,
      io,
      streamQueue: throwingStreamQueue(),
      dispatchOutbox,
      queueProvider: "neon",
      wake,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.ok(
      first.value.kind === "promoted_and_enqueued" ||
        first.value.kind === "already_promoted_enqueued" ||
        first.value.kind === "verified_waiting_for_coverage",
    );
    if (first.value.kind === "verified_waiting_for_coverage") {
      return;
    }
    assert.equal(wake.wakeCalls, 1);
    const job = await jobStore.getByJobIdAndOwner(seeded.jobId, OWNER);
    assert.equal(job.ok && isCanonicalStoredJobRecord(job.value), true);
    if (!job.ok || !isCanonicalStoredJobRecord(job.value)) return;
    assert.equal(job.value.canonicalJob.state, "queued");
    assert.equal(job.value.jobId, seeded.jobId);
    const replay = await executeTrustedVerifyPromotion({
      claimedObject: claimed.value.stored,
      claimToken: "neon-vfy-promote",
      ownerId: OWNER,
      nowMs: CLOCK + 52,
      ownedObjectStore: owned,
      jobStore,
      io,
      streamQueue: throwingStreamQueue(),
      dispatchOutbox,
      queueProvider: "neon",
      wake,
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.ok(
      replay.value.kind === "already_promoted_enqueued" ||
        replay.value.kind === "promoted_and_enqueued",
    );
    assert.equal(wake.wakeCalls, 1);
    const text = JSON.stringify({ first: first.value, replay: replay.value });
    assert.equal(text.includes("supersecret"), false);
    assert.equal(text.includes(seeded.objectKey), false);
    assert.equal(text.includes("https://acct.r2"), false);
  });

  await test("cancellation during verification prevents promotion", async () => {
    const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const fake = new FakeS3Client();
    const objectId = `obj_${randomUUID()}`;
    const seeded = await seedObservedObject({
      jobStore,
      owned,
      objectId,
      fake,
    });
    const loaded = await jobStore.getByJobIdAndOwner(seeded.jobId, OWNER);
    assert.equal(loaded.ok && isProvisionalStoredJobRecord(loaded.value), true);
    if (!loaded.ok || !isProvisionalStoredJobRecord(loaded.value)) return;
    const cancelled = cancelProvisionalRecord(loaded.value, CLOCK + 60);
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    const cas = await jobStore.compareAndSetProvisional({
      jobId: seeded.jobId,
      ownerId: OWNER,
      expectedStoreVersion: loaded.value.storeVersion,
      next: cancelled.record,
    });
    assert.equal(cas.ok && cas.value.kind === "updated", true);
    const claimed = await owned.claimNextVerification!({
      claimToken: "neon-vfy-cancel",
      nowMs: CLOCK + 61,
    });
    assert.equal(claimed.ok && claimed.value.kind === "claimed", true);
    if (!claimed.ok || claimed.value.kind !== "claimed") return;
    const io = new R2StorageAdapter({
      configOverride: R2_CONFIG,
      s3Client: fake,
      authorizeOwner: () => true,
    });
    const result = await executeTrustedVerifyPromotion({
      claimedObject: claimed.value.stored,
      claimToken: "neon-vfy-cancel",
      ownerId: OWNER,
      nowMs: CLOCK + 62,
      ownedObjectStore: owned,
      jobStore,
      io,
      streamQueue: throwingStreamQueue(),
      dispatchOutbox,
      queueProvider: "neon",
      wake: new MemoryHeadlessWorkerWakeAdapter(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.notEqual(result.value.kind, "promoted_and_enqueued");
    const after = await jobStore.getByJobIdAndOwner(seeded.jobId, OWNER);
    assert.equal(after.ok && isProvisionalStoredJobRecord(after.value), true);
    if (!after.ok || !isProvisionalStoredJobRecord(after.value)) return;
    assert.equal(after.value.state, "cancelled");
  });

  await test("neon verify loop drains then idle-stops; shutdown leaves work durable", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const firstId = `obj_${randomUUID()}`;
    const secondId = `obj_${randomUUID()}`;
    await seedObservedObject({ jobStore, owned, objectId: firstId });
    await seedObservedObject({ jobStore, owned, objectId: secondId });
    const claimed: string[] = [];
    let now = CLOCK;
    const loop = createNeonVerifyWorkerLoop({
      ownedObjectStore: owned,
      wake,
      nowMs: () => now,
      idleGraceMs: 50,
      heartbeatMs: 10_000,
      sleep: async () => {
        now += 20;
      },
      onClaimedVerify: async (input) => {
        claimed.push(input.objectId);
      },
    });
    const ran = await loop.run();
    assert.equal(ran.exitCode, 0);
    assert.equal(claimed.length, 2);
    assert.equal(wake.stopCalls, 1);

    const lateOwned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const lateJobs = new MemoryHeadlessJobStoreAdapter();
    const lateWake = new MemoryHeadlessWorkerWakeAdapter();
    const lateId = `obj_${randomUUID()}`;
    await seedObservedObject({
      jobStore: lateJobs,
      owned: lateOwned,
      objectId: lateId,
    });
    const lateLoop = createNeonVerifyWorkerLoop({
      ownedObjectStore: lateOwned,
      wake: lateWake,
      nowMs: () => CLOCK,
      idleGraceMs: 5_000,
      onClaimedVerify: async () => {
        throw new Error("should not claim after shutdown");
      },
    });
    lateLoop.requestShutdown();
    const lateRan = await lateLoop.run();
    assert.equal(lateRan.exitCode, 0);
    const leftover = await lateOwned.claimNextVerification!({
      claimToken: "neon-vfy-late",
      nowMs: CLOCK + 80,
    });
    assert.equal(leftover.ok && leftover.value.kind === "claimed", true);
  });

  await test("job arriving during idle grace is claimed before stop", async () => {
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const wake = new MemoryHeadlessWorkerWakeAdapter();
    const claimed: string[] = [];
    let now = CLOCK;
    let sleeps = 0;
    const loop = createNeonVerifyWorkerLoop({
      ownedObjectStore: owned,
      wake,
      nowMs: () => now,
      idleGraceMs: 80,
      heartbeatMs: 10_000,
      sleep: async () => {
        sleeps += 1;
        if (sleeps === 1) {
          await seedObservedObject({
            jobStore,
            owned,
            objectId: `obj_${randomUUID()}`,
            nowMs: now,
          });
        }
        now += 20;
      },
      onClaimedVerify: async (input) => {
        claimed.push(input.objectId);
      },
    });
    const ran = await loop.run();
    assert.equal(ran.exitCode, 0);
    assert.equal(claimed.length, 1);
    assert.equal(wake.stopCalls, 1);
  });

  await test("hosted neon classify does not require Upstash TCP; REST stays off", () => {
    const neon = classifyHeadlessQueueProvider({
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "neon",
    });
    assert.equal(shouldConstructUpstashRestProducer(neon), false);
    const hosted = classifyHeadlessHostedWorkerEnvironment({
      HEADLESS_WORKER_MODE: "verify",
      HEADLESS_ENV_NAME: "staging",
      HEADLESS_QUEUE_PROVIDER: "neon",
      DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
      R2_ACCOUNT_ID: "a".repeat(32),
      R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
      R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
      R2_BUCKET_ASSETS: "footie-assets-staging",
      R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
      R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
      HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
      HEADLESS_CHROME_PATH: "/usr/bin/chromium",
      HEADLESS_FFMPEG_PATH: "/usr/bin/ffmpeg",
      HEADLESS_FFPROBE_PATH: "/usr/bin/ffprobe",
      HEADLESS_RENDERER_BUILD_ID: HEADLESS_WORKER_RENDERER_BUILD_ID,
      HEADLESS_WORKER_CONCURRENCY: "1",
    });
    assert.equal(hosted.status, "configured");
    const text = JSON.stringify(hosted);
    assert.equal(text.includes("secretvalue"), false);
    assert.equal(text.includes("postgresql://"), false);
    assert.equal(cpOk({ kind: "woken" }).ok, true);
    assert.equal(cpFail("CONFIGURATION_UNAVAILABLE", "unavailable").ok, false);
  });

  await test("hosted verifier stops itself but wakes the separate render Machine", async () => {
    const urls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      return { status: 204 } as Response;
    }) as typeof fetch;

    const adapters = materializeHostedWorkerAdapters({
      config: {
        mode: "verify",
        envName: "staging",
        chromeExecutable: "/usr/bin/chromium",
        ffmpegExecutable: "/usr/bin/ffmpeg",
        ffprobeExecutable: "/usr/bin/ffprobe",
        rendererBuildId: HEADLESS_WORKER_RENDERER_BUILD_ID,
        concurrency: 1,
        gracefulShutdownDeadlineMs: 25_000,
        allowNoSandboxWithExternalIsolation: false,
        leaseSettings: {
          claimLeaseMs: 60_000,
          heartbeatIntervalMs: 12_000,
          blockMs: 1_000,
        },
        neonStatus: "configured",
        r2Status: "configured",
        upstashConsumerStatus: "unconfigured",
      },
      env: {
        HEADLESS_ENV_NAME: "staging",
        HEADLESS_QUEUE_PROVIDER: "neon",
        DATABASE_URL: "postgresql://user:pass@ep-staging.example/neondb",
        R2_ACCOUNT_ID: "a".repeat(32),
        R2_ACCESS_KEY_ID: "AKIA" + "B".repeat(16),
        R2_SECRET_ACCESS_KEY: "secretvalue" + "c".repeat(20),
        R2_BUCKET_ASSETS: "footie-assets-staging",
        R2_BUCKET_ARTIFACTS: "footie-artifacts-staging",
        R2_ENDPOINT: "https://accountid.r2.cloudflarestorage.com",
        HEADLESS_ALLOWED_ORIGINS: "https://staging.example.com",
        FLY_API_TOKEN: "test-fly-token",
        HEADLESS_FLY_WAKE_APP_NAME: "shortforge-staging",
        HEADLESS_FLY_WAKE_MACHINE_ID: "render-machine",
        HEADLESS_FLY_WAKE_VERIFY_MACHINE_ID: "verify-machine",
      },
    });

    try {
      await adapters.workerWake?.stop({ nowMs: CLOCK });
      await adapters.renderWake?.wake({ nowMs: CLOCK });
      assert.match(urls[0] ?? "", /machines\/verify-machine\/stop$/);
      assert.match(urls[1] ?? "", /machines\/render-machine\/start$/);
    } finally {
      globalThis.fetch = originalFetch;
      await adapters.close();
    }
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
