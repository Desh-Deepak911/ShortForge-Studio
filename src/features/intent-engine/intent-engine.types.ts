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
  competitionWords: string[];
  rankingWords: string[];
  playerKeywords: string[];
  matchKeywords: string[];
  predictionKeywords: string[];
  historyKeywords: string[];
  comparisonKeywords: string[];
  normalizedText: string;
  matchSides?: string[];
  seasonYear?: number;
}

export interface IntentEngineInput {
  topic: string;
  context?: string;
}

export interface WeightedPatternMatch {
  intent: Intent;
  label: string;
  weight: number;
}

export interface IntentClassificationEvidence {
  intent: Intent;
  positiveEvidence: number;
  negativeEvidence: number;
  netScore: number;
  matchedPatterns: string[];
}

export interface IntentAnalysis {
  intent: Intent;
  subIntent?: SubIntent;
  confidence: IntentConfidence;
  /** Display-friendly confidence score (0–100). */
  confidencePercent: number;
  /** Normalized confidence score (0–1) for diagnostics and thresholds. */
  confidenceScore: number;
  /** Pattern labels that contributed to the winning classification. */
  matchedPatterns: string[];
  reasoning: string;
  topic: TopicParseResult;
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
  id: Intent;
  weight: number;
  pattern: RegExp;
  label: string;
}

export interface WeightedIntentPatternRule {
  intent: Intent;
  pattern: RegExp;
  label: string;
  weight: number;
  /** When matched, subtract weight from these intents during scoring. */
  suppresses?: readonly Intent[];
}

export interface SubIntentPatternRule {
  subIntent: SubIntent;
  weight: number;
  pattern: RegExp;
  label: string;
}
