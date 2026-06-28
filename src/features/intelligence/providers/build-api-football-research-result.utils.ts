import "server-only";

import type { ConfidenceScore } from "../shared/confidence.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

import type { ApiFootballResearchState } from "./api-football-research-state.types";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "./provider-result.types";
import type { ResearchProviderId } from "./provider.types";

export interface ApiFootballResearchResultQuery {
  id: string;
  entities?: IntelligenceEntity[];
  confidence?: ConfidenceScore;
}

function legacyFactsToIntelligenceFacts(
  facts: string[],
  source: ResearchProviderId,
  fetchedAt: string,
): IntelligenceFact[] {
  return facts.map((text, index) => ({
    id: `fact-${index + 1}`,
    text,
    provenance: { source, fetchedAt },
  }));
}

function mapSourceToStatus(
  source: ApiFootballResearchState["source"],
  factsCount: number,
): IntelligenceResearchResultStatus {
  if (source === "api-football") {
    return "success";
  }

  if (source === "static-fallback" || source === "manual") {
    return "partial";
  }

  return factsCount > 0 ? "partial" : "failed";
}

/** Builds canonical provider output from monolithic API-Football research state. */
export function buildApiFootballResearchResult(
  state: ApiFootballResearchState,
  query: ApiFootballResearchResultQuery,
  providerId: ResearchProviderId = "api-football",
): IntelligenceResearchResult {
  const fetchedAt = new Date().toISOString();
  const facts = legacyFactsToIntelligenceFacts(state.facts, providerId, fetchedAt);

  const rankings =
    state.rankingIntent && state.players?.length
      ? [
          {
            metric:
              state.rankingIntent.rankingType === "top_scorers"
                ? ("goals" as const)
                : ("unknown" as const),
            limit: state.rankingIntent.limit,
            entries: state.players.map((player, index) => ({
              rank: index + 1,
              label: player.name,
              value: player.goals ?? null,
              entityId: player.id,
            })),
          },
        ]
      : [];

  const entities = query.entities?.length ? [...query.entities] : [];

  return createIntelligenceResearchResult({
    queryId: query.id,
    providerId,
    status: mapSourceToStatus(state.source, facts.length),
    facts,
    entities,
    rankings,
    fixtures: state.fixture ? [state.fixture] : [],
    statistics: state.statistics ?? [],
    events: state.events ?? [],
    lineups: state.lineups ?? [],
    warnings: [...state.warnings],
    confidence: query.confidence,
    provenance: {
      source: providerId,
      fetchedAt,
      operations: ["legacyMonolithicResearch"],
      facts: facts.map((fact) => fact.provenance),
    },
  });
}
