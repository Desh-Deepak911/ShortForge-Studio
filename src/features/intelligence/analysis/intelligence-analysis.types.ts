import type { IntelligenceCompetition } from "../shared/competition.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { Intent, SubIntent } from "../intent/intent-types";

/**
 * Slim intelligence output from heuristic extraction (Phase 2).
 *
 * @deprecated Prefer canonical `IntelligenceAnalysis` from `shared/intelligence-analysis.types`.
 */
export interface LegacyIntelligenceAnalysis {
  topic: string;
  intent: Intent;
  subIntent?: SubIntent;
  entities: IntelligenceEntity[];
  competition?: IntelligenceCompetition;
  season?: number;
  warnings: string[];
}

/** @deprecated Use `LegacyIntelligenceAnalysis`. */
export type IntelligenceAnalysis = LegacyIntelligenceAnalysis;
