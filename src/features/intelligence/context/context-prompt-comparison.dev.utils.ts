import type { AssembledContext } from "./assembled-context.types";
import { assembledContextToPrompt } from "./assembled-context-to-prompt";
import type { GraphContext } from "./graph-context.types";
import { graphContextToPromptText } from "./graph-context-to-prompt";
import {
  formatScriptPromptSourceForDev,
  resolveResearchPromptText,
  type ScriptPromptSource,
} from "./resolve-research-prompt-text";

export type ContextPromptRankingPreservation = "pass" | "partial" | "fail" | "n/a";

export type ContextPromptRecommendedSource = "assembled" | "graph";

/** Dev-only comparison between assembled and graph prompt builders. */
export interface ContextPromptComparisonDevResult {
  assembledPromptLength: number;
  graphPromptLength: number;
  rankingPreservation: ContextPromptRankingPreservation;
  rankingDetails: string;
  primaryEntitiesPresent: boolean;
  primaryEntityLabels: string[];
  warningsPresent: boolean;
  warningCount: number;
  missingCriticalFacts: string[];
  recommendedPromptSource: ContextPromptRecommendedSource;
  recommendationReason: string;
  productionPromptSource: ScriptPromptSource;
  productionPromptSourceLabel: string;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function extractRankingLabelsFromAssembled(assembled: AssembledContext): string[] {
  return assembled.rankings.flatMap((ranking) =>
    [...ranking.entries]
      .sort((left, right) => left.rank - right.rank)
      .map((entry) => entry.label.trim())
      .filter(Boolean),
  );
}

function extractRankingLabelsFromGraph(graphContext: GraphContext): string[] {
  return graphContext.rankedFacts
    .map((fact) => {
      const match = fact.text.match(/^#\d+\s+([^:]+?)(?::|\s|$)/);
      return (match?.[1] ?? fact.text).trim();
    })
    .filter(Boolean);
}

function labelsAppearInOrder(labels: string[], promptText: string): boolean {
  if (labels.length === 0) {
    return true;
  }

  let searchFrom = 0;
  const haystack = promptText.toLowerCase();

  for (const label of labels) {
    const index = haystack.indexOf(label.toLowerCase(), searchFrom);
    if (index < 0) {
      return false;
    }
    searchFrom = index + label.length;
  }

  return true;
}

function evaluateRankingPreservation(input: {
  assembled: AssembledContext;
  graphContext: GraphContext;
  assembledPrompt: string;
  graphPrompt: string;
}): { status: ContextPromptRankingPreservation; details: string } {
  const expectedLabels = extractRankingLabelsFromAssembled(input.assembled);
  if (expectedLabels.length === 0) {
    return { status: "n/a", details: "No ranking entries in assembled context." };
  }

  const graphLabels = extractRankingLabelsFromGraph(input.graphContext);
  const assembledOrdered = labelsAppearInOrder(expectedLabels, input.assembledPrompt);
  const graphOrdered = labelsAppearInOrder(
    graphLabels.length > 0 ? graphLabels : expectedLabels,
    input.graphPrompt,
  );

  const graphCoverage = expectedLabels.filter((label) =>
    input.graphPrompt.toLowerCase().includes(label.toLowerCase()),
  ).length;

  if (assembledOrdered && graphOrdered && graphCoverage === expectedLabels.length) {
    return {
      status: "pass",
      details: `All ${expectedLabels.length} ranking entries preserved in graph prompt order.`,
    };
  }

  if (graphCoverage === 0) {
    return {
      status: "fail",
      details: `Graph prompt missing all ${expectedLabels.length} ranking entries.`,
    };
  }

  return {
    status: "partial",
    details: `Graph prompt covers ${graphCoverage}/${expectedLabels.length} ranking entries${graphOrdered ? "" : " with order drift"}.`,
  };
}

function collectPrimaryEntityLabels(graphContext: GraphContext): string[] {
  const labels = new Set<string>();
  for (const entity of graphContext.primaryEntities) {
    if (entity.label.trim()) {
      labels.add(entity.label.trim());
    }
  }
  for (const summary of graphContext.entitySummaries) {
    if (summary.label.trim()) {
      labels.add(summary.label.trim());
    }
  }
  return [...labels];
}

function collectCriticalFactTexts(assembled: AssembledContext): string[] {
  const facts: string[] = [];

  for (const ranking of assembled.rankings) {
    for (const entry of ranking.entries) {
      const valueText = entry.value != null ? `${entry.label}: ${entry.value}` : entry.label;
      facts.push(valueText);
      facts.push(entry.label);
    }
  }

  for (const fact of assembled.verifiedFacts) {
    if (fact.text.trim()) {
      facts.push(fact.text.trim());
    }
  }

  for (const fixture of assembled.fixtures) {
    facts.push(`${fixture.homeTeam} vs ${fixture.awayTeam}`);
  }

  return [...new Set(facts.filter(Boolean))];
}

function findMissingCriticalFacts(input: {
  assembled: AssembledContext;
  graphPrompt: string;
}): string[] {
  const graphHaystack = input.graphPrompt.toLowerCase();
  return collectCriticalFactTexts(input.assembled).filter((fact) => {
    const normalized = normalizeText(fact);
    if (normalized.length < 3) {
      return false;
    }
    return !graphHaystack.includes(normalized);
  });
}

function recommendPromptSource(input: {
  assembled: AssembledContext;
  graphContext: GraphContext;
  assembledPromptLength: number;
  graphPromptLength: number;
  rankingPreservation: ContextPromptRankingPreservation;
  missingCriticalFacts: string[];
  primaryEntitiesPresent: boolean;
}): { source: ContextPromptRecommendedSource; reason: string } {
  if (input.graphPromptLength === 0) {
    return {
      source: "assembled",
      reason: "Graph prompt is empty — keep assembled as production source.",
    };
  }

  if (input.missingCriticalFacts.length > 0) {
    return {
      source: "assembled",
      reason: `Graph prompt is missing ${input.missingCriticalFacts.length} critical fact(s) from assembled context.`,
    };
  }

  if (
    input.assembled.selectedMode === "top_5" &&
    input.rankingPreservation === "fail"
  ) {
    return {
      source: "assembled",
      reason: "Top 5 ranking preservation failed in graph prompt.",
    };
  }

  if (
    input.assembled.selectedMode === "player_analysis" &&
    input.primaryEntitiesPresent &&
    input.graphPromptLength >= input.assembledPromptLength
  ) {
    return {
      source: "graph",
      reason: "Graph prompt includes primary entity coverage with equal or richer context.",
    };
  }

  if (
    input.rankingPreservation === "pass" &&
    input.graphPromptLength >= Math.max(120, Math.floor(input.assembledPromptLength * 0.85))
  ) {
    return {
      source: "graph",
      reason: "Graph prompt preserves rankings and matches assembled coverage.",
    };
  }

  if (
    (input.assembled.selectedMode === "match_preview" ||
      input.assembled.selectedMode === "match_recap" ||
      input.assembled.selectedMode === "tactical_review") &&
    input.graphContext.fixtureFacts.length + input.graphContext.statisticFacts.length >
      0 &&
    input.missingCriticalFacts.length === 0
  ) {
    return {
      source: "graph",
      reason: "Graph prompt includes structured fixture/stat/event sections for match modes.",
    };
  }

  return {
    source: "assembled",
    reason: "Assembled prompt remains the safer production source for this query.",
  };
}

/**
 * Compares assembled vs graph prompt builders for dev diagnostics only.
 * Production script generation uses GraphContext first with assembled fallback.
 */
export function compareContextPromptsForDev(input: {
  assembledContext: AssembledContext;
  graphContext: GraphContext;
}): ContextPromptComparisonDevResult {
  const assembledPrompt = assembledContextToPrompt(input.assembledContext);
  const graphPrompt = graphContextToPromptText(input.graphContext);
  const productionResolution = resolveResearchPromptText({
    assembled: input.assembledContext,
    graphContext: input.graphContext,
  });

  const ranking = evaluateRankingPreservation({
    assembled: input.assembledContext,
    graphContext: input.graphContext,
    assembledPrompt,
    graphPrompt,
  });

  const primaryEntityLabels = collectPrimaryEntityLabels(input.graphContext);
  const warnings = [
    ...new Set([
      ...input.assembledContext.warnings,
      ...input.graphContext.warnings,
    ].filter(Boolean)),
  ];
  const missingCriticalFacts = findMissingCriticalFacts({
    assembled: input.assembledContext,
    graphPrompt,
  });

  const recommendation = recommendPromptSource({
    assembled: input.assembledContext,
    graphContext: input.graphContext,
    assembledPromptLength: assembledPrompt.length,
    graphPromptLength: graphPrompt.length,
    rankingPreservation: ranking.status,
    missingCriticalFacts,
    primaryEntitiesPresent: primaryEntityLabels.length > 0,
  });

  return {
    assembledPromptLength: assembledPrompt.length,
    graphPromptLength: graphPrompt.length,
    rankingPreservation: ranking.status,
    rankingDetails: ranking.details,
    primaryEntitiesPresent: primaryEntityLabels.length > 0,
    primaryEntityLabels,
    warningsPresent: warnings.length > 0,
    warningCount: warnings.length,
    missingCriticalFacts: missingCriticalFacts.slice(0, 8),
    recommendedPromptSource: recommendation.source,
    recommendationReason: recommendation.reason,
    productionPromptSource: productionResolution.promptSource,
    productionPromptSourceLabel: formatScriptPromptSourceForDev(
      productionResolution.promptSource,
    ),
  };
}

export function formatContextPromptComparisonForDev(
  comparison?: ContextPromptComparisonDevResult,
): string {
  if (!comparison) {
    return "No context prompt comparison yet.";
  }

  return JSON.stringify(
    {
      currentPromptLength: comparison.assembledPromptLength,
      graphPromptLength: comparison.graphPromptLength,
      rankingPreservation: comparison.rankingPreservation,
      rankingDetails: comparison.rankingDetails,
      primaryEntitiesPresent: comparison.primaryEntitiesPresent,
      primaryEntityLabels: comparison.primaryEntityLabels,
      warningsPresent: comparison.warningsPresent,
      warningCount: comparison.warningCount,
      missingCriticalFacts: comparison.missingCriticalFacts,
      recommendedPromptSource: comparison.recommendedPromptSource,
      recommendationReason: comparison.recommendationReason,
      promptSource: comparison.productionPromptSourceLabel,
      productionPromptSource: comparison.productionPromptSource,
    },
    null,
    2,
  );
}
