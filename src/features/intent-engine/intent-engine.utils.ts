import type {
  Intent,
  IntentAnalysis,
  IntentConfidence,
  SubIntent,
  TopicParseResult,
} from "./intent-engine.types";

export interface TopicKeywordRule {
  label: string;
  pattern: RegExp;
}

const COMPETITION_RULES: TopicKeywordRule[] = [
  { label: "Premier League", pattern: /\bpremier league\b/i },
  { label: "EPL", pattern: /\bepl\b/i },
  { label: "La Liga", pattern: /\bla liga\b/i },
  { label: "Serie A", pattern: /\bserie a\b/i },
  { label: "Bundesliga", pattern: /\bbundesliga\b/i },
  { label: "Ligue 1", pattern: /\bligue 1\b/i },
  { label: "Champions League", pattern: /\bchampions league\b/i },
  { label: "UCL", pattern: /\bucl\b/i },
  { label: "Europa League", pattern: /\beuropa league\b/i },
  { label: "FIFA World Cup", pattern: /\bfifa world cup\b/i },
  { label: "World Cup", pattern: /\bworld cup\b/i },
  { label: "FA Cup", pattern: /\bfa cup\b/i },
  { label: "Carabao Cup", pattern: /\bcarabao cup\b/i },
  { label: "Copa del Rey", pattern: /\bcopa del rey\b/i },
];

const RANKING_RULES: TopicKeywordRule[] = [
  { label: "top scorers", pattern: /\btop scorers\b/i },
  { label: "top assists", pattern: /\btop assists\b/i },
  { label: "golden boot", pattern: /\bgolden boot\b/i },
  { label: "top five", pattern: /\btop five\b/i },
  { label: "top 5", pattern: /\btop 5\b/i },
  { label: "top 10", pattern: /\btop 10\b/i },
  { label: "ranked list", pattern: /\branked list\b/i },
  { label: "countdown", pattern: /\bcountdown\b/i },
  { label: "most goals", pattern: /\bmost goals\b/i },
  { label: "most assists", pattern: /\bmost assists\b/i },
  { label: "leaderboard", pattern: /\bleaderboard\b/i },
  { label: "best players", pattern: /\bbest players\b/i },
];

const PLAYER_RULES: TopicKeywordRule[] = [
  { label: "player profile", pattern: /\bplayer profile\b/i },
  { label: "player analysis", pattern: /\bplayer analysis\b/i },
  { label: "striker", pattern: /\bstriker\b/i },
  { label: "midfielder", pattern: /\bmidfielder\b/i },
  { label: "winger", pattern: /\bwinger\b/i },
  { label: "goalkeeper", pattern: /\bgoalkeeper\b/i },
  { label: "defender", pattern: /\bdefender\b/i },
  { label: "captain", pattern: /\bcaptain\b/i },
  { label: "breakout season", pattern: /\bbreakout season\b/i },
  { label: "in form", pattern: /\bin form\b/i },
  { label: "goal scorer", pattern: /\bgoal scorer\b/i },
  { label: "playmaker", pattern: /\bplaymakers?\b/i },
];

const MATCH_RULES: TopicKeywordRule[] = [
  { label: "match preview", pattern: /\bmatch preview\b/i },
  { label: "match recap", pattern: /\bmatch recap\b/i },
  { label: "preview", pattern: /\bpreview\b/i },
  { label: "recap", pattern: /\brecap\b/i },
  { label: "highlights", pattern: /\bhighlights\b/i },
  { label: "full-time", pattern: /\bfull[- ]time\b/i },
  { label: "kick-off", pattern: /\bkick[- ]?off\b/i },
  { label: "build-up", pattern: /\bbuild[- ]up\b/i },
  { label: "derby", pattern: /\bderby\b/i },
  { label: "rivalry", pattern: /\brivalry\b/i },
  { label: "fixture", pattern: /\bfixture\b/i },
  { label: "result", pattern: /\bresult\b/i },
  { label: "vs", pattern: /\s+vs\.?\s+|\s+v\.?\s+/i },
];

const PREDICTION_RULES: TopicKeywordRule[] = [
  { label: "prediction", pattern: /\bpredictions?\b/i },
  { label: "forecast", pattern: /\bforecast\b/i },
  { label: "who will win", pattern: /\bwho will win\b/i },
  { label: "odds", pattern: /\bodds\b/i },
  { label: "likely winner", pattern: /\blikely winner\b/i },
  { label: "expected result", pattern: /\bexpected result\b/i },
];

