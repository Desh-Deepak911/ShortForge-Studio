import type { IntelligenceQuery } from "../planner/query-orchestrator.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "./provider-result.types";
import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";

function mergeStatus(
  results: IntelligenceResearchResult[],
): IntelligenceResearchResultStatus {
  if (results.some((result) => result.status === "success")) {
    return results.some((result) => result.status === "partial")
      ? "partial"
      : "success";
  }

  if (results.some((result) => result.status === "partial")) {
    return "partial";
  }

  if (results.every((result) => result.status === "unsupported")) {
    return "unsupported";
  }

  return "failed";
}

function dedupeEntities(entities: IntelligenceEntity[]): IntelligenceEntity[] {
  const seen = new Set<string>();
  const merged: IntelligenceEntity[] = [];

  for (const entity of entities) {
    const key = `${entity.kind}:${entity.label.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(entity);
  }

  return merged;
}

function dedupeFacts(facts: IntelligenceFact[]): IntelligenceFact[] {
  const seen = new Set<string>();
  const merged: IntelligenceFact[] = [];

  for (const fact of facts) {
    if (seen.has(fact.text)) {
      continue;
    }

    seen.add(fact.text);
    merged.push(fact);
  }

  return merged;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/** Combines per-call provider results into one query-level research bundle. */
export function mergeIntelligenceResearchResults(
  query: IntelligenceQuery,
  results: IntelligenceResearchResult[],
  diagnostics: ProviderDiagnosticEntry[] = [],
): IntelligenceResearchResult {
  if (results.length === 0) {
    return createIntelligenceResearchResult({
      queryId: query.id,
      providerId: "fallback",
      status: "unsupported",
      warnings: query.warnings.length
        ? [...query.warnings]
        : ["No research calls were planned for this query."],
      entities: [...query.entities],
      confidence: query.confidence,
      provenance: {
        source: "inferred",
        fetchedAt: new Date().toISOString(),
        operations: [],
      },
      diagnostics,
    });
  }

  const primary =
    results.find((result) => result.status === "success") ??
    results.find((result) => result.status === "partial") ??
    results[0]!;

  const operations = dedupeStrings(
    results.flatMap((result) => result.provenance.operations ?? []),
  );

  const fixtures = results.flatMap((result) => result.fixtures);
  const seenFixtureIds = new Set<number>();

  return createIntelligenceResearchResult({
    queryId: query.id,
    providerId: primary.providerId,
    status: mergeStatus(results),
    facts: dedupeFacts(results.flatMap((result) => result.facts)),
    entities: dedupeEntities(results.flatMap((result) => result.entities)),
    rankings: results.flatMap((result) => result.rankings),
    fixtures: fixtures.filter((fixture) => {
      if (seenFixtureIds.has(fixture.id)) {
        return false;
      }

      seenFixtureIds.add(fixture.id);
      return true;
    }),
    statistics: results.flatMap((result) => result.statistics),
    events: results.flatMap((result) => result.events),
    lineups: results.flatMap((result) => result.lineups),
    warnings: dedupeStrings([
      ...query.warnings,
      ...results.flatMap((result) => result.warnings),
    ]),
    confidence: primary.confidence ?? query.confidence,
    provenance: {
      source: primary.provenance.source,
      fetchedAt: new Date().toISOString(),
      operations,
      facts: dedupeFacts(results.flatMap((result) => result.facts)).map(
        (fact) => fact.provenance,
      ),
    },
    diagnostics,
  });
}
