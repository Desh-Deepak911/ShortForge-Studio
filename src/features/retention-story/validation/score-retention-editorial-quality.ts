/**
 * Deterministic Retention editorial heuristics — Sprint 10F.
 * No model calls, no caller-supplied scores, no predicted-retention language.
 */

import type { NormalizedStoryContract } from "../domain/retention-story-contract.types";
import type { RetentionNarrationCandidate } from "../composition/retention-narration-candidate.types";
import type { RetentionStoryPlan } from "../planning/retention-story-plan.types";
import { countRetentionNarrationWords } from "./count-retention-narration-words";
import { matchesRetentionForbiddenIntroPattern } from "./retention-generic-intro-patterns";
import { RETENTION_HEURISTIC_REGISTRY_VERSION } from "./retention-validation.constants";
import type { RetentionEditorialScores } from "./retention-validation.types";

export function getRetentionHeuristicRegistryVersion(): string {
  return RETENTION_HEURISTIC_REGISTRY_VERSION;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function freezeScores(
  scores: RetentionEditorialScores,
): RetentionEditorialScores {
  return Object.freeze({
    clarity: clamp01(scores.clarity),
    curiosity: clamp01(scores.curiosity),
    emotionalProgression: clamp01(scores.emotionalProgression),
    compressionQuality: clamp01(scores.compressionQuality),
    novelty: clamp01(scores.novelty),
    escalation: clamp01(scores.escalation),
    payoffStrength: clamp01(scores.payoffStrength),
    visualPotential: clamp01(scores.visualPotential),
    repetitionPenalty: clamp01(scores.repetitionPenalty),
    controllingIdeaAdherence: clamp01(scores.controllingIdeaAdherence),
    genericIntroductionQuality: clamp01(scores.genericIntroductionQuality),
  });
}

function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

const QUESTION_PROMISE_STOPWORDS = new Set([
  "why",
  "how",
  "what",
  "which",
  "who",
  "when",
  "where",
  "this",
  "that",
  "with",
  "from",
  "into",
  "does",
  "could",
  "would",
  "should",
  "really",
  "today",
  "tonight",
  "now",
  "next",
]);

function tokenRelated(left: string, right: string): boolean {
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  if (min < 5) return false;
  return left.slice(0, min - 1) === right.slice(0, min - 1);
}

function scoreQuestionPromisePayoff(
  contract: NormalizedStoryContract,
  candidate: RetentionNarrationCandidate,
): number {
  const narration = candidate.assembledNarration.trim();
  const openingEnd = narration.search(/[?]/u);
  if (openingEnd < 0) return 1;
  const opening = narration.slice(0, openingEnd + 1);
  const body = narration.slice(openingEnd + 1);
  const subjectTokens = new Set(tokenize(contract.topic));
  const promiseTokens = tokenize(opening).filter(
    (token) =>
      !subjectTokens.has(token) && !QUESTION_PROMISE_STOPWORDS.has(token),
  );
  if (promiseTokens.length === 0) return 0;
  const payoffTokens = tokenize(body);
  const related = promiseTokens.some((promise) =>
    payoffTokens.some((payoff) => tokenRelated(promise, payoff)),
  );
  return related ? 1 : 0.25;
}

function scoreClarity(candidate: RetentionNarrationCandidate): number {
  const segments = candidate.segments;
  if (segments.length === 0) return 0;
  const uniqueTexts = new Set(segments.map((s) => s.text.trim().toLowerCase()));
  const uniqueness = uniqueTexts.size / segments.length;
  let total = 0;
  for (const segment of segments) {
    const words = countRetentionNarrationWords(segment.text);
    if (words <= 0) {
      total += 0;
    } else if (words >= 5 && words <= 22) {
      total += 0.95;
    } else if (words >= 3 && words <= 28) {
      total += 0.75;
    } else {
      total += 0.4;
    }
  }
  return clamp01((total / segments.length) * (0.35 + 0.65 * uniqueness));
}

/**
 * Opening curiosity credit — Sprint 10H.2.
 * Question punctuation is sufficient but not required. Canonical declarative,
 * cold-open, contrarian, headline, and user-authored openings receive
 * deterministic curiosity credit without fabricating quality.
 */
function scoreCuriosityOpeningSignal(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  // Interrogative / question openings.
  if (/[?]/.test(trimmed) || /\b(why|how|what|which|who)\b/i.test(trimmed)) {
    return 0.7;
  }

  // Contrarian / cold-open / surprise markers (declarative).
  if (
    /\b(never|nobody|no one|everyone|wrong|secret|truth|actually|instead|forget|stop)\b/i.test(
      trimmed,
    )
  ) {
    return 0.6;
  }

  // Headline / punchy declarative opening (short, non-generic).
  const words = countRetentionNarrationWords(trimmed);
  if (
    words >= 3 &&
    words <= 14 &&
    !matchesRetentionForbiddenIntroPattern(trimmed)
  ) {
    return 0.5;
  }

  return 0;
}

function scoreCuriosity(
  contract: NormalizedStoryContract,
  plan: RetentionStoryPlan,
  candidate: RetentionNarrationCandidate,
): number {
  const early = Math.min(2, plan.beatPlan.beats.length);
  if (early === 0) return 0;
  let score = 0;
  for (let i = 0; i < early; i++) {
    const beat = plan.beatPlan.beats[i];
    const segment = candidate.segments[i];
    if (!beat || !segment) continue;
    let local = scoreCuriosityOpeningSignal(segment.text);
    if (
      beat.purpose === "curiosity" ||
      beat.purpose === "hook_handoff" ||
      beat.noveltyRole === "setup"
    ) {
      local += 0.25;
    }
    score += clamp01(local);
  }
  return (score / early) * scoreQuestionPromisePayoff(contract, candidate);
}

function scoreEmotionalProgression(plan: RetentionStoryPlan): number {
  const curve = plan.emotionalArc.curve;
  if (curve.length < 2) return 0.4;
  let rises = 0;
  let pairs = 0;
  for (let i = 1; i < curve.length; i++) {
    pairs += 1;
    if (curve[i]!.intensity >= curve[i - 1]!.intensity) rises += 1;
  }
  const last = curve[curve.length - 1]!.intensity;
  const first = curve[0]!.intensity;
  const overall = last >= first ? 0.25 : 0;
  return clamp01(rises / pairs + overall);
}

function scoreCompressionQuality(
  plan: RetentionStoryPlan,
  candidate: RetentionNarrationCandidate,
): number {
  const allowed = plan.compressionGoals.targetWordBudget;
  const actual = countRetentionNarrationWords(candidate.assembledNarration);
  if (allowed <= 0 || actual <= 0) return 0;
  const ratio = actual / allowed;
  if (ratio >= 0.78 && ratio <= 1) return 0.98;
  if (ratio >= 0.65 && ratio < 0.78) return 0.85;
  if (ratio >= 0.5 && ratio < 0.65) return 0.65;
  if (ratio > 1 && ratio <= 1.15) return 0.35;
  if (ratio < 0.5) return 0.4;
  return 0.15;
}

function scoreNovelty(plan: RetentionStoryPlan): number {
  const roles = new Set(plan.beatPlan.beats.map((b) => b.noveltyRole));
  return clamp01(roles.size / 4);
}

function scoreEscalation(plan: RetentionStoryPlan): number {
  const beats = plan.beatPlan.beats;
  if (beats.length === 0) return 0;
  let hits = 0;
  for (const beat of beats) {
    if (
      beat.noveltyRole === "escalate" ||
      beat.purpose === "escalation" ||
      beat.purpose === "conflict" ||
      beat.purpose === "twist"
    ) {
      hits += 1;
    }
  }
  return clamp01(hits / Math.max(1, Math.ceil(beats.length / 2)));
}

function scorePayoffStrength(plan: RetentionStoryPlan): number {
  const beats = plan.beatPlan.beats;
  const deliverIdx = beats.findIndex((b) => b.payoffRelation === "deliver");
  if (deliverIdx < 0) return 0.35;
  const setupBefore = beats
    .slice(0, deliverIdx)
    .some((b) => b.payoffRelation === "setup");
  const terminal = deliverIdx === beats.length - 1;
  return clamp01((setupBefore ? 0.55 : 0.25) + (terminal ? 0.4 : 0.15));
}

function scoreVisualPotential(
  plan: RetentionStoryPlan,
  candidate: RetentionNarrationCandidate,
): number {
  const beats = plan.beatPlan.beats;
  if (beats.length === 0) return 0;
  let hits = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i]!;
    const segment = candidate.segments[i];
    const planVisual = beat.visualOpportunity.trim().length >= 12;
    const spokenVisual =
      segment != null &&
      countRetentionNarrationWords(segment.text) >= 6 &&
      !/^(pressure keeps rising\.?)$/i.test(segment.text.trim());
    if (planVisual && spokenVisual) hits += 1;
    else if (planVisual) hits += 0.35;
  }
  return clamp01(hits / beats.length);
}

