import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";
import type { ApiFootballResearchInput } from "./api-football-research.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";

/** Unified input for registry-driven football research execution. */
export interface ProviderResearchInput extends ApiFootballResearchInput {
  intelligenceAnalysis?: IntelligenceAnalysis;
  rankingIntent?: RankingIntent;
}

/** Providers that expose deprecated fallback-only `runResearch()` adapters. */
export interface LegacyFootballResearchProvider {
  /** @deprecated Fallback-only — hot path uses registry executeResearchPlan. TODO(phase-5): remove. */
  runResearch(
    input: ProviderResearchInput,
  ): Promise<import("@/features/research/types/football-research.types").FootballResearchContext | null>
    | import("@/features/research/types/football-research.types").FootballResearchContext
    | null;
}

export function isLegacyFootballResearchProvider(
  provider: import("./provider.interface").ResearchProvider,
): provider is import("./provider.interface").ResearchProvider & LegacyFootballResearchProvider {
  /** @deprecated Legacy fallback adapter detection — registry uses executeResearchPlan. */
  return (
    "runResearch" in provider &&
    typeof (provider as LegacyFootballResearchProvider).runResearch === "function"
  );
}
