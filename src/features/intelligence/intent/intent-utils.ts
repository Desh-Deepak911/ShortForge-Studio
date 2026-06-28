import type {
  Intent,
  IntentAnalysis,
  IntentConfidence,
  IntentPatternRule,
  IntentScore,
  SubIntent,
  SubIntentScore,
  TopicParseResult,
} from "./intent-types";

const MATCH_TOPIC_PATTERN = /\s+vs\.?\s+|\s+v\.?\s+/i;

const PAST_MATCH_SIGNALS: RegExp[] = [
  /\brecap\b/i,
  /\bhighlights\b/i,
  /\bfull[- ]time\b/i,
  /\bft\b/i,
  /\blast night\b/i,
  /\byesterday\b/i,
  /\bresult\b/i,
  /\bbeat\b/i,
  /\bdefeated\b/i,
  /\bwon \d/i,
  /\bdrew \d/i,
  /\blost \d/i,
  /\b\d-\d\b/,
];

const FUTURE_MATCH_SIGNALS: RegExp[] = [
  /\bpreview\b/i,
  /\bbuild[- ]up\b/i,
  /\bbefore kick[- ]?off\b/i,
  /\bahead of\b/i,
  /\bupcoming\b/i,
  /\bthis weekend\b/i,
  /\btonight\b/i,
  /\btomorrow\b/i,
  /\bwho will win\b/i,
];

export function normalizeIntentTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

export function combineIntentText(topic: string, context?: string): string {
  const normalizedTopic = normalizeIntentTopic(topic);
  const normalizedContext = context?.trim().replace(/\s+/g, " ") ?? "";

  if (!normalizedContext) {
    return normalizedTopic;
  }

  if (!normalizedTopic) {
    return normalizedContext;
  }

  return `${normalizedTopic} ${normalizedContext}`;
}

export function isMatchTopic(text: string): boolean {
  return MATCH_TOPIC_PATTERN.test(text);
}

export function splitMatchTopic(topic: string): string[] {
  return topic
    .split(/\s+vs\.?\s+|\s+v\.?\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function hasPastMatchSignals(text: string): boolean {
  return PAST_MATCH_SIGNALS.some((pattern) => pattern.test(text));
}

export function hasFutureMatchSignals(text: string): boolean {
  return FUTURE_MATCH_SIGNALS.some((pattern) => pattern.test(text));
}

export function scorePatternRules(text: string, rules: IntentPatternRule[]): IntentScore[] {
  const scores = new Map<Intent, IntentScore>();

  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const intent = rule.id as Intent;
    const existing = scores.get(intent) ?? { intent, score: 0, signals: [] };
    existing.score += rule.weight;
    existing.signals.push(rule.label);
    scores.set(intent, existing);
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

export function scoreSubIntentRules(
  text: string,
  rules: { subIntent: SubIntent; weight: number; pattern: RegExp; label: string }[],
): SubIntentScore[] {
  const scores = new Map<SubIntent, SubIntentScore>();

  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    const existing = scores.get(rule.subIntent) ?? {
      subIntent: rule.subIntent,
      score: 0,
      signals: [],
    };
    existing.score += rule.weight;
    existing.signals.push(rule.label);
    scores.set(rule.subIntent, existing);
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}

export function resolveIntentConfidence(
  top: IntentScore | undefined,
  runnerUp: IntentScore | undefined,
): IntentConfidence {
  if (!top || top.score <= 0) {
    return "low";
  }

  const gap = runnerUp ? top.score - runnerUp.score : top.score;

  if (top.score >= 4 && gap >= 2) {
    return "high";
  }

  if (top.score >= 2 && gap >= 1) {
    return "medium";
  }

  return "low";
}

export function resolveConfidencePercent(
  primary: IntentScore,
  runnerUp: IntentScore | undefined,
  confidence: IntentConfidence,
): number {
  if (primary.score <= 0) {
    return 0;
  }

  const gap = runnerUp ? Math.max(0, primary.score - runnerUp.score) : primary.score;
  const raw = 58 + primary.score * 6 + gap * 4;
  const capped = Math.round(Math.min(97, Math.max(38, raw)));

  if (confidence === "high") {
    return Math.min(97, Math.max(88, capped));
  }

  if (confidence === "medium") {
    return Math.min(87, Math.max(68, capped));
  }

  return Math.min(67, Math.max(38, capped));
}

export function buildReasoning(
  intentScore: IntentScore,
  subIntentScore: SubIntentScore | undefined,
  confidence: IntentConfidence,
): string {
  const intentPart = `Primary intent "${formatIntentLabel(intentScore.intent)}" from: ${intentScore.signals.join(", ")}.`;
  const subPart = subIntentScore
    ? ` Sub-intent "${formatSubIntentLabel(subIntentScore.subIntent)}" from: ${subIntentScore.signals.join(", ")}.`
    : "";
  const confidencePart = ` Confidence is ${confidence} (score ${intentScore.score}).`;

  return `${intentPart}${subPart}${confidencePart}`.trim();
}

export function formatIntentLabel(intent: Intent): string {
  return intent
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatSubIntentLabel(subIntent: SubIntent): string {
  return subIntent
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function emptyTopicParseResult(normalizedText = ""): TopicParseResult {
  return {
    competitionWords: [],
    rankingWords: [],
    playerKeywords: [],
    matchKeywords: [],
    predictionKeywords: [],
    historyKeywords: [],
    comparisonKeywords: [],
    normalizedText,
  };
}

export function emptyTopicAnalysis(): IntentAnalysis {
  return {
    intent: "story",
    confidence: "low",
    confidencePercent: 0,
    reasoning:
      'No topic provided — defaulting to Story with low confidence. Add a brief to improve intent detection.',
    topic: emptyTopicParseResult(),
  };
}
