/**
 * Sprint 11E Phase 2G.25D-Cleanup Part B — sanitized controlled-rollout incident ledger.
 * Provider-free authority reconciled against local logs and read-only Fly release history.
 */

import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
} from "./fly-staging-rollback-bridge-authority";
import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
} from "./fly-staging-cleanup-runtime-authority";
import {
  buildHeadlessFlyStagingMaterializedConfigAttemptIdentity,
  type HeadlessFlyStagingControlledRolloutAttemptKind,
  type HeadlessFlyStagingControlledRolloutAttemptLedgerEntry,
  type HeadlessFlyStagingControlledRolloutFinalRuntimeState,
  type HeadlessFlyStagingControlledRolloutProtocolCompliance,
  type HeadlessFlyStagingControlledRolloutResultClassification,
  summarizeHeadlessFlyStagingControlledRolloutAttemptTotals,
} from "./fly-staging-controlled-rollout-attempt-authority";

export const HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_AUTHORITY_VERSION =
  1 as const;

export const HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT =
  1 as const;

export type HeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentRecord =
  Readonly<{
    phaseId: "2G.25D-Cleanup-Part-B";
    targetImageDigestSha256: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST;
    targetRendererBuildId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID;
    rollbackImageDigestSha256: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
    rollbackRendererBuildId: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID;
    authorizedForwardLimit: typeof HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT;
    actualForwardCleanupDeploymentCount: number;
    actualBridgeRollbackDeploymentCount: number;
    actualManualBridgeRecoveryDeploymentCount: number;
    preflightOnlyContactCount: number;
    failedAcceptanceCheckCount: number;
    protocolCompliance: HeadlessFlyStagingControlledRolloutProtocolCompliance;
    stagingUltimatelyRecovered: true;
    schemaUnchanged: true;
    maintenanceNeverEnabled: true;
    finalRuntimeDigestSha256: typeof HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
    finalRuntimeState: HeadlessFlyStagingControlledRolloutFinalRuntimeState;
    rolloutResult: HeadlessFlyStagingControlledRolloutResultClassification;
    rejectionReasonId: "invalid_renderer_build_id_packaged_worker";
  }>;

export const HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_INCIDENT_RECORD =
  Object.freeze({
    phaseId: "2G.25D-Cleanup-Part-B",
    targetImageDigestSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
    targetRendererBuildId: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
    rollbackImageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    rollbackRendererBuildId: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID,
    authorizedForwardLimit:
      HEADLESS_FLY_STAGING_2G25D_CLEANUP_RUNTIME_ROLLOUT_AUTHORIZED_FORWARD_LIMIT,
    actualForwardCleanupDeploymentCount: 3,
    actualBridgeRollbackDeploymentCount: 4,
    actualManualBridgeRecoveryDeploymentCount: 1,
    preflightOnlyContactCount: 1,
    failedAcceptanceCheckCount: 4,
    protocolCompliance: "deviated",
    stagingUltimatelyRecovered: true,
    schemaUnchanged: true,
    maintenanceNeverEnabled: true,
    finalRuntimeDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    finalRuntimeState: "healthy",
    rolloutResult: "fail",
    rejectionReasonId: "invalid_renderer_build_id_packaged_worker",
  } satisfies HeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentRecord);

function ledgerEntry(input: {
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
  readonly failClass?: string;
  readonly logRef: string;
}): HeadlessFlyStagingControlledRolloutAttemptLedgerEntry {
  return Object.freeze({
    attemptKind: input.attemptKind,
    attemptSequence: input.attemptSequence,
    imageDigestSha256: input.imageDigestSha256,
    rendererBuildId: input.rendererBuildId,
    deployExitCode: input.deployExitCode,
    acceptancePassed: input.acceptancePassed,
    providerContactPerformed: input.providerContactPerformed,
    materializedConfigToken: input.materializedConfigToken,
    cleanupCompleted: input.cleanupCompleted,
    protocolDeviation: input.protocolDeviation,
  });
}

