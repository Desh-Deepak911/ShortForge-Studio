/**
 * Deployed validation-candidate probe authority.
 *
 * Separates "image attached for one authorized validation probe" from ordinary
 * current / runtime-ready selection. Ordinary execution probes continue to
 * require lifecycle=current; candidate probes require an explicit operator gate,
 * digest pin, topology proof, and one-probe consumption.
 *
 * Security invariants:
 * - Candidate eligibility never implies general readiness or rollback selection.
 * - Functional / packaged-artifact rejections remain undeployable and unprobeable.
 * - Protocol-lifecycle rejections may be recovered only under an explicit
 *   one-time recovery authorization that preserves the original rejection event.
 * - Candidate gates are operator-only and must never enter hosted-worker env.
 */

import {
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID,
  HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT,
  classifyHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest,
} from "./fly-staging-cleanup-runtime-authority";
import {
  HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_DEPLOYMENT_PAIR,
} from "./fly-staging-image-environment-deployment-pair-authority";
import {
  HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
} from "./fly-staging-rollback-bridge-authority";
import {
  resolveFlyStagingImageRecordByDigest,
  type HeadlessFlyStagingImageLifecycle,
  type HeadlessFlyStagingVersionedImageRecord,
} from "./fly-staging-versioned-image-authority";

export const HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_AUTHORITY_VERSION =
  1 as const;

/** Circular-authority defect that made prospective promotion unreachable. */
export const HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID =
  "rollout_candidate_lifecycle_missing" as const;

/**
 * Operator-only gate for candidate-validation probes.
 * Must remain absent from hosted-worker environment surfaces.
 */
export const HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE =
  "HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION" as const;

/** Immutable digest pin required when the candidate-validation gate is on. */
export const HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV =
  "HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN" as const;

export const HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE =
  "deployed_validation_candidate" as const satisfies HeadlessFlyStagingImageLifecycle;

/** Maximum age of a deployed candidate observation boundary before expiry. */
export const HEADLESS_FLY_STAGING_CANDIDATE_VALIDATION_OBSERVATION_WINDOW_MS =
  6 * 60 * 60 * 1000;

export const HEADLESS_FLY_STAGING_CANDIDATE_PROTOCOL_RECOVERY_REASON_ID =
  "protocol_recovery_probe_lifecycle_missing" as const;

export const HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION =
  "READY_FOR_ONE_TIME_CANDIDATE_RECOVERY" as const;

export type HeadlessFlyStagingDeployedValidationCandidateProbeReasonId =
  | "ok"
  | "candidate_gate_disabled"
  | "candidate_digest_pin_missing"
  | "candidate_digest_pin_mismatch"
  | "candidate_digest_not_pinned_exact"
  | "historical_lifecycle_not_candidate"
  | "rejected_functional_digest"
  | "rejected_packaged_artifact_digest"
  | "candidate_not_attached_to_required_machines"
  | "mixed_digest"
  | "topology_not_verify_render_only"
  | "loop_acceptance_missing"
  | "wrong_renderer_build_id"
  | "wrong_schema_fingerprint"
  | "wrong_worker_artifact"
  | "wrong_page_artifact"
  | "wrong_build_info"
  | "wrong_deployment_pair"
  | "maintenance_enabled"
  | "public_services_present"
  | "forward_attempt_count_not_one"
  | "candidate_probe_budget_exhausted"
  | "rollback_image_not_preserved"
  | "probe_evidence_not_archived"
  | "protocol_recovery_authorization_missing"
  | "candidate_observation_expired"
  | "candidate_lifecycle_not_active"
  | "promotion_ineligible"
  | "hostile_input";

export type HeadlessFlyStagingCandidateValidationCycleLifecycle =
  | typeof HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE
  | "promoted_current"
  | "rejected"
  | "expired"
  | "protocol_incident_blocked";

export type HeadlessFlyStagingCandidateValidationCycleState = Readonly<{
  readonly candidateDigestSha256: string;
  readonly lifecycle: HeadlessFlyStagingCandidateValidationCycleLifecycle;
  readonly probeAttemptCount: 0 | 1;
  readonly rolloutAcceptanceBoundaryIso: string;
  readonly authorizedUntilIso: string;
  /** Ordinary readiness remains false while lifecycle is candidate. */
  readonly current: false | true;
  readonly runtimeReady: false | true;
  readonly generalProbeEligible: false;
  readonly rollbackEligible: false;
  readonly promotionEligible: boolean;
}>;

