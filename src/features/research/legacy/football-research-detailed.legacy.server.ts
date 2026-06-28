import "server-only";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { IntelligenceAnalysis } from "@/features/intelligence/shared/intelligence-analysis.types";
import type { IntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator.types";
import { executeIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query";
import type { ApiFootballResearchInput } from "@/features/intelligence/providers/api-football-research.types";
import type { CanonicalResearchBundle } from "@/features/intelligence/context";
import { mergeIntelligenceResearchResults } from "@/features/intelligence/providers/merge-intelligence-research-results.utils";
import { buildProviderResearchExecutionSummary } from "@/features/intelligence/providers/provider-plan-outcome.utils";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";
import type { ProviderResearchExecutionSummary } from "@/features/intelligence/providers/provider-plan-outcome.utils";
import "@/features/intelligence/providers/bootstrap-providers";

export type ResearchFootballContextInput = ApiFootballResearchInput & {
  /** Canonical orchestrator query — preferred over reconstruction. */
  intelligenceQuery?: IntelligenceQuery;
  intelligenceAnalysis?: IntelligenceAnalysis;
};

export interface ResearchFootballContextResult {
  assembledContext: AssembledContext;
  /** Canonical bundle when the primary plan → merge path succeeds. */
  canonicalResearchBundle?: CanonicalResearchBundle;
  providerDiagnostics?: ProviderDiagnosticEntry[];
  providerExecutionSummary?: ProviderResearchExecutionSummary;
}

/**
 * @deprecated Legacy adapter — prefer `executeIntelligenceQuery()` directly.
 * @deprecated test/legacy only — do not use in production path.
 */
export async function researchFootballContextDetailed(
  input: ResearchFootballContextInput,
  options?: { collectProviderDiagnostics?: boolean },
): Promise<ResearchFootballContextResult> {
  const topic = input.topic.trim();
  const manualContext = input.manualContext?.trim() || undefined;

  const execution = await executeIntelligenceQuery({
    topic,
    selectedMode: input.mode,
    manualNotes: manualContext,
    enableResearch: true,
    ...(input.intelligenceQuery ? { intelligenceQuery: input.intelligenceQuery } : {}),
    executionInput: {
      ...(input.resolvedEntities ? { resolvedEntities: input.resolvedEntities } : {}),
      ...(input.entityHints ? { entityHints: input.entityHints } : {}),
    },
  });

  return {
    assembledContext: execution.assembledContext,
    canonicalResearchBundle: execution.canonicalResearchBundle,
    ...(options?.collectProviderDiagnostics
      ? {
          providerDiagnostics: execution.diagnostics,
          providerExecutionSummary: buildProviderResearchExecutionSummary(
            "executeResearchPlan",
            {
              queryId: execution.intelligenceQuery.id,
              results: execution.providerResults,
              combined: mergeIntelligenceResearchResults(
                execution.intelligenceQuery,
                execution.providerResults,
                execution.diagnostics,
              ),
              diagnostics: execution.diagnostics,
            },
          ),
        }
      : {}),
  };
}
