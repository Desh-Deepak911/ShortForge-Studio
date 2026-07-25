/**
 * Sprint 11E Phase 2E.2D.7A.2 — Hosted verifier read-only observation authority.
 * Run: npm run test:headless-fly-verify-live-observation-authority
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  MemoryHeadlessJobStoreAdapter,
  MemoryHeadlessOwnedObjectStoreAdapter,
  MemoryHeadlessProjectOwnershipAdapter,
  MemoryHeadlessRenderDispatchOutboxAdapter,
  MemoryHeadlessStreamQueueAdapter,
} from "@/features/headless-renderer/control-plane/testing";
import {
  createProvisionalMaterializingRecord,
  isProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import { reconcileFinalizedOwnedObjectCoverage } from "@/features/headless-renderer/control-plane/services/reconcile-finalized-owned-object-coverage";
import { buildHeadlessAuthorityFingerprint } from "@/features/headless-renderer/domain";
import type { HeadlessJobStorePort } from "@/features/headless-renderer/control-plane/ports/job-store.port";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

import { defaultFlyVerifyLiveCleanup } from "./fly-verify-live/cleanup";
import { buildFlyVerifyLiveSchemaFingerprint } from "./fly-verify-live/evidence-authority";
import {
  observeHostedVerifierState,
  validateDurableIncompleteCoverageSnapshot,
} from "./fly-verify-live/hosted-verifier-observer";
import { pollHostedVerifierState } from "./fly-verify-live/live-fixtures";
import { runFlyVerifyLiveHarness } from "./fly-verify-live/run-fly-verify-live-harness";
import { createCanonicalFlyVerifyLiveQaConfiguredEnv } from "./fly-verify-live/qa-secret-contract";
import { createPassingFlyVerifyLiveCaseRunners } from "./fly-verify-live/live-matrix";
import type { FlyVerifyLiveMatrixContext } from "./fly-verify-live/types";
import { emptyFlyVerifyLiveSession } from "./fly-verify-live/types";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function noopSql(): HeadlessSqlExecutor {
  const client = {
    async query<T = Record<string, unknown>>() {
      return { rows: [{ n: "0" }] as T[] };
    },
  };
  return {
    async withClient(fn) {
      return fn(client as never);
    },
    async withTransaction(fn) {
      return fn(client as never);
    },
  };
}

function baseCtx(input: {
  jobStore: HeadlessJobStorePort;
  ownedObjectStore: HeadlessOwnedObjectStorePort;
  dispatchOutbox?: MemoryHeadlessRenderDispatchOutboxAdapter;
}): FlyVerifyLiveMatrixContext {
  const runId = randomUUID();
  const bytes = new TextEncoder().encode(JSON.stringify({ runId }));
  const d = digest(bytes);
  return {
    runId,
    ownerId: "fvl_owner_obs00001",
    otherOwnerId: "fvl_other_obs00001",
    projectId: randomUUID(),
    nowMs: 4_000,
    env: {},
    flyAppName: "shortforge-hw-staging-4def8fa0",
    acceptedImageDigestSha256: "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
    sql: noopSql(),
    jobStore: input.jobStore,
    ownedObjectStore: input.ownedObjectStore,
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    io: {
      deleteObject: async () => ({ ok: true as const }),
      putObject: async () => ({ ok: true as const }),
      getObjectStream: async () => ({ ok: false as const, code: "NOT_FOUND" as const }),
    } as never,
    uploadCapability: {} as never,
    downloadCapability: null,
    r2Config: {
      endpoint: "https://example.r2.cloudflarestorage.com",
      accessKeyId: "a",
      secretAccessKey: "b",
      bucketAssets: "footie-assets-staging",
      bucketArtifacts: "footie-artifacts-staging",
      allowedOrigins: ["https://app.example.com"],
      accountId: "a".repeat(32),
    },
    restProducer: null,
    tcpConsumer: null,
    streamNames: {
      verifyStream: "hfq:verify:staging",
      verifyGroup: "hfq-verify-staging",
      renderStream: "hfq:render:staging",
      renderGroup: "hfq-render-staging",
    },
    streamAuthority: "production_env",
    dispatchOutbox: input.dispatchOutbox ?? new MemoryHeadlessRenderDispatchOutboxAdapter(),
    preflightFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
    trackedStreamIds: [],
    runOwnedActiveStreamIds: [],
    createdJobIds: [],
    createdProjectIds: [],
    createdObjectIds: [],
    createdR2Locators: [],
    session: {
      ...emptyFlyVerifyLiveSession(),
      bytes,
      digest: d,
      mime: "application/json",
      expectedByteLength: bytes.byteLength,
    },
  };
}

async function seedReconciledIncompleteFixture(ctx: FlyVerifyLiveMatrixContext): Promise<void> {
  assert.ok(ctx.session.bytes != null && ctx.session.digest != null);
  const jobId = randomUUID();
  const operationId = randomUUID();
  const objectId = randomUUID();
  const objectKey = "qa/staging/manifest/key";
  const storeId = "assets" as const;

  const idem = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId: ctx.ownerId, projectId: ctx.projectId },
    idempotencyKey: `fly-verify-live-${ctx.runId}`,
  });
  assert.equal(idem.ok, true);
  if (!idem.ok) return;

  const provisional = createProvisionalMaterializingRecord({
    jobId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    operationId,
    creatorIdempotencyKey: `fly-verify-live-${ctx.runId}`,
    idempotencyAuthorityKey: idem.fingerprint,
    requestedRendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
    requestedRendererBuildId: "build_obs",
    snapshotClaim: {
      manifestPayloadDigestClaim: ctx.session.digest,
      assetBundleFingerprintClaim: `hab:sha256:${"ab".repeat(32)}`,
      expectedSlotClaims: [],
    },
    stagingObjectRefs: [],
    createdAtMs: 1000,
    updatedAtMs: 1000,
    expiresAtMs: 9_000_000,
  });
  assert.equal(provisional.ok, true);
  if (!provisional.ok) return;

  const created = await ctx.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: idem.fingerprint,
    record: provisional.record,
  });
  assert.equal(created.ok, true);

  await ctx.ownedObjectStore.createStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId,
    operationId,
    purpose: "manifest",
    slotKey: null,
    storeId,
    objectKey,
    expectedContentDigestClaim: ctx.session.digest,
    expectedByteLength: ctx.session.expectedByteLength,
    expectedMimeType: ctx.session.mime,
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 100_000,
    expiresAtMs: 9_000_000,
    createdAtMs: 1000,
  });

  const claimed = await ctx.ownedObjectStore.acquireVerificationClaim({
    objectId,
    ownerId: ctx.ownerId,
    claimToken: "claim_tok",
    nowMs: 2000,
    expectedStoreVersion: 1,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  const finalized = await ctx.ownedObjectStore.finalizeStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: "claim_tok",
    contentDigest: ctx.session.digest,
    byteLength: ctx.session.expectedByteLength,
    mimeType: ctx.session.mime,
    verifiedAtMs: 3000,
    expiresAtMs: 9_000_000,
    nowMs: 3000,
  });
  assert.equal(finalized.ok, true);

  ctx.session.jobId = jobId;
  ctx.session.objectId = objectId;
  ctx.session.objectKey = objectKey;
  ctx.session.storeId = storeId;
  ctx.session.operationId = operationId;

  await workerReconcileOnce(ctx);
}

async function seedFinalizedWithoutReconcile(ctx: FlyVerifyLiveMatrixContext): Promise<void> {
  assert.ok(ctx.session.bytes != null && ctx.session.digest != null);
  const jobId = randomUUID();
  const operationId = randomUUID();
  const objectId = randomUUID();
  const objectKey = "qa/staging/manifest/key2";
  const storeId = "assets" as const;

  const idem = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId: ctx.ownerId, projectId: ctx.projectId },
    idempotencyKey: `fly-verify-live-unreconciled-${ctx.runId}`,
  });
  assert.equal(idem.ok, true);
  if (!idem.ok) return;

  const provisional = createProvisionalMaterializingRecord({
    jobId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    operationId,
    creatorIdempotencyKey: `fly-verify-live-unreconciled-${ctx.runId}`,
    idempotencyAuthorityKey: idem.fingerprint,
    requestedRendererProfile: {
      resolution: "720p",
      format: "webm",
      fps: 30,
      quality: "standard",
    },
    requestedRendererBuildId: "build_obs",
    snapshotClaim: {
      manifestPayloadDigestClaim: ctx.session.digest,
      assetBundleFingerprintClaim: `hab:sha256:${"ab".repeat(32)}`,
      expectedSlotClaims: [],
    },
    stagingObjectRefs: [],
    createdAtMs: 1000,
    updatedAtMs: 1000,
    expiresAtMs: 9_000_000,
  });
  assert.equal(provisional.ok, true);
  if (!provisional.ok) return;

  await ctx.jobStore.createProvisionalIfAbsent({
    idempotencyAuthorityKey: idem.fingerprint,
    record: provisional.record,
  });

  await ctx.ownedObjectStore.createStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    jobId,
    operationId,
    purpose: "manifest",
    slotKey: null,
    storeId,
    objectKey,
    expectedContentDigestClaim: ctx.session.digest,
    expectedByteLength: ctx.session.expectedByteLength,
    expectedMimeType: ctx.session.mime,
    uploadCapabilityIssuedAtMs: 1000,
    uploadCapabilityExpiresAtMs: 100_000,
    expiresAtMs: 9_000_000,
    createdAtMs: 1000,
  });

  const claimed = await ctx.ownedObjectStore.acquireVerificationClaim({
    objectId,
    ownerId: ctx.ownerId,
    claimToken: "claim_tok",
    nowMs: 2000,
    expectedStoreVersion: 1,
  });
  assert.equal(claimed.ok, true);
  if (!claimed.ok) return;

  await ctx.ownedObjectStore.finalizeStagingRecord({
    objectId,
    ownerId: ctx.ownerId,
    expectedStoreVersion: claimed.value.storeVersion,
    verificationClaimToken: "claim_tok",
    contentDigest: ctx.session.digest,
    byteLength: ctx.session.expectedByteLength,
    mimeType: ctx.session.mime,
    verifiedAtMs: 3000,
    expiresAtMs: 9_000_000,
    nowMs: 3000,
  });

  ctx.session.jobId = jobId;
  ctx.session.objectId = objectId;
  ctx.session.objectKey = objectKey;
  ctx.session.storeId = storeId;
  ctx.session.operationId = operationId;
}

async function workerReconcileOnce(ctx: FlyVerifyLiveMatrixContext): Promise<void> {
  assert.ok(ctx.session.objectId != null);
  const rec = await reconcileFinalizedOwnedObjectCoverage({
    jobStore: ctx.jobStore,
    ownedObjectStore: ctx.ownedObjectStore,
    objectId: ctx.session.objectId,
    ownerId: ctx.ownerId,
    nowMs: 5000,
  });
  assert.equal(rec.ok, true);
}

function wrapWriteCounter<T extends HeadlessJobStorePort>(inner: T): {
  store: T;
  writes: () => number;
} {
  let count = 0;
  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (
        prop === "createProvisionalIfAbsent" ||
        prop === "updateProvisionalRecord" ||
        prop === "promoteProvisionalToCanonical"
      ) {
        return (...args: unknown[]) => {
          count += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value.bind(target);
    },
  });
  return { store: proxy, writes: () => count };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.7A.2 — Fly verify live observation authority\n",
  );

  await test("worker reconciled before observer → read-only PASS", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    await seedReconciledIncompleteFixture(ctx);
    const state = await observeHostedVerifierState(ctx);
    assert.equal(state.attribution.observation_status, "ok");
    assert.equal(state.coverageReconciled, true);
    assert.equal(state.coverageComplete, false);
    assert.equal(state.promoted, false);
  });

  await test("incomplete manifest-only coverage → expected PASS cases", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    await seedReconciledIncompleteFixture(ctx);
    const state = await pollHostedVerifierState(ctx);
    assert.equal(state.coverageReconciled, true);
    assert.equal(state.coverageComplete, false);
    assert.equal(state.renderDispatchPresent, false);
  });

  await test("missing durable binding → FAIL observation", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    await seedFinalizedWithoutReconcile(ctx);
    const state = await observeHostedVerifierState(ctx);
    assert.equal(state.coverageReconciled, false);
    assert.notEqual(state.attribution.observation_status, "ok");
  });

  await test("observer performs zero writes/CAS", async () => {
    const inner = new MemoryHeadlessJobStoreAdapter();
    const { store, writes } = wrapWriteCounter(inner);
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore: store, ownedObjectStore: owned });
    await seedReconciledIncompleteFixture(ctx);
    const before = writes();
    await observeHostedVerifierState(ctx);
    assert.equal(writes(), before);
  });

  await test("validateDurableIncompleteCoverageSnapshot rejects duplicate manifest refs", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    await seedReconciledIncompleteFixture(ctx);
    const ownedRow = await owned.getByObjectIdAndOwner({
      objectId: ctx.session.objectId!,
      ownerId: ctx.ownerId,
    });
    const jobRow = await jobStore.getByJobIdAndOwner(ctx.session.jobId!, ctx.ownerId);
    assert.ok(ownedRow.ok && ownedRow.value?.record.stage === "finalized");
    assert.ok(jobRow.ok && isProvisionalStoredJobRecord(jobRow.value));
    const dupJob = {
      ...jobRow.value,
      stagingObjectRefs: [
        ...jobRow.value.stagingObjectRefs,
        ...jobRow.value.stagingObjectRefs,
      ],
    };
    const snap = validateDurableIncompleteCoverageSnapshot({
      objectId: ctx.session.objectId!,
      ownerId: ctx.ownerId,
      finalized: ownedRow.value!.record,
      provisional: dupJob,
    });
    assert.equal(snap.ok, false);
    if (!snap.ok) assert.equal(snap.status, "manifest_staging_ref_duplicate");
  });

  await test("first-case failure still runs cleanup", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-obs-"));
    const evidencePath = path.join(dir, "evidence.md");
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    delete env.HEADLESS_FLY_VERIFY_QA;
    const configured = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    const failingRunners = {
      ...createPassingFlyVerifyLiveCaseRunners(),
      "provisional.create": async () => ({
        caseId: "provisional.create" as const,
        status: "FAIL" as const,
        failureCategory: "PROVISIONAL_CREATE_FAILED" as const,
      }),
    };
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const result = await runFlyVerifyLiveHarness({
      env: configured,
      evidencePath,
      forceGateOn: true,
      injectedSql: noopSql(),
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedDispatchOutbox: new MemoryHeadlessRenderDispatchOutboxAdapter(),
      injectedTcpConsumer: streamQueue as never,
      injectedRestProducer: streamQueue as never,
      injectedFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
      readFlyTopology: async () => ({
        verifyCount: 1,
        renderCount: 0,
        region: "iad",
        verifyMachineId: "abc",
        imageDigestSha256:
          "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
      }),
      caseRunners: failingRunners,
    });
    assert.equal(result.overall, "FAIL");
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /\*\*Cleanup:\*\* ok/);
    void env;
  });

  await test("thrown runner still runs cleanup", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-obs-"));
    const evidencePath = path.join(dir, "evidence.md");
    const configured = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const throwing = {
      ...createPassingFlyVerifyLiveCaseRunners(),
      "neon.schema_fingerprint": async () => {
        throw new Error("matrix_throw_fixture");
      },
    };
    const result = await runFlyVerifyLiveHarness({
      env: configured,
      evidencePath,
      forceGateOn: true,
      injectedSql: noopSql(),
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedDispatchOutbox: new MemoryHeadlessRenderDispatchOutboxAdapter(),
      injectedTcpConsumer: streamQueue as never,
      injectedRestProducer: streamQueue as never,
      injectedFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
      readFlyTopology: async () => ({
        verifyCount: 1,
        renderCount: 0,
        region: "iad",
        verifyMachineId: "abc",
        imageDigestSha256: "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
      }),
      caseRunners: throwing,
    });
    assert.equal(result.overall, "FAIL");
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /\*\*Cleanup:\*\* ok/);
  });

  await test("cleanup failure prevents overall PASS", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "fly-verify-obs-"));
    const evidencePath = path.join(dir, "evidence.md");
    const configured = createCanonicalFlyVerifyLiveQaConfiguredEnv();
    const streamQueue = new MemoryHeadlessStreamQueueAdapter({ envName: "staging" });
    const result = await runFlyVerifyLiveHarness({
      env: configured,
      evidencePath,
      forceGateOn: true,
      injectedSql: noopSql(),
      injectedJobStore: new MemoryHeadlessJobStoreAdapter(),
      injectedOwnedObjectStore: new MemoryHeadlessOwnedObjectStoreAdapter(),
      injectedProjectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
      injectedDispatchOutbox: new MemoryHeadlessRenderDispatchOutboxAdapter(),
      injectedTcpConsumer: streamQueue as never,
      injectedRestProducer: streamQueue as never,
      injectedFingerprint: buildFlyVerifyLiveSchemaFingerprint(),
      readFlyTopology: async () => ({
        verifyCount: 1,
        renderCount: 0,
        region: "iad",
        verifyMachineId: "abc",
        imageDigestSha256: "ae06963a93d9cce80b58adb90d4eba5883c8d7bd3c01dc69df6d72acb1d3ee2e",
      }),
      pollHostedVerifier: async () => ({
        finalized: true,
        claimCleared: true,
        coverageReconciled: true,
        coverageComplete: false,
        promoted: false,
        renderDispatchPresent: false,
        verifyPendingCleared: true,
        storeVersion: 1,
      }),
      cleanupRunner: async () => "failed",
      caseRunners: createPassingFlyVerifyLiveCaseRunners(),
    });
    assert.equal(result.overall, "FAIL");
    const md = readFileSync(evidencePath, "utf8");
    assert.match(md, /\*\*Cleanup:\*\* failed/);
  });

  await test("attribution never retains digests or URLs", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    const state = await observeHostedVerifierState(ctx);
    const serialized = JSON.stringify(state.attribution);
    assert.doesNotMatch(serialized, /sha256:/);
    assert.doesNotMatch(serialized, /postgresql:\/\//);
    assert.doesNotMatch(serialized, /rediss?:\/\//);
    void state;
  });

  await test("default cleanup helper remains available", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const owned = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = baseCtx({ jobStore, ownedObjectStore: owned });
    const status = await defaultFlyVerifyLiveCleanup(ctx, false);
    assert.equal(status, "ok");
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
