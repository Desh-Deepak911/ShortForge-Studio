/**
 * Sprint 11E Phase 2E.2D.8F.7.2 — execution-probe job-create attribution authority.
 * Run: npm run test:headless-fly-render-execution-probe-job-create-attribution
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { R2StorageAdapter } from "@/features/headless-renderer/control-plane/adapters/r2-storage.adapter";
import { MemoryHeadlessJobStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-job-store.adapter";
import { MemoryHeadlessOwnedObjectStoreAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-owned-object-store.adapter";
import { MemoryHeadlessRenderDispatchOutboxAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-render-dispatch-outbox.adapter";
import { MemoryHeadlessProjectOwnershipAdapter } from "@/features/headless-renderer/control-plane/adapters/memory-project-ownership.adapter";
import type { HeadlessConfiguredR2Config } from "@/features/headless-renderer/control-plane/runtime/r2-environment";
import { deriveHeadlessQueueStreamNames } from "@/features/headless-renderer/control-plane/services/headless-queue-stream-names";
import { FakeS3Client } from "@/features/headless-renderer/control-plane/testing/fake-s3-client";
import { HEADLESS_WORKER_RENDERER_BUILD_ID } from "@/features/headless-renderer/worker/runtime/worker-types";

import {
  assertExecutionProbeEvidenceSafe,
  renderFlyRenderExecutionProbeEvidenceMarkdown,
  writeFlyRenderExecutionProbeEvidence,
  createNotTestedFlyRenderExecutionProbeEvidence,
  EXECUTION_PROBE_ELIGIBILITY,
} from "./fly-render-live/claimed-render-execution-probe-evidence";
import {
  buildExecutionProbeJobCreateAttributionFromLiveAttribution,
  buildExecutionProbeJobCreateUnconfirmedAttribution,
  extractExecutionProbeJobCreateAttribution,
  renderExecutionProbeJobCreateAttributionMarkdown,
  EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON,
} from "./fly-render-live/execution-probe-job-create-attribution";
import {
  buildFlyRenderLiveJobCreateFailureAttribution,
  runAttributedFlyRenderJobCreateChain,
} from "./fly-render-live/job-create-attribution";
import { buildHeadlessFlyRenderLiveSmokeBoundary } from "./fly-render-live/smoke-workload";
import { emptyFlyRenderLiveSession } from "./fly-render-live/types";
import type { FlyRenderLiveMatrixContext } from "./fly-render-live/types";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CURRENT_PROBE_FAIL_SHA =
  "d23acb8c1b25db87319018c7899128f75e30938a986c5725756d7fc334dd44ef";
const PRE_RUN_ARCHIVE_SHA =
  "535c7cc07f06866ebbc148ff9cd406e0d01bb1285505bcecf56db4e289b806f0";
const PRIOR_PROBE_FAIL_SHA =
  "f9042d8067b9189f56bbd3c11fa2beb267fca6e976930da407351f4f42928082";
const CLAIMED_DIAG_PASS_SHA =
  "da861f68858a48ab330804e36c9d9dd0c2e8e586f11dd4a6736f6fbb51f0ffc4";

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
    ownerId: `fepjc_owner_${runId.slice(0, 8)}`,
    otherOwnerId: `fepjc_other_${runId.slice(0, 8)}`,
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
    "\nSprint 11E Phase 2E.2D.8F.7.2 — execution-probe job-create attribution\n",
  );

  await test("accepted probe and diagnostic evidence SHAs remain byte-identical", () => {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.md")))
        .digest("hex"),
      CURRENT_PROBE_FAIL_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${PRE_RUN_ARCHIVE_SHA}.md`,
            ),
          ),
        )
        .digest("hex"),
      PRE_RUN_ARCHIVE_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(
          readFileSync(
            path.join(
              ROOT,
              `docs/HEADLESS_11E_FLY_RENDER_EXECUTION_PROBE.pre-run-${PRIOR_PROBE_FAIL_SHA}.md`,
            ),
          ),
        )
        .digest("hex"),
      PRIOR_PROBE_FAIL_SHA,
    );
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(ROOT, "docs/HEADLESS_11E_FLY_CLAIMED_RENDER_DIAGNOSTIC.md")))
        .digest("hex"),
      CLAIMED_DIAG_PASS_SHA,
    );
  });

  await test("smoke fixture uses production renderer build id and 720p profile", () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    assert.equal(smoke.profileId, "720p-webm-30");
    assert.equal(smoke.rendererBuildId, HEADLESS_WORKER_RENDERER_BUILD_ID);
    assert.equal(smoke.claims4kCapacity, false);
  });

  await test("attribution-loss boundary: live-matrix attribution maps to probe section", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const live = buildFlyRenderLiveJobCreateFailureAttribution(result, {
      cleanupStatus: "ok",
    });
    const cases = [
      {
        caseId: "job.create_queued" as const,
        status: "FAIL" as const,
        failureCategory: "JOB_CREATE_QUEUED_FAILED" as const,
        jobCreateFailureAttribution: live,
      },
    ];
    const extracted = extractExecutionProbeJobCreateAttribution({
      stageCases: cases,
      failedStageId: "job.create_queued",
      cleanupStatus: "ok",
    });
    assert.ok(extracted != null);
    assert.equal(extracted!.jobCreateResultKind, "attributed_failure");
    assert.equal(extracted!.jobCreateFailureStage, "coverage_reconcile");
    assert.equal(extracted!.jobCreateFailureReasonId, "coverage_incomplete");
    assert.equal(extracted!.coverageMissingCountClass, "1");
    const mdLines = renderExecutionProbeJobCreateAttributionMarkdown(extracted!);
    assert.ok(mdLines.some((l) => l.includes("job_create_failure_stage=coverage_reconcile")));
    assert.ok(mdLines.some((l) => l.includes("coverage_result_class=terminal_incomplete")));
  });

  await test("project ownership failure exposes exact stage attribution", async () => {
    const auth = new MemoryHeadlessProjectOwnershipAdapter();
    const ctx = buildCtx({ projectAuthorization: auth });
    await auth.claimUnownedProject(
      { ownerId: "hostile", sessionId: "s" },
      ctx.projectId,
    );
    const result = await runAttributedFlyRenderJobCreateChain({ ctx });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const live = buildFlyRenderLiveJobCreateFailureAttribution(result);
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(live);
    assert.equal(probe.jobCreateFailureStage, "project_ownership_claim");
    assert.equal(probe.jobCreateFailureReasonId, "project_ownership_failed");
  });

  await test("promotion transaction failure exposes promotion_result_class", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forcePromotionReject: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const live = buildFlyRenderLiveJobCreateFailureAttribution(result);
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(live);
    assert.equal(probe.jobCreateFailureStage, "promotion_transaction");
    assert.equal(probe.promotionResultClass, live.promotionReasonId);
  });

  await test("queued state mismatch exposes durable_job_stage_class", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceQueuedStateMismatch: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const live = buildFlyRenderLiveJobCreateFailureAttribution(result);
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(live);
    assert.equal(probe.jobCreateFailureStage, "queued_state_assertion");
    assert.equal(probe.jobCreateFailureReasonId, "queued_state_mismatch");
  });

  await test("unexpected throw maps to job_create_unconfirmed", () => {
    const unconfirmed = buildExecutionProbeJobCreateUnconfirmedAttribution({
      lastConfirmedStage: "live_manifest_construction",
      cleanupStatus: "ok",
    });
    assert.equal(unconfirmed.jobCreateResultKind, "unconfirmed");
    assert.equal(
      unconfirmed.jobCreateFailureReasonId,
      EXECUTION_PROBE_JOB_CREATE_UNCONFIRMED_REASON,
    );
    assert.equal(unconfirmed.jobCreateFailureStage, "live_manifest_construction");
  });

  await test("transient Neon unavailability exposes provisional_job_create stage", async () => {
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
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(
      buildFlyRenderLiveJobCreateFailureAttribution(result),
    );
    assert.equal(probe.jobCreateFailureStage, "provisional_job_create");
    assert.equal(probe.jobCreateFailureReasonId, "provisional_create_failed");
    assert.equal(probe.safeControlPlaneCode, "STORAGE_UNAVAILABLE");
  });

  await test("R2 staging throw exposes owned_object_staging with staging_substage none", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      injectThrowAt: "owned_object_staging",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(
      buildFlyRenderLiveJobCreateFailureAttribution(result),
    );
    assert.equal(probe.jobCreateFailureStage, "owned_object_staging");
    assert.equal(probe.jobCreateFailureReasonId, "owned_object_staging_failed");
  });

  await test("dispatch outbox intent missing exposes dispatch_outbox_intent_class", async () => {
    const ctx = buildCtx();
    const withoutOutbox = { ...ctx, dispatchOutbox: null };
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx: withoutOutbox,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(
      buildFlyRenderLiveJobCreateFailureAttribution(result),
    );
    assert.equal(probe.jobCreateFailureStage, "dispatch_outbox_intent_reread");
    assert.equal(probe.jobCreateFailureReasonId, "dispatch_outbox_intent_failed");
    assert.equal(
      probe.dispatchOutboxIntentClass,
      "dispatch_outbox_intent_failed",
    );
  });

  await test("injected dispatch_outbox_intent throw maps to unconfirmed via chain catch", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      injectThrowAt: "dispatch_outbox_intent",
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(
      buildFlyRenderLiveJobCreateFailureAttribution(result),
    );
    assert.equal(probe.jobCreateFailureStage, "dispatch_outbox_intent_reread");
    assert.equal(probe.jobCreateFailureReasonId, "dispatch_outbox_intent_failed");
  });

  await test("cleanup failure status merges into probe attribution", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forcePromotionReject: true,
      markCleanupSkipped: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const extracted = extractExecutionProbeJobCreateAttribution({
      stageCases: [
        {
          caseId: "job.create_queued",
          status: "FAIL",
          failureCategory: "JOB_CREATE_QUEUED_FAILED",
          jobCreateFailureAttribution: buildFlyRenderLiveJobCreateFailureAttribution(
            result,
            { cleanupStatus: "failed" },
          ),
        },
      ],
      failedStageId: "job.create_queued",
      cleanupStatus: "failed",
    });
    assert.equal(extracted?.cleanupStatus, "failed");
  });

  await test("privacy: probe job-create markdown excludes secrets and raw identifiers", async () => {
    const ctx = buildCtx();
    const result = await runAttributedFlyRenderJobCreateChain({
      ctx,
      forceIncompleteCoverage: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    const probe = buildExecutionProbeJobCreateAttributionFromLiveAttribution(
      buildFlyRenderLiveJobCreateFailureAttribution(result, { cleanupStatus: "ok" }),
    );
    const md = renderExecutionProbeJobCreateAttributionMarkdown(probe).join("\n");
    assert.equal(md.includes("postgresql://"), false);
    assert.equal(md.includes("UPSTASH_"), false);
    assert.equal(md.includes("R2_SECRET"), false);
    assert.equal(md.includes("sha256:"), false);
    assert.equal(md.includes("hslot:"), false);
    assert.equal(md.includes(ctx.projectId), false);
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
  });

  await test("job.create_queued FAIL without attribution becomes unconfirmed", () => {
    const extracted = extractExecutionProbeJobCreateAttribution({
      stageCases: [
        {
          caseId: "job.create_queued",
          status: "FAIL",
          failureCategory: "JOB_CREATE_QUEUED_FAILED",
        },
      ],
      failedStageId: "job.create_queued",
      cleanupStatus: "ok",
    });
    assert.equal(extracted?.jobCreateResultKind, "unconfirmed");
  });

  await test("execution probe evidence requires job-create section on job.create_queued FAIL", () => {
    const base = createNotTestedFlyRenderExecutionProbeEvidence();
    const withAttribution = {
      ...base,
      overall: "FAIL" as const,
      eligibilityVerdict: EXECUTION_PROBE_ELIGIBILITY.FAIL,
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      cleanupStatus: "ok" as const,
      executionStages: [
        {
          stageId: "job.create_queued",
          status: "FAIL",
          failureCategory: "JOB_CREATE_QUEUED_FAILED",
        },
      ],
      jobCreateAttribution: buildExecutionProbeJobCreateAttributionFromLiveAttribution({
        failureStage: "coverage_reconcile",
        failureReasonId: "coverage_incomplete",
        coverageAttribution: {
          requiredTargetCount: 3,
          stagedReferenceCount: 2,
          finalizedOwnedObjectCount: 2,
          verifiedTargetCountBefore: 0,
          verifiedTargetCountAfter: 2,
          missingTargetCount: 1,
          duplicateExtraClassification: "none",
          reconcileResultKind: "blocked_incomplete",
          finalCoverageComplete: false,
          intermediateBlockedIncomplete: true,
        },
      }),
      smokeWorkload: {
        profileId: "720p-webm-30",
        contentDurationMs: 2000,
        pollTimeoutMs: 180_000,
        claims4kCapacity: false as const,
      },
      acceptedImageDigestSha256: "fixture",
    };
    const md = renderFlyRenderExecutionProbeEvidenceMarkdown(withAttribution);
    assert.ok(md.includes("## Execution-probe job-create attribution"));
    assert.ok(md.includes("job_create_failure_stage=coverage_reconcile"));
    assert.ok(md.includes("job_create_failure_reason_id=coverage_incomplete"));
    assert.ok(md.includes("coverage_missing_count_class=1"));
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
    assert.doesNotThrow(() =>
      writeFlyRenderExecutionProbeEvidence({
        evidencePath: path.join(ROOT, ".tmp/fepjc-probe-evidence-test.md"),
        document: withAttribution,
      }),
    );
    assert.throws(() =>
      writeFlyRenderExecutionProbeEvidence({
        evidencePath: path.join(ROOT, ".tmp/fepjc-probe-evidence-missing-attr.md"),
        document: {
          ...withAttribution,
          jobCreateAttribution: null,
        },
      }),
    );
  });

  await test("production worker artifact hash unchanged at ae04b7eb", () => {
    const workerPath = path.join(ROOT, "dist/headless-worker/hosted-worker.js");
    const hash = createHash("sha256").update(readFileSync(workerPath)).digest("hex");
    assert.equal(
      hash,
      "ae04b7ebb37e34c4399454a25d9635694573b6651dd60148cba4cd91c4af0f0a",
    );
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
