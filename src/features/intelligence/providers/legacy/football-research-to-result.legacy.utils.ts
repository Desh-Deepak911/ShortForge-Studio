/** @deprecated test/legacy only — do not use in production path. */
import type { FootballResearchContext } from "@/features/research/types/football-research.types";

import type { ConfidenceScore } from "../../shared/confidence.types";
import type { IntelligenceEntity } from "../../shared/entity.types";
import type { IntelligenceFact } from "../../shared/knowledge.types";

import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "../provider-result.types";
import type { ProviderExecutionResult } from "../provider.types";
import type { ProviderResearchInput } from "../provider-research.types";
import type { ResearchProviderId } from "../provider.types";

/** Minimal query context for football → canonical result conversion. */
export interface FootballResearchResultQuery {
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

function mapFootballSourceToStatus(
  source: FootballResearchContext["source"],
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

/** @deprecated test/legacy only — do not use in production path. */
export function footballContextToResearchResult(
  context: FootballResearchContext,
  query: FootballResearchResultQuery,
  providerId: ResearchProviderId = "api-football",
): IntelligenceResearchResult {
  const fetchedAt = new Date().toISOString();
  const facts = legacyFactsToIntelligenceFacts(context.facts, providerId, fetchedAt);

  const rankings =
    context.rankingIntent && context.players?.length
      ? [
          {
            metric:
              context.rankingIntent.rankingType === "top_scorers"
                ? ("goals" as const)
                : ("unknown" as const),
            limit: context.rankingIntent.limit,
            entries: context.players.map((player, index) => ({
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
    status: mapFootballSourceToStatus(context.source, facts.length),
    facts,
    entities,
    rankings,
    fixtures: context.fixture ? [context.fixture] : [],
    statistics: context.statistics ?? [],
    events: context.events ?? [],
    lineups: context.lineups ?? [],
    warnings: [...context.warnings],
    confidence: query.confidence,
    provenance: {
      source: providerId,
      fetchedAt,
      operations: ["legacyResearch"],
      facts: facts.map((fact) => fact.provenance),
    },
  });
}

/** @deprecated test/legacy only — do not use in production path. */
export function researchResultToFootballContext(
  result: IntelligenceResearchResult,
  input: Pick<FootballResearchContext, "mode" | "topic">,
): FootballResearchContext {
  const source =
    result.providerId === "api-football" ||
    result.providerId === "static-fallback" ||
    result.providerId === "manual"
      ? result.providerId
      : "fallback";

  const primaryRanking = result.rankings[0];
  const players = primaryRanking?.entries.map((entry, index) => ({
    id: typeof entry.entityId === "number" ? entry.entityId : index + 1,
    name: entry.label,
    goals: entry.value ?? null,
  }));

  return {
    mode: input.mode,
    topic: input.topic.trim(),
    summary:
      result.facts[0]?.text ??
      (result.fixtures[0]
        ? `${result.fixtures[0].homeTeam} vs ${result.fixtures[0].awayTeam}`
        : `Research brief: ${input.topic.trim()}`),
    facts: result.facts.map((fact) => fact.text),
    warnings: [...result.warnings],
    source,
    ...(result.fixtures[0] ? { fixture: result.fixtures[0] } : {}),
    ...(players?.length ? { players } : {}),
    ...(result.statistics.length ? { statistics: result.statistics } : {}),
    ...(result.events.length ? { events: result.events } : {}),
    ...(result.lineups.length ? { lineups: result.lineups } : {}),
  };
}

/** @deprecated test/legacy only — do not use in production path. */
export function executionResultToFootballContext(
  execution: ProviderExecutionResult,
  input: ProviderResearchInput,
): FootballResearchContext {
  return researchResultToFootballContext(execution.result, {
    mode: input.mode,
    topic: input.topic,
  });
}
