import "server-only";

import type { FootballResearchContext } from "@/features/research/types/football-research.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import { applyAssembledResearchContext } from "@/features/research/utils/script-research-context.utils";
import { applyFifaWorldCup2026Grounding } from "@/features/research/legacy/research-grounding.legacy.utils";

import type { IntelligenceQuery } from "../planner/query-orchestrator.types";
import { executeIntelligenceQuery } from "../planner/execute-intelligence-query";
import type { ExecuteResearchPlanOutcome } from "../providers/provider-execute-research-plan.server";
import { mergeIntelligenceResearchResults } from "../providers/merge-intelligence-research-results.utils";
import type { ProviderResearchInput } from "../providers/provider-research.types";
import { shouldAcceptProviderPlanOutcome } from "../providers/provider-plan-outcome.utils";
import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";

import { assembleContextFromBundle } from "./assemble-context";
import { assembledContextToPrompt } from "./assembled-context-to-prompt";
import type { AssembledContext } from "./assembled-context.types";
import { canonicalResearchBundleToFootballContext } from "./canonical-research-bundle.adapter";
import type { CanonicalResearchBundle } from "./canonical-research.types";

export interface AssembledResearchContext {
  assembled: AssembledContext;
  body: string;
  researchApplied: boolean;
  top5RankedDataAvailable: boolean;
  /** @deprecated Legacy FootballResearchContext — migration adapter output only. */
  context: FootballResearchContext;
}

export interface CanonicalResearchExecutionResult {
  bundle: CanonicalResearchBundle;
  context: FootballResearchContext;
  contextText: string;
  assembled: AssembledResearchContext;
  planOutcome: ExecuteResearchPlanOutcome;
}

export interface ExecuteCanonicalResearchPlanOptions {
  rankingIntent?: RankingIntent;
  intelligenceAnalysis?: IntelligenceAnalysis;
  /** Entity hints and ranking overrides for provider execution context. */
  executionInput?: Pick<
    ProviderResearchInput,
    "resolvedEntities" | "entityHints" | "rankingIntent"
  >;
}

/**
 * @deprecated Prefer `executeIntelligenceQuery` from `planner/execute-intelligence-query`.
 * @deprecated test/legacy only — do not use in production path.
 *
 * Thin adapter returning legacy preview fields when plan execution yields usable payload.
 */
export async function executeCanonicalResearchPlan(
  query: IntelligenceQuery,
  options?: ExecuteCanonicalResearchPlanOptions,
): Promise<CanonicalResearchExecutionResult | null> {
  const execution = await executeIntelligenceQuery({
    topic: query.input.topic,
    selectedMode: query.input.selectedMode,
    manualNotes: query.input.manualNotes,
    enableResearch: query.input.enableResearch,
    intelligenceQuery: query,
    executionInput: options?.executionInput,
  });

  const planOutcome: ExecuteResearchPlanOutcome = {
    queryId: execution.intelligenceQuery.id,
    results: execution.providerResults,
    combined: mergeIntelligenceResearchResults(
      execution.intelligenceQuery,
      execution.providerResults,
      execution.diagnostics,
    ),
    diagnostics: execution.diagnostics,
  };

  if (!execution.canonicalResearchBundle || !shouldAcceptProviderPlanOutcome(planOutcome)) {
    return null;
  }

  const bundle = execution.canonicalResearchBundle;
  const assembledContext = assembleContextFromBundle(bundle);
  const contextText = assembledContextToPrompt(assembledContext);
  const scriptResolution = applyAssembledResearchContext({
    scriptMode: assembledContext.selectedMode,
    assembled: assembledContext,
    graphContext: execution.graphContext,
  });
  const analysis = options?.intelligenceAnalysis ?? bundle.intelligenceAnalysis;
  const legacyContext = applyFifaWorldCup2026Grounding(
    canonicalResearchBundleToFootballContext(bundle, {
      rankingIntent: options?.rankingIntent ?? options?.executionInput?.rankingIntent,
      intelligenceAnalysis: analysis,
    }),
  );

  const assembled: AssembledResearchContext = {
    assembled: assembledContext,
    body: contextText,
    researchApplied: scriptResolution.researchApplied,
    top5RankedDataAvailable: scriptResolution.top5RankedDataAvailable ?? false,
    context: {
      ...legacyContext,
      warnings: assembledContext.warnings,
    },
  };

  return {
    bundle,
    context: assembled.context,
    contextText,
    assembled,
    planOutcome,
  };
}
