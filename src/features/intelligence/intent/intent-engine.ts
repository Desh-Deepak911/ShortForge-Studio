import type {
  Intent,
  IntentAnalysis,
  IntentEngineInput,
  IntentPatternRule,
  IntentScore,
  SubIntent,
} from "./intent-types";
import {
  buildReasoning,
  combineIntentText,
  emptyTopicAnalysis,
  hasFutureMatchSignals,
  hasPastMatchSignals,
  isMatchTopic,
  normalizeIntentTopic,
  resolveIntentConfidence,
  resolveConfidencePercent,
  scorePatternRules,
  scoreSubIntentRules,
} from "./intent-utils";
import { parseTopicKeywords } from "./topic-parser";

const PRIMARY_INTENT_RULES: IntentPatternRule[] = [
  // Ranked list
  { id: "ranked_list", weight: 3, pattern: /\btop\s+\d{1,2}\b/i, label: "top N list" },
  { id: "ranked_list", weight: 3, pattern: /\btop five\b/i, label: "top five" },
  { id: "ranked_list", weight: 3, pattern: /\bcountdown\b/i, label: "countdown" },
  { id: "ranked_list", weight: 3, pattern: /\branked list\b/i, label: "ranked list" },
  { id: "ranked_list", weight: 2, pattern: /\bbest \d{1,2}\b/i, label: "best N" },
  { id: "ranked_list", weight: 2, pattern: /\bgolden boot\b/i, label: "golden boot" },

  // Match preview
  { id: "match_preview", weight: 4, pattern: /\bmatch preview\b/i, label: "match preview phrase" },
  { id: "match_preview", weight: 3, pattern: /\bpreview\b/i, label: "preview" },
  { id: "match_preview", weight: 3, pattern: /\bbuild[- ]up\b/i, label: "build-up" },
  { id: "match_preview", weight: 2, pattern: /\bbefore kick[- ]?off\b/i, label: "before kick-off" },
  { id: "match_preview", weight: 2, pattern: /\bahead of\b/i, label: "ahead of" },
  { id: "match_preview", weight: 2, pattern: /\bupcoming\b/i, label: "upcoming" },

  // Match recap
  { id: "match_recap", weight: 4, pattern: /\bmatch recap\b/i, label: "match recap phrase" },
  { id: "match_recap", weight: 3, pattern: /\brecap\b/i, label: "recap" },
  { id: "match_recap", weight: 3, pattern: /\bhighlights\b/i, label: "highlights" },
  { id: "match_recap", weight: 2, pattern: /\blast night\b/i, label: "last night" },
  { id: "match_recap", weight: 2, pattern: /\bfull[- ]time\b/i, label: "full-time" },
  { id: "match_recap", weight: 2, pattern: /\bresult\b/i, label: "result" },

  // Tactical breakdown
  { id: "tactical_breakdown", weight: 4, pattern: /\btactical breakdown\b/i, label: "tactical breakdown phrase" },
  { id: "tactical_breakdown", weight: 3, pattern: /\btactical\b/i, label: "tactical" },
  { id: "tactical_breakdown", weight: 3, pattern: /\btactics\b/i, label: "tactics" },
  { id: "tactical_breakdown", weight: 3, pattern: /\bformation\b/i, label: "formation" },
  { id: "tactical_breakdown", weight: 2, pattern: /\bpressing\b/i, label: "pressing" },
  { id: "tactical_breakdown", weight: 2, pattern: /\bxg\b/i, label: "xG" },
  { id: "tactical_breakdown", weight: 2, pattern: /\blow block\b/i, label: "low block" },

  // Player profile
  { id: "player_profile", weight: 3, pattern: /\bplayer profile\b/i, label: "player profile phrase" },
  { id: "player_profile", weight: 3, pattern: /\bplayer analysis\b/i, label: "player analysis phrase" },
  { id: "player_profile", weight: 2, pattern: /\bwhy .+ is\b/i, label: "why X is" },
  { id: "player_profile", weight: 2, pattern: /\bhow good is\b/i, label: "how good is" },
  { id: "player_profile", weight: 2, pattern: /\bbreakout season\b/i, label: "breakout season" },
  { id: "player_profile", weight: 1, pattern: /\b(striker|midfielder|winger|goalkeeper|defender)\b/i, label: "position mention" },

  // Historical explainer
  { id: "historical_explainer", weight: 3, pattern: /\bhistorical explainer\b/i, label: "historical explainer phrase" },
  { id: "historical_explainer", weight: 3, pattern: /\bhistory of\b/i, label: "history of" },
  { id: "historical_explainer", weight: 2, pattern: /\bhistorical\b/i, label: "historical" },
  { id: "historical_explainer", weight: 2, pattern: /\blegacy\b/i, label: "legacy" },
  { id: "historical_explainer", weight: 2, pattern: /\ball[- ]time\b/i, label: "all-time" },
  { id: "historical_explainer", weight: 2, pattern: /\borigins of\b/i, label: "origins of" },

  // Opinion
  { id: "opinion", weight: 3, pattern: /\bunpopular opinion\b/i, label: "unpopular opinion" },
  { id: "opinion", weight: 3, pattern: /\bhot take\b/i, label: "hot take" },
  { id: "opinion", weight: 2, pattern: /\boverrated\b/i, label: "overrated" },
  { id: "opinion", weight: 2, pattern: /\bunderrated\b/i, label: "underrated" },
  { id: "opinion", weight: 2, pattern: /\bwho is better\b/i, label: "who is better" },
  { id: "opinion", weight: 2, pattern: /\bdebate\b/i, label: "debate" },

  // News
  { id: "news", weight: 3, pattern: /\bbreaking\b/i, label: "breaking" },
  { id: "news", weight: 2, pattern: /\blatest news\b/i, label: "latest news" },
  { id: "news", weight: 2, pattern: /\bconfirmed\b/i, label: "confirmed" },
  { id: "news", weight: 2, pattern: /\bannounced\b/i, label: "announced" },
  { id: "news", weight: 2, pattern: /\breport\b/i, label: "report" },

  // Story (soft signals — low weight fallback boosters)
  { id: "story", weight: 1, pattern: /\bstory\b/i, label: "story keyword" },
  { id: "story", weight: 1, pattern: /\bnarrative\b/i, label: "narrative" },
  { id: "story", weight: 1, pattern: /\bjourney\b/i, label: "journey" },
];

