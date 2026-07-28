/**
 * Sprint 11E Phase 2E.2D.8I — post-frame failure containment authority.
 * Run: npm run test:headless-post-frame-failure-containment-authority
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { resolveExportTotalFrames } from "@/features/export/timing";
import {
  HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS,
  buildHeadlessFlyRenderLiveSmokeBoundary,
} from "@/verification/headless-renderer/fly-render-live/smoke-workload";
import {
  HEADLESS_OUTPUT_PROFILES,
  headlessMaxFramesForRenderDurationMs,
} from "@/features/headless-renderer/worker/runtime/output-profiles";
import { buildLiveDraft } from "@/verification/headless-renderer/neon-live/live-fixtures";
import { observeHostedRendererState } from "@/verification/headless-renderer/fly-render-live/hosted-renderer-observer";
import {
  discoverFlyRenderExecutionProbeCleanupRecoveryTarget,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I1C,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I2C,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8H,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_STARTED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_STARTED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_ENDED_MS,
  FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_STARTED_MS,
} from "@/verification/headless-renderer/fly-render-live/execution-probe-cleanup-recovery";
import { executeFlyRenderExecutionProbeCleanupRecoveryMutation } from "@/verification/headless-renderer/fly-render-live/execution-probe-cleanup-recovery-mutation";
import {
  assertExecutionProbePostmortemReportSafe,
  classifyExecutionProbePostmortemFromFlyLogs,
  sanitizePostmortemFlyLogLine,
} from "@/verification/headless-renderer/fly-render-live/execution-probe-postmortem";
import { runFlyRenderExecutionProbeCleanupRecoveryHarness } from "@/verification/headless-renderer/fly-render-live/run-fly-render-execution-probe-cleanup-recovery";
import {
  runPostFrameBoundaryTelemetryFixture,
  runPostFrameContainmentAttributionFixture,
} from "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures";
import {
  classifyStoreVersionDeltaLocal,
  resolveAttributedExecutionSubstage,
  shouldPreservePrimaryOverSecondaryCas,
} from "@/features/headless-renderer/worker/runtime/post-frame-failure-containment";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("\nSprint 11E Phase 2E.2D.8I — post-frame failure containment\n");

  await test("archived 8I.3C probe FAIL evidence sha is frozen", () => {
    assert.equal(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA,
      "f0b157c9535cbd8aece176b782bb7f073f4b40e9d038a0e9002eaef30d6402c2",
    );
  });

  await test("archived 8I.2C probe FAIL evidence sha preserved", () => {
    assert.equal(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I2C,
      "b5b373987b01fb74705a1d19734d4728274fad09369164c1fea999fd30b67bf3",
    );
  });

  await test("archived 8I.1C probe FAIL evidence sha preserved", () => {
    assert.equal(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8I1C,
      "12faa3c663d0b58ef24855062a8a55847bd6051ca1454f1af976f1da46fe0712",
    );
  });

  await test("historical 8H probe FAIL evidence sha preserved", () => {
    assert.equal(
      FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_EVIDENCE_SHA_8H,
      "a863e3cf06cb63085f5490f53ff0c69a97614ca540628b32e88ab56d3a621b33",
    );
  });

  await test("primary failure preserved over secondary terminal_failure_cas", () => {
    assert.equal(
      shouldPreservePrimaryOverSecondaryCas("ffmpeg_execution", "terminal_failure_cas"),
      true,
    );
    assert.equal(
      resolveAttributedExecutionSubstage({
        primaryExecutionSubstage: "artifact_upload",
        reportedExecutionSubstage: "terminal_failure_cas",
      }),
      "artifact_upload",
    );
  });

  await test("terminal CAS store-version delta uses local transition window", () => {
    assert.equal(classifyStoreVersionDeltaLocal(5, 6), "plus_one");
    assert.equal(classifyStoreVersionDeltaLocal(1, 6), "unexpected");
  });

  await test("post-frame containment attribution fixtures preserve primary substage", async () => {
    const ffmpeg = await runPostFrameContainmentAttributionFixture(
      "primary_ffmpeg_preserved_over_secondary_cas",
    );
    assert.equal(ffmpeg.executionSubstage, "ffmpeg_execution");
    assert.equal(ffmpeg.hostedFacts.primary_execution_substage, "ffmpeg_execution");
    assert.equal(
      ffmpeg.hostedFacts.secondary_terminal_cas_substage,
      "terminal_failure_cas",
    );

    const upload = await runPostFrameContainmentAttributionFixture(
      "primary_upload_preserved_over_secondary_cas",
    );
    assert.equal(upload.executionSubstage, "artifact_upload");
  });

  await test("post-frame boundary telemetry emits monotonic post-chromium sequence", async () => {
    const observed = await runPostFrameBoundaryTelemetryFixture();
    assert.ok(observed.postFrameBoundaryCount >= 6);
    assert.equal(observed.lastBoundary, "terminal_failure_cas_completed");
  });

  await test("smoke 2s manifest yields 72 rendered frames with 12 tail frames", async () => {
    const smoke = buildHeadlessFlyRenderLiveSmokeBoundary();
    const draft = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "fep_owner_test0001",
      contentDurationMs: smoke.contentDurationMs,
    });
    const frames = resolveExportTotalFrames(draft.manifest);
    assert.equal(smoke.contentDurationMs, HEADLESS_FLY_RENDER_LIVE_SMOKE_CONTENT_DURATION_MS);
    assert.equal(frames, 72);
    assert.equal(draft.manifest.project.contentDurationMs, 2000);
    assert.equal(draft.manifest.project.renderDurationMs, 2400);
    const profile = HEADLESS_OUTPUT_PROFILES["720p-webm-30"];
    const ceilingFrames = headlessMaxFramesForRenderDurationMs(
      profile.operationalMaxRenderDurationMs,
    );
    assert.equal(ceilingFrames, 1812);
    assert.ok(frames < ceilingFrames / 10);
  });

  await test("legacy 6s live draft remains 192 frames for regression contrast", async () => {
    const draft = await buildLiveDraft({
      runId: randomUUID(),
      ownerId: "fep_owner_test0002",
    });
    assert.equal(resolveExportTotalFrames(draft.manifest), 192);
  });

  await test("hosted observer reports terminal failure without masking as success", async () => {
    const ownerId = "fep_owner_test0003";
    const jobId = randomUUID();
    const ctx = {
      ownerId,
      session: { jobId },
      jobStore: {
        getByJobIdAndOwner: async () => ({
          ok: true,
          value: {
            stage: "canonical",
            claimToken: null,
            storeVersion: 2,
            canonicalJob: { state: "failed", attempt: 1 },
          },
        }),
      },
      ownedObjectStore: { getByObjectIdAndOwner: async () => ({ ok: true, value: null }) },
      dispatchOutbox: null,
      tcpConsumer: null,
      streamNames: {
        renderStream: "hfq:render:staging",
        renderGroup: "hfq:render-workers",
        verifyStream: "hfq:verify:staging",
        verifyGroup: "hfq:verify-workers",
      },
    } as never;
    const state = await observeHostedRendererState(ctx);
    assert.equal(state.jobTerminalFailed, true);
    assert.equal(state.jobSucceeded, false);
    assert.equal(state.chromiumExecuted, true);
  });

  await test("execution probe cleanup discovery rejects zero-match window", async () => {
    const result = await discoverFlyRenderExecutionProbeCleanupRecoveryTarget({
      sql: {
        withClient: async () => ({ rows: [] }),
        withTransaction: async () => {
          throw new Error("unused");
        },
      } as never,
      windowStartMs: 0,
      windowEndMs: 1,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failClass, "discovery_zero_matches");
  });

  await test("already-clean harness passes when global Neon leftovers are zero", async () => {
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes("COUNT(*)")) {
          return { rows: [{ n: "0" }] };
        }
        return { rows: [] };
      },
    };
    const result = await runFlyRenderExecutionProbeCleanupRecoveryHarness({
      forceGateOn: true,
      forceMutateGateOn: false,
      sql: {
        withClient: async (fn: (client: never) => Promise<unknown>) =>
          fn(mockClient as never),
        withTransaction: async () => {
          throw new Error("unused");
        },
      } as never,
      windowStartMs: FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_STARTED_MS,
      windowEndMs: FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_ENDED_MS,
      nowIso: () => "2026-07-24T14:00:00.000Z",
      evidencePath: "/tmp/fly-8i-cleanup-recovery-fixture.md",
    });
    assert.equal(result.overall, "PASS");
  });

  await test("cleanup mutation blocks on active claim", async () => {
    const mutation = await executeFlyRenderExecutionProbeCleanupRecoveryMutation({
      sql: { withClient: async () => ({ rows: [] }), withTransaction: async () => {} } as never,
      storage: { deleteObject: async () => {} } as never,
      redis: null,
      target: {
        ownerId: "fep_owner_test0004",
        jobId: "job_test",
        projectId: "proj_test",
        objectIds: ["obj1"],
        objectKeys: ["key1"],
        storeIds: ["assets"],
      },
      windowStartMs: 0,
      windowEndMs: 1,
      blockOnActiveClaim: true,
      activeClaimPresent: true,
    });
    assert.equal(mutation.ok, false);
    if (!mutation.ok) assert.equal(mutation.failClass, "active_claim_still_present");
  });

  await test("8I.1C postmortem classifies post-frame primary failure after chromium success", () => {
    const windowStart = FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_STARTED_MS;
    const windowEnd = FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I1C_ENDED_MS;
    const flyPrefix =
      "2026-07-24T15:45:00Z app[d895d16f264918] iad [info]";
    const log = [
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${windowStart + 180_000},"action":"frame_request_terminal","facts":{"frame_outcome_class":"succeeded"}}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${windowStart + 181_000},"action":"chromium_session_cleanup","facts":{"cleanup_outcome_class":"ok"}}`,
      `${flyPrefix}{"name":"hosted.loop.delivery","action":"terminalized_render_failure","facts":{"execution_substage":"terminal_failure_cas","primary_execution_substage":"ffmpeg_execution","secondary_terminal_cas_substage":"terminal_failure_cas","secondary_terminal_cas_outcome":"confirmed","safe_worker_code":"WORKER_FAILED","store_version_delta":"plus_one"}}`,
    ].join("\n");
    const report = classifyExecutionProbePostmortemFromFlyLogs({
      flyLogText: log,
      renderMachineId: "d895d16f264918",
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      harnessPollTimeoutMs: 180_000,
      harnessExecutionDurationMs: 58_235,
      harnessCleanupFailed: true,
      contentDurationMs: 2_000,
    });
    assertExecutionProbePostmortemReportSafe(report);
    assert.equal(report.frameRequestTerminalPresent, true);
    assert.equal(report.chromiumSessionCleanupPresent, true);
    assert.equal(report.primaryExecutionFailureClass, "ffmpeg_exit_failure");
    assert.equal(report.secondaryTerminalCasClass, "terminal_failure_cas_confirmed");
  });

  await test("postmortem classifies harness observation timeout despite worker progress", () => {
    const flyPrefix =
      "2026-07-24T13:45:00Z app[d895d16f264918] iad [info]";
    const log = [
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS + 60_000},"action":"page_bootstrap_terminal","facts":{"bootstrap_response_class":"ok"}}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS + 120_000},"action":"frame_request_started"}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS + 180_000},"action":"frame_request_terminal","facts":{"frameOutcomeClass":"succeeded"}}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_ENDED_MS},"action":"chromium_session_cleanup","facts":{"cleanupOutcomeClass":"failed"}}`,
      `${flyPrefix}{"name":"hosted.loop.delivery","action":"claimed_and_acked"}`,
    ].join("\n");
    const report = classifyExecutionProbePostmortemFromFlyLogs({
      flyLogText: log,
      renderMachineId: "d895d16f264918",
      windowStartMs: FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_STARTED_MS,
      windowEndMs: FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8H_ENDED_MS,
      harnessPollTimeoutMs: 180_000,
      harnessExecutionDurationMs: 234_941,
      harnessCleanupFailed: true,
      contentDurationMs: 2_000,
    });
    assertExecutionProbePostmortemReportSafe(report);
    assert.equal(
      report.primaryExecutionFailureClass,
      "harness_observation_timeout_despite_worker_progress",
    );
    assert.equal(report.frameRequestTerminalPresent, true);
    assert.equal(report.cleanupFailureReasonClass, "harness_cleanup_failed");
  });

  await test("post-frame monotonic artifact boundary fixture is sequence-coherent", async () => {
    const { runPostFrameMonotonicArtifactBoundaryFixture } = await import(
      "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures"
    );
    const observed = await runPostFrameMonotonicArtifactBoundaryFixture();
    assert.equal(observed.sequenceCoherent, true);
    assert.deepEqual(observed.artifactBoundaries, [
      "artifact_upload_started",
      "artifact_upload_completed",
      "owned_object_finalize_started",
      "owned_object_finalize_completed",
      "artifact_binding_validation_started",
      "artifact_binding_validation_completed",
      "job_succeeded_cas_started",
      "job_succeeded_cas_completed",
      "cleanup_scheduled",
      "cleanup_completed",
    ]);
  });

  await test("binding failure classification maps to safe finalize substages", async () => {
    const { runPostFrameBindingFailureClassificationFixture } = await import(
      "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures"
    );
    const classes = runPostFrameBindingFailureClassificationFixture();
    assert.equal(classes.finalizedCoherence, "finalized_coherence_assertion");
    assert.equal(classes.canonicalAttachment, "canonical_artifact_attachment");
  });

  await test("primary artifact_binding_validation preserved when cleanup also fails", async () => {
    const { runPostFramePrimaryPreservedWhenCleanupAlsoFailsFixture } =
      await import(
        "@/features/headless-renderer/worker/testing/post-frame-failure-containment-fixtures"
      );
    const observed = await runPostFramePrimaryPreservedWhenCleanupAlsoFailsFixture();
    assert.equal(observed.executionSubstage, "artifact_binding_validation");
    assert.equal(observed.primaryExecutionSubstage, "artifact_binding_validation");
  });

  await test("8I.2C postmortem classifies owned_object_finalize primary failure", () => {
    const windowStart = FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_STARTED_MS;
    const windowEnd = FLY_RENDER_EXECUTION_PROBE_ARCHIVED_FAIL_8I2C_ENDED_MS;
    const flyPrefix =
      "2026-07-24T16:45:54Z app[d895d16f264918] iad [info]";
    const log = [
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${windowStart + 200_000},"action":"artifact_upload_started","facts":{"boundary_sequence":"25"}}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${windowStart + 201_000},"action":"artifact_upload_completed","facts":{"upload_outcome_class":"succeeded","boundary_sequence":"27"}}`,
      `${flyPrefix}{"name":"hosted.render.boundary","atMs":${windowStart + 201_000},"action":"owned_object_finalize_started","facts":{"boundary_sequence":"28"}}`,
      `${flyPrefix}{"name":"hosted.loop.delivery","action":"terminalized_render_failure","facts":{"execution_substage":"artifact_finalize","primary_execution_substage":"artifact_finalize","safe_worker_code":"WORKER_FAILED","store_version_delta":"unchanged"}}`,
    ].join("\n");
    const report = classifyExecutionProbePostmortemFromFlyLogs({
      flyLogText: log,
      renderMachineId: "d895d16f264918",
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      harnessPollTimeoutMs: 180_000,
      harnessExecutionDurationMs: 57_726,
      harnessCleanupFailed: true,
      contentDurationMs: 2_000,
    });
    assertExecutionProbePostmortemReportSafe(report);
    assert.equal(report.primaryExecutionFailureClass, "owned_object_finalize_failure");
    assert.equal(report.artifactUploadStartedPresent, true);
  });

  await test("postmortem sanitizer redacts urls and ids", () => {
    const sanitized = sanitizePostmortemFlyLogLine(
      'hosted.render.boundary https://secret.example/a 550e8400-e29b-41d4-a716-446655440000 frame_request_terminal',
    );
    assert.ok(sanitized != null);
    assert.match(sanitized!, /\[redacted-url\]/);
    assert.match(sanitized!, /\[redacted-id\]/);
    assert.doesNotMatch(sanitized!, /secret\.example/);
  });

  console.log(`\n${passed} passed\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
