/**
 * Sprint 11E Phase 2E.2D.8E — owned-object finalize probe authority (deterministic).
 * Run: npm run test:headless-fly-render-owned-object-finalize-probe-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import type { HeadlessOwnedObjectStorePort } from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import {
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "@/features/headless-renderer/domain/headless-source-slot-key";

import { buildLiveDraft } from "./neon-live/live-fixtures";
import { deriveFlyRenderJobCreateStagingPayloads } from "./fly-render-live/job-create-fixture-identity";
import {
  OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS,
  sanitizeOwnedObjectFinalizeAttributionSnapshot,
} from "./fly-render-live/owned-object-finalize-attribution";
import { runOwnedObjectStagingRecordChain } from "./fly-render-live/owned-object-staging-chain";
import {
  runOwnedObjectFinalizeChain,
} from "./fly-render-live/owned-object-finalize-chain";
import {
  assertOwnedObjectFinalizeProbeEvidenceSafe,
  preserveOrInitializeFlyRenderOwnedObjectFinalizeProbeEvidence,
  renderFlyRenderOwnedObjectFinalizeProbeEvidenceMarkdown,
} from "./fly-render-live/owned-object-finalize-probe-evidence";
import { runFlyRenderOwnedObjectFinalizeProbe } from "./fly-render-live/owned-object-finalize-probe";
import { emptyFlyRenderLiveSession } from "./fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "./fly-render-live/types";
import { digestOf } from "./r2-live/live-fixtures";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW = 1_700_000_000_000;

const CONFIG: HeadlessConfiguredR2Config = Object.freeze({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucketAssets: "assets-bucket",
  bucketArtifacts: "artifacts-bucket",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  allowedOrigins: Object.freeze(["https://app.example.com"]),
});

function buildCtx(
  ownedObjectStore: HeadlessOwnedObjectStorePort,
  fake?: FakeS3Client,
): FlyRenderLiveMatrixContext {
  const runId = randomUUID();
  const s3 = fake ?? new FakeS3Client();
  return {
    runId,
    ownerId: `oofp_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `oofp_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    nowMs: NOW,
    sql: {
      withClient: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
      withTransaction: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
    } as never,
    jobStore: new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore,
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: s3,
      authorizeOwner: () => true,
    }),
    uploadCapability: null,
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
    streamNames: deriveHeadlessQueueStreamNames("staging"),
    streamAuthority: "production_env",
    dispatchOutbox: {
      createIntentIfAbsent: async () => ({
        ok: false as const,
        issues: [{ code: "BLOCKED", message: "blocked" }],
      }),
    } as never,
    preflightFingerprint: null,
    trackedStreamIds: [],
    runOwnedActiveStreamIds: [],
    smokePollTimeoutMs: 180_000,
    smokeContentDurationMs: 2_000,
    resourceObservation: null,
  };
}

async function stageFullFixture(ctx: FlyRenderLiveMatrixContext) {
  const runId = randomUUID();
  const draft = await buildLiveDraft({
    runId,
    ownerId: ctx.ownerId,
    projectId: ctx.projectId,
    emptyStaging: true,
    creatorKey: "x",
    randomUUID: () => randomUUID(),
  });
  const payloads = deriveFlyRenderJobCreateStagingPayloads(draft);
  const staging = await runOwnedObjectStagingRecordChain({
    ctx,
    payloads,
    jobId: draft.jobId,
    operationId: draft.operationId,
  });
  assert.equal(staging.ok, true);
  if (!staging.ok) throw new Error("staging_failed");
  return { payloads, staged: staging.staged };
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8E — owned-object finalize probe authority\n",
  );

  await test("finalize substage registry is frozen allowlist", () => {
    assert.equal(OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS.length, 12);
    assert.equal(Object.isFrozen(OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS), true);
    assert.ok(OWNED_OBJECT_FINALIZE_SUBSTAGE_IDS.includes("neon_finalize_transaction"));
  });

  await test("successful finalize for full live fixture on memory + fake R2", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({ ctx, staged, payloads });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.finalizedObjectIds.length, payloads.length);
    assert.equal(chain.finalizeAttribution.resultKind, "finalized");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "successful_finalize",
    );
  });

  await test("manifest purpose finalize succeeds", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("{}");
    const staging = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "manifest",
          slotKey: null,
          bytes,
          digest: digestOf(bytes),
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [
        {
          purpose: "manifest",
          slotKey: null,
          bytes,
          digest: digestOf(bytes),
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
    });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.finalizeAttribution.objectPurposeClass, "manifest");
  });

  await test("asset_bundle purpose finalize succeeds", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("bundle");
    const staging = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "asset_bundle_record",
          slotKey: null,
          bytes,
          digest: digestOf(bytes),
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [
        {
          purpose: "asset_bundle_record",
          slotKey: null,
          bytes,
          digest: digestOf(bytes),
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
    });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.finalizeAttribution.objectPurposeClass, "asset_bundle");
  });

  await test("live-shaped hslot:v2 asset_bytes finalize succeeds", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const runId = randomUUID();
    const draft = await buildLiveDraft({
      runId,
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      emptyStaging: true,
      creatorKey: "x",
      randomUUID: () => randomUUID(),
    });
    const asset = deriveFlyRenderJobCreateStagingPayloads(draft).find(
      (p) => p.purpose === "asset_bytes",
    );
    assert.ok(asset?.slotKey);
    assert.ok(asset.slotKey.length > 128);
    assert.ok(asset.slotKey.length <= HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH);
    const staging = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [asset],
      jobId: draft.jobId,
      operationId: draft.operationId,
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [asset],
    });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.finalizeAttribution.objectPurposeClass, "asset_bytes");
    assert.equal(chain.finalizeAttribution.slotKeyClass, "hslot_v2");
    assert.equal(
      chain.finalizeAttribution.slotKeyLengthClass,
      "exceeds_neon_varchar_128_within_ts_max",
    );
  });

  await test("neon connect failure attributes neon_finalize_connect", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { failConnect: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_finalize_connect");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "provider_connection_unavailable",
    );
    assert.equal(chain.finalizeAttribution.safeControlPlaneCode, "DATABASE_UNAVAILABLE");
  });

  await test("neon transaction failure attributes neon_finalize_transaction", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { failTransaction: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_finalize_transaction");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "provider_transaction_unavailable",
    );
  });

  await test("stale storeVersion attributes neon_finalize_update", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { staleStoreVersion: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_finalize_update");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "stale_cas_store_version",
    );
  });

  await test("malformed RETURNING row attributes neon_finalize_returning_map", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { forceReturningMismatch: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_finalize_returning_map");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "malformed_returning_row",
    );
  });

  await test("post-write reread failure attributes neon_finalize_reread", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { forcePostFinalizeRereadMismatch: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_finalize_reread");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "post_write_reread_failed",
    );
  });

  await test("post-write coherence mismatch attributes finalized_coherence_assertion", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
      storeHooks: { forceCoherenceMismatch: true },
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "finalized_coherence_assertion");
    assert.equal(
      chain.finalizeAttribution.failureBoundaryClass,
      "metadata_coherence_rejection",
    );
  });

  await test("finalized replay on second pass is idempotent", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    const first = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
    });
    assert.equal(first.ok, true);
    const replay = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
    });
    assert.equal(replay.ok, true);
    if (!replay.ok) return;
    assert.equal(replay.finalizeAttribution.resultKind, "idempotent_replay");
  });

  await test("concurrent finalize surfaces stale CAS at neon_finalize_update", async () => {
    const inner = new MemoryHeadlessOwnedObjectStoreAdapter();
    const ctx = buildCtx(inner);
    const bytes = new TextEncoder().encode("concurrent");
    const staging = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "manifest",
          slotKey: null,
          bytes,
          digest: digestOf(bytes),
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    const payload = {
      purpose: "manifest" as const,
      slotKey: null,
      bytes,
      digest: digestOf(bytes),
      mime: "application/json",
      byteLength: bytes.byteLength,
    };
    const first = runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [payload],
    });
    const second = runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [payload],
    });
    const results = await Promise.all([first, second]);
    const failed = results.filter((r) => !r.ok);
    assert.ok(failed.length >= 1);
    const fail = failed[0]!;
    if (fail.ok) return;
    assert.equal(fail.failureSubstage, "neon_finalize_update");
  });

  await test("r2 upload failure attributes r2_upload substage", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const { payloads, staged } = await stageFullFixture(ctx);
    ctx.io.writeUploadStream = async () => ({
      ok: false as const,
      issues: [{ code: "STORAGE_UNAVAILABLE", message: "blocked" }],
    });
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: [staged[0]!],
      payloads: [payloads[0]!],
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "r2_upload");
  });

  await test("sanitizeOwnedObjectFinalizeAttributionSnapshot rejects hostile fields", () => {
    const clean = sanitizeOwnedObjectFinalizeAttributionSnapshot({
      finalizeSubstage: "neon_finalize_transaction",
      objectPurposeClass: "manifest",
      slotKeyClass: "null",
      slotKeyLengthClass: "none",
      storeClass: "assets",
      resultKind: "failed",
      safeControlPlaneCode: "DATABASE_UNAVAILABLE",
      failureBoundaryClass: "provider_transaction_unavailable",
    });
    assert.ok(clean);
    assert.equal(
      sanitizeOwnedObjectFinalizeAttributionSnapshot({
        ...clean,
        finalizeSubstage: "evil_stage",
      }),
      undefined,
    );
  });

  await test("gate-off finalize probe preserves evidence with zero connections", async () => {
    const path = `/tmp/fly-render-oofp-${Date.now()}.md`;
    const result = await runFlyRenderOwnedObjectFinalizeProbe({
      evidencePath: path,
      env: {},
    });
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(result.overall, "NOT_TESTED");
    const preserved = preserveOrInitializeFlyRenderOwnedObjectFinalizeProbeEvidence(
      path,
    );
    assert.equal(preserved.action, "preserved");
  });

  await test("finalize probe evidence markdown passes privacy authority", () => {
    const md = renderFlyRenderOwnedObjectFinalizeProbeEvidenceMarkdown({
      title: "probe",
      overall: "FAIL",
      eligibilityVerdict: "FAIL",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      failureSubstage: "neon_finalize_transaction",
      failureReasonId: "neon_finalize_transaction_failed",
      substages: [
        {
          substage: "neon_finalize_transaction",
          status: "failed",
          reasonId: "neon_finalize_transaction_failed",
        },
      ],
      finalizeAttribution: {
        finalizeSubstage: "neon_finalize_transaction",
        objectPurposeClass: "manifest",
        slotKeyClass: "null",
        slotKeyLengthClass: "none",
        storeClass: "assets",
        resultKind: "failed",
        safeControlPlaneCode: "DATABASE_UNAVAILABLE",
        failureBoundaryClass: "provider_transaction_unavailable",
      },
      finalizedObjectCount: 0,
      cleanupStatus: "ok",
      notes: ["safe note"],
    });
    const safe = assertOwnedObjectFinalizeProbeEvidenceSafe(md);
    assert.equal(safe.ok, true);
    writeFileSync(`/tmp/oofp-evidence-${Date.now()}.md`, md);
  });

  await test("within_neon_varchar_128 hslot asset finalize succeeds", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("short");
    const slotKey = headlessSourceSlotKey({
      role: "p",
      sceneId: "s",
      mediaItemId: "m",
      sourceDigest: `sha256:${"b".repeat(64)}`,
      expectedMediaKind: "video",
    });
    const staging = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "asset_bytes",
          slotKey,
          bytes,
          digest: digestOf(bytes),
          mime: "video/mp4",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(staging.ok, true);
    if (!staging.ok) return;
    const chain = await runOwnedObjectFinalizeChain({
      ctx,
      staged: staging.staged,
      payloads: [
        {
          purpose: "asset_bytes",
          slotKey,
          bytes,
          digest: digestOf(bytes),
          mime: "video/mp4",
          byteLength: bytes.byteLength,
        },
      ],
    });
    assert.equal(chain.ok, true);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
