import type { GraphContext, GraphContextFact } from "../context/graph-context.types";
import { graphContextToPromptText } from "../context/graph-context-to-prompt";
import type { ScriptPromptSource } from "../context/resolve-research-prompt-text";

import { buildPromptIntelligence } from "./build-prompt-intelligence";
import { promptIntelligenceToPromptText } from "./prompt-intelligence-to-prompt";

export type PromptIntelligenceRankingPreservation = "pass" | "partial" | "fail" | "n/a";

export type PromptIntelligenceRecommendedSource = "graph" | "prompt-intelligence";

export interface PromptIntelligenceBeatSummary {
  id: string;
  label: string;
  targetWordCount: number;
  requiredFactCount: number;
}

/** Dev-only comparison between graph and Prompt Intelligence prompt builders. */
export interface PromptIntelligenceComparisonDevResult {
  graphPromptLength: number;
  promptIntelligencePromptLength: number;
  narrativeBeats: PromptIntelligenceBeatSummary[];
  requiredFactsTotal: number;
  requiredFactsCoveredGraph: number;
  requiredFactsCoveredPromptIntelligence: number;
  rankingsPreservedGraph: PromptIntelligenceRankingPreservation;
  rankingsPreservedPromptIntelligence: PromptIntelligenceRankingPreservation;
  rankingDetailsGraph: string;
  rankingDetailsPromptIntelligence: string;
  forbiddenClaimsTotal: number;
  forbiddenClaimsIncludedGraph: number;
  forbiddenClaimsIncludedPromptIntelligence: number;
  recommendedPromptSource: PromptIntelligenceRecommendedSource;
  recommendationReason: string;
  productionPromptSource: ScriptPromptSource;
  productionPromptSourceLabel: string;
}

function indexGraphFacts(context: GraphContext): Map<string, GraphContextFact> {
  const index = new Map<string, GraphContextFact>();

  for (const collection of [
    context.rankedFacts,
    context.verifiedFacts,
    context.statisticFacts,
    context.timelineFacts,
    context.fixtureFacts,
  ]) {
    for (const fact of collection) {
      index.set(fact.id, fact);
    }
  }

  return index;
}

