import { createEntityConfidence, normalizeEntityName } from "./entity-utils";
import type { EntityConfidence } from "./entity-types";
import type { ScoredResolvedEntity } from "./entity-provider.types";
import {
  DEFAULT_AMBIGUITY_GAP,
  DEFAULT_MIN_RESOLVE_PERCENT,
  type EntityProviderResolution,
  type EntityProviderResolutionKind,
} from "./entity-provider.types";

export function scoreNameMatch(query: string, candidateName: string): number {
  const normalizedQuery = normalizeEntityName(query);
  const normalizedCandidate = normalizeEntityName(candidateName);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return 88;
  }

  const queryParts = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryParts.length === 0) {
    return 0;
  }

  let score = 0;
  for (const part of queryParts) {
    if (normalizedCandidate.includes(part)) {
      score += 18;
    }
  }

  return Math.min(92, score);
}

export function scoreCountryMatch(query: string, country?: string): number {
  if (!country) {
    return 0;
  }

  return scoreNameMatch(query, country);
}

export function rawScoreToPercent(rawScore: number): number {
  if (rawScore <= 0) {
    return 0;
  }

  return Math.min(97, Math.max(38, Math.round(40 + rawScore * 0.55)));
}

export function confidenceFromRawScore(
  rawScore: number,
  reasoning?: string,
): EntityConfidence {
  const percent = rawScoreToPercent(rawScore);
  const tier = percent >= 85 ? "high" : percent >= 65 ? "medium" : "low";

  return createEntityConfidence({
    tier,
    percent,
    ...(reasoning ? { reasoning } : {}),
  });
}

export function buildProviderResolution(input: {
  query: string;
  kind: EntityProviderResolutionKind;
  scored: ScoredResolvedEntity[];
  providerAvailable: boolean;
  baseReasoning: string;
  minResolvePercent?: number;
  ambiguityGap?: number;
}): EntityProviderResolution {
  const minResolvePercent = input.minResolvePercent ?? DEFAULT_MIN_RESOLVE_PERCENT;
  const ambiguityGap = input.ambiguityGap ?? DEFAULT_AMBIGUITY_GAP;

  const sorted = [...input.scored].sort((a, b) => b.score - a.score);
  const candidates = sorted.map((entry) => ({
    ...entry.entity,
    confidence: confidenceFromRawScore(entry.score),
  }));

  if (!input.providerAvailable) {
    return {
      query: input.query,
      kind: input.kind,
      candidates,
      ambiguous: false,
      providerAvailable: false,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "API-Football is not configured.",
      }),
      reasoning: `${input.baseReasoning} API-Football is not configured — no provider lookup performed.`,
    };
  }

  if (candidates.length === 0) {
    return {
      query: input.query,
      kind: input.kind,
      candidates: [],
      ambiguous: false,
      providerAvailable: true,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "No provider matches returned.",
      }),
      reasoning: `${input.baseReasoning} No API-Football matches returned.`,
    };
  }

  const top = sorted[0]!;
  const runnerUp = sorted[1];
  const topPercent = rawScoreToPercent(top.score);
  const gapPercent =
    runnerUp != null ? topPercent - rawScoreToPercent(runnerUp.score) : topPercent;

  const ambiguous =
    runnerUp != null &&
    topPercent >= minResolvePercent &&
    gapPercent < ambiguityGap;

  const meetsThreshold = topPercent >= minResolvePercent && !ambiguous;

  const reasoningParts = [
    input.baseReasoning,
    `${candidates.length} provider candidate(s) scored.`,
    `Top match: "${top.entity.displayName}" (${topPercent}%).`,
  ];

  if (runnerUp) {
    reasoningParts.push(
      `Runner-up: "${runnerUp.entity.displayName}" (${rawScoreToPercent(runnerUp.score)}%).`,
    );
  }

  if (ambiguous) {
    reasoningParts.push(
      `Ambiguous — top candidates are within ${ambiguityGap} points; no entity auto-selected.`,
    );
  } else if (!meetsThreshold) {
    reasoningParts.push(
      `Below auto-select threshold (${minResolvePercent}%) — review candidates manually.`,
    );
  } else {
    reasoningParts.push("Confidence threshold met — top candidate selected.");
  }

  return {
    query: input.query,
    kind: input.kind,
    candidates,
    ambiguous,
    providerAvailable: true,
    resolved: meetsThreshold ? candidates[0] : undefined,
    confidence: confidenceFromRawScore(top.score, reasoningParts.join(" ")),
    reasoning: reasoningParts.join(" "),
  };
}
