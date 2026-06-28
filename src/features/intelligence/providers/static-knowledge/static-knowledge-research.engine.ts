import "server-only";

import type { ProviderQuery } from "../provider.types";
import type { IntelligenceResearchResult } from "../provider-result.types";
import type { IntelligenceFact } from "../../shared/knowledge.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import { resolveResearchRankingIntent } from "@/features/research/utils/intelligence-analysis-research.utils";
import { resolveStaticKnowledgeMatch, resolveStaticKnowledgeReferenceFacts } from "./static-knowledge-matching.utils";
import { executeStaticKnowledgeOperation } from "./static-knowledge-operations.engine";
import type { StaticKnowledgeResearchInput } from "./static-knowledge-research.types";
import { buildStaticKnowledgeResearchResult } from "./build-static-knowledge-research-result.utils";

function resolveRankingIntent(input: StaticKnowledgeResearchInput): RankingIntent | undefined {
  if (input.rankingIntent) {
    return input.rankingIntent;
  }

  return resolveResearchRankingIntent({
    topic: input.topic,
    mode: input.mode,
    intelligenceAnalysis: input.intelligenceAnalysis,
  });
}

/**
 * Executes static knowledge research when a curated dataset matches the brief.
 */
export function executeStaticKnowledgeResearch(
  input: StaticKnowledgeResearchInput,
  query: ProviderQuery,
): IntelligenceResearchResult | null {
  const match = resolveStaticKnowledgeMatch(input);
  if (!match) {
    return null;
  }

  if (match.datasetId === "world-cup-all-time-top-scorers") {
    const rankingIntent = resolveRankingIntent(input);
    if (!rankingIntent) {
      return null;
    }

    const output = executeStaticKnowledgeOperation(
      "allTimeWorldCupTopScorers",
      { limit: match.limit ?? rankingIntent.limit },
      query,
      input,
    );

    return buildStaticKnowledgeResearchResult(output, query);
  }

  const output = executeStaticKnowledgeOperation(
    "historicWinners",
    { datasetId: match.datasetId },
    query,
    input,
    match.datasetId,
  );

  return buildStaticKnowledgeResearchResult(output, query);
}

/** Appends alias/nickname reference facts without replacing primary research. */
export function appendStaticKnowledgeReferenceFacts(
  result: IntelligenceResearchResult,
  topic: string,
): IntelligenceResearchResult {
  const referenceFacts = resolveStaticKnowledgeReferenceFacts(topic);
  if (referenceFacts.length === 0) {
    return result;
  }

  const seen = new Set(result.facts.map((fact) => fact.text));
  const nextFacts: IntelligenceFact[] = [...result.facts];

  for (const [index, factText] of referenceFacts.entries()) {
    if (seen.has(factText)) {
      continue;
    }

    seen.add(factText);
    nextFacts.push({
      id: `reference-${index + 1}`,
      text: factText,
      provenance: {
        source: "static-fallback",
        fetchedAt: new Date().toISOString(),
      },
    });
  }

  return {
    ...result,
    facts: nextFacts,
  };
}
