import { analyzeIntent, resolveSuggestedContentTypeLabel } from "@/features/intelligence";
import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type {
  EntityResolverDevDebug,
  ResearchPreviewDevSnapshot,
} from "@/features/create/types/research-preview-dev.types";
import type { ResearchPreviewState } from "@/features/create/types/research-preview.types";
import { entityPreviewConfidenceLabel } from "@/features/create/utils/entity-preview.utils";
import type { CanonicalResearchBundle } from "@/features/intelligence/context";
import { buildPromptIntelligenceDevSummary } from "@/features/intelligence/prompts/prompt-intelligence-dev.utils";
import type { GraphContextDevSnapshot } from "@/features/intelligence/graph-context";
import {
  buildGraphContext,
  buildGraphContextDevSnapshot,
  knowledgeGraphFromDevSnapshot,
} from "@/features/intelligence/graph-context";
import type { KnowledgeGraphDevSnapshot } from "@/features/intelligence/knowledge";

export function formatEntityDiagnosticsForDev(
  entityDebug?: EntityResolverDevDebug,
): string {
  if (!entityDebug) {
    return "Entity diagnostics unavailable.";
  }

  return formatDevJson({
    extractionCandidates: entityDebug.extractionCandidates,
    lookups: entityDebug.lookups,
    cacheEntryCount: entityDebug.cacheEntryCount,
  });
}

export function buildResearchPreviewDevSnapshot(input: {
  topic: string;
  context?: string;
  preview: ResearchPreviewState;
  entityPreview?: EntityPreviewDisplay;
  entityDebug?: EntityResolverDevDebug;
}): ResearchPreviewDevSnapshot {
  const assembled = input.preview.assembledContext;
  const intelligenceAnalysis = input.preview.intelligenceAnalysis;
  const intelligenceQuery = input.preview.intelligenceQuery;
  const intent =
    assembled?.intent ??
    intelligenceAnalysis?.intent ??
    intelligenceQuery?.intent ??
    analyzeIntent({
      topic: input.topic,
      context: input.context,
    });

  const entityDebug = input.entityDebug;

  const researchConfidence = assembled
    ? `${assembled.confidence.tier} (${assembled.confidence.percent}%)`
    : input.entityPreview
      ? entityPreviewConfidenceLabel(input.entityPreview.overallConfidence)
      : undefined;

  const graphContext =
    input.preview.graphContext ??
    buildGraphContextDevSnapshot({
      assembledContext: assembled,
      knowledgeGraph: input.preview.knowledgeGraph,
    });

  const resolvedGraphContext =
    assembled && input.preview.knowledgeGraph
      ? buildGraphContext(
          knowledgeGraphFromDevSnapshot(input.preview.knowledgeGraph),
          assembled,
        )
      : undefined;

  const promptIntelligenceSummary =
    resolvedGraphContext && assembled
      ? buildPromptIntelligenceDevSummary({
          graphContext: resolvedGraphContext,
          assembledContext: assembled,
        })
      : undefined;

  return {
    intent,
    entityDebug,
    researchCalls: input.preview.devCalls ?? [],
    providerDiagnostics: input.preview.providerDiagnostics,
    providerExecutionSummary: input.preview.providerExecutionSummary,
    canonicalResearchBundle: input.preview.canonicalResearchBundle,
    assembledContext: assembled,
    intelligenceQuery,
    providerResults: input.preview.providerResults,
    executionStatus: input.preview.executionStatus,
    knowledgeGraph: input.preview.knowledgeGraph,
    graphContext,
    promptIntelligenceSummary,
    researchSource: assembled ? assembled.provenance.source : undefined,
    researchConfidence,
    ...(intelligenceAnalysis
      ? {
          orchestratorDiagnostics: intelligenceAnalysis.diagnostics,
          researchPlan: intelligenceAnalysis.researchPlan,
          orchestratorConfidence: `${intelligenceAnalysis.confidence.tier} (${intelligenceAnalysis.confidence.percent}%)`,
        }
      : intelligenceQuery
        ? {
            orchestratorDiagnostics: intelligenceQuery.diagnostics,
            researchPlan: intelligenceQuery.researchPlan,
            orchestratorConfidence: `${intelligenceQuery.confidence.tier} (${intelligenceQuery.confidence.percent}%)`,
          }
        : assembled
          ? {
              orchestratorConfidence: `${assembled.confidence.tier} (${assembled.confidence.percent}%)`,
            }
          : {}),
  };
}