export type HeadlessFlyStagingCandidateProbeObservation = Readonly<{
  readonly candidateValidationGateEnabled: boolean;
  readonly candidateDigestPin: unknown;
  readonly candidateDigestSha256: unknown;
  readonly expectedDeploymentPairId: unknown;
  readonly expectedRendererBuildId: unknown;
  readonly expectedHostedWorkerArtifactSha256: unknown;
  readonly expectedHostedPageArtifactSha256: unknown;
  readonly expectedBuildInfoSha256: unknown;
  readonly expectedSchemaMigrationIds: readonly string[];
  readonly expectedSchemaChecksumSha256: readonly string[];
  readonly verifyMachineDigestSha256: unknown;
  readonly renderMachineDigestSha256: unknown;
  readonly verifyCount: unknown;
  readonly renderCount: unknown;
  readonly otherCount: unknown;
  readonly verifyLoopAccepted: unknown;
  readonly renderLoopAccepted: unknown;
  readonly maintenanceEnabled: unknown;
  readonly publicServicesPresent: unknown;
  readonly forwardAttemptCountForCandidate: unknown;
  readonly candidateProbeAttemptCount: unknown;
  readonly rollbackImageDigestSha256: unknown;
  readonly probeEvidenceArchived: unknown;
  readonly cycleLifecycle: HeadlessFlyStagingCandidateValidationCycleLifecycle | null;
  readonly rolloutAcceptanceBoundaryIso: unknown;
  readonly nowIso: unknown;
  readonly protocolRecoveryAuthorizationPresent: unknown;
}>;

export type HeadlessFlyStagingFinalizationCorrectionProtocolRecoveryAuthorization =
  Readonly<{
    readonly targetDigestSha256: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;
    readonly incidentCommitSha: "7bd84c355163f5238242d0ee7945c56778b981da";
    readonly originalRejectionReasonId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID;
    readonly originalRejectionPreserved: true;
    readonly defectId: typeof HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID;
    readonly forwardAcceptancePassed: true;
    readonly loopsAccepted: true;
    readonly schemaAccepted: true;
    readonly probeJobCreated: false;
    readonly productionPathExercised: false;
    readonly functionalFailureObserved: false;
    readonly packagedArtifactRejection: false;
    readonly rollbackSucceeded: true;
    readonly additionalForwardAuthorization: 1;
    readonly candidateProbeAuthorization: 1;
    readonly reasonId: typeof HEADLESS_FLY_STAGING_CANDIDATE_PROTOCOL_RECOVERY_REASON_ID;
    readonly furtherRecoveryForbidden: true;
    readonly recoveryDecision: typeof HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION;
  }>;

/**
 * One-time protocol recovery for 41df9b44….
 * Preserves the sealed rejection event; does not pretend the first rollout
 * never occurred. Activates only under an explicit later operator authorization
 * that presents this record.
 */
export const HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_PROTOCOL_RECOVERY_AUTHORIZATION =
  Object.freeze({
    targetDigestSha256:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    incidentCommitSha: "7bd84c355163f5238242d0ee7945c56778b981da",
    originalRejectionReasonId:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID,
    originalRejectionPreserved: true,
    defectId: HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID,
    forwardAcceptancePassed: true,
    loopsAccepted: true,
    schemaAccepted: true,
    probeJobCreated: false,
    productionPathExercised: false,
    functionalFailureObserved: false,
    packagedArtifactRejection: false,
    rollbackSucceeded: true,
    additionalForwardAuthorization: 1,
    candidateProbeAuthorization: 1,
    reasonId: HEADLESS_FLY_STAGING_CANDIDATE_PROTOCOL_RECOVERY_REASON_ID,
    furtherRecoveryForbidden: true,
    recoveryDecision:
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
  } satisfies HeadlessFlyStagingFinalizationCorrectionProtocolRecoveryAuthorization);

const DIGEST_RE = /^[a-f0-9]{64}$/;

function asDigest(value: unknown): string | null {
  return typeof value === "string" && DIGEST_RE.test(value) ? value : null;
}

