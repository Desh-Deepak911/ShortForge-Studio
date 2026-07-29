/**
 * Sprint 11E Phase 2G.24G.1 — controlled rollout attempt accounting and materialized-config isolation.
 * Provider-free authority — documents the recovered 2G.24G incident honestly.
 */

import {
  HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
} from "./fly-staging-versioned-image-authority";
import {
  HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
} from "./fly-staging-image-environment-deployment-pair-authority";

export const HEADLESS_FLY_STAGING_CONTROLLED_ROLLOUT_ATTEMPT_AUTHORITY_VERSION =
  1 as const;

export type HeadlessFlyStagingControlledRolloutAttemptKind =
  | "forward"
  | "rollback"
  | "recovery"
  | "manual_recovery";

export type HeadlessFlyStagingControlledRolloutFinalRuntimeState =
  | "healthy"
  | "degraded"
  | "stopped"
  | "unknown";

export type HeadlessFlyStagingControlledRolloutProtocolCompliance =
  | "compliant"
  | "deviated";

export type HeadlessFlyStagingControlledRolloutResultClassification =
  | "pass"
  | "pass_after_recovery"
  | "fail"
  | "blocked";

/** Sanitized operational record for the recovered Phase 2G.24G incident. */
export const HEADLESS_FLY_STAGING_2G24G_CONTROLLED_ROLLOUT_INCIDENT_RECORD =
  Object.freeze({
    phaseId: "2G.24G",
    targetImageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    targetRendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
    rollbackImageDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
    rollbackRendererBuildId: HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
    firstForwardRolloutAttempted: true,
    firstAcceptanceFailed: true,
    rollbackAttempted: true,
    rollbackImageEnvironmentMismatchOccurred: true,
    bothMachinesStoppedAfterBadRollback: true,
    manualRecoveryPerformed: true,
    secondForwardRolloutSucceeded: true,
    finalRuntimeDigestSha256:
      HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
    forwardAttemptCountTotal: 2,
    rollbackAttemptCountTotal: 1,
    recoveryAttemptCountTotal: 2,
    manualRecoveryPerformedFlag: true,
    providerContactCountTotal: 4,
    successfulDeploymentCountTotal: 2,
    failedAcceptanceCheckCountTotal: 3,
    finalRuntimeState: "healthy" satisfies HeadlessFlyStagingControlledRolloutFinalRuntimeState,
    rolloutResult:
      "pass_after_recovery" satisfies HeadlessFlyStagingControlledRolloutResultClassification,
    protocolCompliance:
      "deviated" satisfies HeadlessFlyStagingControlledRolloutProtocolCompliance,
    singleForwardAttemptPolicy: true,
    secondForwardAttemptClassifiedAsProtocolDeviation: true,
  } as const);

export type HeadlessFlyStagingControlledRolloutAttemptLedgerEntry = {
  readonly attemptKind: HeadlessFlyStagingControlledRolloutAttemptKind;
  readonly attemptSequence: number;
  readonly imageDigestSha256: string;
  readonly rendererBuildId: string;
  readonly deployExitCode: number | null;
  readonly acceptancePassed: boolean;
  readonly providerContactPerformed: boolean;
  readonly materializedConfigToken: string;
  readonly cleanupCompleted: boolean;
  readonly protocolDeviation: boolean;
};

export type HeadlessFlyStagingControlledRolloutAttemptTotals = {
  readonly forwardAttempts: number;
  readonly rollbackAttempts: number;
  readonly recoveryAttempts: number;
  readonly providerContacts: number;
  readonly successfulDeployments: number;
  readonly failedAcceptanceChecks: number;
  readonly protocolDeviations: number;
  readonly finalRuntimeState: HeadlessFlyStagingControlledRolloutFinalRuntimeState;
};

export type HeadlessFlyStagingMaterializedConfigAttemptIdentity = {
  readonly attemptKind: HeadlessFlyStagingControlledRolloutAttemptKind;
  readonly imageDigestSha256: string;
  readonly attemptSequence: number;
  readonly token: string;
  readonly relativePath: string;
};

