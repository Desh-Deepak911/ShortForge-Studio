/**
 * Sprint 11E Phase 2E.2D.8C.1 — owned-object staging probe authority (deterministic).
 * Run: npm run test:headless-fly-render-owned-object-staging-probe-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { cpFail } from "@/features/headless-renderer/control-plane/types/control-plane.types";
import type {
  HeadlessCreateStagingOwnedObjectInput,
  HeadlessOwnedObjectStorePort,
} from "@/features/headless-renderer/control-plane/ports/owned-object-store.port";
import {
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH } from "@/features/headless-renderer/domain/headless-source-slot-key";

import { buildLiveDraft } from "../neon-live/live-fixtures";
import { deriveFlyRenderJobCreateStagingPayloads } from "../fly-render-live/job-create-fixture-identity";
import {
  NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT,
  OWNED_OBJECT_STAGING_VALIDATION_LIMIT_AUDIT,
  classifyStagingSlotKeyLengthClass,
  sanitizeOwnedObjectStagingAttributionSnapshot,
} from "../fly-render-live/owned-object-staging-attribution";
import {
  assertProductionR2DeriverAcceptsStagingIdentities,
  runOwnedObjectStagingRecordChain,
} from "../fly-render-live/owned-object-staging-chain";
import {
  assertOwnedObjectStagingProbeEvidenceSafe,
  preserveOrInitializeFlyRenderOwnedObjectStagingProbeEvidence,
  renderFlyRenderOwnedObjectStagingProbeEvidenceMarkdown,
} from "../fly-render-live/owned-object-staging-probe-evidence";
import { runFlyRenderOwnedObjectStagingProbe } from "../fly-render-live/owned-object-staging-probe";
import { emptyFlyRenderLiveSession } from "../fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "../fly-render-live/types";
import { digestOf } from "../r2-live/live-fixtures";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW = 1_700_000_000_000;

class NeonVarcharSlotKeyOwnedObjectStore
  implements Pick<HeadlessOwnedObjectStorePort, "createStagingRecord" | "getByObjectIdAndOwner">
{
  constructor(
    private readonly inner: MemoryHeadlessOwnedObjectStoreAdapter,
    private readonly options?: {
      readonly forceReturningMismatch?: boolean;
      readonly forceRereadMismatch?: boolean;
    },
  ) {}

  createStagingRecord(input: HeadlessCreateStagingOwnedObjectInput) {
    if (
      input.slotKey != null &&
      input.slotKey.length > NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT
    ) {
      return Promise.resolve(
        cpFail(
          "DATABASE_UNAVAILABLE",
          "Durable database is temporarily unavailable.",
        ),
      );
    }
    if (this.options?.forceReturningMismatch) {
      return Promise.resolve(
        cpFail(
          "JOB_STORE_COHERENCE_REJECTED",
          "Persisted database row failed coherence checks.",
        ),
      );
    }
    return this.inner.createStagingRecord(input);
  }

  getByObjectIdAndOwner(input: { objectId: string; ownerId: string }) {
    if (this.options?.forceRereadMismatch) {
      return Promise.resolve(cpFail("JOB_NOT_FOUND", "Owned object not found."));
    }
    return this.inner.getByObjectIdAndOwner(input);
  }
}

function buildCtx(
  ownedObjectStore: HeadlessOwnedObjectStorePort,
): FlyRenderLiveMatrixContext {
  const runId = randomUUID();
  return {
    runId,
    ownerId: `oosp_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `oosp_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    nowMs: NOW,
    sql: {
      withClient: async (fn: (client: never) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
      withTransaction: async (fn: (client: never) => Promise<unknown>) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
    } as never,
    jobStore: new MemoryHeadlessJobStoreAdapter(),
    ownedObjectStore,
    projectAuthorization: new MemoryHeadlessProjectOwnershipAdapter(),
    io: {
      writeUploadStream: async () => ({
        ok: false as const,
        issues: [{ code: "BLOCKED", message: "blocked" }],
      }),
    } as never,
    uploadCapability: undefined as never,
    downloadCapability: null,
    r2Config: {
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketAssets: "assets",
      bucketArtifacts: "artifacts",
      endpoint: "https://acct.r2.example.com",
      allowedOrigins: [],
    },
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
    streamNames: { render: "r", verify: "v" } as never,
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

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8C.1 — owned-object staging probe authority\n",
  );

  await test("validation limit audit documents TS vs Neon slot_key (004 baseline + 007 effective)", () => {
    const ts = OWNED_OBJECT_STAGING_VALIDATION_LIMIT_AUDIT.find(
      (r) => r.layer === "typescript_validator" && r.field === "slot_key",
    );
    const neon004 = OWNED_OBJECT_STAGING_VALIDATION_LIMIT_AUDIT.find(
      (r) => r.layer === "neon_sql_schema" && r.field === "slot_key",
    );
    const neonPost007 = OWNED_OBJECT_STAGING_VALIDATION_LIMIT_AUDIT.find(
      (r) => r.layer === "neon_sql_schema_post_007" && r.field === "slot_key",
    );
    assert.ok(ts);
    assert.ok(neon004);
    assert.ok(neonPost007);
    assert.equal(ts!.limit, 1024);
    assert.equal(neon004!.limit, 128);
    assert.equal(neonPost007!.limit, 1024);
  });

  await test("live fixture slot keys exceed Neon VARCHAR(128) but stay within TS max", async () => {
    const runId = randomUUID();
    const draft = await buildLiveDraft({
      runId,
      ownerId: "owner",
      projectId: randomUUID(),
      emptyStaging: true,
      creatorKey: "fixture",
      randomUUID: () => randomUUID(),
    });
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draft);
    const assetPayloads = payloads.filter((p) => p.purpose === "asset_bytes");
    assert.ok(assetPayloads.length >= 1);
    for (const p of assetPayloads) {
      assert.ok(p.slotKey != null);
      assert.ok(p.slotKey!.length > NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT);
      assert.ok(p.slotKey!.length <= HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH);
      assert.equal(
        classifyStagingSlotKeyLengthClass({ slotKey: p.slotKey }),
        "exceeds_neon_varchar_128_within_ts_max",
      );
    }
  });

  await test("manifest and bundle null-slot staging succeed on memory store", async () => {
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
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draft).slice(0, 2);
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads,
      jobId: draft.jobId,
      operationId: draft.operationId,
    });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.staged.length, 2);
  });

  await test("full fixture staging succeeds on memory store (all substages ok)", async () => {
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
    const payloads = deriveFlyRenderJobCreateStagingPayloads(draft);
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads,
      jobId: draft.jobId,
      operationId: draft.operationId,
    });
    assert.equal(chain.ok, true);
    if (!chain.ok) return;
    assert.equal(chain.staged.length, payloads.length);
    assert.equal(ctx.createdObjectIds.length, payloads.length);
  });

  await test("Neon VARCHAR(128) boundary fails at neon_staging_insert on first long hslot asset", async () => {
    const inner = new MemoryHeadlessOwnedObjectStoreAdapter();
    const store = new NeonVarcharSlotKeyOwnedObjectStore(inner);
    const ctx = buildCtx(store as never);
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
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads,
      jobId: draft.jobId,
      operationId: draft.operationId,
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_staging_insert");
    assert.equal(chain.failureReasonId, "neon_staging_insert_failed");
    assert.equal(chain.stagingAttribution.objectPurposeClass, "asset_bytes");
    assert.equal(chain.stagingAttribution.slotKeyClass, "hslot_v2");
    assert.equal(
      chain.stagingAttribution.slotKeyLengthClass,
      "exceeds_neon_varchar_128_within_ts_max",
    );
    assert.equal(chain.stagingAttribution.safeControlPlaneCode, "DATABASE_UNAVAILABLE");
  });

  await test("malformed hslot:v2 fails at slot_key_validation", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("{}");
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "asset_bytes",
          slotKey: "hslot:v2:not-canonical",
          bytes,
          digest: digestOf(bytes),
          mime: "video/mp4",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "slot_key_validation");
    assert.equal(
      chain.stagingAttribution.slotKeyLengthClass,
      "malformed",
    );
  });

  await test("first rejected slot length exceeds TS max", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("x");
    const tooLong = `hslot:v2:${"a".repeat(HEADLESS_SOURCE_SLOT_KEY_MAX_LENGTH)}`;
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "asset_bytes",
          slotKey: tooLong,
          bytes,
          digest: digestOf(bytes),
          mime: "video/mp4",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "slot_key_validation");
    assert.equal(chain.stagingAttribution.slotKeyLengthClass, "exceeds_ts_max");
  });

  await test("within_neon_varchar_128 hslot staging succeeds", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("short-slot");
    const slotKey = headlessSourceSlotKey({
      role: "p",
      sceneId: "s",
      mediaItemId: "m",
      sourceDigest: `sha256:${"a".repeat(64)}`,
    });
    assert.ok(slotKey.length <= NEON_OWNED_OBJECT_SLOT_KEY_VARCHAR_LIMIT);
    const chain = await runOwnedObjectStagingRecordChain({
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
    assert.equal(chain.ok, true);
  });

  await test("RETURNING map failure attributes neon_staging_returning_map", async () => {
    const inner = new MemoryHeadlessOwnedObjectStoreAdapter();
    const store = new NeonVarcharSlotKeyOwnedObjectStore(inner, {
      forceReturningMismatch: true,
    });
    const ctx = buildCtx(store as never);
    const bytes = new TextEncoder().encode("{}");
    const chain = await runOwnedObjectStagingRecordChain({
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
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_staging_returning_map");
  });

  await test("reread mismatch attributes neon_staging_reread", async () => {
    const inner = new MemoryHeadlessOwnedObjectStoreAdapter();
    const store = new NeonVarcharSlotKeyOwnedObjectStore(inner, {
      forceRereadMismatch: true,
    });
    const ctx = buildCtx(store as never);
    const bytes = new TextEncoder().encode("{}");
    const chain = await runOwnedObjectStagingRecordChain({
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
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "neon_staging_reread");
  });

  await test("idempotent createStagingRecord replay succeeds on memory adapter", async () => {
    const store = new MemoryHeadlessOwnedObjectStoreAdapter();
    const objectId = randomUUID();
    const input = {
      objectId,
      ownerId: "owner_a",
      projectId: randomUUID(),
      jobId: randomUUID(),
      operationId: randomUUID(),
      purpose: "manifest" as const,
      slotKey: null,
      storeId: "assets" as const,
      objectKey: "qa/stg/assets/manifest/abc",
      expectedContentDigestClaim: `sha256:${"cd".repeat(32)}`,
      expectedByteLength: 2,
      expectedMimeType: "application/json",
      uploadCapabilityIssuedAtMs: NOW,
      uploadCapabilityExpiresAtMs: NOW + 600_000,
      expiresAtMs: NOW + 3_600_000,
      createdAtMs: NOW,
    };
    const first = await store.createStagingRecord(input);
    const second = await store.createStagingRecord(input);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
  });

  await test("hostile digest fails at staging_input_construction", async () => {
    const ctx = buildCtx(new MemoryHeadlessOwnedObjectStoreAdapter());
    const bytes = new TextEncoder().encode("{}");
    const chain = await runOwnedObjectStagingRecordChain({
      ctx,
      payloads: [
        {
          purpose: "manifest",
          slotKey: null,
          bytes,
          digest: "not-a-digest",
          mime: "application/json",
          byteLength: bytes.byteLength,
        },
      ],
      jobId: randomUUID(),
      operationId: randomUUID(),
    });
    assert.equal(chain.ok, false);
    if (chain.ok) return;
    assert.equal(chain.failureSubstage, "staging_input_construction");
  });

  await test("sanitizeOwnedObjectStagingAttributionSnapshot rejects hostile fields", () => {
    const clean = sanitizeOwnedObjectStagingAttributionSnapshot({
      stagingSubstage: "neon_staging_insert",
      objectPurposeClass: "asset_bytes",
      slotKeyClass: "hslot_v2",
      slotKeyLengthClass: "exceeds_neon_varchar_128_within_ts_max",
      storeClass: "assets",
      resultKind: "failed",
      safeControlPlaneCode: "DATABASE_UNAVAILABLE",
    });
    assert.ok(clean);
    assert.equal(
      sanitizeOwnedObjectStagingAttributionSnapshot({
        ...clean,
        stagingSubstage: "evil_stage",
      }),
      undefined,
    );
  });

  await test("gate-off probe preserves evidence with zero connections", async () => {
    const path = `/tmp/fly-render-oosp-${Date.now()}.md`;
    const result = await runFlyRenderOwnedObjectStagingProbe({
      evidencePath: path,
      env: {},
    });
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(result.overall, "NOT_TESTED");
    const preserved = preserveOrInitializeFlyRenderOwnedObjectStagingProbeEvidence(
      path,
    );
    assert.equal(preserved.action, "preserved");
  });

  await test("probe evidence markdown passes privacy authority", () => {
    const md = renderFlyRenderOwnedObjectStagingProbeEvidenceMarkdown({
      title: "probe",
      overall: "FAIL",
      eligibilityVerdict: "FAIL",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      failureSubstage: "neon_staging_insert",
      failureReasonId: "neon_staging_insert_failed",
      substages: [
        { substage: "neon_staging_insert", status: "failed", reasonId: "neon_staging_insert_failed" },
      ],
      stagingAttribution: {
        stagingSubstage: "neon_staging_insert",
        objectPurposeClass: "asset_bytes",
        slotKeyClass: "hslot_v2",
        slotKeyLengthClass: "exceeds_neon_varchar_128_within_ts_max",
        storeClass: "assets",
        resultKind: "failed",
        safeControlPlaneCode: "DATABASE_UNAVAILABLE",
      },
      stagedRecordCount: 2,
      cleanupStatus: "ok",
      notes: ["safe note"],
    });
    const safe = assertOwnedObjectStagingProbeEvidenceSafe(md);
    assert.equal(safe.ok, true);
    writeFileSync(`/tmp/oosp-evidence-${Date.now()}.md`, md);
  });

  await test("production R2 deriver rejects raw long slotKey but QA path accepts fixture", async () => {
    const runId = randomUUID();
    const draft = await buildLiveDraft({
      runId,
      ownerId: "owner",
      projectId: randomUUID(),
      emptyStaging: true,
      creatorKey: "x",
      randomUUID: () => randomUUID(),
    });
    const asset = deriveFlyRenderJobCreateStagingPayloads(draft).find(
      (p) => p.purpose === "asset_bytes",
    );
    assert.ok(asset?.slotKey);
    assert.equal(
      assertProductionR2DeriverAcceptsStagingIdentities({
        ownerId: "owner",
        projectId: draft.projectId,
        jobId: draft.jobId,
        operationId: draft.operationId,
        purpose: "asset_bytes",
        slotKey: asset.slotKey,
      }),
      true,
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
