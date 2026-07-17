/**
 * Retention validation fingerprint — Sprint 10F / 10F.1.
 *
 * Fingerprint is identity over a payload, not authority.
 * Forged scores with a recomputed matching hash still fail
 * `assertRetentionValidationResultCoherence`.
 */

import { buildRetentionSemanticIdentity } from "../domain/retention-story-fingerprint";
import {
  RETENTION_HEURISTIC_REGISTRY_VERSION,
  RETENTION_THRESHOLD_REGISTRY_VERSION,
  RETENTION_VALIDATION_FINGERPRINT_PREFIX,
  RETENTION_VALIDATION_VERSION,
} from "./retention-validation.constants";
import type {
  RetentionEditorialScores,
  RetentionHardGateOutcome,
  RetentionValidationFailureClass,
  RetentionValidationResult,
} from "./retention-validation.types";

export interface RetentionValidationFingerprintPayload {
  readonly candidateFingerprint: string;
  readonly validatorVersion: typeof RETENTION_VALIDATION_VERSION;
  readonly heuristicRegistryVersion: string;
  readonly thresholdRegistryVersion: string;
  readonly activeStrategyThreshold: number;
  readonly hardGates: readonly RetentionHardGateOutcome[];
  readonly editorial: RetentionEditorialScores;
  readonly retentionReadiness: number;
  readonly storyQualityConfidence: number;
  readonly frameworkCompliance: number;
  readonly ok: boolean;
  readonly failureClass: RetentionValidationFailureClass;
}

/** Identity-only hash. Does not prove scores/gates are authoritative. */
export function buildRetentionValidationFingerprint(
  payload: RetentionValidationFingerprintPayload,
): string {
  return buildRetentionSemanticIdentity(
    {
      candidateFingerprint: payload.candidateFingerprint,
      validatorVersion: payload.validatorVersion,
      heuristicRegistryVersion: payload.heuristicRegistryVersion,
      thresholdRegistryVersion: payload.thresholdRegistryVersion,
      activeStrategyThreshold: payload.activeStrategyThreshold,
      hardGates: payload.hardGates.map((g) =>
        Object.freeze({ id: g.id, passed: g.passed, detail: g.detail }),
      ),
      editorial: {
        clarity: payload.editorial.clarity,
        curiosity: payload.editorial.curiosity,
        emotionalProgression: payload.editorial.emotionalProgression,
        compressionQuality: payload.editorial.compressionQuality,
        novelty: payload.editorial.novelty,
        escalation: payload.editorial.escalation,
        payoffStrength: payload.editorial.payoffStrength,
        visualPotential: payload.editorial.visualPotential,
        repetitionPenalty: payload.editorial.repetitionPenalty,
        controllingIdeaAdherence: payload.editorial.controllingIdeaAdherence,
        genericIntroductionQuality: payload.editorial.genericIntroductionQuality,
      },
      retentionReadiness: payload.retentionReadiness,
      storyQualityConfidence: payload.storyQualityConfidence,
      frameworkCompliance: payload.frameworkCompliance,
      ok: payload.ok,
      failureClass: payload.failureClass,
    },
    RETENTION_VALIDATION_FINGERPRINT_PREFIX,
  );
}

/** Build identity fingerprint from a result object (identity-only; not authority). */
export function buildRetentionValidationFingerprintFromResult(
  result: RetentionValidationResult,
): string {
  return buildRetentionValidationFingerprint({
    candidateFingerprint: result.candidateFingerprint,
    validatorVersion: RETENTION_VALIDATION_VERSION,
    heuristicRegistryVersion: RETENTION_HEURISTIC_REGISTRY_VERSION,
    thresholdRegistryVersion: RETENTION_THRESHOLD_REGISTRY_VERSION,
    activeStrategyThreshold: result.activeStrategyThreshold,
    hardGates: result.hardGates,
    editorial: result.editorial,
    retentionReadiness: result.retentionReadiness,
    storyQualityConfidence: result.storyQualityConfidence,
    frameworkCompliance: result.frameworkCompliance,
    ok: result.ok,
    failureClass: result.failureClass,
  });
}