const DIGEST_PREFIX_LEN = 8;

export function buildHeadlessFlyStagingMaterializedConfigAttemptIdentity(input: {
  readonly footiebitzRoot: string;
  readonly attemptKind: HeadlessFlyStagingControlledRolloutAttemptKind;
  readonly imageDigestSha256: string;
  readonly attemptSequence: number;
}): HeadlessFlyStagingMaterializedConfigAttemptIdentity {
  const digestPrefix = input.imageDigestSha256.slice(0, DIGEST_PREFIX_LEN);
  const token = `${input.attemptKind}-${digestPrefix}-attempt-${input.attemptSequence}`;
  const relativePath = `fly.staging.${token}.materialized.toml`;
  return Object.freeze({
    attemptKind: input.attemptKind,
    imageDigestSha256: input.imageDigestSha256,
    attemptSequence: input.attemptSequence,
    token,
    relativePath,
  });
}

export function classifyHeadlessFlyStagingMaterializedConfigCrossAttemptReuse(input: {
  readonly priorIdentity: HeadlessFlyStagingMaterializedConfigAttemptIdentity;
  readonly nextIdentity: HeadlessFlyStagingMaterializedConfigAttemptIdentity;
}): {
  readonly ok: boolean;
  readonly reasonId: "ok" | "stale_materialized_config_reuse" | "cross_direction_reuse";
} {
  if (input.priorIdentity.token === input.nextIdentity.token) {
    return Object.freeze({
      ok: false,
      reasonId: "stale_materialized_config_reuse",
    });
  }
  if (input.priorIdentity.relativePath === input.nextIdentity.relativePath) {
    return Object.freeze({
      ok: false,
      reasonId: "stale_materialized_config_reuse",
    });
  }
  const priorForward = input.priorIdentity.attemptKind === "forward";
  const nextRollback = input.nextIdentity.attemptKind === "rollback";
  if (
    priorForward &&
    nextRollback &&
    input.nextIdentity.relativePath.includes("forward-")
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "cross_direction_reuse",
    });
  }
  if (
    input.priorIdentity.attemptKind === "rollback" &&
    input.nextIdentity.attemptKind === "forward" &&
    input.nextIdentity.relativePath.includes("rollback-")
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "cross_direction_reuse",
    });
  }
  return Object.freeze({ ok: true, reasonId: "ok" });
}

export function classifyHeadlessFlyStagingMaterializedConfigCleanupContract(input: {
  readonly materializedRelativePaths: readonly string[];
  readonly pathsStillPresent: readonly string[];
}): {
  readonly ok: boolean;
  readonly reasonId: "ok" | "materialized_cleanup_incomplete";
} {
  for (const expected of input.materializedRelativePaths) {
    if (input.pathsStillPresent.includes(expected)) {
      return Object.freeze({
        ok: false,
        reasonId: "materialized_cleanup_incomplete",
      });
    }
  }
  return Object.freeze({ ok: true, reasonId: "ok" });
}

export function summarizeHeadlessFlyStagingControlledRolloutAttemptTotals(
  entries: readonly HeadlessFlyStagingControlledRolloutAttemptLedgerEntry[],
  finalRuntimeState: HeadlessFlyStagingControlledRolloutFinalRuntimeState,
): HeadlessFlyStagingControlledRolloutAttemptTotals {
  let forwardAttempts = 0;
  let rollbackAttempts = 0;
  let recoveryAttempts = 0;
  let providerContacts = 0;
  let successfulDeployments = 0;
  let failedAcceptanceChecks = 0;
  let protocolDeviations = 0;

  for (const entry of entries) {
    if (entry.attemptKind === "forward") forwardAttempts += 1;
    if (entry.attemptKind === "rollback") rollbackAttempts += 1;
    if (
      entry.attemptKind === "recovery" ||
      entry.attemptKind === "manual_recovery"
    ) {
      recoveryAttempts += 1;
    }
    if (entry.providerContactPerformed) providerContacts += 1;
    if (entry.deployExitCode === 0) successfulDeployments += 1;
    if (entry.deployExitCode === 0 && !entry.acceptancePassed) {
      failedAcceptanceChecks += 1;
    }
    if (entry.protocolDeviation) protocolDeviations += 1;
  }

  return Object.freeze({
    forwardAttempts,
    rollbackAttempts,
    recoveryAttempts,
    providerContacts,
    successfulDeployments,
    failedAcceptanceChecks,
    protocolDeviations,
    finalRuntimeState,
  });
}

