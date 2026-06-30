import {
  applySubIntentPrimaryBoost,
  classifyIntentEvidence,
  computeConfidenceScore,
  resolvePrimaryEvidence,
  scoreSubIntentRules,
} from "./intent-engine.scoring";
import type { IntentAnalysis, IntentEngineInput } from "./intent-engine.types";
import {
  buildReasoning,
  combineIntentText,
  emptyTopicAnalysis,
  normalizeIntentTopic,
  parseTopicKeywords,
  resolveConfidencePercent,
  resolveIntentConfidence,
} from "./intent-engine.utils";

/**
 * Infers primary intent, optional sub-intent, confidence, and reasoning from a creator brief.
 * Weighted-evidence classifier — heuristic-only, not wired to generation pipelines directly.
 */
export function analyzeIntent(input: IntentEngineInput | string): IntentAnalysis {
  const normalizedInput: IntentEngineInput =
    typeof input === "string" ? { topic: input } : input;

  const topic = normalizeIntentTopic(normalizedInput.topic);
  if (!topic && !normalizedInput.context?.trim()) {
    return emptyTopicAnalysis();
  }

  const text = combineIntentText(topic, normalizedInput.context);
  const rankedEvidence = classifyIntentEvidence(text);
  const primary = resolvePrimaryEvidence(rankedEvidence);
  const runnerUp = rankedEvidence.find((entry) => entry.intent !== primary.intent);

  const confidenceScore = computeConfidenceScore(primary, runnerUp);
  const confidence = resolveIntentConfidence(
    primary.netScore,
    runnerUp?.netScore ?? 0,
    confidenceScore,
  );
  const confidencePercent = resolveConfidencePercent(confidenceScore);

  const subScores = scoreSubIntentRules(text);
  const topSub = subScores[0]?.score > 0 ? subScores[0] : undefined;
  const subIntent = applySubIntentPrimaryBoost(primary.intent, topSub?.subIntent);

  const positivePatterns = primary.matchedPatterns.filter((label) => !label.startsWith("−"));

  return {
    intent: primary.intent,
    ...(subIntent ? { subIntent } : {}),
    confidence,
    confidencePercent,
    confidenceScore,
    matchedPatterns: positivePatterns,
    reasoning: buildReasoning(
      primary.intent,
      positivePatterns,
      primary.positiveEvidence,
      primary.negativeEvidence,
      confidenceScore,
      subIntent,
      topSub?.signals,
    ),
    topic: parseTopicKeywords(text),
  };
}
