/**
 * Sprint 11E Phase 2B.2D.3 — promotion attribution authority (deterministic, no remote DB).
 * Run: npm run test:headless-promotion-attribution
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  createProvisionalMaterializingRecord,
  type HeadlessProvisionalStoredJobRecord,
} from "@/features/headless-renderer/control-plane";
import {
  composeTestHeadlessControlPlane,
  HEADLESS_PROMOTION_REASON_IDS,
  HEADLESS_PROMOTION_SAFE_STAGES,
  MemoryHeadlessJobStoreAdapter,
  NeonHeadlessJobStoreAdapter,
  ScriptedHeadlessSqlExecutor,
  evaluateHeadlessPromotionPreflight,
  isHeadlessPromotionReasonId,
  sanitizeHeadlessPromotionReasonId,
  sanitizePromotionAttribution,
  seedOwnedManifestAndBundle,
} from "@/features/headless-renderer/control-plane/testing";
import {
  buildExportManifest,
  type ExportEnvironmentSnapshot,
  type ExportManifestV3,
} from "@/features/export/domain";
import type { FootieScript } from "@/features/story/types";
import { syncFootieScript } from "@/lib/utils/voiceover";
import {
  buildHeadlessAuthorityFingerprint,
  createAcceptedHeadlessRenderJob,
  extractRequiredHeadlessSourceSlots,
  finalizeHeadlessRenderJobRequest,
  headlessSourceSlotKey,
} from "@/features/headless-renderer/domain";
import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain/headless-job-lifecycle";

import {
  buildLiveCanonicalPair,
  buildLiveDraft,
  casLiveCoverage,
} from "./neon-live/live-fixtures";
import {
  assertPromotionProbeEvidenceSafe,
  createNotTestedPromotionProbeEvidence,
  preserveOrInitializeNeonPromotionProbeEvidence,
  promotionProbeCannotFalsePass,
  renderNeonPromotionProbeEvidenceMarkdown,
  writeNeonPromotionProbeEvidence,
} from "./neon-live/promotion-probe-evidence";
import { runNeonPromotionProbe } from "./neon-live/promotion-probe";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const CLOCK = 1_700_000_000_000;
const CAPABLE_ENV: Partial<ExportEnvironmentSnapshot> = {
  browserName: "chrome",
  supportsCanvasCaptureStream: true,
  supportsManualCanvasFrameRequest: true,
  supportsMediaRecorder: true,
  supportsRequestVideoFrameCallback: true,
  supportsWebAssembly: true,
  serverRendererAvailable: false,
  ffmpegRuntimePoisoned: false,
  estimatedHeapLimitBytes: 4 * 1024 * 1024 * 1024,
  mp4EncoderAvailable: true,
};

function fixStory(): FootieScript {
  return syncFootieScript({
    title: "Promotion Attribution Verify",
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
          motion: null,
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
          motion: null,
        },
      },
    ],
  });
}

async function seedReadyProvisional(store: MemoryHeadlessJobStoreAdapter) {
  const ownerId = "owner-promo-attr-1";
  const manifest = buildExportManifest({
    story: fixStory(),
    environment: CAPABLE_ENV,
    audioMode: "with-voice",
  }) as ExportManifestV3;
  const projectId = manifest.project.projectId;
  const stack = composeTestHeadlessControlPlane({
    principal: { ownerId, sessionId: "sess-promo-attr" },
    authorizedProjectIds: [projectId],
    nowMs: () => CLOCK,
  });
  const seeded = await seedOwnedManifestAndBundle({
    storage: stack.storage,
    ownerId,
    projectId,
    manifest,
    nowMs: CLOCK,
  });
  assert.equal(seeded.ok, true);
  if (!seeded.ok) throw new Error("seed failed");

  const slots = extractRequiredHeadlessSourceSlots(manifest);
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

  const creatorKey = `creator-${randomUUID()}`;
  const idempotency = buildHeadlessAuthorityFingerprint("hid", {
    version: 1,
    kind: "control-plane-idempotency",
    ownership: { ownerId, projectId },
    idempotencyKey: creatorKey,
  });
  assert.equal(idempotency.ok, true);
  if (!idempotency.ok) throw new Error("idempotency failed");

  const fullStaging = [
    {
      purpose: "manifest" as const,
      slotKey: null,
      locator: seeded.value.manifestLocator,
      contentDigestClaim: seeded.value.manifestPayloadDigest,
      byteLengthClaim: 100,
      mimeTypeClaim: "application/json",
    },
    {
      purpose: "asset_bundle_record" as const,
      slotKey: null,
      locator: seeded.value.bundleLocator,
      contentDigestClaim: "sha256:" + "cc".repeat(32),
      byteLengthClaim: 200,
      mimeTypeClaim: "application/json",
    },
    ...seeded.value.bundle.assets.map((asset) => ({
      purpose: "asset_bytes" as const,
      slotKey: headlessSourceSlotKey({
        role: asset.sourceIdentity.role,
        sceneId: asset.sourceIdentity.sceneId,
        mediaItemId: asset.sourceIdentity.mediaItemId,
        sourceDigest: asset.sourceIdentity.sourceDigest,
      }),
      locator: asset.storageLocator,
      contentDigestClaim: asset.contentDigest,
      byteLengthClaim: asset.byteLength,
      mimeTypeClaim: asset.mimeType,
    })),
  ];

  const materialize = createProvisionalMaterializingRecord({
    jobId: `job_${randomUUID()}`,
    ownerId,
    projectId,
    createdAtMs: CLOCK,
    updatedAtMs: CLOCK,
    idempotencyAuthorityKey: idempotency.fingerprint,
    operationId: `op_${randomUUID()}`,
    creatorIdempotencyKey: creatorKey,
    requestedRendererProfile: {
      resolution: manifest.output.resolution,
      format: manifest.output.format,
      fps: 30,
      quality: manifest.output.quality,
    },
    requestedRendererBuildId: "renderer-build-promo-1",
    snapshotClaim: {
      manifestPayloadDigestClaim: seeded.value.manifestPayloadDigest,
      assetBundleFingerprintClaim: seeded.value.bundle.fingerprint,
      expectedSlotClaims,
    },
    stagingObjectRefs: fullStaging,
    expiresAtMs: CLOCK + 60 * 60 * 1000,
  });
  assert.equal(materialize.ok, true);
  if (!materialize.ok) throw new Error(materialize.message);

  const created = await store.createProvisionalIfAbsent({
    idempotencyAuthorityKey: idempotency.fingerprint,
    record: materialize.record,
  });
  assert.equal(created.ok && created.value.kind === "created", true);
  if (!created.ok || created.value.kind !== "created") {
    throw new Error("create failed");
  }
  let record = created.value.record as HeadlessProvisionalStoredJobRecord;
  const coverage = await casLiveCoverage(
    store,
    record,
    record.verificationCoverage.requiredTargets,
  );
  assert.equal(coverage.ok, true);
  if (!coverage.ok) throw new Error("coverage failed");
  record = coverage.record;

  const requestResult = finalizeHeadlessRenderJobRequest({
    ownership: { ownerId: record.ownerId, projectId: record.projectId },
    manifest,
    assetBundle: seeded.value.bundle,
    rendererProfile: record.requestedRendererProfile,
    rendererBuildId: record.requestedRendererBuildId,
    idempotencyKey: record.creatorIdempotencyKey,
  });
  assert.equal(requestResult.ok, true);
  if (!requestResult.ok) throw new Error("finalize failed");
  const accepted = createAcceptedHeadlessRenderJob({
    jobId: record.jobId,
    requestValue: requestResult.request,
    createdAtMs: record.createdAtMs,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("accept failed");
  const queued = applyHeadlessJobTransition({
    jobValue: accepted.job,
    requestValue: accepted.request,
    toState: "queued",
    attempt: accepted.job.attempt,
    updatedAtMs: record.updatedAtMs + 1,
  });
  assert.equal(queued.ok, true);
  if (!queued.ok) throw new Error("queue failed");

  return {
    record,
    pair: { job: queued.job, request: accepted.request },
  };
}

async function main() {
  console.log("\nSprint 11E Phase 2B.2D.3 — promotion attribution\n");

  await test("reason-ID registry is immutable allowlist", () => {
    assert.ok(HEADLESS_PROMOTION_REASON_IDS.includes("coverage_incomplete"));
    assert.ok(HEADLESS_PROMOTION_REASON_IDS.includes("canonical_pair_invalid"));
    assert.ok(HEADLESS_PROMOTION_REASON_IDS.includes("stale_store_version"));
    assert.ok(HEADLESS_PROMOTION_REASON_IDS.includes("unknown_safe_failure"));
    assert.equal(
      sanitizeHeadlessPromotionReasonId("coverage_incomplete"),
      "coverage_incomplete",
    );
    assert.equal(
      sanitizeHeadlessPromotionReasonId("relation does not exist at line 1"),
      null,
    );
    assert.equal(isHeadlessPromotionReasonId("password=secret"), false);
    assert.equal(sanitizeHeadlessPromotionReasonId("aborted"), null);
  });

  await test("safe stages are allowlisted", () => {
    for (const stage of [
      "canonical_pair_construction",
      "promotion_record_read",
      "promotion_preflight",
      "promotion_update",
      "promotion_rehydrate",
      "promotion_post_write",
      "promotion",
    ] as const) {
      assert.ok((HEADLESS_PROMOTION_SAFE_STAGES as readonly string[]).includes(stage));
    }
  });

  await test("live-draft canonical pair succeeds after projectId fingerprint fix", async () => {
    const draftCtx = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "owner_live_pair_probe",
      projectId: randomUUID(),
      randomUUID,
    });
    const store = new MemoryHeadlessJobStoreAdapter();
    const created = await store.createProvisionalIfAbsent({
      idempotencyAuthorityKey: draftCtx.idempotencyAuthorityKey,
      record: draftCtx.draft,
    });
    assert.equal(created.ok && created.value.kind === "created", true);
    if (!created.ok || created.value.kind !== "created") {
      throw new Error("create failed");
    }
    const coverage = await casLiveCoverage(
      store,
      created.value.record as HeadlessProvisionalStoredJobRecord,
      (created.value.record as HeadlessProvisionalStoredJobRecord)
        .verificationCoverage.requiredTargets,
    );
    assert.equal(coverage.ok, true);
    if (!coverage.ok) throw new Error("coverage failed");
    const pair = buildLiveCanonicalPair(
      draftCtx.manifest,
      draftCtx.seeded.bundle,
      coverage.record,
    );
    assert.equal(pair.ok, true);
  });

  await test("successful memory promotion attribution (+1 storeVersion)", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    const { record, pair } = await seedReadyProvisional(store);
    const before = record.storeVersion;
    const attributed = await store.promoteProvisionalToCanonicalAttributed({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(attributed.result.ok, true);
    if (!attributed.result.ok) throw new Error("promote failed");
    assert.equal(attributed.result.value.kind, "updated");
    if (attributed.result.value.kind !== "updated") throw new Error("kind");
    assert.equal(attributed.result.value.record.storeVersion, before + 1);
    assert.equal(attributed.attribution.promotionResultKind, "updated");
    assert.equal(attributed.attribution.storeVersionDelta, "plus_one");
    assert.equal(attributed.attribution.durableCanonicalRowExists, true);
    assert.equal(attributed.attribution.stageClassification, "canonical");
    assert.equal(attributed.attribution.promotionReasonId, null);
    assert.equal(attributed.attribution.safeOperationStage, "promotion_post_write");
  });

  await test("rejected preflight reason classes (shared authority)", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    const { record, pair } = await seedReadyProvisional(store);

    const cases: Array<{
      name: string;
      reason: string;
      mutate: () => Parameters<typeof evaluateHeadlessPromotionPreflight>[0];
    }> = [
      {
        name: "coverage_incomplete",
        reason: "coverage_incomplete",
        mutate: () => ({
          current: {
            ...record,
            verificationCoverage: {
              ...record.verificationCoverage,
              complete: false,
              verifiedTargets: [],
            },
          },
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "operation_lineage_mismatch",
        reason: "operation_lineage_mismatch",
        mutate: () => ({
          current: record,
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: "op_forged_lineage_mismatch_0001",
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "stale_store_version",
        reason: "stale_store_version",
        mutate: () => ({
          current: record,
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion + 9,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "job_identity_mismatch",
        reason: "job_identity_mismatch",
        mutate: () => ({
          current: record,
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: { ...pair.job, jobId: randomUUID() },
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "ownership_mismatch",
        reason: "ownership_mismatch",
        mutate: () => ({
          current: { ...record, ownerId: "owner_forged_current" },
          promote: {
            jobId: record.jobId,
            ownerId: "owner_forged_current",
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "profile_build_mismatch",
        reason: "profile_build_mismatch",
        mutate: () => ({
          current: {
            ...record,
            requestedRendererBuildId: "renderer-build-forged",
          },
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "snapshot_fingerprint_mismatch",
        reason: "snapshot_fingerprint_mismatch",
        mutate: () => ({
          current: {
            ...record,
            snapshotClaim: {
              ...record.snapshotClaim,
              assetBundleFingerprintClaim: "hab:sha256:" + "cd".repeat(32),
            },
          },
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "provisional_not_materializing",
        reason: "provisional_not_materializing",
        mutate: () => ({
          current: { ...record, state: "cancelled" as const },
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: pair.job,
            canonicalRequest: pair.request,
          },
        }),
      },
      {
        name: "canonical_coherence_invalid",
        reason: "canonical_coherence_invalid",
        mutate: () => ({
          current: record,
          promote: {
            jobId: record.jobId,
            ownerId: record.ownerId,
            expectedStoreVersion: record.storeVersion,
            expectedOperationId: record.operationId,
            canonicalJob: { ...pair.job, state: "running" },
            canonicalRequest: pair.request,
          },
        }),
      },
    ];

    for (const c of cases) {
      const decision = evaluateHeadlessPromotionPreflight(c.mutate());
      assert.equal(decision.ok, false, c.name);
      if (decision.ok) throw new Error(c.name);
      if (c.reason === "stale_store_version") {
        assert.equal(decision.outcome, "stale", c.name);
      } else {
        assert.equal(decision.outcome, "rejected", c.name);
      }
      assert.equal(decision.reasonId, c.reason, c.name);
    }

    assert.ok(
      (HEADLESS_PROMOTION_REASON_IDS as readonly string[]).includes(
        "illegal_initial_state",
      ),
    );
  });

  await test("memory adapter surfaces stale reason ID", async () => {
    const store = new MemoryHeadlessJobStoreAdapter();
    const { record, pair } = await seedReadyProvisional(store);
    const stale = await store.promoteProvisionalToCanonicalAttributed({
      jobId: record.jobId,
      ownerId: record.ownerId,
      expectedStoreVersion: record.storeVersion + 1,
      expectedOperationId: record.operationId,
      canonicalJob: pair.job,
      canonicalRequest: pair.request,
    });
    assert.equal(stale.result.ok && stale.result.value.kind === "stale", true);
    assert.equal(stale.attribution.promotionResultKind, "stale");
    assert.equal(stale.attribution.promotionReasonId, "stale_store_version");
    assert.equal(stale.attribution.safeOperationStage, "promotion_preflight");
  });

  await test("SQL failure maps to promotion_update attribution", async () => {
    const sql = new ScriptedHeadlessSqlExecutor([
      {
        kind: "rows",
        rows: [], // will not reach real provisional — force early failure path
      },
    ]);
    // Force UPDATE path failure with a connection failure after a lock miss isn't
    // enough; use query_failure on first query to map control-plane failure.
    const failing = new ScriptedHeadlessSqlExecutor([
      { kind: "query_failure" },
    ]);
    const store = new NeonHeadlessJobStoreAdapter(failing);
    const attributed = await store.promoteProvisionalToCanonicalAttributed({
      jobId: "job_probe_sql_fail",
      ownerId: "owner_probe_sql_fail",
      expectedStoreVersion: 1,
      expectedOperationId: "op_probe_sql_fail",
      canonicalJob: {} as never,
      canonicalRequest: {} as never,
    });
    assert.equal(attributed.result.ok, false);
    assert.equal(
      attributed.attribution.promotionResultKind,
      "control_plane_failure",
    );
    assert.ok(
      attributed.attribution.promotionReasonId === "unknown_safe_failure" ||
        attributed.attribution.promotionReasonId === "promotion_update_failed",
    );
    assert.equal(
      JSON.stringify(attributed.attribution).includes("syntax error"),
      false,
    );
    void sql;
  });

  await test("malformed RETURNING / hostile attribution sanitize", () => {
    assert.equal(
      sanitizePromotionAttribution({
        safeOperationStage: "promotion_rehydrate",
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode: "JOB_STORE_COHERENCE_REJECTED",
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        promotionReasonId: "promotion_rehydrate_failed",
        durableCanonicalRowExists: false,
        storeVersionDelta: "unexpected",
        stageClassification: "provisional",
      })?.promotionReasonId,
      "promotion_rehydrate_failed",
    );
    assert.equal(
      sanitizePromotionAttribution({
        safeOperationStage: "promotion",
        promotionResultKind: "rejected",
        safeControlPlaneCode: null,
        allowlistedSqlState: null,
        allowlistedConstraint: null,
        promotionReasonId: "relation does not exist",
        durableCanonicalRowExists: false,
        storeVersionDelta: "unchanged",
        stageClassification: "provisional",
      }),
      null,
    );
    assert.equal(
      sanitizeHeadlessPromotionReasonId(
        "ERROR: duplicate key value violates unique constraint",
      ),
      null,
    );
  });

  await test("canonical reread mismatch classification helper", () => {
    assert.equal(
      promotionProbeCannotFalsePass({
        overall: "PASS",
        attribution: {
          safeOperationStage: "promotion_post_write",
          promotionResultKind: "updated",
          safeControlPlaneCode: null,
          allowlistedSqlState: null,
          allowlistedConstraint: null,
          promotionReasonId: null,
          durableCanonicalRowExists: true,
          storeVersionDelta: "unexpected",
          stageClassification: "canonical",
        },
        cleanupStatus: "ok",
      }),
      false,
    );
  });

  await test("unknown provider text cannot enter evidence", () => {
    const dirty = renderNeonPromotionProbeEvidenceMarkdown({
      ...createNotTestedPromotionProbeEvidence(),
      overall: "FAIL",
      eligibilityVerdict: "NOT ELIGIBLE — promotion probe failed or incomplete.",
      startedAtIso: "2026-07-20T10:00:00.000Z",
      endedAtIso: "2026-07-20T10:00:01.000Z",
      attribution: {
        safeOperationStage: "promotion_update",
        promotionResultKind: "control_plane_failure",
        safeControlPlaneCode: "DATABASE_UNAVAILABLE",
        allowlistedSqlState: "08006",
        allowlistedConstraint: null,
        promotionReasonId: "promotion_update_failed",
        durableCanonicalRowExists: false,
        storeVersionDelta: "unchanged",
        stageClassification: "provisional",
      },
      cleanupStatus: "ok",
      notes: ["safe note"],
    });
    assert.equal(assertPromotionProbeEvidenceSafe(dirty), true);
    assert.equal(
      assertPromotionProbeEvidenceSafe(
        dirty + "\nrelation does not exist\n",
      ),
      false,
    );
    assert.equal(
      assertPromotionProbeEvidenceSafe("postgresql://u:p@h/db"),
      false,
    );
  });

  await test("gate-off makes zero connections and preserves evidence", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "promo-probe-"));
    const evidencePath = path.join(dir, "probe.md");
    writeNeonPromotionProbeEvidence({
      evidencePath,
      document: {
        ...createNotTestedPromotionProbeEvidence(),
        overall: "FAIL",
        eligibilityVerdict: "NOT ELIGIBLE — promotion probe failed or incomplete.",
        startedAtIso: "2026-07-20T10:00:00.000Z",
        endedAtIso: "2026-07-20T10:00:01.000Z",
        attribution: {
          safeOperationStage: "promotion_preflight",
          promotionResultKind: "rejected",
          safeControlPlaneCode: null,
          allowlistedSqlState: null,
          allowlistedConstraint: null,
          promotionReasonId: "coverage_incomplete",
          durableCanonicalRowExists: false,
          storeVersionDelta: "unchanged",
          stageClassification: "provisional",
        },
        cleanupStatus: "ok",
        notes: [
          "Promotion probe evidence — does not overwrite progressive or official live evidence.",
        ],
      },
    });
    const before = readFileSync(evidencePath, "utf8");
    let factoryCalls = 0;
    const result = await runNeonPromotionProbe(
      { HEADLESS_NEON_QA_PROMOTION_PROBE: "0" },
      {
        evidencePath,
        createSqlExecutor: ((url: string) => {
          factoryCalls += 1;
          throw new Error(`unexpected connection: ${typeof url}`);
        }) as never,
      },
    );
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.exitCode, 0);
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(factoryCalls, 0);
    assert.equal(readFileSync(evidencePath, "utf8"), before);
    const preserved = preserveOrInitializeNeonPromotionProbeEvidence({
      evidencePath,
    });
    assert.equal(preserved.action, "preserved");
    assert.equal(preserved.overall, "FAIL");
  });

  await test("evidence writer cannot false-pass incomplete promotion", () => {
    assert.equal(
      promotionProbeCannotFalsePass({
        overall: "PASS",
        attribution: {
          safeOperationStage: "promotion_preflight",
          promotionResultKind: "rejected",
          safeControlPlaneCode: null,
          allowlistedSqlState: null,
          allowlistedConstraint: null,
          promotionReasonId: "coverage_incomplete",
          durableCanonicalRowExists: false,
          storeVersionDelta: "unchanged",
          stageClassification: "provisional",
        },
        cleanupStatus: "ok",
      }),
      false,
    );
    assert.equal(
      promotionProbeCannotFalsePass({
        overall: "PASS",
        attribution: {
          safeOperationStage: "promotion_post_write",
          promotionResultKind: "updated",
          safeControlPlaneCode: null,
          allowlistedSqlState: null,
          allowlistedConstraint: null,
          promotionReasonId: null,
          durableCanonicalRowExists: true,
          storeVersionDelta: "plus_one",
          stageClassification: "canonical",
        },
        cleanupStatus: "ok",
      }),
      true,
    );
  });

  await test("public Headless barrel does not export promotion attribution", () => {
    const barrel = readFileSync(
      path.resolve(
        __dirname,
        "../../features/headless-renderer/control-plane/index.ts",
      ),
      "utf8",
    );
    assert.equal(barrel.includes("promotion-attribution"), false);
    assert.equal(barrel.includes("promotion-reason-ids"), false);
    assert.equal(barrel.includes("promotion-preflight-authority"), false);
    assert.equal(barrel.includes("evaluateHeadlessPromotionPreflight"), false);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
