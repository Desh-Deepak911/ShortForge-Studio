import "server-only";

import type { ProviderQuery } from "../provider.types";
import {
  createProviderEntityEnrichment,
  findMatchingOwnedEntityForHint,
} from "../../entities/entity-ownership.utils";
import type { IntelligenceEntity } from "../../shared/entity.types";
import type { IntelligenceFact } from "../../shared/knowledge.types";

import {
  findCompetitionAliasesInTopic,
  getStaticKnowledgeHistoricWinners,
  getStaticKnowledgeRankedList,
  getWorldCupHosts,
} from "./static-knowledge-catalog.utils";
import type { StaticKnowledgeNormalizedOperation } from "./static-knowledge-operation-names.utils";
import type {
  IntelligenceResearchRanking,
  IntelligenceResearchResultStatus,
} from "../provider-result.types";
import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";
import type { StaticKnowledgeResearchInput } from "./static-knowledge-research.types";
import { resolveStaticKnowledgeMatch } from "./static-knowledge-matching.utils";

export interface StaticKnowledgeOperationOutput {
  status: IntelligenceResearchResultStatus;
  facts: IntelligenceFact[];
  entities: IntelligenceEntity[];
  rankings: IntelligenceResearchRanking[];
  fixtures: FootballResearchFixture[];
  statistics: FootballResearchStatistic[];
  events: FootballResearchEvent[];
  lineups: FootballResearchLineup[];
  warnings: string[];
  raw?: unknown;
}

