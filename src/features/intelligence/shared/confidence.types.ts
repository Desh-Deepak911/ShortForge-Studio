/** Discrete confidence tier used across intelligence modules. */
export type ConfidenceTier = "high" | "medium" | "low";

/**
 * Normalized confidence score for an intelligence decision.
 * Canonical model — unify intent, entity, and research confidence in later phases.
 */
export interface ConfidenceScore {
  tier: ConfidenceTier;
  /** Display-friendly percentage (0–100). */
  percent: number;
  /** Optional module-specific rationale. */
  reasoning?: string;
}

/** Per-stage confidence breakdown for observability and UI. */
export interface IntelligenceConfidenceReport {
  overall: ConfidenceScore;
  intent?: ConfidenceScore;
  entities?: ConfidenceScore;
  research?: ConfidenceScore;
  context?: ConfidenceScore;
}

/** Thresholds for mapping raw scores to tiers (configurable in later phases). */
export interface ConfidenceThresholds {
  highMinPercent: number;
  mediumMinPercent: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  highMinPercent: 88,
  mediumMinPercent: 68,
};