export function mergeHeadlessFlyStagingControlledRolloutAttemptLedgers(
  segments: readonly (readonly HeadlessFlyStagingControlledRolloutAttemptLedgerEntry[])[],
  finalRuntimeState: HeadlessFlyStagingControlledRolloutFinalRuntimeState,
): HeadlessFlyStagingControlledRolloutAttemptTotals {
  const merged = segments.flat();
  return summarizeHeadlessFlyStagingControlledRolloutAttemptTotals(
    merged,
    finalRuntimeState,
  );
}

export function classifyHeadlessFlyStagingSecondForwardAttemptProtocolCompliance(input: {
  readonly singleForwardAttemptPolicy: boolean;
  readonly forwardAttemptSequence: number;
}): {
  readonly ok: boolean;
  readonly reasonId: "ok" | "protocol_deviation_second_forward_attempt";
} {
  if (
    input.singleForwardAttemptPolicy &&
    input.forwardAttemptSequence > 1
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "protocol_deviation_second_forward_attempt",
    });
  }
  return Object.freeze({ ok: true, reasonId: "ok" });
}

export function buildHeadlessFlyStaging2G24GRecoveredAttemptLedger(): readonly HeadlessFlyStagingControlledRolloutAttemptLedgerEntry[] {
  return Object.freeze([
    Object.freeze({
      attemptKind: "forward",
      attemptSequence: 1,
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "forward-d38e45e2-attempt-1",
      cleanupCompleted: false,
      protocolDeviation: false,
    }),
    Object.freeze({
      attemptKind: "rollback",
      attemptSequence: 1,
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-a1e26d4b-attempt-1",
      cleanupCompleted: false,
      protocolDeviation: false,
    }),
    Object.freeze({
      attemptKind: "recovery",
      attemptSequence: 1,
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: "headless-local-chromium-ffmpeg-11e-phase2g.24d",
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "recovery-a1e26d4b-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
    }),
    Object.freeze({
      attemptKind: "manual_recovery",
      attemptSequence: 1,
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G23_FRAME_PROGRESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G23_ROLLBACK_RENDERER_BUILD_ID,
      deployExitCode: 0,
      acceptancePassed: true,
      providerContactPerformed: true,
      materializedConfigToken: "manual_recovery-a1e26d4b-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
    }),
    Object.freeze({
      attemptKind: "forward",
      attemptSequence: 2,
      imageDigestSha256:
        HEADLESS_FLY_STAGING_POST_007_2G24_EXPORT_CORRECTNESS_IMAGE_DIGEST,
      rendererBuildId: HEADLESS_FLY_STAGING_2G24_FORWARD_RENDERER_BUILD_ID,
      deployExitCode: 0,
      acceptancePassed: true,
      providerContactPerformed: true,
      materializedConfigToken: "forward-d38e45e2-attempt-2",
      cleanupCompleted: true,
      protocolDeviation: true,
    }),
  ]);
}

export const HEADLESS_FLY_STAGING_CONTROLLED_ROLLOUT_ATTEMPT_CONTRACT =
  Object.freeze({
    authorityVersion:
      HEADLESS_FLY_STAGING_CONTROLLED_ROLLOUT_ATTEMPT_AUTHORITY_VERSION,
    materializedConfigIsolation: true,
    deleteTemporaryConfigAfterEveryAttempt: true,
    preserveFailureHistoryAfterHealthyFinalState: true,
    incidentRecordId: "post_007_2g24g_controlled_rollout_incident",
  } as const);