function readNumberParam(
  params: Record<string, string | number | boolean | null | undefined>,
  key: string,
  fallback?: number,
): number | undefined {
  const value = params[key];
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createFact(text: string, id: string): IntelligenceFact {
  return {
    id,
    text,
    provenance: {
      source: "static-fallback",
      fetchedAt: new Date().toISOString(),
    },
  };
}

function emptyOutput(
  status: IntelligenceResearchResultStatus,
  warnings: string[] = [],
): StaticKnowledgeOperationOutput {
  return {
    status,
    facts: [],
    entities: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings,
  };
}

function executeAllTimeWorldCupTopScorers(
  params: Record<string, string | number | boolean | null | undefined>,
  input: StaticKnowledgeResearchInput,
): StaticKnowledgeOperationOutput {
  const limit = readNumberParam(params, "limit") ?? input.rankingIntent?.limit ?? 5;
  const dataset = getStaticKnowledgeRankedList("world-cup-all-time-top-scorers");

  if (!dataset?.entries.length) {
    return emptyOutput("failed", ["All-time World Cup top scorers dataset is unavailable."]);
  }

  const entries = dataset.entries.slice(0, Math.max(1, limit));
  const ranking: IntelligenceResearchRanking = {
    metric: "goals",
    limit: entries.length,
    entries: entries.map((entry) => ({
      rank: entry.rank,
      label: entry.name,
      value: entry.value,
      entityId: entry.rank,
    })),
  };

  const facts = entries.map((entry, index) =>
    createFact(
      `#${entry.rank} ${entry.name}: ${entry.value} goals (FIFA World Cup all-time)`,
      `allTimeWorldCupTopScorers-${index}`,
    ),
  );

  const entities: IntelligenceEntity[] = entries.map((entry) =>
    createProviderEntityEnrichment({
      kind: "player",
      canonicalLabel: entry.name,
      externalId: entry.rank,
      status: "resolved",
      ...(entry.nationality ? { metadata: { nationality: entry.nationality } } : {}),
    }),
  );

  const warnings = ["Using curated all-time World Cup record fallback."];
  if (dataset.sourceNote) {
    warnings.push(dataset.sourceNote);
  }

  return {
    status: "success",
    facts,
    entities,
    rankings: [ranking],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings,
    raw: process.env.NODE_ENV === "development" ? dataset : undefined,
  };
}

function executeCompetitionAliases(
  query: ProviderQuery,
): StaticKnowledgeOperationOutput {
  const aliases = findCompetitionAliasesInTopic(query.input.topic);

  if (aliases.length === 0) {
    return emptyOutput("partial", ["No competition aliases matched this brief."]);
  }

  const facts = aliases.map((alias, index) =>
    createFact(`"${alias.alias}" refers to ${alias.canonical}.`, `competitionAliases-${index}`),
  );

  const entities: IntelligenceEntity[] = aliases.map((alias) =>
    createProviderEntityEnrichment({
      owner: findMatchingOwnedEntityForHint({
        owners: query.entities,
        kind: "competition",
        label: alias.alias,
      }),
      kind: "competition",
      canonicalLabel: alias.canonical,
      status: "resolved",
      metadata: { alias: alias.alias, scope: alias.scope },
    }),
  );

  return {
    status: "success",
    facts,
    entities,
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: ["Using curated competition alias reference."],
    raw: process.env.NODE_ENV === "development" ? aliases : undefined,
  };
}

function executeWorldCupHosts(): StaticKnowledgeOperationOutput {
  const hosts = getWorldCupHosts();

  if (hosts.length === 0) {
    return emptyOutput("failed", ["World Cup hosts dataset is unavailable."]);
  }

  const facts = hosts.map((entry, index) =>
    createFact(
      `${entry.year}: hosted in ${entry.host} — won by ${entry.winner}${entry.runnerUp ? ` (beat ${entry.runnerUp})` : ""}`,
      `worldCupHosts-${index}`,
    ),
  );

  const entities: IntelligenceEntity[] = hosts.map((entry) =>
    createProviderEntityEnrichment({
      kind: "venue",
      canonicalLabel: entry.host,
      status: "resolved",
      metadata: { year: entry.year, winner: entry.winner },
    }),
  );

  return {
    status: "success",
    facts,
    entities,
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: ["Using curated World Cup hosts reference."],
    raw: process.env.NODE_ENV === "development" ? hosts : undefined,
  };
}

function executeHistoricWinners(
  params: Record<string, string | number | boolean | null | undefined>,
  input: StaticKnowledgeResearchInput,
  datasetId?: string,
): StaticKnowledgeOperationOutput {
  const resolvedDatasetId =
    datasetId ??
    (params.datasetId != null && params.datasetId !== ""
      ? String(params.datasetId)
      : resolveStaticKnowledgeMatch(input)?.datasetId);

  if (
    !resolvedDatasetId ||
    resolvedDatasetId === "world-cup-all-time-top-scorers" ||
    resolvedDatasetId === "competition-aliases" ||
    resolvedDatasetId === "football-nicknames"
  ) {
    return emptyOutput("failed", ["historicWinners requires a winners dataset id."]);
  }

  const dataset = getStaticKnowledgeHistoricWinners(
    resolvedDatasetId as Parameters<typeof getStaticKnowledgeHistoricWinners>[0],
  );

  if (!dataset) {
    return emptyOutput("failed", [`Static knowledge dataset "${resolvedDatasetId}" is unavailable.`]);
  }

  const facts = dataset.entries.map((entry, index) => {
    if (entry.host && entry.runnerUp) {
      return createFact(
        `${entry.year}: ${entry.winner} (beat ${entry.runnerUp}, hosted in ${entry.host})`,
        `historicWinners-${index}`,
      );
    }

    if (entry.club && entry.country) {
      return createFact(
        `${entry.year}: ${entry.winner} (${entry.country}, ${entry.club})`,
        `historicWinners-${index}`,
      );
    }

    return createFact(`${entry.year}: ${entry.winner}`, `historicWinners-${index}`);
  });

  return {
    status: "success",
    facts,
    entities: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: [`Using curated static knowledge: ${dataset.title}.`],
    raw: process.env.NODE_ENV === "development" ? dataset : undefined,
  };
}

export function executeStaticKnowledgeOperation(
  operation: StaticKnowledgeNormalizedOperation,
  params: Record<string, string | number | boolean | null | undefined>,
  query: ProviderQuery,
  input: StaticKnowledgeResearchInput,
  datasetId?: string,
): StaticKnowledgeOperationOutput {
  switch (operation) {
    case "allTimeWorldCupTopScorers":
      return executeAllTimeWorldCupTopScorers(params, input);
    case "competitionAliases":
      return executeCompetitionAliases(query);
    case "worldCupHosts":
      return executeWorldCupHosts();
    case "historicWinners":
      return executeHistoricWinners(params, input, datasetId);
  }
}

export function mergeStaticKnowledgeOperationOutputs(
  outputs: StaticKnowledgeOperationOutput[],
): StaticKnowledgeOperationOutput {
  if (outputs.length === 0) {
    return emptyOutput("unsupported");
  }

  const merged = emptyOutput("success");
  const seenFacts = new Set<string>();
  const seenWarnings = new Set<string>();
  const seenEntities = new Set<string>();

  for (const output of outputs) {
    if (output.status === "failed") {
      merged.status = merged.status === "success" ? "partial" : merged.status;
    } else if (output.status === "partial" && merged.status === "success") {
      merged.status = "partial";
    } else if (output.status === "unsupported" && merged.status === "success") {
      merged.status = "unsupported";
    }

    for (const fact of output.facts) {
      if (!seenFacts.has(fact.text)) {
        seenFacts.add(fact.text);
        merged.facts.push(fact);
      }
    }

    for (const warning of output.warnings) {
      if (!seenWarnings.has(warning)) {
        seenWarnings.add(warning);
        merged.warnings.push(warning);
      }
    }

    for (const entity of output.entities) {
      const key = `${entity.kind}:${entity.label.toLowerCase()}`;
      if (!seenEntities.has(key)) {
        seenEntities.add(key);
        merged.entities.push(entity);
      }
    }

    merged.rankings.push(...output.rankings);
    merged.fixtures.push(...output.fixtures);
    merged.statistics.push(...output.statistics);
    merged.events.push(...output.events);
    merged.lineups.push(...output.lineups);
  }

  if (merged.facts.length === 0 && merged.rankings.length === 0 && merged.status === "success") {
    merged.status = "partial";
  }

  return merged;
}
