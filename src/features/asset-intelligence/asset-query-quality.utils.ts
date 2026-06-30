import { normalizeAssetSearchQuery } from "@/features/studio-intelligence/scene-blueprint.utils";

import type { AssetEntity, AssetQueryCandidate } from "./asset-intelligence.types";

/** Maximum terms in a planned asset search query. */
export const MAX_QUERY_TERMS = 6;

/** Maximum character length for a planned asset search query. */
export const MAX_QUERY_LENGTH = 80;

/** Standalone generic terms that are too vague without entity/context pairing. */
export const GENERIC_QUERY_TERMS = new Set([
  "football",
  "player",
  "players",
  "match",
  "trophy",
  "highlights",
  "broll",
  "context",
  "sport",
  "soccer",
  "game",
  "team",
  "teams",
  "video",
  "clip",
]);

/** Visual terms that indicate a useful asset search query. */
export const VISUAL_QUERY_TERMS = new Set([
  "portrait",
  "action",
  "celebration",
  "badge",
  "kit",
  "stadium",
  "touchline",
  "press",
  "conference",
  "trophy",
  "logo",
  "branding",
  "flag",
  "anthem",
  "tactical",
  "board",
  "formation",
  "graphic",
  "archive",
  "ceremony",
  "podium",
  "highlight",
  "scoreboard",
  "debate",
  "split",
  "comparison",
  "stats",
  "overlay",
  "opener",
  "close",
  "legacy",
  "preview",
  "decisive",
  "emotional",
]);

function tokenizeQuery(query: string): string[] {
  return normalizeAssetSearchQuery(query).split(/\s+/).filter(Boolean);
}

/** Returns true when the query is only generic football terms. */
export function isGenericOnlyQuery(query: string, entityNames: string[] = []): boolean {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return true;
  }

  const normalizedEntities = entityNames.map((name) => normalizeAssetSearchQuery(name));
  const hasEntityAnchor = tokens.some((token) =>
    normalizedEntities.some(
      (entity) => entity.includes(token) || token.includes(entity) || entity.split(/\s+/).includes(token),
    ),
  );

  if (hasEntityAnchor) {
    return false;
  }

  const nonGenericTokens = tokens.filter((token) => !GENERIC_QUERY_TERMS.has(token));
  if (nonGenericTokens.length === 0) {
    return true;
  }

  const hasVisualTerm = nonGenericTokens.some((token) =>
    [...VISUAL_QUERY_TERMS].some((visual) => token.includes(visual) || visual.includes(token)),
  );

  return !hasVisualTerm && nonGenericTokens.length <= 1;
}

/** Returns true when a query includes useful visual search language. */
export function queryIncludesVisualTerm(query: string): boolean {
  const tokens = tokenizeQuery(query);
  return tokens.some((token) =>
    [...VISUAL_QUERY_TERMS].some((visual) => token.includes(visual) || visual.includes(token)),
  );
}

/** Caps query length and deduplicates terms. */
export function polishAssetQuery(query: string): string {
  const terms = tokenizeQuery(query).slice(0, MAX_QUERY_TERMS);
  const polished = terms.join(" ");
  return polished.length > MAX_QUERY_LENGTH ? polished.slice(0, MAX_QUERY_LENGTH).trim() : polished;
}

/** Builds an entity-focused query string with visual bias. */
export function buildEntityFocusedQuery(
  entity: AssetEntity,
  visualTerm: string,
  contextTerms: string[] = [],
): string {
  return polishAssetQuery(
    [entity.name, visualTerm, ...contextTerms.filter(Boolean)].join(" "),
  );
}

