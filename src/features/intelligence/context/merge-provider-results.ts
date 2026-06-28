import type { IntelligenceQuery } from "../planner/query-orchestrator.types";
import { applyProviderEnrichmentToOwners } from "../entities/entity-ownership.utils";
import { mergeIntelligenceResearchResults } from "../providers/merge-intelligence-research-results.utils";
import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";
import type {
  IntelligenceResearchResult,
  IntelligenceResearchResultStatus,
} from "../providers/provider-result.types";
import {
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type ConfidenceScore,
} from "../shared/confidence.types";
import { intelligenceQueryToAnalysis } from "../shared/intelligence-analysis.utils";
import type { IntelligenceFact } from "../shared/knowledge.types";

import type { CanonicalResearchBundle } from "./canonical-research.types";

function confidenceTierFromPercent(percent: number): ConfidenceScore["tier"] {
  if (percent >= DEFAULT_CONFIDENCE_THRESHOLDS.highMinPercent) {
    return "high";
  }

  if (percent >= DEFAULT_CONFIDENCE_THRESHOLDS.mediumMinPercent) {
    return "medium";
  }

  return "low";
}

const RESEARCH_STATUS_PERCENT: Record<IntelligenceResearchResultStatus, number> = {
  success: 92,
  partial: 74,
  unsupported: 35,
  failed: 20,
};

function computeMergedConfidence(
  query: IntelligenceQuery,
  providerResults: IntelligenceResearchResult[],
  mergedFacts: IntelligenceFact[],
): ConfidenceScore {
  if (providerResults.length === 0) {
    return {
      ...query.confidence,
      reasoning: [
        query.confidence.reasoning,
        "No provider results were merged.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const researchPercents = providerResults.map((result) => {
    const statusPercent = RESEARCH_STATUS_PERCENT[result.status];
    if (result.confidence?.percent != null) {
      return Math.round((statusPercent + result.confidence.percent) / 2);
    }

    return statusPercent;
  });

  const diagnosticPercents = providerResults.flatMap(
    (result) => result.diagnostics?.map((entry) => entry.confidence) ?? [],
  );

  const averagedResearch = Math.round(
    (researchPercents.reduce((sum, value) => sum + value, 0) +
      diagnosticPercents.reduce((sum, value) => sum + value, 0)) /
      Math.max(researchPercents.length + diagnosticPercents.length, 1),
  );

  const factBoost =
    mergedFacts.length > 0 ? Math.min(8, mergedFacts.length * 2) : 0;
  const researchPercent = Math.min(100, averagedResearch + factBoost);
  const percent = Math.round((query.confidence.percent + researchPercent) / 2);

  return {
    tier: confidenceTierFromPercent(percent),
    percent,
    reasoning: `Blended query confidence (${query.confidence.percent}%) with merged research (${researchPercent}% across ${providerResults.length} provider result(s), ${mergedFacts.length} structured fact(s)).`,
  };
}

function collectProviderDiagnostics(
  providerResults: IntelligenceResearchResult[],
): ProviderDiagnosticEntry[] {
  const diagnostics: ProviderDiagnosticEntry[] = [];

  for (const result of providerResults) {
    if (result.diagnostics?.length) {
      diagnostics.push(...result.diagnostics);
    }
  }

  return diagnostics;
}

/**
 * Merges per-provider research results into a canonical bundle for downstream
 * graph and context assembly. Keeps structured facts, entities, and provenance —
 * manual notes remain on `query.input.manualNotes` only.
 */
export function mergeProviderResults(
  query: IntelligenceQuery,
  providerResults: IntelligenceResearchResult[],
): CanonicalResearchBundle {
  const diagnostics = collectProviderDiagnostics(providerResults);
  const combined = mergeIntelligenceResearchResults(
    query,
    providerResults,
    diagnostics,
  );
  const mergedFacts = combined.facts;
  const mergedEntities = applyProviderEnrichmentToOwners(
    query.entities,
    combined.entities,
  );

  return {
    query,
    intelligenceAnalysis: intelligenceQueryToAnalysis(query),
    providerResults: [...providerResults],
    mergedFacts,
    mergedEntities,
    rankings: combined.rankings,
    fixtures: combined.fixtures,
    statistics: combined.statistics,
    events: combined.events,
    lineups: combined.lineups,
    warnings: combined.warnings,
    confidence: computeMergedConfidence(query, providerResults, mergedFacts),
    provenance: combined.provenance,
    diagnostics,
  };
}
