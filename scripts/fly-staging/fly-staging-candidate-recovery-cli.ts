#!/usr/bin/env -S npx tsx
/**
 * One-time candidate recovery ledger / cycle helpers.
 * Provider mutation remains in the dedicated recovery shell.
 */

import path from "node:path";

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
  HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-deployed-validation-candidate-authority";
import {
  appendHeadlessFlyStagingCandidateRecoveryLedgerEntry,
  classifyHeadlessFlyStagingCandidateRecoveryDeployBudget,
  classifyHeadlessFlyStagingCandidateRecoveryProbeBudget,
  loadHeadlessFlyStagingCandidateRecoveryLedger,
  loadHeadlessFlyStagingCandidateValidationCycleState,
  persistHeadlessFlyStagingCandidateRecoveryLedger,
  persistHeadlessFlyStagingCandidateValidationCycleState,
  type HeadlessFlyStagingCandidateValidationCyclePersistedState,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-candidate-recovery-ledger-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-rollback-bridge-authority";
import {
  loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState,
  resolveHeadlessFlyStagingCleanupRuntimeRolloutAttemptStatePath,
} from "../../src/features/headless-renderer/worker/hosted/fly-staging/fly-staging-cleanup-runtime-rollout-attempt-budget-authority";

const [command, appName, arg3, arg4, arg5] = process.argv.slice(2);

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

switch (command) {
  case "reconcile": {
    if (typeof appName !== "string") die("hostile_input");
    const root = repoRoot();
    const incidentLoad = loadHeadlessFlyStagingCleanupRuntimeRolloutAttemptState({
      footiebitzRoot: root,
      appName,
    });
    if (!incidentLoad.ok || incidentLoad.state.incidentSealed !== true) {
      die("incident_ledger_unsealed");
    }
    const originalForwards = incidentLoad.state.entries.filter(
      (entry) =>
        entry.kind === "forward" &&
        entry.targetDigestSha256 ===
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    );
    if (originalForwards.length !== 1 || originalForwards[0]?.acceptancePassed !== true) {
      die("incident_forward_incoherent");
    }
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      appName,
    });
    const deployBudget = classifyHeadlessFlyStagingCandidateRecoveryDeployBudget({
      ledger,
    });
    if (!deployBudget.ok) die(deployBudget.reasonId);
    console.log("recovery_reconcile=PASS");
    console.log(
      `incident_commit=${HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION.incidentCommitSha}`,
    );
    console.log(
      `recovery_decision=${HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION.recoveryDecision}`,
    );
    console.log("original_incident_forward_count=1");
    console.log("recovery_deploy_attempts=0");
    console.log("candidate_probe_attempts=0");
    console.log(
      `candidate_digest=${HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST}`,
    );
    console.log(
      `rollback_digest=${HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST}`,
    );
    console.log(
      `incident_state_path=${resolveHeadlessFlyStagingCleanupRuntimeRolloutAttemptStatePath(root)}`,
    );
    break;
  }
  case "assert-deploy-budget": {
    if (typeof appName !== "string") die("hostile_input");
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: repoRoot(),
      appName,
    });
    if (process.env.HEADLESS_FLY_STAGING_CANDIDATE_RECOVERY_CONTINUE === "1") {
      const accepted = ledger.entries.some(
        (entry) =>
          entry.kind === "one_time_candidate_recovery" &&
          entry.acceptancePassed === true,
      );
      if (!accepted) die("continue_requires_accepted_recovery_deploy");
      console.log("candidate_recovery_deploy_budget=CONTINUE");
      break;
    }
    const budget = classifyHeadlessFlyStagingCandidateRecoveryDeployBudget({
      ledger,
    });
    if (!budget.ok) die(budget.reasonId);
    console.log("candidate_recovery_deploy_budget=PASS");
    break;
  }
  case "record-recovery-deploy": {
    if (typeof appName !== "string" || arg3 !== "1") die("hostile_input");
    const acceptancePassed = arg4 === "1";
    const root = repoRoot();
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      appName,
    });
    const budget = classifyHeadlessFlyStagingCandidateRecoveryDeployBudget({
      ledger,
    });
    if (!budget.ok) die(budget.reasonId);
    const next = appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "one_time_candidate_recovery",
        targetDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        recordedAtIso: nowIso(),
        deployPerformed: true,
        acceptancePassed,
        probeJobCreated: null,
        sanitizedNote: "one_time_candidate_recovery",
      },
      consumeRecoveryAuthorization: true,
    });
    persistHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      ledger: next,
    });
    console.log("candidate_recovery_deploy_recorded=PASS");
    break;
  }
  case "activate-cycle": {
    if (
      typeof appName !== "string" ||
      typeof arg3 !== "string" ||
      typeof arg4 !== "string" ||
      typeof arg5 !== "string"
    ) {
      die("hostile_input");
    }
    const boundaryIso = arg3;
    const verifyMachineId = arg4;
    const renderMachineId = arg5;
    const until = new Date(Date.parse(boundaryIso) + 6 * 60 * 60 * 1000).toISOString();
    const state: HeadlessFlyStagingCandidateValidationCyclePersistedState =
      Object.freeze({
        authorityVersion: 1,
        candidateDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        lifecycle: HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
        probeAttemptCount: 0,
        forwardAttemptCountForCandidate: 1,
        rolloutAcceptanceBoundaryIso: boundaryIso,
        authorizedUntilIso: until,
        verifyMachineId,
        renderMachineId,
        verifyLoopAccepted: true,
        renderLoopAccepted: true,
        protocolRecoveryAuthorizationPresent: true,
        maintenanceEnabled: false,
      });
    persistHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: repoRoot(),
      state,
    });
    console.log("candidate_cycle_activated=PASS");
    console.log(`lifecycle=${state.lifecycle}`);
    console.log(`rollout_boundary=${boundaryIso}`);
    break;
  }
  case "assert-probe-budget": {
    if (typeof appName !== "string") die("hostile_input");
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: repoRoot(),
      appName,
    });
    const budget = classifyHeadlessFlyStagingCandidateRecoveryProbeBudget({
      ledger,
    });
    if (!budget.ok) die(budget.reasonId);
    const cycle = loadHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: repoRoot(),
    });
    if (
      cycle == null ||
      cycle.lifecycle !==
        HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE ||
      cycle.probeAttemptCount !== 0
    ) {
      die("candidate_cycle_not_probe_ready");
    }
    console.log("candidate_probe_budget=PASS");
    break;
  }
  case "consume-probe-attempt": {
    if (typeof appName !== "string") die("hostile_input");
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
      cycle.lifecycle !==
        HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE ||
      cycle.probeAttemptCount !== 0
    ) {
      die("candidate_cycle_not_probe_ready");
    }
    persistHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: root,
      state: Object.freeze({
        ...cycle,
        probeAttemptCount: 1,
      }),
    });
    const next = appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "candidate_validation_probe",
        targetDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        recordedAtIso: nowIso(),
        deployPerformed: false,
        acceptancePassed: null,
        probeJobCreated: null,
        sanitizedNote: "candidate_probe_attempt_consumed_pre_job",
      },
      consumeProbeAuthorization: true,
    });
    persistHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      ledger: next,
    });
    console.log("candidate_probe_attempt_consumed=PASS");
    break;
  }
  case "record-probe-result": {
    if (typeof appName !== "string") die("hostile_input");
    const overall = arg3;
    const jobCreated = arg4 === "1";
    if (overall !== "PASS" && overall !== "FAIL") die("hostile_input");
    const root = repoRoot();
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      appName,
    });
    const next = appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "candidate_validation_probe",
        targetDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        recordedAtIso: nowIso(),
        deployPerformed: false,
        acceptancePassed: overall === "PASS",
        probeJobCreated: jobCreated,
        sanitizedNote:
          overall === "PASS"
            ? "candidate_probe_pass"
            : "candidate_probe_fail",
      },
    });
    persistHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      ledger: next,
    });
    const cycle = loadHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: root,
    });
    if (cycle != null && overall === "FAIL") {
      persistHeadlessFlyStagingCandidateValidationCycleState({
        footiebitzRoot: root,
        state: Object.freeze({
          ...cycle,
          lifecycle: jobCreated ? "rejected" : "protocol_incident_blocked",
        }),
      });
    }
    console.log(`candidate_probe_result_recorded=${overall}`);
    break;
  }
  case "record-rollback": {
    if (typeof appName !== "string") die("hostile_input");
    const acceptancePassed = arg3 === "1";
    const root = repoRoot();
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      appName,
    });
    const next = appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "candidate_rollback",
        targetDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
        recordedAtIso: nowIso(),
        deployPerformed: true,
        acceptancePassed,
        probeJobCreated: null,
        sanitizedNote: "candidate_recovery_bridge_rollback",
      },
    });
    persistHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      ledger: next,
    });
    console.log("candidate_rollback_recorded=PASS");
    break;
  }
  case "mark-promoted": {
    if (typeof appName !== "string") die("hostile_input");
    const root = repoRoot();
    const ledger = loadHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      appName,
    });
    const next = appendHeadlessFlyStagingCandidateRecoveryLedgerEntry({
      ledger,
      entry: {
        kind: "candidate_promotion",
        targetDigestSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
        recordedAtIso: nowIso(),
        deployPerformed: false,
        acceptancePassed: true,
        probeJobCreated: true,
        sanitizedNote: "candidate_promoted_current",
      },
      markPromoted: true,
    });
    persistHeadlessFlyStagingCandidateRecoveryLedger({
      footiebitzRoot: root,
      ledger: next,
    });
    const cycle = loadHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: root,
    });
    if (cycle != null) {
      persistHeadlessFlyStagingCandidateValidationCycleState({
        footiebitzRoot: root,
        state: Object.freeze({
          ...cycle,
          lifecycle: "promoted_current",
        }),
      });
    }
    console.log("candidate_promotion_recorded=PASS");
    break;
  }
  case "print-cycle-json": {
    const cycle = loadHeadlessFlyStagingCandidateValidationCycleState({
      footiebitzRoot: repoRoot(),
    });
    if (cycle == null) die("candidate_cycle_missing");
    console.log(JSON.stringify(cycle));
    break;
  }
  default:
    die("hostile_input");
}