function schemaFingerprintMatches(input: {
  readonly expectedMigrationIds: readonly string[];
  readonly expectedChecksumSha256: readonly string[];
  readonly actualMigrationIds: readonly string[];
  readonly actualChecksumSha256: readonly string[];
}): boolean {
  if (
    input.expectedMigrationIds.length !== input.actualMigrationIds.length ||
    input.expectedChecksumSha256.length !== input.actualChecksumSha256.length
  ) {
    return false;
  }
  for (let i = 0; i < input.expectedMigrationIds.length; i += 1) {
    if (input.expectedMigrationIds[i] !== input.actualMigrationIds[i]) {
      return false;
    }
  }
  for (let i = 0; i < input.expectedChecksumSha256.length; i += 1) {
    if (input.expectedChecksumSha256[i] !== input.actualChecksumSha256[i]) {
      return false;
    }
  }
  return true;
}

export function isHeadlessFlyRenderCandidateValidationGateOn(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): boolean {
  return (
    (env as Record<string, unknown>)[
      HEADLESS_FLY_RENDER_CANDIDATE_VALIDATION_GATE
    ] === "1"
  );
}

export function readHeadlessFlyRenderCandidateDigestPin(
  env: NodeJS.ProcessEnv | Record<string, unknown>,
): string | null {
  return asDigest(
    (env as Record<string, unknown>)[HEADLESS_FLY_RENDER_CANDIDATE_DIGEST_PIN_ENV],
  );
}

/**
 * Functional and packaged rejections are never candidate-probe eligible.
 * Protocol-lifecycle rejection (probe_ineligible_historical_lifecycle) may be
 * recovered only with an explicit one-time recovery authorization.
 */
export function classifyHeadlessFlyStagingCandidateRejectionBarrier(input: {
  readonly candidateDigestSha256: unknown;
  readonly protocolRecoveryAuthorizationPresent: unknown;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingDeployedValidationCandidateProbeReasonId;
    } {
  const digest = asDigest(input.candidateDigestSha256);
  if (digest == null) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_IMAGE_DIGEST) {
    return Object.freeze({
      ok: false,
      reasonId: "rejected_packaged_artifact_digest",
    });
  }
  if (digest === HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REPLACEMENT_IMAGE_DIGEST) {
    return Object.freeze({ ok: false, reasonId: "rejected_functional_digest" });
  }
  if (
    digest ===
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST
  ) {
    const rejected =
      classifyHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(digest);
    if (
      rejected.rejected &&
      rejected.reasonId ===
        HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID
    ) {
      if (input.protocolRecoveryAuthorizationPresent !== true) {
        return Object.freeze({
          ok: false,
          reasonId: "protocol_recovery_authorization_missing",
        });
      }
      return Object.freeze({ ok: true });
    }
  }
  const permanent =
    classifyHeadlessFlyStagingPermanentlyRejectedCleanupRuntimeDigest(digest);
  if (permanent.rejected) {
    if (
      permanent.reasonId ===
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_REJECTED_REASON_ID
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "rejected_packaged_artifact_digest",
      });
    }
    if (
      permanent.reasonId ===
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_LIVE_FINALIZATION_FAILED_REASON_ID
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "rejected_functional_digest",
      });
    }
    return Object.freeze({
      ok: false,
      reasonId: "protocol_recovery_authorization_missing",
    });
  }
  return Object.freeze({ ok: true });
}

export function buildHeadlessFlyStagingCandidateValidationCycleState(input: {
  readonly candidateDigestSha256: string;
  readonly rolloutAcceptanceBoundaryIso: string;
  readonly authorizedUntilIso: string;
}): HeadlessFlyStagingCandidateValidationCycleState {
  return Object.freeze({
    candidateDigestSha256: input.candidateDigestSha256,
    lifecycle: HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
    probeAttemptCount: 0,
    rolloutAcceptanceBoundaryIso: input.rolloutAcceptanceBoundaryIso,
    authorizedUntilIso: input.authorizedUntilIso,
    current: false,
    runtimeReady: false,
    generalProbeEligible: false,
    rollbackEligible: false,
    promotionEligible: false,
  });
}

export function classifyHeadlessFlyStagingCandidateObservationExpiry(input: {
  readonly rolloutAcceptanceBoundaryIso: unknown;
  readonly nowIso: unknown;
  readonly authorizedUntilIso?: unknown;
}):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonId: "candidate_observation_expired" | "hostile_input";
    } {
  if (
    typeof input.rolloutAcceptanceBoundaryIso !== "string" ||
    typeof input.nowIso !== "string"
  ) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  const boundaryMs = Date.parse(input.rolloutAcceptanceBoundaryIso);
  const nowMs = Date.parse(input.nowIso);
  if (!Number.isFinite(boundaryMs) || !Number.isFinite(nowMs)) {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
  if (typeof input.authorizedUntilIso === "string") {
    const untilMs = Date.parse(input.authorizedUntilIso);
    if (!Number.isFinite(untilMs) || nowMs > untilMs) {
      return Object.freeze({
        ok: false,
        reasonId: "candidate_observation_expired",
      });
    }
  } else if (
    nowMs - boundaryMs >
    HEADLESS_FLY_STAGING_CANDIDATE_VALIDATION_OBSERVATION_WINDOW_MS
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "candidate_observation_expired",
    });
  }
  return Object.freeze({ ok: true });
}

