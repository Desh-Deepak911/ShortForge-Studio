import {
  DEFAULT_INTENT,
  FIXTURE_PREVIEW_SIGNALS,
  MATCHUP_SEPARATOR_PATTERN,
  PAST_MATCH_SIGNALS,
  PLAYER_COMPARISON_SIGNALS,
  TEAM_ENTITY_SIGNALS,
} from "./intent-engine.constants";
import {
  FIXTURE_PREVIEW_MATCHUP_BOOST,
  FIXTURE_RECAP_MATCHUP_BOOST,
  MATCH_PREVIEW_COMPARISON_PENALTY,
  PRIMARY_INTENT_PATTERNS,
  SUB_INTENT_PATTERNS,
} from "./intent-engine.patterns";
import type {
  Intent,
  IntentClassificationEvidence,
  SubIntent,
  SubIntentScore,
  WeightedIntentPatternRule,
} from "./intent-engine.types";
import { isMatchTopic, splitMatchTopic } from "./intent-engine.utils";

const ALL_INTENTS: Intent[] = [
  "story",
  "player_profile",
  "ranked_list",
  "match_preview",
  "match_recap",
  "tactical_breakdown",
  "historical_explainer",
  "opinion",
  "news",
];

function createEvidenceMap(): Map<Intent, IntentClassificationEvidence> {
  const map = new Map<Intent, IntentClassificationEvidence>();

  for (const intent of ALL_INTENTS) {
    map.set(intent, {
      intent,
      positiveEvidence: 0,
      negativeEvidence: 0,
      netScore: 0,
      matchedPatterns: [],
    });
  }

  return map;
}

function addPositive(
  evidence: Map<Intent, IntentClassificationEvidence>,
  intent: Intent,
  weight: number,
  label: string,
): void {
  const entry = evidence.get(intent);
  if (!entry) {
    return;
  }

  entry.positiveEvidence += weight;
  entry.netScore += weight;
  entry.matchedPatterns.push(label);
}

function addNegative(
  evidence: Map<Intent, IntentClassificationEvidence>,
  intent: Intent,
  weight: number,
  label: string,
): void {
  const entry = evidence.get(intent);
  if (!entry) {
    return;
  }

  entry.negativeEvidence += weight;
  entry.netScore -= weight;

  if (!entry.matchedPatterns.includes(label)) {
    entry.matchedPatterns.push(`−${label}`);
  }
}

function scorePrimaryPatterns(
  text: string,
  rules: readonly WeightedIntentPatternRule[],
  evidence: Map<Intent, IntentClassificationEvidence>,
): void {
  for (const rule of rules) {
    if (!rule.pattern.test(text)) {
      continue;
    }

    addPositive(evidence, rule.intent, rule.weight, rule.label);

    if (rule.suppresses) {
      for (const suppressed of rule.suppresses) {
        addNegative(evidence, suppressed, rule.weight, `suppressed by ${rule.label}`);
      }
    }
  }
}

export function hasFixturePreviewSignals(text: string): boolean {
  return FIXTURE_PREVIEW_SIGNALS.some((pattern) => pattern.test(text));
}

export function hasPastMatchSignals(text: string): boolean {
  return PAST_MATCH_SIGNALS.some((pattern) => pattern.test(text));
}

export function hasPlayerComparisonSignals(text: string): boolean {
  return (
    PLAYER_COMPARISON_SIGNALS.some((pattern) => pattern.test(text)) ||
    MATCHUP_SEPARATOR_PATTERN.test(text)
  );
}

export function hasTeamFixtureEntities(text: string): boolean {
  if (TEAM_ENTITY_SIGNALS.some((pattern) => pattern.test(text))) {
    return true;
  }

  if (!isMatchTopic(text)) {
    return false;
  }

  const sides = splitMatchTopic(text);
  return sides.length >= 2 && sides.every((side) => side.split(/\s+/).length <= 3);
}

function applyMatchupContext(text: string, evidence: Map<Intent, IntentClassificationEvidence>): void {
  if (!isMatchTopic(text)) {
    return;
  }

  const fixtureLanguage = hasFixturePreviewSignals(text);
  const pastSignals = hasPastMatchSignals(text);
  const teamFixtureContext = hasTeamFixtureEntities(text);
  const comparisonContext = hasPlayerComparisonSignals(text);

  if (fixtureLanguage && teamFixtureContext) {
    addPositive(
      evidence,
      "match_preview",
      FIXTURE_PREVIEW_MATCHUP_BOOST,
      "team/fixture matchup with preview language",
    );
    return;
  }

  if (pastSignals && !fixtureLanguage) {
    addPositive(
      evidence,
      "match_recap",
      FIXTURE_RECAP_MATCHUP_BOOST,
      "team matchup with past-tense/result signals",
    );
    return;
  }

  if (comparisonContext && !fixtureLanguage) {
    addPositive(
      evidence,
      "opinion",
      4,
      "comparison-style matchup without fixture context",
    );
    addNegative(
      evidence,
      "match_preview",
      MATCH_PREVIEW_COMPARISON_PENALTY,
      "vs alone is not match preview",
    );
  }
}

export function classifyIntentEvidence(text: string): IntentClassificationEvidence[] {
  const evidence = createEvidenceMap();

  scorePrimaryPatterns(text, PRIMARY_INTENT_PATTERNS, evidence);
  applyMatchupContext(text, evidence);

  return [...evidence.values()].sort((a, b) => b.netScore - a.netScore);
}

export function resolvePrimaryEvidence(
  ranked: IntentClassificationEvidence[],
): IntentClassificationEvidence {
  const top = ranked[0];

  if (!top || top.netScore <= 0) {
    return {
      intent: DEFAULT_INTENT,
      positiveEvidence: 0,
      negativeEvidence: 0,
      netScore: 0,
      matchedPatterns: ["no strong intent signals — default story"],
    };
  }

  return top;
}

export function computeConfidenceScore(
  winner: IntentClassificationEvidence,
  runnerUp: IntentClassificationEvidence | undefined,
): number {
  const winnerNet = Math.max(0, winner.netScore);
  const runnerNet = runnerUp ? Math.max(0, runnerUp.netScore) : 0;
  const gap = winnerNet - runnerNet;

  if (winnerNet <= 0) {
    return 0;
  }

  const strengthFactor = Math.min(1, winnerNet / 10);
  const gapFactor = Math.min(1, gap / 8);
  let score = 0.62 + strengthFactor * 0.22 + gapFactor * 0.16;

  if (winner.positiveEvidence >= 4 && gap >= 2) {
    score = Math.max(score, 0.82);
  }

  if (winner.positiveEvidence >= 6 && gap >= 3) {
    score = Math.max(score, 0.88);
  }

  if (winner.positiveEvidence >= 10 && gap >= 5) {
    score = Math.max(score, 0.93);
  }

  return Math.min(0.99, Math.max(0.5, score));
}

export function scoreSubIntentRules(text: string): SubIntentScore[] {
  const scores = new Map<SubIntent, SubIntentScore>();

  for (const rule of SUB_INTENT_PATTERNS) {
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

export function applySubIntentPrimaryBoost(
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

  return subIntent;
}