const SUB_INTENT_RULES: {
  subIntent: SubIntent;
  weight: number;
  pattern: RegExp;
  label: string;
}[] = [
  { subIntent: "top_scorers", weight: 3, pattern: /\btop scorers\b/i, label: "top scorers" },
  { subIntent: "top_scorers", weight: 3, pattern: /\bgolden boot\b/i, label: "golden boot" },
  { subIntent: "top_scorers", weight: 2, pattern: /\bmost goals\b/i, label: "most goals" },
  { subIntent: "top_scorers", weight: 2, pattern: /\bgoal scorers?\b/i, label: "goal scorers" },

  { subIntent: "top_assists", weight: 3, pattern: /\btop assists\b/i, label: "top assists" },
  { subIntent: "top_assists", weight: 2, pattern: /\bmost assists\b/i, label: "most assists" },
  { subIntent: "top_assists", weight: 2, pattern: /\bplaymakers?\b/i, label: "playmaker" },

  { subIntent: "transfers", weight: 3, pattern: /\btransfer\b/i, label: "transfer" },
  { subIntent: "transfers", weight: 2, pattern: /\bsigning\b/i, label: "signing" },
  { subIntent: "transfers", weight: 2, pattern: /\bsigned\b/i, label: "signed" },
  { subIntent: "transfers", weight: 2, pattern: /\brumou?r\b/i, label: "rumour" },

  { subIntent: "injuries", weight: 3, pattern: /\binjur(y|ies)\b/i, label: "injury" },
  { subIntent: "injuries", weight: 2, pattern: /\bsidelined\b/i, label: "sidelined" },
  { subIntent: "injuries", weight: 2, pattern: /\bout for\b/i, label: "out for" },
  { subIntent: "injuries", weight: 2, pattern: /\bfitness\b/i, label: "fitness" },

  { subIntent: "form", weight: 3, pattern: /\bin form\b/i, label: "in form" },
  { subIntent: "form", weight: 2, pattern: /\bform guide\b/i, label: "form guide" },
  { subIntent: "form", weight: 2, pattern: /\bhot streak\b/i, label: "hot streak" },
  { subIntent: "form", weight: 2, pattern: /\brecent run\b/i, label: "recent run" },

  { subIntent: "records", weight: 3, pattern: /\brecord\b/i, label: "record" },
  { subIntent: "records", weight: 2, pattern: /\bunbeaten run\b/i, label: "unbeaten run" },
  { subIntent: "records", weight: 2, pattern: /\bmost ever\b/i, label: "most ever" },

  { subIntent: "predictions", weight: 3, pattern: /\bprediction\b/i, label: "prediction" },
  { subIntent: "predictions", weight: 2, pattern: /\bpredict\b/i, label: "predict" },
  { subIntent: "predictions", weight: 2, pattern: /\bwho will win\b/i, label: "who will win" },
  { subIntent: "predictions", weight: 2, pattern: /\bforecast\b/i, label: "forecast" },

  { subIntent: "rivalries", weight: 3, pattern: /\brivalry\b/i, label: "rivalry" },
  { subIntent: "rivalries", weight: 3, pattern: /\bderby\b/i, label: "derby" },
  { subIntent: "rivalries", weight: 2, pattern: /\bgrudge match\b/i, label: "grudge match" },

  { subIntent: "timeline", weight: 3, pattern: /\btimeline\b/i, label: "timeline" },
  { subIntent: "timeline", weight: 2, pattern: /\bchronolog/i, label: "chronological" },
  { subIntent: "timeline", weight: 2, pattern: /\byear by year\b/i, label: "year by year" },
  { subIntent: "timeline", weight: 2, pattern: /\bthrough the years\b/i, label: "through the years" },
];