/**
 * Fail-closed candidate probe eligibility. Does not weaken current-image
 * selection; ordinary probes must continue to require lifecycle=current.
 */
export function classifyFlyRenderDeployedValidationCandidateProbeAuthority(
  input: HeadlessFlyStagingCandidateProbeObservation,
):
  | {
      readonly ok: true;
      readonly record: HeadlessFlyStagingVersionedImageRecord | null;
      readonly candidateDigestSha256: string;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingDeployedValidationCandidateProbeReasonId;
    } {
  try {
    if (input.candidateValidationGateEnabled !== true) {
      return Object.freeze({ ok: false, reasonId: "candidate_gate_disabled" });
    }
    const pin = asDigest(input.candidateDigestPin);
    if (pin == null) {
      return Object.freeze({
        ok: false,
        reasonId: "candidate_digest_pin_missing",
      });
    }
    const candidate = asDigest(input.candidateDigestSha256);
    if (candidate == null) {
      return Object.freeze({ ok: false, reasonId: "hostile_input" });
    }
    if (pin !== candidate) {
      return Object.freeze({
        ok: false,
        reasonId: "candidate_digest_pin_mismatch",
      });
    }

    const barrier = classifyHeadlessFlyStagingCandidateRejectionBarrier({
      candidateDigestSha256: candidate,
      protocolRecoveryAuthorizationPresent:
        input.protocolRecoveryAuthorizationPresent,
    });
    if (!barrier.ok) return barrier;

    if (
      input.cycleLifecycle !==
      HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE
    ) {
      if (input.cycleLifecycle == null) {
        // Historical / prospective records without an active candidate cycle
        // cannot use the candidate probe path.
        const versioned = resolveFlyStagingImageRecordByDigest(candidate);
        if (versioned == null) {
          return Object.freeze({ ok: false, reasonId: "hostile_input" });
        }
        if (versioned.lifecycle === "historical") {
          return Object.freeze({
            ok: false,
            reasonId: "historical_lifecycle_not_candidate",
          });
        }
        return Object.freeze({
          ok: false,
          reasonId: "candidate_lifecycle_not_active",
        });
      }
      return Object.freeze({
        ok: false,
        reasonId: "candidate_lifecycle_not_active",
      });
    }

    const expiry = classifyHeadlessFlyStagingCandidateObservationExpiry({
      rolloutAcceptanceBoundaryIso: input.rolloutAcceptanceBoundaryIso,
      nowIso: input.nowIso,
    });
    if (!expiry.ok) return expiry;

    // Candidate recovery reuses the sealed correction image/environment binding.
    // An explicit candidate pair id is also accepted for the same digest.
    if (
      input.expectedDeploymentPairId !==
        HEADLESS_FLY_STAGING_POST_008_2G25_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_DEPLOYMENT_PAIR
          .pairId &&
      input.expectedDeploymentPairId !==
        "post_008_2g25_cleanup_runtime_finalization_correction_candidate_pair"
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_deployment_pair" });
    }

    if (
      input.expectedRendererBuildId !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_RENDERER_BUILD_ID
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_renderer_build_id" });
    }
    if (
      input.expectedHostedWorkerArtifactSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_HOSTED_WORKER_ARTIFACT_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_worker_artifact" });
    }
    if (
      input.expectedHostedPageArtifactSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PAGE_ARTIFACT_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_page_artifact" });
    }
    if (
      input.expectedBuildInfoSha256 !==
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_BUILD_INFO_SHA256
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_build_info" });
    }
    if (
      !schemaFingerprintMatches({
        expectedMigrationIds:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.migrationIds,
        expectedChecksumSha256:
          HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_SCHEMA_FINGERPRINT.checksumSha256,
        actualMigrationIds: input.expectedSchemaMigrationIds,
        actualChecksumSha256: input.expectedSchemaChecksumSha256,
      })
    ) {
      return Object.freeze({ ok: false, reasonId: "wrong_schema_fingerprint" });
    }

    const verifyDigest = asDigest(input.verifyMachineDigestSha256);
    const renderDigest = asDigest(input.renderMachineDigestSha256);
    if (verifyDigest == null || renderDigest == null) {
      return Object.freeze({
        ok: false,
        reasonId: "candidate_not_attached_to_required_machines",
      });
    }
    if (verifyDigest !== candidate || renderDigest !== candidate) {
      if (verifyDigest !== renderDigest) {
        return Object.freeze({ ok: false, reasonId: "mixed_digest" });
      }
      return Object.freeze({
        ok: false,
        reasonId: "candidate_not_attached_to_required_machines",
      });
    }
    if (
      input.verifyCount !== 1 ||
      input.renderCount !== 1 ||
      input.otherCount !== 0
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "topology_not_verify_render_only",
      });
    }
    if (
      input.verifyLoopAccepted !== true ||
      input.renderLoopAccepted !== true
    ) {
      return Object.freeze({ ok: false, reasonId: "loop_acceptance_missing" });
    }
    if (input.maintenanceEnabled !== false) {
      return Object.freeze({ ok: false, reasonId: "maintenance_enabled" });
    }
    if (input.publicServicesPresent !== false) {
      return Object.freeze({ ok: false, reasonId: "public_services_present" });
    }
    if (input.forwardAttemptCountForCandidate !== 1) {
      return Object.freeze({
        ok: false,
        reasonId: "forward_attempt_count_not_one",
      });
    }
    if (input.candidateProbeAttemptCount !== 0) {
      return Object.freeze({
        ok: false,
        reasonId: "candidate_probe_budget_exhausted",
      });
    }
    if (
      asDigest(input.rollbackImageDigestSha256) !==
      HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST
    ) {
      return Object.freeze({
        ok: false,
        reasonId: "rollback_image_not_preserved",
      });
    }
    if (input.probeEvidenceArchived !== true) {
      return Object.freeze({
        ok: false,
        reasonId: "probe_evidence_not_archived",
      });
    }

    return Object.freeze({
      ok: true,
      record: resolveFlyStagingImageRecordByDigest(candidate),
      candidateDigestSha256: candidate,
    });
  } catch {
    return Object.freeze({ ok: false, reasonId: "hostile_input" });
  }
}

