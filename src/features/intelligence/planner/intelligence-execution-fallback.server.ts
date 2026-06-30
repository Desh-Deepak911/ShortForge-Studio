import "server-only";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { IntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator.types";
import type {
  FootballResearchContext,
  FootballResearchMode,
} from "@/features/research/types/football-research.types";
import type { ScriptMode } from "@/types/footiebitz";

export function buildEmptyAssembledContext(input: {
  topic: string;
  mode: FootballResearchMode;
  manualContext?: string;
  warnings: string[];
  queryId?: string;
}): AssembledContext {
  return {
    queryId: input.queryId ?? "unavailable",
    topic: input.topic,
    selectedMode: input.mode,
    intent: {
      intent: "story",
      confidence: "low",
      confidencePercent: 0,
      confidenceScore: 0,
      matchedPatterns: [],
      reasoning: "Research unavailable.",
      topic: {
        competitionWords: [],
        rankingWords: [],
        playerKeywords: [],
        matchKeywords: [],
        predictionKeywords: [],
        historyKeywords: [],
        comparisonKeywords: [],
        normalizedText: input.topic,
      },
    },
    entities: [],
    verifiedFacts: [],
    rankings: [],
    fixtures: [],
    statistics: [],
    events: [],
    lineups: [],
    warnings: input.warnings,
    confidence: {
      tier: "low",
      percent: 0,
      reasoning: "Research unavailable.",
    },
    provenance: { source: "inferred" },
    promptSections: [],
    diagnostics: [],
    ...(input.manualContext ? { manualNotes: input.manualContext } : {}),
  };
}

export function buildFailedIntelligenceQuery(input: {
  id: string;
  topic: string;
  selectedMode: ScriptMode;
  manualContext?: string;
  warnings: string[];
  reason: string;
}): IntelligenceQuery {
  return {
    id: input.id,
    input: {
      topic: input.topic,
      selectedMode: input.selectedMode,
      enableResearch: true,
      manualNotes: input.manualContext,
    },
    intent: buildEmptyAssembledContext({
      topic: input.topic,
      mode: input.selectedMode,
      manualContext: input.manualContext,
      warnings: [],
      queryId: input.id,
    }).intent,
    entities: [],
    warnings: input.warnings,
    confidence: {
      tier: "low",
      percent: 0,
      reasoning: input.reason,
    },
    researchPlan: {
      requiredProviders: [],
      requiredCalls: [],
      reason: input.reason,
      canProceed: false,
      missingInputs: [],
      fallbackStrategy: "manual_only",
    },
    diagnostics: { orchestratedAt: new Date().toISOString(), events: [] },
  };
}

/** @deprecated Legacy FootballResearchContext adapter — fallback consumers only. */
export function buildFallbackFootballResearchContext(input: {
  topic: string;
  mode: FootballResearchMode;
  manualContext?: string;
  warnings: string[];
}): FootballResearchContext {
  const manualFacts = input.manualContext?.trim()
    ? input.manualContext
        .trim()
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];

  return {
    mode: input.mode,
    topic: input.topic,
    summary: `Research brief: ${input.topic}`,
    facts: manualFacts,
    warnings: input.warnings,
    source: manualFacts.length > 0 ? "manual" : "fallback",
  };
}

export interface CautiousIntelligenceExecutionFailure {
  intelligenceQuery: IntelligenceQuery;
  assembledContext: AssembledContext;
}

/** Internal failure payload when provider execution throws — manual notes + error only. */
export function buildCautiousIntelligenceExecutionFailure(input: {
  topic: string;
  mode: FootballResearchMode;
  selectedMode: ScriptMode;
  manualContext?: string;
  error: unknown;
}): CautiousIntelligenceExecutionFailure {
  const executionMessage =
    input.error instanceof Error ? input.error.message : "Intelligence execution failed.";
  const warnings = [executionMessage];

  const assembledContext = buildEmptyAssembledContext({
    topic: input.topic,
    mode: input.mode,
    manualContext: input.manualContext,
    warnings,
    queryId: "failed",
  });

  const intelligenceQuery = buildFailedIntelligenceQuery({
    id: "failed",
    topic: input.topic,
    selectedMode: input.selectedMode,
    manualContext: input.manualContext,
    warnings,
    reason: executionMessage,
  });

  return {
    intelligenceQuery,
    assembledContext,
  };
}
