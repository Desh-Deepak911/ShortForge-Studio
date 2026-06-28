/** Primary storytelling intent inferred from a creator brief. */
export type Intent =
  | "story"
  | "player_profile"
  | "ranked_list"
  | "match_preview"
  | "match_recap"
  | "tactical_breakdown"
  | "historical_explainer"
  | "opinion"
  | "news";

/** Secondary topic focus within a primary intent. */
export type SubIntent =
  | "top_scorers"
  | "top_assists"
  | "transfers"
  | "injuries"
  | "form"
  | "records"
  | "predictions"
  | "rivalries"
  | "timeline";

export type IntentConfidence = "high" | "medium" | "low";

export interface TopicParseResult {
  /** Detected competition / league phrases. */
  competitionWords: string[];
  /** Ranking / list / leaderboard phrases. */
  rankingWords: string[];
  /** Player-focused phrases and position terms. */
  playerKeywords: string[];
  /** Match / fixture / result phrases. */
  matchKeywords: string[];
  /** Prediction / forecast phrases. */
  predictionKeywords: string[];
  /** Historical / legacy / timeline phrases. */
  historyKeywords: string[];
  /** Comparison / debate phrases. */
  comparisonKeywords: string[];
  /** Normalized text used for extraction. */
  normalizedText: string;
  /** Teams or sides when a vs/v matchup pattern is present. */
  matchSides?: string[];
  /** Four-digit season year when detected (e.g. 2026). */
  seasonYear?: number;
}

export interface IntentAnalysis {
  intent: Intent;
  /** Most relevant sub-intent when detected; omitted when none apply. */
  subIntent?: SubIntent;
  confidence: IntentConfidence;
  /** Display-friendly confidence score (0–100). */
  confidencePercent: number;
  /** Human-readable summary of signals that drove the classification. */
  reasoning: string;
  /** Structured keyword extraction from the brief. */
  topic: TopicParseResult;
}

export interface IntentEngineInput {
  /** Creator topic / brief — primary classification signal. */
  topic: string;
  /** Optional manual notes — secondary signal for v1 (light weight). */
  context?: string;
}

export interface IntentScore {
  intent: Intent;
  score: number;
  signals: string[];
}

export interface SubIntentScore {
  subIntent: SubIntent;
  score: number;
  signals: string[];
}

export interface IntentPatternRule {
  id: string;
  weight: number;
  pattern: RegExp;
  label: string;
}