function scoreRepetitionPenalty(
  candidate: RetentionNarrationCandidate,
): number {
  const texts = candidate.segments.map((s) => s.text.trim().toLowerCase());
  if (texts.length <= 1) return 0;
  let duplicatePairs = 0;
  let pairs = 0;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      pairs += 1;
      if (texts[i] === texts[j]) duplicatePairs += 1;
      else {
        const a = new Set(tokenize(texts[i]!));
        const b = tokenize(texts[j]!);
        const overlap = b.filter((t) => a.has(t)).length;
        if (b.length > 0 && overlap / b.length >= 0.7) duplicatePairs += 0.5;
      }
    }
  }
  return pairs === 0 ? 0 : clamp01(duplicatePairs / pairs);
}

function scoreControllingIdeaAdherence(
  contract: NormalizedStoryContract,
  plan: RetentionStoryPlan,
  candidate: RetentionNarrationCandidate,
): number {
  const anchors = tokenize(
    `${contract.topic} ${plan.controllingIdea.statement}`,
  ).slice(0, 8);
  if (anchors.length === 0) return 0.5;
  const narrationTokens = new Set(tokenize(candidate.assembledNarration));
  let hits = 0;
  for (const token of anchors) {
    if (narrationTokens.has(token)) hits += 1;
  }
  return clamp01(hits / anchors.length);
}

