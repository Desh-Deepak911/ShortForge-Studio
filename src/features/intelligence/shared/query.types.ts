import type { ConfidenceScore } from "./confidence.types";
import type { IntelligenceCompetition } from "./competition.types";
import type { EntityResolutionResult } from "./entity.types";

/** Content mode aligned with script formats (mirrors research mode without importing it). */
export type IntelligenceContentMode =
  | "story"
  | "tactical_review"
  | "match_preview"
  | "match_recap"
  | "player_analysis"
  | "top_5"
  | "historical_explainer"
  | "opinion_debate";

/**
 * Unified input to the intelligence pipeline from /create or API routes.
 * Canonical query envelope for future orchestration.
 */
export interface IntelligenceQuery {
  topic: string;
  manualContext?: string;
  contentMode: IntelligenceContentMode;
  enableResearch?: boolean;
  /** Optional pre-resolved intent label for logging (does not override contentMode). */
  detectedIntentLabel?: string;
}

/** Parsed topic signals before full entity/research resolution. */
export interface ParsedTopicSignals {
  competitionPhrases: string[];
  rankingPhrases: string[];
  playerPhrases: string[];
  matchPhrases: string[];
  predictionPhrases: string[];
  historyPhrases: string[];
  comparisonPhrases: string[];
  seasonYear?: number;
  matchSides?: string[];
}

/** Enriched query after intent + topic parsing (pre-research). */
export interface EnrichedIntelligenceQuery extends IntelligenceQuery {
  parsedTopic: ParsedTopicSignals;
  entities?: EntityResolutionResult;
  competition?: IntelligenceCompetition;
  confidence?: ConfidenceScore;
}