/** Sanitized ledger reconciled from /tmp/2g25-rollout-live*.log and Fly releases v41–v49. */
export function buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger(): readonly HeadlessFlyStagingControlledRolloutAttemptLedgerEntry[] {
  const cleanup = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST;
  const bridge = HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST;
  const cleanupBuild = HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID;
  const bridgeBuild = HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_RENDERER_BUILD_ID;

  return Object.freeze([
    ledgerEntry({
      attemptKind: "forward",
      attemptSequence: 1,
      imageDigestSha256: cleanup,
      rendererBuildId: cleanupBuild,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "forward-9570e9d9-attempt-1",
      cleanupCompleted: false,
      protocolDeviation: true,
      failClass: "verify_loop_failed",
      logRef: "/tmp/2g25-rollout-live3.log",
    }),
    ledgerEntry({
      attemptKind: "rollback",
      attemptSequence: 1,
      imageDigestSha256: bridge,
      rendererBuildId: bridgeBuild,
      deployExitCode: 0,
      acceptancePassed: true,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-7de23dbd-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
      logRef: "/tmp/2g25-rollout-live3.log",
    }),
    ledgerEntry({
      attemptKind: "forward",
      attemptSequence: 2,
      imageDigestSha256: cleanup,
      rendererBuildId: cleanupBuild,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "forward-9570e9d9-attempt-1",
      cleanupCompleted: false,
      protocolDeviation: true,
      failClass: "verify_loop_failed",
      logRef: "/tmp/2g25-rollout-live5.log",
    }),
    ledgerEntry({
      attemptKind: "rollback",
      attemptSequence: 2,
      imageDigestSha256: bridge,
      rendererBuildId: bridgeBuild,
      deployExitCode: 0,
      acceptancePassed: true,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-7de23dbd-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
      logRef: "/tmp/2g25-rollout-live5.log",
    }),
    ledgerEntry({
      attemptKind: "forward",
      attemptSequence: 3,
      imageDigestSha256: cleanup,
      rendererBuildId: cleanupBuild,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "forward-9570e9d9-manual-debug",
      cleanupCompleted: false,
      protocolDeviation: true,
      failClass: "invalid_renderer_build_id",
      logRef: "manual debug deploy (Fly release v48)",
    }),
    ledgerEntry({
      attemptKind: "manual_recovery",
      attemptSequence: 1,
      imageDigestSha256: bridge,
      rendererBuildId: bridgeBuild,
      deployExitCode: 0,
      acceptancePassed: true,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-bridge-recovery",
      cleanupCompleted: true,
      protocolDeviation: false,
      logRef: "manual bridge recovery (Fly release v49)",
    }),
    ledgerEntry({
      attemptKind: "rollback",
      attemptSequence: 3,
      imageDigestSha256: bridge,
      rendererBuildId: bridgeBuild,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-7de23dbd-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
      failClass: "hosted_environment_not_ready",
      logRef: "/tmp/2g25-rollout-live.log",
    }),
    ledgerEntry({
      attemptKind: "rollback",
      attemptSequence: 4,
      imageDigestSha256: bridge,
      rendererBuildId: bridgeBuild,
      deployExitCode: 0,
      acceptancePassed: false,
      providerContactPerformed: true,
      materializedConfigToken: "rollback-7de23dbd-attempt-1",
      cleanupCompleted: true,
      protocolDeviation: false,
      failClass: "execution_probe_failed",
      logRef: "/tmp/2g25-rollout-live2.log",
    }),
  ]);
}

export function summarizeHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentTotals(): ReturnType<
  typeof summarizeHeadlessFlyStagingControlledRolloutAttemptTotals
> {
  return summarizeHeadlessFlyStagingControlledRolloutAttemptTotals(
    buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutIncidentLedger(),
    "healthy",
  );
}

export function buildHeadlessFlyStaging2G25DCleanupRuntimeRolloutAttemptIdentity(input: {
  readonly footiebitzRoot: string;
  readonly attemptKind: HeadlessFlyStagingControlledRolloutAttemptKind;
  readonly imageDigestSha256: string;
  readonly attemptSequence: number;
}) {
  return buildHeadlessFlyStagingMaterializedConfigAttemptIdentity(input);
}