function scoreGenericIntroductionQuality(
  contract: NormalizedStoryContract,
  candidate: RetentionNarrationCandidate,
): number {
  const opening = candidate.segments[0]?.text ?? "";
  if (matchesRetentionForbiddenIntroPattern(opening)) {
    return contract.constraints.forbidGenericIntro ? 0.1 : 0.35;
  }
  const words = countRetentionNarrationWords(opening);
  if (words >= 4 && words <= 18) return 0.9;
  if (words > 0) return 0.65;
  return 0.2;
}

/**
 * Score editorial quality from asserted contract/plan/candidate only.
 */
export function scoreRetentionEditorialQuality(input: {
  readonly contract: NormalizedStoryContract;
  readonly plan: RetentionStoryPlan;
  readonly candidate: RetentionNarrationCandidate;
}): RetentionEditorialScores {
  return freezeScores({
    clarity: scoreClarity(input.candidate),
    curiosity: scoreCuriosity(input.contract, input.plan, input.candidate),
    emotionalProgression: scoreEmotionalProgression(input.plan),
    compressionQuality: scoreCompressionQuality(input.plan, input.candidate),
    novelty: scoreNovelty(input.plan),
    escalation: scoreEscalation(input.plan),
    payoffStrength: scorePayoffStrength(input.plan),
    visualPotential: scoreVisualPotential(input.plan, input.candidate),
    repetitionPenalty: scoreRepetitionPenalty(input.candidate),
    controllingIdeaAdherence: scoreControllingIdeaAdherence(
      input.contract,
      input.plan,
      input.candidate,
    ),
    genericIntroductionQuality: scoreGenericIntroductionQuality(
      input.contract,
      input.candidate,
    ),
  });
}

export function computeRetentionAggregates(input: {
  readonly formatStrategyId: NormalizedStoryContract["formatStrategyId"];
  readonly editorial: RetentionEditorialScores;
  readonly hardGatesPassedCount: number;
  readonly hardGatesEvaluatedCount: number;
}): {
  readonly retentionReadiness: number;
  readonly storyQualityConfidence: number;
  readonly frameworkCompliance: number;
  readonly noveltyEscalationPayoff: number;
  readonly coreEngagement: number;
} {
  const e = input.editorial;
  const noveltyEscalationPayoff =
    (e.novelty + e.escalation + e.payoffStrength) / 3;
  const coreEngagement =
    (e.clarity +
      e.curiosity +
      e.emotionalProgression +
      e.compressionQuality +
      e.visualPotential) /
    5;

  const shortRetention = input.formatStrategyId === "short_retention";
  const coreWeight = shortRetention ? 0.28 : 0.34;
  const nepWeight = shortRetention ? 0.34 : 0.28;

  const retentionReadiness = clamp01(
    coreWeight * coreEngagement +
      nepWeight * noveltyEscalationPayoff +
      0.18 * e.controllingIdeaAdherence +
      0.1 * e.genericIntroductionQuality +
      0.1 * (1 - e.repetitionPenalty),
  );

  const storyQualityConfidence = clamp01(
    0.4 * e.clarity +
      0.25 * e.controllingIdeaAdherence +
      0.2 * e.compressionQuality +
      0.15 * e.emotionalProgression,
  );

  const frameworkCompliance = clamp01(
    input.hardGatesEvaluatedCount === 0
      ? 0
      : input.hardGatesPassedCount / input.hardGatesEvaluatedCount,
  );

  return Object.freeze({
    retentionReadiness,
    storyQualityConfidence,
    frameworkCompliance,
    noveltyEscalationPayoff: clamp01(noveltyEscalationPayoff),
    coreEngagement: clamp01(coreEngagement),
  });
}
