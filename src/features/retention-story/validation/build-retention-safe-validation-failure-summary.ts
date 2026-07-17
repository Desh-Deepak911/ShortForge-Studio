/**
 * Privacy-safe Retention validation failure summary for live diagnostics — Sprint 10H.2.
 * Lives under validation/ to avoid production↔rewrite circular imports.
 * Scores and IDs only. Never includes narration, prompts, claims, or research text.
 */

import type { RetentionValidationResult } from "../validation/retention-validation.types";
import { RETENTION_EDITORIAL_COMPONENT_IDS } from "../validation/retention-validation.constants";

const MAX_FAILED_HARD_GATES = 12;
const MAX_QUALITY_DIAGNOSTIC_IDS = 12;

export interface RetentionSafeValidationFailureSummary {
  readonly failureClass: "hard_gate" | "quality_threshold";
  readonly readinessScore: number;
  readonly activeThreshold: number;
  readonly failedHardGateIds: readonly string[];
  /** Bounded 0–1 editorial component scores (2 decimal places). */
  readonly editorialScores: Readonly<Record<string, number>>;
  /** Component IDs that sit below the soft quality band (threshold − 0.2, floor 0.35). */
  readonly qualityDiagnosticIds: readonly string[];
}

function roundScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/**
 * Build a bounded validation-failure summary from a canonical validation result.
 * Returns null when validation passed or failureClass is none.
 */
export function buildRetentionSafeValidationFailureSummary(
  validation: RetentionValidationResult,
): RetentionSafeValidationFailureSummary | null {
  if (validation.ok || validation.failureClass === "none") return null;
  if (
    validation.failureClass !== "hard_gate" &&
    validation.failureClass !== "quality_threshold"
  ) {
    return null;
  }

  const failedHardGateIds = Object.freeze(
    validation.hardGates
      .filter((g) => !g.passed)
      .map((g) => g.id)
      .slice(0, MAX_FAILED_HARD_GATES),
  );

  const editorialScores: Record<string, number> = {};
  const e = validation.editorial;
  editorialScores.clarity = roundScore(e.clarity);
  editorialScores.curiosity = roundScore(e.curiosity);
  editorialScores.emotional_progression = roundScore(e.emotionalProgression);
  editorialScores.compression_quality = roundScore(e.compressionQuality);
  editorialScores.novelty = roundScore(e.novelty);
  editorialScores.escalation = roundScore(e.escalation);
  editorialScores.payoff_strength = roundScore(e.payoffStrength);
  editorialScores.visual_potential = roundScore(e.visualPotential);
  editorialScores.repetition_penalty = roundScore(e.repetitionPenalty);
  editorialScores.controlling_idea_adherence = roundScore(
    e.controllingIdeaAdherence,
  );
  editorialScores.generic_introduction_quality = roundScore(
    e.genericIntroductionQuality,
  );

  const softCut = Math.max(0.35, validation.activeStrategyThreshold - 0.2);
  const scoreById: Record<string, number> = {
    clarity: e.clarity,
    curiosity: e.curiosity,
    emotional_progression: e.emotionalProgression,
    compression_quality: e.compressionQuality,
    novelty: e.novelty,
    escalation: e.escalation,
    payoff_strength: e.payoffStrength,
    visual_potential: e.visualPotential,
    // Higher repetition penalty is worse — invert for soft-band check.
    repetition_penalty: 1 - e.repetitionPenalty,
    controlling_idea_adherence: e.controllingIdeaAdherence,
    generic_introduction_quality: e.genericIntroductionQuality,
  };

  const qualityDiagnosticIds = Object.freeze(
    RETENTION_EDITORIAL_COMPONENT_IDS.filter((id) => {
      const score = scoreById[id];
      return typeof score === "number" && score < softCut;
    }).slice(0, MAX_QUALITY_DIAGNOSTIC_IDS),
  );

  return Object.freeze({
    failureClass: validation.failureClass,
    readinessScore: roundScore(validation.retentionReadiness),
    activeThreshold: roundScore(validation.activeStrategyThreshold),
    failedHardGateIds,
    editorialScores: Object.freeze(editorialScores),
    qualityDiagnosticIds,
  });
}