export function consumeHeadlessFlyStagingCandidateProbeAttempt(input: {
  readonly cycle: HeadlessFlyStagingCandidateValidationCycleState;
}):
  | {
      readonly ok: true;
      readonly cycle: HeadlessFlyStagingCandidateValidationCycleState;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingDeployedValidationCandidateProbeReasonId;
    } {
  if (
    input.cycle.lifecycle !==
    HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "candidate_lifecycle_not_active",
    });
  }
  if (input.cycle.probeAttemptCount !== 0) {
    return Object.freeze({
      ok: false,
      reasonId: "candidate_probe_budget_exhausted",
    });
  }
  return Object.freeze({
    ok: true,
    cycle: Object.freeze({
      ...input.cycle,
      probeAttemptCount: 1 as const,
      promotionEligible: false,
    }),
  });
}

export type HeadlessFlyStagingCandidateProbeOutcomeEvidence = Readonly<{
  readonly overall: "PASS" | "FAIL";
  readonly jobCreated: boolean;
  readonly productionStagesPassed: boolean;
  readonly durableJobSucceeded: boolean;
  readonly finalizationPassed: boolean;
  readonly bindingPassed: boolean;
  readonly downloadPassed: boolean;
  readonly replayPassed: boolean;
  readonly cleanupPassed: boolean;
  readonly zeroDisallowedLeftovers: boolean;
  readonly gateOffEvidencePreservationPassed: boolean;
  readonly failureBeforeJobCreationDueAuthorityDefect: boolean;
}>;

/**
 * PASS: candidate → current only after complete production-path proof.
 * FAIL after job contact: candidate → rejected + rollback pair selected.
 * FAIL before job due authority/orchestration defect: protocol incident; no auto-retry.
 */