const HISTORY_RULES: TopicKeywordRule[] = [
  { label: "history", pattern: /\bhistory\b/i },
  { label: "historical", pattern: /\bhistorical\b/i },
  { label: "legacy", pattern: /\blegacy\b/i },
  { label: "all-time", pattern: /\ball[- ]time\b/i },
  { label: "origins", pattern: /\borigins\b/i },
  { label: "timeline", pattern: /\btimeline\b/i },
  { label: "through the years", pattern: /\bthrough the years\b/i },
  { label: "year by year", pattern: /\byear by year\b/i },
  { label: "era", pattern: /\bera\b/i },
  { label: "record", pattern: /\brecord\b/i },
];

const COMPARISON_RULES: TopicKeywordRule[] = [
  { label: "vs comparison", pattern: /\bvs\.?\b/i },
  { label: "who is better", pattern: /\bwho is better\b/i },
  { label: "overrated", pattern: /\boverrated\b/i },
  { label: "underrated", pattern: /\bunderrated\b/i },
  { label: "debate", pattern: /\bdebate\b/i },
  { label: "hot take", pattern: /\bhot take\b/i },
  { label: "unpopular opinion", pattern: /\bunpopular opinion\b/i },
  { label: "compared to", pattern: /\bcompared to\b/i },
  { label: "better than", pattern: /\bbetter than\b/i },
];

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

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
  return /\s+vs\.?\s+|\s+v\.?\s+|\s+versus\s+/i.test(text);
}

export function splitMatchTopic(topic: string): string[] {
  return topic
    .split(/\s+vs\.?\s+|\s+v\.?\s+|\s+versus\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function extractKeywordLabels(text: string, rules: TopicKeywordRule[]): string[] {
  const labels = new Set<string>();

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      labels.add(rule.label);
    }
  }

  return [...labels];
}

function detectSeasonYear(text: string): number | undefined {
  const match = text.match(YEAR_PATTERN);
  if (!match) {
    return undefined;
  }

  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
}

export function parseTopicKeywords(text: string): TopicParseResult {
  const normalizedText = text.trim().replace(/\s+/g, " ");
  if (!normalizedText) {
    return emptyTopicParseResult();
  }

  const matchSides = splitMatchTopic(normalizedText);
  const sides = matchSides.length >= 2 ? matchSides : undefined;
  const year = detectSeasonYear(normalizedText);

  return {
    competitionWords: extractKeywordLabels(normalizedText, COMPETITION_RULES),
    rankingWords: extractKeywordLabels(normalizedText, RANKING_RULES),
    playerKeywords: extractKeywordLabels(normalizedText, PLAYER_RULES),
    matchKeywords: extractKeywordLabels(normalizedText, MATCH_RULES),
    predictionKeywords: extractKeywordLabels(normalizedText, PREDICTION_RULES),
    historyKeywords: extractKeywordLabels(normalizedText, HISTORY_RULES),
    comparisonKeywords: extractKeywordLabels(normalizedText, COMPARISON_RULES),
    normalizedText,
    ...(sides ? { matchSides: sides } : {}),
    ...(year != null ? { seasonYear: year } : {}),
  };
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
    confidenceScore: 0,
    matchedPatterns: [],
    reasoning:
      "No topic provided — defaulting to Story with low confidence. Add a brief to improve intent detection.",
    topic: emptyTopicParseResult(),
  };
}

export function resolveIntentConfidence(
  winnerNet: number,
  runnerUpNet: number,
  confidenceScore: number,
): IntentConfidence {
  if (winnerNet <= 0) {
    return "low";
  }

  const gap = winnerNet - runnerUpNet;

  if (confidenceScore >= 0.85 && gap >= 2) {
    return "high";
  }

  if (confidenceScore >= 0.7 && gap >= 1) {
    return "medium";
  }

  return "low";
}

export function resolveConfidencePercent(confidenceScore: number): number {
  return Math.round(Math.min(97, Math.max(0, confidenceScore * 100)));
}

export function buildReasoning(
  intent: Intent,
  matchedPatterns: string[],
  positiveEvidence: number,
  negativeEvidence: number,
  confidenceScore: number,
  subIntent?: SubIntent,
  subIntentSignals?: string[],
): string {
  const intentPart = `Primary intent "${formatIntentLabel(intent)}" from: ${matchedPatterns.join(", ") || "default fallback"}.`;
  const evidencePart = ` Weighted evidence +${positiveEvidence.toFixed(1)} / -${negativeEvidence.toFixed(1)} (confidence ${(confidenceScore * 100).toFixed(0)}%).`;
  const subPart =
    subIntent && subIntentSignals?.length
      ? ` Sub-intent "${formatSubIntentLabel(subIntent)}" from: ${subIntentSignals.join(", ")}.`
      : "";

  return `${intentPart}${evidencePart}${subPart}`.trim();
}