export function formatDevJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatAssembledContextForDev(
  assembled?: ResearchPreviewDevSnapshot["assembledContext"],
): string {
  if (!assembled) {
    return "No assembled context yet.";
  }

  return formatDevJson({
    queryId: assembled.queryId,
    topic: assembled.topic,
    selectedMode: assembled.selectedMode,
    intent: assembled.intent.intent,
    entityCount: assembled.entities.length,
    entities: assembled.entities.map((entity) => ({
      kind: entity.kind,
      label: entity.label,
    })),
    competition: assembled.competition?.label ?? null,
    season: assembled.season ?? null,
    verifiedFactCount: assembled.verifiedFacts.length,
    rankingCount: assembled.rankings.length,
    warningCount: assembled.warnings.length,
    confidence: assembled.confidence,
    provenance: assembled.provenance,
    executionStatus: undefined,
  });
}

export function formatIntelligenceQueryForDev(
  query?: ResearchPreviewDevSnapshot["intelligenceQuery"],
): string {
  if (!query) {
    return "No intelligence query yet.";
  }

  return formatDevJson({
    id: query.id,
    input: query.input,
    intent: query.intent.intent,
    entityCount: query.entities.length,
    competition: query.competition?.label ?? null,
    season: query.season ?? null,
    researchPlan: query.researchPlan,
    confidence: query.confidence,
    warnings: query.warnings,
    diagnostics: query.diagnostics,
  });
}

export function formatProviderResultsListForDev(
  results?: ResearchPreviewDevSnapshot["providerResults"],
): string {
  if (!results?.length) {
    return "No provider results yet.";
  }

  return formatDevJson(
    results.map((result) => ({
      providerId: result.providerId,
      status: result.status,
      factCount: result.facts.length,
      entityCount: result.entities.length,
      rankingCount: result.rankings.length,
      fixtureCount: result.fixtures.length,
      warningCount: result.warnings.length,
      provenance: result.provenance,
    })),
  );
}

export function formatProviderResultsForDev(
  bundle?: CanonicalResearchBundle,
): string {
  if (!bundle) {
    return "No canonical provider results yet.";
  }

  return formatDevJson(
    bundle.providerResults.map((result) => ({
      providerId: result.providerId,
      status: result.status,
      factCount: result.facts.length,
      facts: result.facts.map((fact) => ({
        id: fact.id,
        text: fact.text,
        provenance: fact.provenance,
      })),
      entityCount: result.entities.length,
      rankingCount: result.rankings.length,
      fixtureCount: result.fixtures.length,
      warningCount: result.warnings.length,
      provenance: result.provenance,
    })),
  );
}

export function formatCanonicalResearchBundleForDev(
  bundle?: CanonicalResearchBundle,
): string {
  if (!bundle) {
    return "No merged canonical bundle yet.";
  }

  return formatDevJson({
    queryId: bundle.query.id,
    providerResultCount: bundle.providerResults.length,
    mergedFactCount: bundle.mergedFacts.length,
    mergedEntityCount: bundle.mergedEntities.length,
    rankingCount: bundle.rankings.length,
    fixtureCount: bundle.fixtures.length,
    statisticCount: bundle.statistics.length,
    eventCount: bundle.events.length,
    lineupCount: bundle.lineups.length,
    warningCount: bundle.warnings.length,
    mergedFacts: bundle.mergedFacts.map((fact) => ({
      id: fact.id,
      text: fact.text,
      provenance: fact.provenance,
    })),
    mergedEntities: bundle.mergedEntities.map((entity) => ({
      kind: entity.kind,
      label: entity.label,
    })),
    rankings: bundle.rankings,
    fixtures: bundle.fixtures,
    statistics: bundle.statistics,
    events: bundle.events,
    lineups: bundle.lineups,
    warnings: bundle.warnings,
  });
}

export function formatCanonicalProvenanceForDev(
  bundle?: CanonicalResearchBundle,
): string {
  if (!bundle) {
    return "No provenance yet.";
  }

  return formatDevJson(bundle.provenance);
}

export function formatCanonicalBundleConfidenceForDev(
  bundle?: CanonicalResearchBundle,
): string {
  if (!bundle) {
    return "—";
  }

  return `${bundle.confidence.tier} (${bundle.confidence.percent}%)`;
}

const KNOWLEDGE_GRAPH_TOP_FACTS_LIMIT = 10;