export function classifyHeadlessFlyStagingCandidateProbeTransition(input: {
  readonly cycle: HeadlessFlyStagingCandidateValidationCycleState;
  readonly evidence: HeadlessFlyStagingCandidateProbeOutcomeEvidence;
}):
  | {
      readonly ok: true;
      readonly nextLifecycle: "promoted_current";
      readonly selectRollbackPair: false;
    }
  | {
      readonly ok: true;
      readonly nextLifecycle: "rejected";
      readonly selectRollbackPair: true;
    }
  | {
      readonly ok: true;
      readonly nextLifecycle: "protocol_incident_blocked";
      readonly selectRollbackPair: true;
    }
  | {
      readonly ok: false;
      readonly reasonId: HeadlessFlyStagingDeployedValidationCandidateProbeReasonId;
    } {
  if (
    input.cycle.lifecycle !==
      HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE ||
    input.cycle.probeAttemptCount !== 1
  ) {
    return Object.freeze({
      ok: false,
      reasonId: "candidate_lifecycle_not_active",
    });
  }
  if (input.evidence.overall === "PASS") {
    if (
      !input.evidence.jobCreated ||
      !input.evidence.productionStagesPassed ||
      !input.evidence.durableJobSucceeded ||
      !input.evidence.finalizationPassed ||
      !input.evidence.bindingPassed ||
      !input.evidence.downloadPassed ||
      !input.evidence.replayPassed ||
      !input.evidence.cleanupPassed ||
      !input.evidence.zeroDisallowedLeftovers ||
      !input.evidence.gateOffEvidencePreservationPassed
    ) {
      return Object.freeze({ ok: false, reasonId: "promotion_ineligible" });
    }
    return Object.freeze({
      ok: true,
      nextLifecycle: "promoted_current",
      selectRollbackPair: false,
    });
  }
  if (
    !input.evidence.jobCreated &&
    input.evidence.failureBeforeJobCreationDueAuthorityDefect
  ) {
    return Object.freeze({
      ok: true,
      nextLifecycle: "protocol_incident_blocked",
      selectRollbackPair: true,
    });
  }
  return Object.freeze({
    ok: true,
    nextLifecycle: "rejected",
    selectRollbackPair: true,
  });
}

/**
 * Classifies the sealed 41df9b44… incident without claiming a renderer failure.
 */
export function classifyHeadlessFlyStagingFinalizationCorrectionIncident(): Readonly<{
  readonly defectId: typeof HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID;
  readonly digest: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;
  readonly rejectionReasonId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID;
  readonly deploymentAcceptance: "PASS";
  readonly loops: "PASS";
  readonly schema: "PASS";
  readonly probeJobCreated: false;
  readonly productionPathExercised: false;
  readonly rendererFailureClaimed: false;
  readonly recoveryDecision: typeof HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION;
  readonly sealedRejectedRecordId: typeof HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD.recordId;
}> {
  return Object.freeze({
    defectId: HEADLESS_FLY_STAGING_ROLLOUT_CANDIDATE_LIFECYCLE_MISSING_DEFECT_ID,
    digest: HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST,
    rejectionReasonId:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_PROBE_INELIGIBLE_REASON_ID,
    deploymentAcceptance: "PASS",
    loops: "PASS",
    schema: "PASS",
    probeJobCreated: false,
    productionPathExercised: false,
    rendererFailureClaimed: false,
    recoveryDecision:
      HEADLESS_FLY_STAGING_FINALIZATION_CORRECTION_RECOVERY_DECISION,
    sealedRejectedRecordId:
      HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_REJECTED_IMAGE_RECORD
        .recordId,
  });
}

export function buildPassingCandidateProbeObservation(overrides?: Partial<HeadlessFlyStagingCandidateProbeObservation>): HeadlessFlyStagingCandidateProbeObservation {
  const digest =
    HEADLESS_FLY_STAGING_CLEANUP_RUNTIME_FINALIZATION_CORRECTION_IMAGE_DIGEST;
  return Object.freeze({
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
    verifyLoopAccepted: true,
    renderLoopAccepted: true,
    maintenanceEnabled: false,
    publicServicesPresent: false,
    forwardAttemptCountForCandidate: 1,
    candidateProbeAttemptCount: 0,
    rollbackImageDigestSha256: HEADLESS_FLY_STAGING_ROLLBACK_BRIDGE_IMAGE_DIGEST,
    probeEvidenceArchived: true,
    cycleLifecycle: HEADLESS_FLY_STAGING_DEPLOYED_VALIDATION_CANDIDATE_LIFECYCLE,
    rolloutAcceptanceBoundaryIso: "2026-07-31T20:19:34.242Z",
    nowIso: "2026-07-31T20:21:00.000Z",
    protocolRecoveryAuthorizationPresent: true,
    ...overrides,
  });
}
