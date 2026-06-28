import type { IntelligenceProviderId } from "../shared/provider.types";

import type { ResearchProvider } from "./provider.interface";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
} from "./provider-result.types";
import type {
  ProviderExecutionResult,
  ProviderQuery,
  ResearchCapability,
  ResearchProviderCapabilities,
  ResearchProviderId,
  ResearchType,
} from "./provider.types";
import type { EntityKind } from "../shared/entity.types";

export function hasCapability(
  capabilities: ResearchProviderCapabilities,
  capability: ResearchCapability,
): boolean {
  return capabilities[capability] === true;
}

export function supportsEntityType(
  provider: Pick<ResearchProvider, "supportedEntityTypes">,
  entityKind: EntityKind,
): boolean {
  return provider.supportedEntityTypes.includes(entityKind);
}

export function supportsResearchType(
  provider: Pick<ResearchProvider, "supportedResearchTypes">,
  researchType: ResearchType,
): boolean {
  return provider.supportedResearchTypes.includes(researchType);
}

/** Whether a provider supports the query's research type and entity kinds. */
export function supportsProviderQuery(
  provider: ResearchProvider,
  query: ProviderQuery,
): boolean {
  const researchType = resolveResearchTypeFromQuery(query);
  if (!supportsResearchType(provider, researchType)) {
    return false;
  }

  if (query.entities.length === 0) {
    return true;
  }

  return query.entities.every((entity) =>
    provider.supportedEntityTypes.includes(entity.kind),
  );
}

export function sortProvidersByPriority(providers: ResearchProvider[]): ResearchProvider[] {
  return [...providers].sort((left, right) => left.priority - right.priority);
}

export function resolveResearchTypeFromQuery(query: ProviderQuery): ResearchType {
  const mode = query.input.selectedMode;
  const intent = query.intent.intent;

  if (mode === "top_5" || intent === "ranked_list" || query.intent.subIntent === "top_scorers") {
    return "ranked_list";
  }

  if (mode === "player_analysis" || intent === "player_profile") {
    return "player_profile";
  }

  if (mode === "match_preview" || intent === "match_preview") {
    return "match_preview";
  }

  if (mode === "match_recap" || intent === "match_recap") {
    return "match_recap";
  }

  if (mode === "tactical_review" || intent === "tactical_breakdown") {
    return "tactical_breakdown";
  }

  if (query.competition && query.competition.scope !== "unknown") {
    return "competition_context";
  }

  if (
    mode === "story" ||
    mode === "historical_explainer" ||
    mode === "opinion_debate" ||
    intent === "story" ||
    intent === "historical_explainer" ||
    intent === "opinion"
  ) {
    return "optional_research";
  }

  return "general";
}

export function createEmptyProviderResult(input: {
  providerId: ResearchProviderId | IntelligenceProviderId;
  query: ProviderQuery;
  warnings?: string[];
}): IntelligenceResearchResult {
  return createIntelligenceResearchResult({
    queryId: input.query.id,
    providerId: input.providerId as ResearchProviderId,
    status: "failed",
    warnings: input.warnings ?? [],
    entities: [...input.query.entities],
    confidence: input.query.confidence,
    provenance: {
      source: input.providerId as ResearchProviderId,
      fetchedAt: new Date().toISOString(),
      operations: [],
    },
  });
}

/** Merge normalized provider results — facts and warnings deduped, arrays concatenated.
 * @deprecated test/legacy only — do not use in production path.
 */
export function mergeProviderResults(
  results: ProviderExecutionResult[],
): IntelligenceResearchResult | null {
  if (results.length === 0) {
    return null;
  }

  const successful = results.filter(
    (entry) => entry.status === "success" || entry.status === "partial",
  );

  if (successful.length === 0) {
    return results[0]?.result ?? null;
  }

  const [primary, ...rest] = successful;
  const seenFacts = new Set(primary!.result.facts.map((fact) => fact.text));
  const seenWarnings = new Set(primary!.result.warnings);
  const seenFixtureIds = new Set(primary!.result.fixtures.map((fixture) => fixture.id));

  const merged: IntelligenceResearchResult = {
    ...primary!.result,
    facts: [...primary!.result.facts],
    warnings: [...primary!.result.warnings],
    entities: [...primary!.result.entities],
    rankings: [...primary!.result.rankings],
    fixtures: [...primary!.result.fixtures],
    statistics: [...primary!.result.statistics],
    events: [...primary!.result.events],
    lineups: [...primary!.result.lineups],
  };

  for (const entry of rest) {
    for (const fact of entry.result.facts) {
      if (!seenFacts.has(fact.text)) {
        seenFacts.add(fact.text);
        merged.facts.push(fact);
      }
    }

    for (const warning of entry.result.warnings) {
      if (!seenWarnings.has(warning)) {
        seenWarnings.add(warning);
        merged.warnings.push(warning);
      }
    }

    for (const entity of entry.result.entities) {
      const key = `${entity.kind}:${entity.label.toLowerCase()}`;
      if (
        !merged.entities.some(
          (candidate) => `${candidate.kind}:${candidate.label.toLowerCase()}` === key,
        )
      ) {
        merged.entities.push(entity);
      }
    }

    merged.rankings.push(...entry.result.rankings);

    for (const fixture of entry.result.fixtures) {
      if (!seenFixtureIds.has(fixture.id)) {
        seenFixtureIds.add(fixture.id);
        merged.fixtures.push(fixture);
      }
    }

    merged.statistics.push(...entry.result.statistics);
    merged.events.push(...entry.result.events);
    merged.lineups.push(...entry.result.lineups);
  }

  return merged;
}
