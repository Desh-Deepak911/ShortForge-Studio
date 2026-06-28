import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import { getCompetitionLabel } from "@/features/research/utils/competition-resolver.utils";
import { resolveResearchRankingIntent } from "@/features/research/utils/intelligence-analysis-research.utils";

import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";
import { researchResultToFootballContext } from "../providers/legacy/football-research-to-result.legacy.utils";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "../providers/provider-result.types";
import type { ResearchProviderId } from "../providers/provider.types";

import type { CanonicalResearchBundle } from "./canonical-research.types";

function mergeResultStatus(
  results: IntelligenceResearchResult[],
): IntelligenceResearchResultStatus {
  if (results.some((result) => result.status === "success")) {
    return results.some((result) => result.status === "partial") ? "partial" : "success";
  }

  if (results.some((result) => result.status === "partial")) {
    return "partial";
  }

  if (results.every((result) => result.status === "unsupported")) {
    return "unsupported";
  }

  return "failed";
}

function resolvePrimaryProviderResult(
  bundle: CanonicalResearchBundle,
): IntelligenceResearchResult | undefined {
  return (
    bundle.providerResults.find((result) => result.status === "success") ??
    bundle.providerResults.find((result) => result.status === "partial") ??
    bundle.providerResults[0]
  );
}

function mapRankingPlayers(
  bundle: CanonicalResearchBundle,
  providerId: ResearchProviderId,
): FootballResearchContext["players"] {
  const primaryRanking = bundle.rankings[0];
  if (!primaryRanking) {
    return undefined;
  }

  return primaryRanking.entries.map((entry, index) => {
    const entity = bundle.mergedEntities.find((candidate) => candidate.label === entry.label);
    const nationality =
      typeof entity?.metadata?.nationality === "string"
        ? entity.metadata.nationality
        : undefined;

    return {
      id: typeof entry.entityId === "number" ? entry.entityId : index + 1,
      name: entry.label,
      goals: entry.value ?? null,
      assists: null,
      ...(nationality ? { nationality } : {}),
      ...(providerId === "static-fallback" ? { league: "FIFA World Cup" } : {}),
    };
  });
}

function bundleToCombinedResult(bundle: CanonicalResearchBundle): IntelligenceResearchResult {
  const primary = resolvePrimaryProviderResult(bundle);

  return createIntelligenceResearchResult({
    queryId: bundle.query.id,
    providerId: primary?.providerId ?? "fallback",
    status: mergeResultStatus(bundle.providerResults),
    facts: bundle.mergedFacts,
    entities: bundle.mergedEntities,
    rankings: bundle.rankings,
    fixtures: bundle.fixtures,
    statistics: bundle.statistics,
    events: bundle.events,
    lineups: bundle.lineups,
    warnings: bundle.warnings,
    confidence: bundle.confidence,
    provenance: bundle.provenance,
    diagnostics: bundle.diagnostics,
  });
}

/**
 * Adapts a canonical research bundle to legacy `FootballResearchContext` for
 * Research Preview display and script-generation compatibility.
 */
export function canonicalResearchBundleToFootballContext(
  bundle: CanonicalResearchBundle,
  input?: {
    rankingIntent?: RankingIntent;
    intelligenceAnalysis?: IntelligenceAnalysis;
  },
): FootballResearchContext {
  const combined = bundleToCombinedResult(bundle);
  const context = researchResultToFootballContext(combined, {
    mode: bundle.query.input.selectedMode,
    topic: bundle.query.input.topic,
  });

  const rankedPlayers = mapRankingPlayers(bundle, combined.providerId);
  if (rankedPlayers?.length) {
    context.players = rankedPlayers;
  }

  const rankingIntent =
    input?.rankingIntent ??
    resolveResearchRankingIntent({
      topic: bundle.query.input.topic,
      mode: bundle.query.input.selectedMode,
      intelligenceAnalysis: input?.intelligenceAnalysis ?? bundle.intelligenceAnalysis,
    });

  if (rankingIntent && rankedPlayers?.length) {
    context.rankingIntent = rankingIntent;
    if (context.summary.startsWith("Research brief:")) {
      const competitionLabel = getCompetitionLabel(rankingIntent.competition);
      const timeLabel =
        rankingIntent.timeScope === "all_time"
          ? "all-time"
          : rankingIntent.season != null
            ? String(rankingIntent.season)
            : "season";
      context.summary = `Top ${rankedPlayers.length} goal scorers — ${competitionLabel} (${timeLabel})`;
    }
  }

  if (bundle.warnings.length) {
    context.warnings = [...new Set([...context.warnings, ...bundle.warnings])];
  }

  return context;
}
