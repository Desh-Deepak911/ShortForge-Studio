#!/usr/bin/env -S npx tsx
/**
 * One candidate-validation probe under protocol recovery.
 * Authority check uses attempt-count 0; consumption happens before job contact.
 */

import path from "node:path";

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV,
  HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE,
  HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
  buildPassingCandidateProbeObservation,
  classifyFlyRenderDeployedValidationCandidateProbeAuthority,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-deployed-validation-candidate-authority";
import {
  classifyHeadlessFlyStagingCandidateRecoveryProbeBudget,
  loadHeadlessFlyStagingCandidateRecoveryLedger,
  loadHeadlessFlyStagingCandidateValidationCycleState,
  persistHeadlessFlyStagingCandidateValidationCycleState,
  appendHeadlessFlyStagingCandidateRecoveryLedgerEntry,
  persistHeadlessFlyStagingCandidateRecoveryLedger,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-candidate-recovery-ledger-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import { runFlyRenderExecutionProbe } from "../../src/verification/headless-renderer/fly-render-live/claimed-render-execution-probe";

const [command, appName] = process.argv.slice(2);

function die(reasonId: string, code = 1): never {
  console.error(`fail_class=${reasonId}`);
  process.exit(code);
}

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "../..");
}

function nowIso(): string {
  return new Date().toISOString();
}

async function main(): Promise<void> {
  if (command !== "run" || typeof appName !== "string") die("hostile_input");
  const root = repoRoot();
  const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
    footiebitzRoot: root,
    appName,
  });
  const budget = classifyHeadlessFlyStagingCandidateRecoveryProbeBudget({
    ledger,
  });
  if (!budget.ok) die(budget.reasonId);
  const cycle = loadHeadlessFlyStagingCandidateValidationCycleState({
    footiebitzRoot: root,
  });
  if (
    cycle == null ||
    cycle.lifecycle !== HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE ||
    cycle.probeAttemptCount !== 0
  ) {
    die("candidate_cycle_not_probe_ready");
  }

  const digest =
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;
  const observation = buildPassingCandidateProbeObservation({
    candidateValidationGateEnabled: true,
    candidateDigestPin: digest,
    candidateDigestSha256: digest,
    expectedDeploymentPairId:
      "post_008_2g25_cleanup_runtime_finalization_correction_rejected_pair",
    expectedRendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    expectedHostedWorkerArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256,
    expectedHostedPageArtifactSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
    expectedBuildInfoSha256: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
    expectedSchemaMigrationIds:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.migrationIds,
    expectedSchemaChecksumSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.checksumSha256,
    verifyMachineDigestSha256: digest,
    renderMachineDigestSha256: digest,
    verifyCount: 1,
    renderCount: 1,
    otherCount: 0,
    verifyLoopAccepted: cycle.verifyLoopAccepted,
    renderLoopAccepted: cycle.renderLoopAccepted,
    maintenanceEnabled: false,
    publicServicesPresent: false,
    forwardAttemptCountForCandidate: 1,
    candidateProbeAttemptCount: 0,
    rollbackImageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    probeEvidenceArchived: true,
    cycleLifecycle: HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
    rolloutAcceptanceBoundaryIso: cycle.rolloutAcceptanceBoundaryIso,
    nowIso: nowIso(),
    protocolRecoveryAuthorizationPresent: true,
  });

  const authority =
    classifyFlyRenderDeployedValidationCandidateProbeAuthority(observation);
  if (!authority.ok) {
    die(authority.reasonId);
  }

  // Consume exactly one probe attempt before provider/job contact.
  persistHeadlessFlyStagingCandidateValidationCycleState({
    footiebitzRoot: root,
    state: Object.freeze({
      ...cycle,
      probeAttemptCount: 1,
    }),
  });
  persistHeadlessFlyStagingCandidateRecoveryLedger({
    footiebitzRoot: root,
    ledger: appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "candidate_validation_probe",
        targetDigestSha256: digest,
        recordedAtIso: nowIso(),
        deployPerformed: false,
        acceptancePassed: null,
        probeJobCreated: null,
        sanitizedNote: "candidate_probe_attempt_consumed_pre_job",
      },
      consumeProbeAuthorization: true,
    }),
  });

  const env = {
    ...process.env,
    [HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE]: "1",
    [HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV]: digest,
    HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_SHA256: digest,
    HEADLESS_FLY_RENDER_QA_EXECUTION_PROBE: "1",
  };

  const result = await runFlyRenderExecutionProbe({
    env,
    forceGateOn: true,
    renderMachineImageDigestSha256: digest,
    candidateValidationAuthorizedDigest: digest,
  });

  const postLedger = loadHeadlessFlyStagingCandidateRecoveryLedger({
    footiebitzRoot: root,
    appName,
  });
  persistHeadlessFlyStagingCandidateRecoveryLedger({
    footiebitzRoot: root,
    ledger: appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger: postLedger,
      entry: {
        kind: "candidate_validation_probe",
        targetDigestSha256: digest,
        recordedAtIso: nowIso(),
        deployPerformed: false,
        acceptancePassed: result.overall === "PASS",
        probeJobCreated:
          result.overall === "PASS" || result.connectionFactoryCalls > 0,
        sanitizedNote:
          result.overall === "PASS"
            ? "candidate_probe_pass"
            : `candidate_probe_fail:${result.overall}`,
      },
    }),
  });

  if (result.overall !== "PASS") {
    const failedCycle = loadHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: root,
    });
    if (failedCycle != null) {
      persistHeadlessFlyStagingCandidateValidationCycleState({
        footiebitzRoot: root,
        state: Object.freeze({
          ...failedCycle,
          lifecycle:
            result.connectionFactoryCalls > 0
              ? "rejected"
              : "protocol_incident_blocked",
        }),
      });
    }
    console.log(`candidate_probe_overall=${result.overall}`);
    console.log(
      `candidate_probe_connections=${result.connectionFactoryCalls}`,
    );
    process.exit(result.exitCode || 1);
  }

  console.log("candidate_probe_overall=PASS");
  console.log(`candidate_probe_connections=${result.connectionFactoryCalls}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
