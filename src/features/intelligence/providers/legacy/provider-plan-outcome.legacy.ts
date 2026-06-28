import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";

import { canonicalResearchBundleToFootballContext } from "../../context/canonical-research-bundle.adapter";
import { mergeProviderResults } from "../../context/merge-provider-results";
import type { IntelligenceQuery } from "../../planner/query-orchestrator.types";
import type { IntelligenceAnalysis } from "../../shared/intelligence-analysis.types";
import type { ExecuteResearchPlanOutcome } from "../provider-execute-research-plan.server";
import type {
  IntelligenceResearchResultStatus,
} from "../provider-result.types";
import type { ResearchProviderId } from "../provider.types";
import type { ProviderResearchExecutionSummary } from "../provider-plan-outcome.utils";

/** @deprecated Legacy FootballResearchContext adapter — migration only. */
export function providerPlanOutcomeToFootballContext(
  outcome: ExecuteResearchPlanOutcome,
  input: {
    mode: FootballResearchContext["mode"];
    topic: string;
    intelligenceAnalysis?: IntelligenceAnalysis;
    rankingIntent?: RankingIntent;
  },
  query: IntelligenceQuery,
): FootballResearchContext {
  const bundle = {
    ...mergeProviderResults(query, outcome.results),
    diagnostics: outcome.diagnostics,
  };

  return canonicalResearchBundleToFootballContext(bundle, {
    rankingIntent: input.rankingIntent,
    intelligenceAnalysis: input.intelligenceAnalysis,
  });
}

/** @deprecated Legacy registry fallback summary — migration only. */
export function buildRegistryFallbackExecutionSummary(
  providerId: ResearchProviderId,
  status: IntelligenceResearchResultStatus,
  context: FootballResearchContext,
): ProviderResearchExecutionSummary {
  return {
    path: "registryFallback",
    combinedStatus: status,
    combinedProviderId: providerId,
    results: [
      {
        providerId,
        status,
        factCount: context.facts.length,
        rankingCount: context.players?.length ? 1 : 0,
        fixtureCount: context.fixture ? 1 : 0,
        warningCount: context.warnings.length,
      },
    ],
  };
}