function applyMatchContextBoosts(text: string, scores: IntentScore[]): IntentScore[] {
  if (!isMatchTopic(text)) {
    return scores;
  }

  const boosted = new Map<Intent, IntentScore>();
  for (const entry of scores) {
    boosted.set(entry.intent, { ...entry, signals: [...entry.signals] });
  }

  const ensure = (intent: Intent): IntentScore => {
    const existing = boosted.get(intent);
    if (existing) {
      return existing;
    }

    const created: IntentScore = { intent, score: 0, signals: [] };
    boosted.set(intent, created);
    return created;
  };

  const past = hasPastMatchSignals(text);
  const future = hasFutureMatchSignals(text);

  if (past && !future) {
    const recap = ensure("match_recap");
    recap.score += 3;
    recap.signals.push("matchup with past-tense/result signals");
  } else if (future && !past) {
    const preview = ensure("match_preview");
    preview.score += 3;
    preview.signals.push("matchup with forward-looking signals");
  } else if (past && future) {
    const recap = ensure("match_recap");
    recap.score += 1;
    recap.signals.push("matchup with mixed tense signals (recap lean)");

    const preview = ensure("match_preview");
    preview.score += 1;
    preview.signals.push("matchup with mixed tense signals (preview lean)");
  } else {
    const preview = ensure("match_preview");
    preview.score += 2;
    preview.signals.push("matchup without clear tense (preview default)");
  }

  return [...boosted.values()].sort((a, b) => b.score - a.score);
}

function applySubIntentPrimaryBoost(
  primaryIntent: Intent,
  subIntent: SubIntent | undefined,
): SubIntent | undefined {
  if (!subIntent) {
    return undefined;
  }

  if (primaryIntent === "ranked_list" && (subIntent === "top_scorers" || subIntent === "top_assists")) {
    return subIntent;
  }

  if (primaryIntent === "match_preview" && subIntent === "predictions") {
    return subIntent;
  }

  if (primaryIntent === "historical_explainer" && subIntent === "timeline") {
    return subIntent;
  }

  if (primaryIntent === "news" && subIntent === "transfers") {
    return subIntent;
  }

  if (primaryIntent === "player_profile" && (subIntent === "form" || subIntent === "injuries")) {
    return subIntent;
  }

  if (primaryIntent === "match_recap" && subIntent === "rivalries") {
    return subIntent;
  }

  if (primaryIntent === "story" || primaryIntent === "opinion") {
    return subIntent;
  }

  // Sub-intent detected but not strongly tied to primary — still return when score is meaningful.
  return subIntent;
}

function resolvePrimaryIntent(scores: IntentScore[]): IntentScore {
  const top = scores[0];

  if (!top || top.score <= 0) {
    return {
      intent: "story",
      score: 0,
      signals: ["no strong intent signals — default story"],
    };
  }

  return top;
}

/**
 * Infers primary intent, optional sub-intent, confidence, and reasoning from a creator brief.
 * Heuristic-only — not wired to research, script generation, or UI yet.
 */
export function analyzeIntent(input: IntentEngineInput | string): IntentAnalysis {
  const normalizedInput: IntentEngineInput =
    typeof input === "string" ? { topic: input } : input;

  const topic = normalizeIntentTopic(normalizedInput.topic);
  if (!topic && !normalizedInput.context?.trim()) {
    return emptyTopicAnalysis();
  }

  const text = combineIntentText(topic, normalizedInput.context);
  const rawScores = scorePatternRules(text, PRIMARY_INTENT_RULES);
  const scores = applyMatchContextBoosts(text, rawScores);
  const primary = resolvePrimaryIntent(scores);
  const runnerUp = scores.find((entry) => entry.intent !== primary.intent);
  const confidence = resolveIntentConfidence(primary, runnerUp);
  const confidencePercent = resolveConfidencePercent(primary, runnerUp, confidence);

  const subScores = scoreSubIntentRules(text, SUB_INTENT_RULES);
  const topSub = subScores[0]?.score > 0 ? subScores[0] : undefined;
  const subIntent = applySubIntentPrimaryBoost(primary.intent, topSub?.subIntent);

  return {
    intent: primary.intent,
    ...(subIntent ? { subIntent } : {}),
    confidence,
    confidencePercent,
    reasoning: buildReasoning(primary, topSub, confidence),
    topic: parseTopicKeywords(text),
  };
}
