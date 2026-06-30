import type { IntelligenceQuery } from "../planner/query-orchestrator.types";
import type { LegacyIntelligenceAnalysis } from "../analysis/intelligence-analysis.types";
import type { IntelligenceAnalysis } from "./intelligence-analysis.types";

/** Maps orchestrator output to the canonical intelligence analysis object. */
export function intelligenceQueryToAnalysis(query: IntelligenceQuery): IntelligenceAnalysis {
  return {
    queryId: query.id,
    topic: query.input.topic,
    selectedMode: query.input.selectedMode,
    intent: query.intent,
    entities: query.entities,
    ...(query.competition ? { competition: query.competition } : {}),
    ...(query.season != null ? { season: query.season } : {}),
    researchPlan: query.researchPlan,
    confidence: query.confidence,
    warnings: query.warnings,
    diagnostics: query.diagnostics,
  };
}

/**
 * Maps legacy slim analysis (from resolve-entities) into partial canonical fields.
 * Research plan and diagnostics are omitted — merge with orchestrator output when both exist.
 */
export function legacyIntelligenceAnalysisToPartial(
  legacy: LegacyIntelligenceAnalysis,
): Pick<
  IntelligenceAnalysis,
  "topic" | "entities" | "competition" | "season" | "warnings"
> & {
  intent: IntelligenceAnalysis["intent"];
} {
  return {
    topic: legacy.topic,
    intent: {
      intent: legacy.intent,
      ...(legacy.subIntent ? { subIntent: legacy.subIntent } : {}),
      confidence: "medium",
      confidencePercent: 0,
      confidenceScore: 0,
      matchedPatterns: [],
      reasoning: "Legacy analysis — intent confidence not available.",
      topic: {
        competitionWords: [],
        rankingWords: [],
        playerKeywords: [],
        matchKeywords: [],
        predictionKeywords: [],
        historyKeywords: [],
        comparisonKeywords: [],
        normalizedText: legacy.topic,
        ...(legacy.season != null ? { seasonYear: legacy.season } : {}),
      },
    },
    entities: legacy.entities,
    ...(legacy.competition ? { competition: legacy.competition } : {}),
    ...(legacy.season != null ? { season: legacy.season } : {}),
    warnings: legacy.warnings,
  };
}
