/**
 * Sprint 11E Phase 2E.2D.8F — claimed render execution probe authority (deterministic).
 * Run: npm run test:headless-fly-render-execution-probe-authority
 */

import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildClaimedRenderExecutionAttributionSnapshot,
  buildExecutionAttributionFromClaimedResult,
  CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS,
  executionAttributionToSafeTelemetryFacts,
  sanitizeClaimedRenderExecutionAttributionSnapshot,
} from "@/features/headless-renderer/worker/runtime/claimed-render-execution-attribution";
import { mapClaimedRenderToHostedResult } from "@/features/headless-renderer/worker/runtime/execute-claimed-render";

import {
  classifyRenderClaimObservationAuthority,
  type HostedRenderDeliveryEventObservation,
} from "../fly-render-live/claim-correlation-authority";
import {
  assertExecutionProbeEvidenceSafe,
  renderFlyRenderExecutionProbeEvidenceMarkdown,
  writeFlyRenderExecutionProbeEvidence,
} from "../fly-render-live/claimed-render-execution-probe-evidence";
import { runFlyRenderExecutionProbe } from "../fly-render-live/claimed-render-execution-probe";
import {
  HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F51_REAL_SHAPE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { createCanonicalFlyVerifyLiveQaConfiguredEnv } from "../fly-verify-live/qa-secret-contract";
import { EXECUTION_PROBE_ELIGIBILITY } from "../fly-render-live/claimed-render-execution-probe-evidence";
import { buildHeadlessFlyRenderLiveSmokeWorkloadEvidence } from "../fly-render-live/smoke-workload";
import { emptyFlyRenderLiveSession } from "../fly-render-live/types";

let passed = 0;

function tempExecutionProbeEvidencePath(): string {
  return join(mkdtempSync(join(tmpdir(), "fb-exec-probe-auth-")), "probe.md");
}

async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function terminalJob(overrides: {
  state?: string;
  claimToken?: string | null;
  storeVersion?: number;
  terminalReason?: string;
}) {
  return {
    stage: "canonical" as const,
    storeVersion: overrides.storeVersion ?? 2,
    claimToken: overrides.claimToken ?? null,
    canonicalJob: {
      state: overrides.state ?? "failed",
      terminalReason:
        overrides.terminalReason != null
          ? { reasonId: overrides.terminalReason, retryable: true }
          : { reasonId: "WORKER_FAILED", retryable: true },
    },
  } as never;
}

async function main() {
  console.log(
    "\nSprint 11E Phase 2E.2D.8F — claimed render execution probe authority\n",
  );

  await test("execution substage registry is frozen allowlist", () => {
    assert.equal(CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS.length, 26);
    assert.ok(
      CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS.includes("chromium_preflight"),
    );
    assert.ok(
      CLAIMED_RENDER_EXECUTION_SUBSTAGE_IDS.includes("page_contract_ready"),
    );
  });

  await test("active claim observed passes claim authority", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "rendering", claimToken: "tok", storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 1000,
        renderStartedAtMs: 1000,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: [],
      observationStartedAtMs: 1000,
      observationEndedAtMs: 2000,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.authority, "active_claim");
  });

  await test("claim→terminal before polling with correlated ack passes", () => {
    const events: HostedRenderDeliveryEventObservation[] = [
      {
        name: "hosted.loop.delivery",
        atMs: 1100,
        mode: "render",
        action: "claimed_and_acked",
        reasonId: "claimed_and_acked",
      },
      {
        name: "hosted.loop.delivery",
        atMs: 1400,
        mode: "render",
        action: "terminalized_render_failure",
        reasonId: "terminalized_render_failure",
        facts: {
          execution_substage: "chromium_preflight",
          disposition_kind: "terminal_failure",
          durable_job_state_class: "failed",
          claim_token_coherence_class: "cleared_after_terminal",
          cleanup_scheduled_class: "not_applicable",
          binary_component_class: "chromium",
          bounded_duration_class: "sub_second",
          safe_worker_code: "WORKER_FAILED",
        },
      },
    ];
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null, storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 1000,
        renderStartedAtMs: 1000,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: events,
      observationStartedAtMs: 1000,
      observationEndedAtMs: 2000,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.authority, "fast_terminal_with_correlated_ack");
      assert.equal(result.runDeliveryCorrelation.correlationClass, "matched");
    }
  });

  await test("terminal without correlated claim rejected", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 1000,
        renderStartedAtMs: 1000,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: [],
      observationStartedAtMs: 1000,
      observationEndedAtMs: 2000,
    });
    assert.equal(result.ok, false);
  });

  await test("historical pre-boundary ack ignored; terminal without run-owned claim rejected", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null, storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 2000,
        renderStartedAtMs: 2000,
        probeObservationBoundaryMs: 1800,
        initialStoreVersion: 1,
      },
      deliveryEvents: [
        {
          name: "hosted.loop.delivery",
          atMs: 1500,
          mode: "render",
          action: "claimed_and_acked",
        },
      ],
      observationStartedAtMs: 2000,
      observationEndedAtMs: 3000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.rejectReason, "terminal_without_correlated_claim");
    }
  });

  await test("competing in-window ack fails closed as unrelated delivery", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", claimToken: null, storeVersion: 2 }),
      session: {
        ...emptyFlyRenderLiveSession(),
        renderEnqueuedAtMs: 2000,
        renderStartedAtMs: 2000,
        probeObservationBoundaryMs: 0,
        initialStoreVersion: 1,
      },
      deliveryEvents: [
        {
          name: "hosted.loop.delivery",
          atMs: 2100,
          mode: "render",
          action: "claimed_and_acked",
        },
        {
          name: "hosted.loop.delivery",
          atMs: 16000,
          mode: "render",
          action: "claimed_and_acked",
        },
        {
          name: "hosted.loop.delivery",
          atMs: 18000,
          mode: "render",
          action: "terminalized_render_failure",
        },
      ],
      observationStartedAtMs: 2000,
      observationEndedAtMs: 20000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.rejectReason, "unrelated_delivery_event");
  });

  await test("store version regression rejected", () => {
    const result = classifyRenderClaimObservationAuthority({
      job: terminalJob({ state: "failed", storeVersion: 0 }),
      session: { ...emptyFlyRenderLiveSession(), renderStartedAtMs: 1000, initialStoreVersion: 2 },
      deliveryEvents: [],
      observationStartedAtMs: 1000,
      observationEndedAtMs: 2000,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.rejectReason, "store_version_regression");
  });

  await test("claim coherence failure attribution", () => {
    const mapped = mapClaimedRenderToHostedResult({
      kind: "claim_coherence_rejected",
      phase: "coherence",
      reasonId: "claim_token_mismatch",
      coherenceRejection: "claim_token_mismatch",
      evidence: null,
      orphanCleanup: null,
      succeededCasLost: false,
      executionAttribution: buildExecutionAttributionFromClaimedResult({
        result: {
          kind: "claim_coherence_rejected",
          phase: "coherence",
          reasonId: "claim_token_mismatch",
          coherenceRejection: "claim_token_mismatch",
        },
        executionSubstage: "claim_coherence",
        durableJobState: "queued",
        claimTokenCoherenceClass: "mismatch",
      }),
    });
    assert.equal(mapped.kind, "stale_claim");
    assert.equal(mapped.executionAttribution?.executionSubstage, "claim_coherence");
  });

  await test("terminalized_render_failure carries exact worker reasonId", () => {
    const mapped = mapClaimedRenderToHostedResult({
      kind: "failed",
      phase: "render",
      reasonId: "WORKER_FAILED",
      coherenceRejection: null,
      evidence: null,
      orphanCleanup: null,
      succeededCasLost: false,
      executionAttribution: buildExecutionAttributionFromClaimedResult({
        result: { kind: "failed", phase: "render", reasonId: "WORKER_FAILED" },
        executionSubstage: "chromium_preflight",
        durableJobState: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
      }),
    });
    assert.equal(mapped.kind, "terminalized_render_failure");
    assert.equal(mapped.reasonId, "WORKER_FAILED");
    assert.equal(mapped.executionAttribution?.executionSubstage, "chromium_preflight");
  });

  await test("hostile telemetry sanitization rejects unknown substage", () => {
    assert.equal(
      sanitizeClaimedRenderExecutionAttributionSnapshot({
        executionSubstage: "evil_substage",
        dispositionKind: "terminal_failure",
        durableJobStateClass: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        cleanupScheduledClass: "not_applicable",
        binaryComponentClass: "chromium",
        boundedDurationClass: "sub_second",
      }),
      undefined,
    );
  });

  await test("telemetry facts round-trip safe fields only", () => {
    const snap = buildClaimedRenderExecutionAttributionSnapshot({
      executionSubstage: "ffmpeg_execution",
      dispositionKind: "terminal_failure",
      safeWorkerCode: "WORKER_FAILED",
      durableJobStateClass: "failed",
      claimTokenCoherenceClass: "cleared_after_terminal",
      cleanupScheduledClass: "not_applicable",
      boundedDurationMs: 400,
    });
    const facts = executionAttributionToSafeTelemetryFacts(snap);
    assert.equal(facts.execution_substage, "ffmpeg_execution");
    assert.equal(facts.safe_worker_code, "WORKER_FAILED");
    assert.ok(!("jobId" in facts));
  });

  await test("gate-off execution probe preserves evidence with zero connections", async () => {
    const result = await runFlyRenderExecutionProbe({ env: {} });
    assert.equal(result.exitCode, 0);
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.connectionFactoryCalls, 0);
  });

  await test("execution probe rejects non-telemetry render image before provider contact", async () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE: "1",
    });
    const preTelemetry = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_PRE_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(preTelemetry.exitCode, 1);
    assert.equal(preTelemetry.overall, "FAIL");
    assert.equal(preTelemetry.connectionFactoryCalls, 0);

    const historical8f = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8f.exitCode, 1);
    assert.equal(historical8f.overall, "FAIL");
    assert.equal(historical8f.connectionFactoryCalls, 0);

    const historical8f4 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F4_PAGE_MATERIALIZATION_CURRENT_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8f4.exitCode, 1);
    assert.equal(historical8f4.overall, "FAIL");
    assert.equal(historical8f4.connectionFactoryCalls, 0);

    const historical8f5 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F5_PAGE_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8f5.exitCode, 1);
    assert.equal(historical8f5.overall, "FAIL");
    assert.equal(historical8f5.connectionFactoryCalls, 0);

    const historical8f7 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F7_BOUNDARY_TELEMETRY_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8f7.exitCode, 1);
    assert.equal(historical8f7.overall, "FAIL");
    assert.equal(historical8f7.connectionFactoryCalls, 0);

    const historical8f71 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8F71_PROFILE_BOUNDARY_CONTINUITY_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8f71.exitCode, 1);
    assert.equal(historical8f71.overall, "FAIL");
    assert.equal(historical8f71.connectionFactoryCalls, 0);

    const historical8g1 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8G1_DURABLE_SOURCE_IDENTITY_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8g1.exitCode, 1);
    assert.equal(historical8g1.overall, "FAIL");
    assert.equal(historical8g1.connectionFactoryCalls, 0);

    const historical8h = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8H_BOOTSTRAP_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8h.exitCode, 1);
    assert.equal(historical8h.overall, "FAIL");
    assert.equal(historical8h.connectionFactoryCalls, 0);

    const historical8i = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I_POST_FRAME_CORRECTION_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8i.exitCode, 1);
    assert.equal(historical8i.overall, "FAIL");
    assert.equal(historical8i.connectionFactoryCalls, 0);

    const historical8i2 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I2_POST_FRAME_ATTRIBUTION_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8i2.exitCode, 1);
    assert.equal(historical8i2.overall, "FAIL");
    assert.equal(historical8i2.connectionFactoryCalls, 0);

    const historical8i3 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I3_ARTIFACT_BINDING_COHERENCE_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8i3.exitCode, 1);
    assert.equal(historical8i3.overall, "FAIL");
    assert.equal(historical8i3.connectionFactoryCalls, 0);

    const historical8i5 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_8I5_OBJECT_KEY_BINDING_VALIDATION_PROSPECTIVE_IMAGE_DIGEST,
      connectionProbe: () => {
        throw new Error("provider contact forbidden");
      },
    });
    assert.equal(historical8i5.exitCode, 1);
    assert.equal(historical8i5.overall, "FAIL");
    assert.equal(historical8i5.connectionFactoryCalls, 0);

    const current2g20 = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G20_MANIFEST_CONTRACT_ALIGNMENT_IMAGE_DIGEST,
      connectionProbe: () => {},
    });
    assert.equal(current2g20.exitCode, 1);
    assert.equal(current2g20.overall, "FAIL");
    assert.equal(current2g20.connectionFactoryCalls, 1);
  });

  await test("execution probe gate-on without render digest fails telemetry authority closed", async () => {
    const env = createCanonicalFlyVerifyLiveQaConfiguredEnv({
      HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE: "1",
    });
    const result = await runFlyRenderExecutionProbe({
      env,
      forceGateOn: true,
      evidencePath: tempExecutionProbeEvidencePath(),
      renderMachineImageDigestSha256: null,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.overall, "FAIL");
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(EXECUTION_PROBE_ELIGIBILITY.FAIL_TELEMETRY_IMAGE.length > 0, true);
  });

  await test("execution probe evidence markdown passes privacy authority", () => {
    const md = renderFlyRenderExecutionProbeEvidenceMarkdown({
      title: "test",
      overall: "FAIL",
      eligibilityVerdict: "NOT ELIGIBLE",
      startedAtIso: "2026-01-01T00:00:00.000Z",
      endedAtIso: "2026-01-01T00:00:01.000Z",
      failureSubstage: "chromium_preflight",
      failureReasonId: "chromium_preflight_failed",
      executionAttribution: buildClaimedRenderExecutionAttributionSnapshot({
        executionSubstage: "chromium_preflight",
        dispositionKind: "terminal_failure",
        safeWorkerCode: "WORKER_FAILED",
        durableJobStateClass: "failed",
        claimTokenCoherenceClass: "cleared_after_terminal",
        cleanupScheduledClass: "not_applicable",
        boundedDurationMs: 300,
      }),
      cleanupStatus: "ok",
      executionStages: [{ stageId: "hosted.chromium_execution", status: "FAIL" }],
      smokeWorkload: buildHeadlessFlyRenderLiveSmokeWorkloadEvidence(),
      resourceObservation: null,
      executionDurationMs: 300,
      artifactAuthority: null,
      acceptedImageDigestSha256: HEADLESS_FLY_STAGING_POST_007_8F2_PAGE_TELEMETRY_CURRENT_IMAGE_DIGEST,
      owningBoundaryEvidence: null,
      owningBoundaryIngestionFailure: null,
      boundaryEmissionClassification: null,
      jobCreateAttribution: null,
      notes: ["safe note"],
    });
    assert.equal(assertExecutionProbeEvidenceSafe(md).ok, true);
    assert.ok(md.includes("chromium_preflight"));
    assert.ok(!md.includes("R2_SECRET"));
  });

  await test("no false PASS after terminal failure disposition", () => {
    assert.throws(() =>
      writeFlyRenderExecutionProbeEvidence({
        evidencePath: ".tmp/execution-probe-false-pass.md",
        document: {
          title: "x",
          overall: "PASS",
          eligibilityVerdict: "x",
          startedAtIso: null,
          endedAtIso: null,
          failureSubstage: null,
          failureReasonId: null,
          executionAttribution: buildClaimedRenderExecutionAttributionSnapshot({
            executionSubstage: "terminal_failure_cas",
            dispositionKind: "terminal_failure",
            durableJobStateClass: "failed",
            claimTokenCoherenceClass: "cleared_after_terminal",
            cleanupScheduledClass: "not_applicable",
            boundedDurationMs: 100,
          }),
          cleanupStatus: "ok",
          executionStages: [],
          smokeWorkload: null,
          resourceObservation: null,
          executionDurationMs: null,
          artifactAuthority: null,
          acceptedImageDigestSha256: null,
          owningBoundaryEvidence: null,
          owningBoundaryIngestionFailure: null,
          boundaryEmissionClassification: null,
          jobCreateAttribution: null,
          notes: [],
        },
      }),
    );
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