function resolveCandidateConfidence(
  entity: AssetEntity | undefined,
  query: string,
  priority: AssetQueryCandidate["priority"],
): AssetQueryCandidate["confidence"] {
  if (isGenericOnlyQuery(query, entity ? [entity.name, ...entity.aliases] : [])) {
    return "low";
  }

  if (entity?.confidence === "high" && queryIncludesVisualTerm(query)) {
    return "high";
  }

  if (entity && normalizeAssetSearchQuery(query).includes(normalizeAssetSearchQuery(entity.name))) {
    return priority === "primary" ? "high" : "medium";
  }

  return priority === "exploratory" ? "low" : "medium";
}

/** Scores a query candidate quality in `[0, 1]`. */
export function scoreQueryCandidateQuality(
  candidate: AssetQueryCandidate,
  entities: AssetEntity[],
): number {
  const linkedEntities = entities.filter((entity) => candidate.entityIds.includes(entity.id));
  const entityNames = linkedEntities.flatMap((entity) => [entity.name, ...entity.aliases]);
  let score = 0.35;

  if (isGenericOnlyQuery(candidate.query, entityNames)) {
    return 0.15;
  }

  if (entityNames.some((name) => normalizeAssetSearchQuery(candidate.query).includes(normalizeAssetSearchQuery(name)))) {
    score += 0.3;
  }

  if (queryIncludesVisualTerm(candidate.query)) {
    score += 0.2;
  }

  if (candidate.rationale.trim().length > 0) {
    score += 0.05;
  }

  if (candidate.confidence === "high") {
    score += 0.1;
  } else if (candidate.confidence === "low") {
    score -= 0.1;
  }

  const termCount = tokenizeQuery(candidate.query).length;
  if (termCount >= 2 && termCount <= MAX_QUERY_TERMS) {
    score += 0.05;
  }

  return Math.min(1, Math.max(0, Math.round(score * 1000) / 1000));
}

/** Applies confidence scoring and drops generic-only candidates when alternatives exist. */
export function refineQueryCandidates(
  candidates: AssetQueryCandidate[],
  entities: AssetEntity[],
): AssetQueryCandidate[] {
  const enriched = candidates.map((candidate) => {
    const primaryEntity = entities.find((entity) => candidate.entityIds.includes(entity.id));
    return {
      ...candidate,
      query: polishAssetQuery(candidate.query),
      confidence:
        candidate.confidence ??
        resolveCandidateConfidence(primaryEntity, candidate.query, candidate.priority),
    };
  });

  const nonGeneric = enriched.filter(
    (candidate) =>
      !isGenericOnlyQuery(
        candidate.query,
        entities
          .filter((entity) => candidate.entityIds.includes(entity.id))
          .flatMap((entity) => [entity.name, ...entity.aliases]),
      ),
  );

  if (nonGeneric.length > 0) {
    return nonGeneric.slice(0, 4);
  }

  return enriched.slice(0, 4);
}

/** Returns aggregate candidate quality score in `[0, 1]`. */
export function computeCandidateQualityScore(
  scenePlans: Array<{ candidates: AssetQueryCandidate[] }>,
  entities: AssetEntity[],
): number {
  const scores = scenePlans.flatMap((plan) =>
    plan.candidates.map((candidate) => scoreQueryCandidateQuality(candidate, entities)),
  );

  if (scores.length === 0) {
    return 0;
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  return Math.round((total / scores.length) * 1000) / 1000;
}

/** Collects generic query warnings across scene plans. */
export function collectGenericQueryWarnings(
  scenePlans: Array<{ sceneId: string; candidates: AssetQueryCandidate[] }>,
  entities: AssetEntity[],
): string[] {
  const warnings: string[] = [];

  for (const plan of scenePlans) {
    for (const candidate of plan.candidates) {
      const entityNames = entities
        .filter((entity) => candidate.entityIds.includes(entity.id))
        .flatMap((entity) => [entity.name, ...entity.aliases]);

      if (isGenericOnlyQuery(candidate.query, entityNames)) {
        warnings.push(
          `Scene "${plan.sceneId}" candidate "${candidate.query}" is overly generic.`,
        );
      }
    }
  }

  return warnings;
}
