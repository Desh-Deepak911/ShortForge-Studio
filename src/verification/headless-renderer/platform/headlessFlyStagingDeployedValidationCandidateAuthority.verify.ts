/**
 * Deployed validation-candidate probe authority fixtures.
 * Run: npm run test:headless-fly-staging-deployed-validation-candidate-authority
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV,
  HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE,
  HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION,
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
  HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID,
  buildHeadlessFlyStagingCandidateValidationCycleState,
  buildPassingCandidateProbeObservation,
  classifyFlyRenderDeployedValidationCandidateProbeAuthority,
  classifyHeadlessFlyStagingCandidateProbeTransition,
  classifyHeadlessFlyStagingFinalizationCorrectionIncident,
  consumeHeadlessFlyStagingCandidateProbeAttempt,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-deployed-validation-candidate-authority";
import {
  HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
  classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority,
  resolveCurrentFlyStagingAcceptedImageRecord,
} from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-versioned-image-authority";
import { HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS } from "@/features/headless-renderer/worker/hosted/fly-staging/fly-staging-bridge-rollout-worker-preflight-authority";
import { runFlyRenderCandidateValidationProbe } from "../fly-render-live/claimed-render-execution-probe";

let passed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function main(): Promise<void> {
  console.log("\nDeployed validation-candidate probe authority\n");

  await test("1. promoted correction digest now uses normal execution probe as current", () => {
    const probe = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    });
    assert.equal(probe.ok, true);
    if (probe.ok) {
      assert.equal(probe.record.lifecycle, "current");
      assert.equal(
        probe.record.recordId,
        "post_008_2g25_cleanup_runtime_finalization_correction_current",
      );
    }
    const stillRejected = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    });
    assert.equal(stillRejected.ok, false);
    if (!stillRejected.ok) {
      assert.equal(stillRejected.reasonId, "historical_lifecycle_not_current_ready");
    }
  });

  await test("2. historical image cannot use candidate probe without active cycle", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        candidateDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        candidateDigestPin:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        verifyMachineDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        renderMachineDigestSha256:
          HEADLESS_FLY_STAGING_POST_007_8F_TELEMETRY_HISTORICAL_IMAGE_DIGEST,
        cycleLifecycle: null,
        protocolRecoveryAuthorizationPresent: false,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "historical_lifecycle_not_candidate");
    }
  });

  await test("3. rejected functional image cannot use candidate probe", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        candidateDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
        candidateDigestPin:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
        verifyMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
        renderMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
        protocolRecoveryAuthorizationPresent: true,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "rejected_functional_digest");
    }
  });

  await test("4. rejected packaged image cannot use candidate probe", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        candidateDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        candidateDigestPin:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        verifyMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        renderMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        protocolRecoveryAuthorizationPresent: true,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "rejected_packaged_artifact_digest");
    }
  });

  await test("5. candidate gate off produces zero provider contact", async () => {
    let connections = 0;
    const result = await runFlyRenderCandidateValidationProbe({
      env: {},
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.overall, "NOT_TESTED");
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(connections, 0);
    assert.equal(result.reasonId, "candidate_gate_disabled");
  });

  await test("6. candidate gate on without digest pin fails closed", async () => {
    let connections = 0;
    const result = await runFlyRenderCandidateValidationProbe({
      env: { [HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE]: "1" },
      connectionProbe: () => {
        connections += 1;
      },
    });
    assert.equal(result.overall, "FAIL");
    assert.equal(result.connectionFactoryCalls, 0);
    assert.equal(connections, 0);
    assert.equal(result.reasonId, "candidate_digest_pin_missing");
  });

  await test("7. candidate digest mismatch fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        candidateDigestPin:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "candidate_digest_pin_mismatch");
    }
  });

  await test("8. candidate not attached to both Machines fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        verifyMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
        renderMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(
        result.reasonId,
        "candidate_not_attached_to_required_machines",
      );
    }
  });

  await test("9. mixed digest fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        verifyMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        renderMachineDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "mixed_digest");
    }
  });

  await test("10. missing loop acceptance fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        renderLoopAccepted: false,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "loop_acceptance_missing");
    }
  });

  await test("11. wrong build ID fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        expectedRendererBuildId: "wrong-build-id",
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "wrong_renderer_build_id");
    }
  });

  await test("12. wrong schema fingerprint fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        expectedSchemaMigrationIds: ["001"],
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "wrong_schema_fingerprint");
    }
  });

  await test("13. maintenance enabled fails closed", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        maintenanceEnabled: true,
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "maintenance_enabled");
    }
  });

  await test("14. first authorized candidate probe is accepted", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation(),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(
        result.candidateDigestSha256,
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
      );
    }
  });

  await test("15. second candidate probe is rejected", () => {
    const cycle = buildHeadlessFlyStagingCandidateValidationCycleState({
      candidateDigestSha256:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
      rolloutAcceptanceBoundaryIso: "2026-07-31T20:19:34.242Z",
      authorizedUntilIso: "2026-08-01T02:19:34.242Z",
    });
    const consumed = consumeHeadlessFlyStagingCandidateProbeAttempt({ cycle });
    assert.equal(consumed.ok, true);
    const second = consumeHeadlessFlyStagingCandidateProbeAttempt({
      cycle: consumed.ok ? consumed.cycle : cycle,
    });
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.reasonId, "candidate_probe_budget_exhausted");
    }
    const classifySecond =
      classifyFlyRenderDeployedValidationCandidateProbeAuthority(
        buildPassingCandidateProbeObservation({
          candidateProbeAttemptCount: 1,
        }),
      );
    assert.equal(classifySecond.ok, false);
    if (!classifySecond.ok) {
      assert.equal(classifySecond.reasonId, "candidate_probe_budget_exhausted");
    }
  });

  await test("16. probe PASS permits promotion", () => {
    const cycle = buildHeadlessFlyStagingCandidateValidationCycleState({
      candidateDigestSha256:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
      rolloutAcceptanceBoundaryIso: "2026-07-31T20:19:34.242Z",
      authorizedUntilIso: "2026-08-01T02:19:34.242Z",
    });
    const consumed = consumeHeadlessFlyStagingCandidateProbeAttempt({ cycle });
    assert.equal(consumed.ok, true);
    if (!consumed.ok) return;
    const transition = classifyHeadlessFlyStagingCandidateProbeTransition({
      cycle: consumed.cycle,
      evidence: {
        overall: "PASS",
        jobCreated: true,
        productionStagesPassed: true,
        durableJobSucceeded: true,
        finalizationPassed: true,
        bindingPassed: true,
        downloadPassed: true,
        replayPassed: true,
        cleanupPassed: true,
        zeroDisallowedLeftovers: true,
        gateOffEvidencePreservationPassed: true,
        failureBeforeJobCreationDueAuthorityDefect: false,
      },
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.nextLifecycle, "promoted_current");
      assert.equal(transition.selectRollbackPair, false);
    }
  });

  await test("17. probe FAIL permits rollback but not promotion", () => {
    const cycle = buildHeadlessFlyStagingCandidateValidationCycleState({
      candidateDigestSha256:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
      rolloutAcceptanceBoundaryIso: "2026-07-31T20:19:34.242Z",
      authorizedUntilIso: "2026-08-01T02:19:34.242Z",
    });
    const consumed = consumeHeadlessFlyStagingCandidateProbeAttempt({ cycle });
    assert.equal(consumed.ok, true);
    if (!consumed.ok) return;
    const transition = classifyHeadlessFlyStagingCandidateProbeTransition({
      cycle: consumed.cycle,
      evidence: {
        overall: "FAIL",
        jobCreated: true,
        productionStagesPassed: false,
        durableJobSucceeded: false,
        finalizationPassed: false,
        bindingPassed: false,
        downloadPassed: false,
        replayPassed: false,
        cleanupPassed: true,
        zeroDisallowedLeftovers: true,
        gateOffEvidencePreservationPassed: false,
        failureBeforeJobCreationDueAuthorityDefect: false,
      },
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.nextLifecycle, "rejected");
      assert.equal(transition.selectRollbackPair, true);
    }
  });

  await test("18. current-image probes remain unchanged", () => {
    const current = resolveCurrentFlyStagingAcceptedImageRecord();
    assert.equal(current.lifecycle, "current");
    const probe = classifyFlyRenderTelemetryExecutionProbeRenderImageAuthority({
      renderImageDigestSha256: current.imageDigestSha256,
    });
    assert.equal(probe.ok, true);
    assert.equal(
      HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
      "deployed_validation_candidate",
    );
  });

  await test("19. 41df incident classified without renderer failure claim", () => {
    const incident = classifyHeadlessFlyStagingFinalizationCorrectionIncident();
    assert.equal(
      incident.defectId,
      HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID,
    );
    assert.equal(incident.probeJobCreated, false);
    assert.equal(incident.productionPathExercised, false);
    assert.equal(incident.rendererFailureClaimed, false);
    assert.equal(
      incident.recoveryDecision,
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
    );
    assert.equal(
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION
        .originalRejectionPreserved,
      true,
    );
  });

  await test("20. incident evidence and attempt accounting remain immutable", () => {
    const root = path.resolve(import.meta.dirname, "../../../..");
    const attemptState = JSON.parse(
      readFileSync(
        path.join(
          root,
          "docs/evidence/headless/operational/fly-staging-cleanup-runtime-rollout-attempt-state.json",
        ),
        "utf8",
      ),
    ) as {
      readonly incidentSealed: boolean;
      readonly entries: readonly {
        readonly kind: string;
        readonly targetDigestSha256: string;
        readonly deployPerformed: boolean;
      }[];
    };
    assert.equal(attemptState.incidentSealed, true);
    const forward41 = attemptState.entries.filter(
      (entry) =>
        entry.kind === "forward" &&
        entry.targetDigestSha256 ===
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    );
    assert.equal(forward41.length, 1);
    assert.equal(forward41[0]?.deployPerformed, true);
    assert.ok(
      HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS.includes(
        HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE,
      ),
    );
    assert.ok(
      HEADLESS_FLY_STAGING_QA_ONLY_WORKER_PREFLIGHT_KEYS.includes(
        HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV,
      ),
    );
  });

  await test("protocol-incident before job creation blocks automatic retry", () => {
    const cycle = buildHeadlessFlyStagingCandidateValidationCycleState({
      candidateDigestSha256:
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
      rolloutAcceptanceBoundaryIso: "2026-07-31T20:19:34.242Z",
      authorizedUntilIso: "2026-08-01T02:19:34.242Z",
    });
    const consumed = consumeHeadlessFlyStagingCandidateProbeAttempt({ cycle });
    assert.equal(consumed.ok, true);
    if (!consumed.ok) return;
    const transition = classifyHeadlessFlyStagingCandidateProbeTransition({
      cycle: consumed.cycle,
      evidence: {
        overall: "FAIL",
        jobCreated: false,
        productionStagesPassed: false,
        durableJobSucceeded: false,
        finalizationPassed: false,
        bindingPassed: false,
        downloadPassed: false,
        replayPassed: false,
        cleanupPassed: false,
        zeroDisallowedLeftovers: true,
        gateOffEvidencePreservationPassed: false,
        failureBeforeJobCreationDueAuthorityDefect: true,
      },
    });
    assert.equal(transition.ok, true);
    if (transition.ok) {
      assert.equal(transition.nextLifecycle, "protocol_incident_blocked");
      assert.equal(transition.selectRollbackPair, true);
    }
  });

  await test("stale candidate observation expires without renewed authorization", () => {
    const result = classifyFlyRenderDeployedValidationCandidateProbeAuthority(
      buildPassingCandidateProbeObservation({
        rolloutAcceptanceBoundaryIso: "2026-07-31T10:00:00.000Z",
        nowIso: "2026-08-01T10:00:00.000Z",
      }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reasonId, "candidate_observation_expired");
    }
  });

  console.log(`\n${passed} tests passed.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
