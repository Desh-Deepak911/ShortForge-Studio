import type {
  FootballResearchEvent,
  FootballResearchFixture,
  FootballResearchLineup,
  FootballResearchStatistic,
} from "@/features/research/types/football-research.types";

import type { IntelligenceQuery } from "../planner/query-orchestrator.types";
import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";
import type {
  IntelligenceResearchRanking,
  IntelligenceResearchResult,
  ResearchResultProvenance,
} from "../providers/provider-result.types";
import type { ConfidenceScore } from "../shared/confidence.types";
import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceFact } from "../shared/knowledge.types";

/**
 * Query-level research bundle bridging provider execution output to future
 * knowledge-graph and context-assembly stages.
 *
 * Holds the orchestrated query, analysis snapshot, per-provider results, and
 * merged research payload derived from those results.
 */
export interface CanonicalResearchBundle {
  query: IntelligenceQuery;
  intelligenceAnalysis: IntelligenceAnalysis;
  providerResults: IntelligenceResearchResult[];
  mergedFacts: IntelligenceFact[];
  mergedEntities: IntelligenceEntity[];
  rankings: IntelligenceResearchRanking[];
  fixtures: FootballResearchFixture[];
  statistics: FootballResearchStatistic[];
  events: FootballResearchEvent[];
  lineups: FootballResearchLineup[];
  warnings: string[];
  confidence: ConfidenceScore;
  provenance: ResearchResultProvenance;
  diagnostics: ProviderDiagnosticEntry[];
}
