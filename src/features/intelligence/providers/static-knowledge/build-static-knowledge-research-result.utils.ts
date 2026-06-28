import "server-only";

import { applyProviderEnrichmentToOwners } from "../../entities/entity-ownership.utils";

import type { ProviderQuery } from "../provider.types";
import { createIntelligenceResearchResult, type IntelligenceResearchResult } from "../provider-result.types";
import type { StaticKnowledgeOperationOutput } from "./static-knowledge-operations.engine";

/** Converts monolithic static-knowledge operation output into a canonical provider result. */
export function buildStaticKnowledgeResearchResult(
  output: StaticKnowledgeOperationOutput,
  query: ProviderQuery,
): IntelligenceResearchResult {
  const fetchedAt = new Date().toISOString();

  return createIntelligenceResearchResult({
    queryId: query.id,
    providerId: "static-fallback",
    status: output.status,
    facts: output.facts,
    entities: applyProviderEnrichmentToOwners(query.entities, output.entities),
    rankings: output.rankings,
    fixtures: output.fixtures,
    statistics: output.statistics,
    events: output.events,
    lineups: output.lineups,
    warnings: output.warnings,
    confidence: query.confidence,
    provenance: {
      source: "static-fallback",
      fetchedAt,
      operations: ["legacyMonolithicResearch"],
      facts: output.facts.map((fact) => fact.provenance),
    },
    raw: output.raw,
  });
}
