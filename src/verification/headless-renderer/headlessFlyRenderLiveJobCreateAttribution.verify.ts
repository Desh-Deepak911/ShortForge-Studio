/**
 * Sprint 11E Phase 2E.2D.8B.1 — Fly render job-create attribution (deterministic).
 * Run: npm run test:headless-fly-render-job-create-attribution
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";

import {
  JOB_CREATE_ATTRIBUTION_REASON_IDS,
  JOB_CREATE_ATTRIBUTION_STAGE_IDS,
  buildFlyRenderLiveJobCreateFailureAttribution,
  runAttributedFlyRenderJobCreateChain,
  scrubJobCreateAttributionStages,
} from "./fly-render-live/job-create-attribution";
import { renderFlyRenderJobCreateProbeEvidenceMarkdown } from "./fly-render-live/job-create-probe-evidence";
import {
  createNotTestedFlyRenderLiveEvidence,
  extractJobCreateFailureAttributionFromCases,
  renderFlyRenderLiveEvidenceMarkdown,
} from "./fly-render-live/evidence";
import { emptyFlyRenderLiveSession } from "./fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "./fly-render-live/types";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";

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

function buildCtx(overrides?: {
  readonly projectAuthorization?: MemoryHeadlessProjectOwnershipAdapter;
  readonly jobStore?: MemoryHeadlessJobStoreAdapter;
}): FlyRenderLiveMatrixContext {
  const runId = randomUUID();
  const fake = new FakeS3Client();
  const ownedObjectStore = new MemoryHeadlessOwnedObjectStoreAdapter();
  const dispatchOutbox = new MemoryHeadlessRenderDispatchOutboxAdapter();
  const jobStore =
    overrides?.jobStore ??
    new MemoryHeadlessJobStoreAdapter({ dispatchOutbox });
  return {
    runId,
    ownerId: `frjc_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `frjc_other_${runId.slice(0, 8)}`,
    projectId: randomUUID(),
    nowMs: 1_700_000_000_000,
    sql: {
      withClient: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
      withTransaction: async (fn) =>
        fn({ query: async () => ({ rows: [{ n: "0" }] }) } as never),
    } as never,
    jobStore,
    ownedObjectStore,
    projectAuthorization:
      overrides?.projectAuthorization ?? new MemoryHeadlessProjectOwnershipAdapter(),
    io: new R2StorageAdapter({
      configOverride: CONFIG,
      s3Client: fake,
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
    session: emptyFlyRenderLiveSession(),
    env: { HEADLESS_ENV_NAME: "staging" },
    flyAppName: "local-fixture",
    acceptedImageDigestSha256: "fixture",
    restProducer: null,
    tcpConsumer: null,
    streamNames: deriveHeadlessQueueStreamNames("staging"),
    streamAuthority: "production_env",
    dispatchOutbox,
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
    "\nSprint 11E Phase 2E.2D.8B.1 — Fly render job-create attribution\n",
  );

  await test("stage and reason registries are frozen allowlists", () => {
    assert.ok(JOB_CREATE_ATTRIBUTION_STAGE_IDS.includes("queued_state_assertion"));
    assert.ok(
      JOB_CREATE_ATTRIBUTION_REASON_IDS.includes("coverage_incomplete"),
    );
    assert.equal(Object.isFrozen(JOB_CREATE_ATTRIBUTION_STAGE_IDS), true);
    assert.equal(Object.isFrozen(JOB_CREATE_ATTRIBUTION_REASON_IDS), true);
  });

  await test("happy path reaches queued_state_assertion with coherent identity", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.stages.some((s) => s.stage === "live_manifest_construction" && s.status === "ok"));
    assert.ok(result.stages.some((s) => s.stage === "promotion_transaction" && s.status === "ok"));
    assert.ok(result.stages.some((s) => s.stage === "queued_state_assertion" && s.status === "ok"));
    assert.equal(ctx.session.jobId, result.draftCtx.jobId);
  });

  await test("job-create chain records monotonic dispatch-outbox observation", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const outbox = result.stages.find(
      (s) => s.stage === "dispatch_outbox_intent_reread",
    );
    assert.equal(outbox?.status, "ok");
    assert.ok(outbox?.dispatchOutboxAttribution != null);
    assert.ok(ctx.session.dispatchOutboxObservationAnchor != null);
  });

  await test("project ownership failure stops before manifest construction", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const ctx = buildCtx({ projectAuthorization: auth });
    await auth.claimUnownedProject(
      { ownerId: "hostile", sessionId: "s" },
      ctx.projectId,
    );
    const result = await runAttributedFlyRenderJobCreateChain({ ctx });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "project_ownership_claim");
    assert.equal(result.failureReasonId, "project_ownership_failed");
  });

  await test("foreign project id fails at live_manifest_construction", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceForeignProjectId: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "live_manifest_construction");
    assert.equal(result.failureReasonId, "fixture_identity_incoherent");
  });

  await test("stale manifest fingerprint fails at live_manifest_construction", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceStaleManifestFingerprint: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "live_manifest_construction");
    assert.equal(result.failureReasonId, "stale_manifest_fingerprint");
  });

  await test("incomplete coverage fails before promotion with coverage counts", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "coverage_reconcile");
    assert.equal(result.failureReasonId, "coverage_incomplete");
    assert.ok(result.coverageAttribution != null);
    assert.equal(result.coverageAttribution!.missingTargetCount > 0, true);
    assert.equal(result.coverageAttribution!.finalCoverageComplete, false);
  });

  await test("provisional create failure is attributed", async () => {
    const jobStore = new MemoryHeadlessJobStoreAdapter();
    const ctx = buildCtx({ jobStore });
    jobStore.createProvisionalIfAbsent = async () =>
      ({
        ok: false as const,
        issues: [{ code: "STORAGE_UNAVAILABLE" as const, message: "injected" }],
      }) as never;
    const result = await runAttributedFlyRenderJobCreateChain({ ctx });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "provisional_job_create");
    assert.equal(result.failureReasonId, "provisional_create_failed");
  });

  await test("queued state mismatch fails at queued_state_assertion", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceQueuedStateMismatch: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.failureStage, "queued_state_assertion");
    assert.equal(result.failureReasonId, "queued_state_mismatch");
  });

  await test("scrubJobCreateAttributionStages drops hostile values", () => {
    const scrubbed = scrubJobCreateAttributionStages([
      { stage: "cleanup", status: "ok" },
      {
        stage: "cleanup",
        status: "failed",
        reasonId: "not_real" as never,
        safeControlPlaneCode: "evil\n" as never,
      },
      { stage: "not_real" as never, status: "ok" },
    ]);
    assert.equal(scrubbed.length, 2);
    assert.equal(scrubbed[1]?.reasonId, undefined);
  });

  await test("stopBeforePromotion skips promotion and outbox stages", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      stopBeforePromotion: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.stoppedBeforePromotion, true);
    assert.ok(
      result.stages.some(
        (s) => s.stage === "promotion_transaction" && s.status === "skipped",
      ),
    );
    assert.ok(
      result.stages.some(
        (s) =>
          s.stage === "dispatch_outbox_intent_reread" && s.status === "skipped",
      ),
    );
  });

  await test("official FAIL evidence carries exact attributed stage", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const attribution = buildFlyRenderLiveJobCreateFailureAttribution(result, {
      cleanupStatus: "ok",
    });
    const cases = [
      {
        caseId: "job.create_queued" as const,
        status: "FAIL" as const,
        failureCategory: "JOB_CREATE_QUEUED_FAILED" as const,
        jobCreateFailureAttribution: attribution,
      },
    ];
    const extracted = extractJobCreateFailureAttributionFromCases(cases, "ok");
    assert.equal(extracted?.failureStage, "coverage_reconcile");
    assert.equal(extracted?.failureReasonId, "coverage_incomplete");
    assert.equal(extracted?.cleanupStatus, "ok");
    assert.ok(extracted?.coverageAttribution != null);
    assert.equal(extracted?.coverageAttribution?.missingTargetCount > 0, true);
    const md = renderFlyRenderLiveEvidenceMarkdown({
      ...createNotTestedFlyRenderLiveEvidence(),
      overall: "FAIL",
      eligibilityVerdict: "fail",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      cases,
      jobCreateFailureAttribution: extracted,
      cleanupStatus: "ok",
    });
    assert.ok(md.includes("failure_stage=coverage_reconcile"));
    assert.ok(md.includes("failure_reason_id=coverage_incomplete"));
    assert.ok(md.includes("coverage_missing_target_count="));
    assert.ok(md.includes("stage=coverage_reconcile reasonId=coverage_incomplete"));
  });

  await test("attributed failure stages survive hostile sanitization", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forcePromotionReject: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const attribution = buildFlyRenderLiveJobCreateFailureAttribution(result);
    assert.equal(attribution.failureStage, "promotion_transaction");
    assert.equal(attribution.failureReasonId, "promotion_rejected");
    const hostile = buildFlyRenderLiveJobCreateFailureAttribution({
      ...result,
      stages: [
        ...result.stages,
        {
          stage: "not_real" as never,
          status: "failed",
          reasonId: "evil" as never,
          safeControlPlaneCode: "evil\n" as never,
        },
      ],
    });
    assert.equal(hostile.failureStage, "promotion_transaction");
  });

  await test("cleanup status merges into official job-create attribution", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceQueuedStateMismatch: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const attribution = buildFlyRenderLiveJobCreateFailureAttribution(result, {
      cleanupStatus: "preserved",
    });
    assert.equal(attribution.cleanupStatus, "preserved");
  });

  await test("probe evidence markdown excludes secrets and provider URLs", () => {
    const md = renderFlyRenderJobCreateProbeEvidenceMarkdown({
      title: "t",
      overall: "FAIL",
      eligibilityVerdict: "x",
      startedAtIso: null,
      endedAtIso: null,
      failureStage: "provisional_job_create",
      failureReasonId: "provisional_create_failed",
      stages: [
        {
          stage: "provisional_job_create",
          status: "failed",
          reasonId: "provisional_create_failed",
        },
      ],
      cleanupStatus: "ok",
      consumerSafetyMode: "zero_consumer",
      notes: ["safe note only"],
    });
    assert.equal(md.includes("postgresql://"), false);
    assert.equal(md.includes("UPSTASH_"), false);
    assert.equal(md.includes("sha256:"), false);
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