function extractRankingLabels(context: GraphContext): string[] {
  return [...context.rankedFacts]
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
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

function evaluateRankingPreservation(
  context: GraphContext,
  promptText: string,
): { status: PromptIntelligenceRankingPreservation; details: string } {
  const expectedLabels = extractRankingLabels(context);

  if (expectedLabels.length === 0) {
    return { status: "n/a", details: "No ranked facts in graph context." };
  }

  const coverage = expectedLabels.filter((label) =>
    promptText.toLowerCase().includes(label.toLowerCase()),
  ).length;
  const ordered = labelsAppearInOrder(expectedLabels, promptText);

  if (coverage === expectedLabels.length && ordered) {
    return {
      status: "pass",
      details: `All ${expectedLabels.length} ranking entries present in order.`,
    };
  }

  if (coverage === 0) {
    return {
      status: "fail",
      details: `Missing all ${expectedLabels.length} ranking entries.`,
    };
  }

  return {
    status: "partial",
    details: `Covers ${coverage}/${expectedLabels.length} ranking entries${ordered ? "" : " with order drift"}.`,
  };
}

function resolveRequiredFactTexts(
  context: GraphContext,
  requiredFactIds: string[],
): string[] {
  const index = indexGraphFacts(context);

  return requiredFactIds
    .map((factId) => index.get(factId)?.text.trim())
    .filter((text): text is string => Boolean(text));
}

function countTextsCovered(promptText: string, texts: string[]): number {
  if (texts.length === 0) {
    return 0;
  }

  const haystack = promptText.toLowerCase();

  return texts.filter((text) => {
    const normalized = text.trim().toLowerCase();
    return normalized.length >= 3 && haystack.includes(normalized);
  }).length;
}

function countClaimsIncluded(promptText: string, claims: string[]): number {
  if (claims.length === 0) {
    return 0;
  }

  const haystack = promptText.toLowerCase();

  return claims.filter((claim) => {
    const normalized = claim.trim().toLowerCase();
    if (normalized.length < 8) {
      return haystack.includes(normalized);
    }

    const snippet = normalized.slice(0, Math.min(48, normalized.length));
    return haystack.includes(snippet);
  }).length;
}

function recommendPromptSource(input: {
  graphContext: GraphContext;
  graphPromptLength: number;
  promptIntelligencePromptLength: number;
  requiredFactsTotal: number;
  requiredFactsCoveredGraph: number;
  requiredFactsCoveredPromptIntelligence: number;
  rankingsPreservedGraph: PromptIntelligenceRankingPreservation;
  rankingsPreservedPromptIntelligence: PromptIntelligenceRankingPreservation;
  forbiddenClaimsTotal: number;
  forbiddenClaimsIncludedGraph: number;
  forbiddenClaimsIncludedPromptIntelligence: number;
}): { source: PromptIntelligenceRecommendedSource; reason: string } {
  if (input.promptIntelligencePromptLength === 0) {
    return {
      source: "graph",
      reason: "Prompt Intelligence prompt is empty — keep graph as dev recommendation.",
    };
  }

  if (
    input.graphContext.selectedMode === "top_5" &&
    input.rankingsPreservedPromptIntelligence === "fail" &&
    input.rankingsPreservedGraph !== "fail"
  ) {
    return {
      source: "graph",
      reason: "Prompt Intelligence failed ranking preservation while graph prompt passes.",
    };
  }

  const piRequiredCoverage =
    input.requiredFactsTotal === 0
      ? 1
      : input.requiredFactsCoveredPromptIntelligence / input.requiredFactsTotal;
  const graphRequiredCoverage =
    input.requiredFactsTotal === 0
      ? 1
      : input.requiredFactsCoveredGraph / input.requiredFactsTotal;

  const piForbiddenCoverage =
    input.forbiddenClaimsTotal === 0
      ? 1
      : input.forbiddenClaimsIncludedPromptIntelligence / input.forbiddenClaimsTotal;
  const graphForbiddenCoverage =
    input.forbiddenClaimsTotal === 0
      ? 1
      : input.forbiddenClaimsIncludedGraph / input.forbiddenClaimsTotal;

  const rankingScore = (status: PromptIntelligenceRankingPreservation): number => {
    if (status === "pass") return 2;
    if (status === "partial") return 1;
    if (status === "n/a") return 1;
    return 0;
  };

  const piScore =
    piRequiredCoverage * 3 +
    piForbiddenCoverage * 2 +
    rankingScore(input.rankingsPreservedPromptIntelligence) +
    (input.promptIntelligencePromptLength <= input.graphPromptLength ? 0.5 : 0);
  const graphScore =
    graphRequiredCoverage * 3 +
    graphForbiddenCoverage * 2 +
    rankingScore(input.rankingsPreservedGraph) +
    (input.graphPromptLength <= input.promptIntelligencePromptLength ? 0.5 : 0);

  if (
    piScore > graphScore &&
    piRequiredCoverage >= graphRequiredCoverage &&
    piForbiddenCoverage >= graphForbiddenCoverage &&
    rankingScore(input.rankingsPreservedPromptIntelligence) >=
      rankingScore(input.rankingsPreservedGraph)
  ) {
    return {
      source: "prompt-intelligence",
      reason:
        "Prompt Intelligence covers required facts and forbidden claims with equal or better ranking preservation in a compact prompt.",
    };
  }

  if (
    input.promptIntelligencePromptLength < input.graphPromptLength * 0.9 &&
    piRequiredCoverage >= graphRequiredCoverage &&
    rankingScore(input.rankingsPreservedPromptIntelligence) >=
      rankingScore(input.rankingsPreservedGraph)
  ) {
    return {
      source: "prompt-intelligence",
      reason: "Prompt Intelligence is more compact while preserving required fact coverage.",
    };
  }

  return {
    source: "graph",
    reason: "Graph prompt remains the safer dev recommendation — production still uses graphContextToPromptText().",
  };
}

/**
 * Compares graph vs Prompt Intelligence prompt builders for dev diagnostics only.
 * Production script generation uses Prompt Intelligence via resolveResearchPromptText().
 */
export function comparePromptIntelligenceForDev(input: {
  graphContext: GraphContext;
  targetDurationSeconds?: number;
}): PromptIntelligenceComparisonDevResult {
  const graphPrompt = graphContextToPromptText(input.graphContext);
  const promptIntelligence = buildPromptIntelligence({
    graphContext: input.graphContext,
    targetDurationSeconds: input.targetDurationSeconds,
  });
  const promptIntelligencePrompt = promptIntelligenceToPromptText({
    result: promptIntelligence,
    graphContext: input.graphContext,
  });

  const requiredFactTexts = resolveRequiredFactTexts(
    input.graphContext,
    promptIntelligence.narrativePlan.requiredFacts,
  );
  const forbiddenClaims = promptIntelligence.narrativePlan.forbiddenClaims;

  const rankingGraph = evaluateRankingPreservation(input.graphContext, graphPrompt);
  const rankingPromptIntelligence = evaluateRankingPreservation(
    input.graphContext,
    promptIntelligencePrompt,
  );

  const recommendation = recommendPromptSource({
    graphContext: input.graphContext,
    graphPromptLength: graphPrompt.length,
    promptIntelligencePromptLength: promptIntelligencePrompt.length,
    requiredFactsTotal: requiredFactTexts.length,
    requiredFactsCoveredGraph: countTextsCovered(graphPrompt, requiredFactTexts),
    requiredFactsCoveredPromptIntelligence: countTextsCovered(
      promptIntelligencePrompt,
      requiredFactTexts,
    ),
    rankingsPreservedGraph: rankingGraph.status,
    rankingsPreservedPromptIntelligence: rankingPromptIntelligence.status,
    forbiddenClaimsTotal: forbiddenClaims.length,
    forbiddenClaimsIncludedGraph: countClaimsIncluded(graphPrompt, forbiddenClaims),
    forbiddenClaimsIncludedPromptIntelligence: countClaimsIncluded(
      promptIntelligencePrompt,
      forbiddenClaims,
    ),
  });

  return {
    graphPromptLength: graphPrompt.length,
    promptIntelligencePromptLength: promptIntelligencePrompt.length,
    narrativeBeats: promptIntelligence.narrativePlan.beats.map((beat) => ({
      id: beat.id,
      label: beat.label,
      targetWordCount: beat.targetWordCount,
      requiredFactCount: beat.requiredFactIds.length,
    })),
    requiredFactsTotal: requiredFactTexts.length,
    requiredFactsCoveredGraph: countTextsCovered(graphPrompt, requiredFactTexts),
    requiredFactsCoveredPromptIntelligence: countTextsCovered(
      promptIntelligencePrompt,
      requiredFactTexts,
    ),
    rankingsPreservedGraph: rankingGraph.status,
    rankingsPreservedPromptIntelligence: rankingPromptIntelligence.status,
    rankingDetailsGraph: rankingGraph.details,
    rankingDetailsPromptIntelligence: rankingPromptIntelligence.details,
    forbiddenClaimsTotal: forbiddenClaims.length,
    forbiddenClaimsIncludedGraph: countClaimsIncluded(graphPrompt, forbiddenClaims),
    forbiddenClaimsIncludedPromptIntelligence: countClaimsIncluded(
      promptIntelligencePrompt,
      forbiddenClaims,
    ),
    recommendedPromptSource: recommendation.source,
    recommendationReason: recommendation.reason,
    productionPromptSource: "prompt-intelligence",
    productionPromptSourceLabel: "Prompt Intelligence (production)",
  };
}

export function formatPromptIntelligenceComparisonForDev(
  comparison?: PromptIntelligenceComparisonDevResult,
): string {
  if (!comparison) {
    return "No Prompt Intelligence comparison yet.";
  }

  return JSON.stringify(
    {
      sourceLengths: {
        graphContextToPromptText: comparison.graphPromptLength,
        promptIntelligenceToPromptText: comparison.promptIntelligencePromptLength,
        delta: comparison.promptIntelligencePromptLength - comparison.graphPromptLength,
      },
      narrativeBeats: comparison.narrativeBeats,
      requiredFactsCovered: {
        total: comparison.requiredFactsTotal,
        graph: comparison.requiredFactsCoveredGraph,
        promptIntelligence: comparison.requiredFactsCoveredPromptIntelligence,
      },
      rankingsPreserved: {
        graph: comparison.rankingsPreservedGraph,
        promptIntelligence: comparison.rankingsPreservedPromptIntelligence,
        graphDetails: comparison.rankingDetailsGraph,
        promptIntelligenceDetails: comparison.rankingDetailsPromptIntelligence,
      },
      forbiddenClaimsIncluded: {
        total: comparison.forbiddenClaimsTotal,
        graph: comparison.forbiddenClaimsIncludedGraph,
        promptIntelligence: comparison.forbiddenClaimsIncludedPromptIntelligence,
      },
      recommendation: comparison.recommendedPromptSource,
      recommendationReason: comparison.recommendationReason,
      productionPromptSource: comparison.productionPromptSourceLabel,
    },
    null,
    2,
  );
}
