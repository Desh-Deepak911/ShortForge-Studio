import "server-only";

import { resolveResearchRankingIntent } from "@/features/research/utils/intelligence-analysis-research.utils";
import { resolveFootballResearchMode } from "@/features/research/types/football-research.types";

import type { ProviderExecutionEnrichment } from "../providers/provider-registry";
import { intelligenceQueryToAnalysis } from "../shared/intelligence-analysis.utils";

import type { IntelligenceQuery } from "./query-orchestrator.types";

/** Provider execution enrichment derived from a planned intelligence query. */
export function buildExecutionEnrichmentFromQuery(
  intelligenceQuery: IntelligenceQuery,
  overrides?: ProviderExecutionEnrichment,
): ProviderExecutionEnrichment | undefined {
  const analysis = intelligenceQueryToAnalysis(intelligenceQuery);
  const mode = resolveFootballResearchMode(intelligenceQuery.input.selectedMode);
  const rankingIntent =
    overrides?.rankingIntent ??
    resolveResearchRankingIntent({
      topic: intelligenceQuery.input.topic,
      mode,
      intelligenceAnalysis: analysis,
    });

  const enrichment: ProviderExecutionEnrichment = {
    ...(overrides?.resolvedEntities ? { resolvedEntities: overrides.resolvedEntities } : {}),
    ...(overrides?.entityHints ? { entityHints: overrides.entityHints } : {}),
    ...(rankingIntent ? { rankingIntent } : {}),
  };

  return Object.keys(enrichment).length > 0 ? enrichment : undefined;
}