export function formatKnowledgeGraphSummaryForDev(
  graph?: KnowledgeGraphDevSnapshot,
): string {
  if (!graph) {
    return "No knowledge graph yet.";
  }

  return formatDevJson({
    queryId: graph.queryId,
    nodeCount: graph.nodeCount,
    edgeCount: graph.edgeCount,
    factCount: graph.factCount,
    warningCount: graph.warningCount,
    confidence: graph.confidence,
  });
}

export function formatKnowledgeGraphTopFactsForDev(
  graph?: KnowledgeGraphDevSnapshot,
): string {
  if (!graph) {
    return "No knowledge graph facts yet.";
  }

  if (!graph.facts.length) {
    return "No facts in knowledge graph.";
  }

  const topFacts = [...graph.facts]
    .sort((left, right) => right.confidencePercent - left.confidencePercent)
    .slice(0, KNOWLEDGE_GRAPH_TOP_FACTS_LIMIT)
    .map((fact) => ({
      id: fact.id,
      type: fact.type,
      text: fact.text,
      value: fact.value,
      unit: fact.unit,
      confidencePercent: fact.confidencePercent,
      source: fact.source,
    }));

  return formatDevJson({
    shown: topFacts.length,
    total: graph.factCount,
    facts: topFacts,
  });
}

export function formatKnowledgeGraphProvenanceForDev(
  graph?: KnowledgeGraphDevSnapshot,
): string {
  if (!graph) {
    return "No knowledge graph provenance yet.";
  }

  return formatDevJson(graph.provenance);
}

export function formatGraphContextSummaryForDev(
  context?: GraphContextDevSnapshot,
): string {
  if (!context) {
    return "No graph context yet.";
  }

  return formatDevJson({
    queryId: context.queryId,
    topic: context.topic,
    selectedMode: context.selectedMode,
    sectionCount: context.sectionCount,
    primaryEntityCount: context.primaryEntityCount,
    verifiedFactCount: context.verifiedFactCount,
    rankedFactCount: context.rankedFactCount,
    timelineFactCount: context.timelineFactCount,
    statisticFactCount: context.statisticFactCount,
    fixtureFactCount: context.fixtureFactCount,
    entitySummaryCount: context.entitySummaryCount,
    relationshipSummaryCount: context.relationshipSummaryCount,
    groundingRuleCount: context.groundingRuleCount,
    warningCount: context.warningCount,
    confidence: context.confidence,
    provenance: context.provenance,
  });
}

/** Developer View panel — primary entities, counts, grounding rules, confidence. */
export function formatGraphContextDeveloperViewForDev(
  context?: GraphContextDevSnapshot,
): string {
  if (!context) {
    return "No graph context yet.";
  }

  return formatDevJson({
    primaryEntities: context.primaryEntities,
    sectionCount: context.sectionCount,
    rankedFactsCount: context.rankedFactCount,
    verifiedFactsCount: context.verifiedFactCount,
    groundingRules: context.groundingRules,
    confidence: `${context.confidence.tier} (${context.confidence.percent}%)`,
  });
}

export function formatGraphContextFactsForDev(
  context?: GraphContextDevSnapshot,
): string {
  if (!context) {
    return "No graph context facts yet.";
  }

  return formatDevJson({
    ranked: context.topRankedFacts,
    verified: context.topVerifiedFacts,
    primaryEntities: context.primaryEntities,
  });
}

export function formatGraphContextRankingsForDev(
  context?: GraphContextDevSnapshot,
): string {
  if (!context) {
    return "No graph context rankings yet.";
  }

  if (!context.topRankedFacts.length) {
    return "No ranked facts in graph context.";
  }

  return formatDevJson(context.topRankedFacts);
}

export function summarizeIntent(intent: ResearchPreviewDevSnapshot["intent"]): string {
  const label = resolveSuggestedContentTypeLabel(intent.intent);
  const sub = intent.subIntent ? ` / ${intent.subIntent}` : "";
  return `${label}${sub} (${intent.confidencePercent}%)`;
}

export function collectResolvedIds(debug?: EntityResolverDevDebug): string[] {
  if (!debug) {
    return [];
  }

  return debug.lookups
    .filter((lookup) => lookup.resolvedId || lookup.externalId != null)
    .map((lookup) => {
      const parts = [lookup.kind, lookup.resolvedId].filter(Boolean);
      if (lookup.externalId != null) {
        parts.push(`ext:${lookup.externalId}`);
      }
      return parts.join(" · ");
    });
}
