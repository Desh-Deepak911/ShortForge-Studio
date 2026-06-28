import "server-only";

import { assembleContextFromBundle, hasUsableStructuredPayload } from "../context/assemble-context";
import type { AssembledContext } from "../context/assembled-context.types";
import type { CanonicalResearchBundle } from "../context/canonical-research.types";
import { mergeProviderResults } from "../context/merge-provider-results";
import { buildKnowledgeGraphFromAssembledContext } from "../knowledge/build-knowledge-graph";
import type { KnowledgeGraph } from "../knowledge/knowledge-graph.types";
import { tryBuildGraphContext } from "../graph-context/build-graph-context";
import type { GraphContext } from "../context/graph-context.types";
import "@/features/intelligence/providers/bootstrap-providers";
import { mergeIntelligenceResearchResults } from "../providers/merge-intelligence-research-results.utils";
import type { ProviderDiagnosticEntry } from "../providers/provider-diagnostics.types";
import { providerRegistry } from "../providers/provider-registry";
import type { ProviderExecutionEnrichment } from "../providers/provider-registry";
import type { IntelligenceResearchResult } from "../providers/provider-result.types";
import { resolveFootballResearchMode } from "@/features/research/types/football-research.types";

import {
  buildCautiousIntelligenceExecutionFailure,
  buildEmptyAssembledContext,
  buildFailedIntelligenceQuery,
} from "./intelligence-execution-fallback.server";
import { buildIntelligenceQueryWithProviderRouting } from "./query-orchestrator.server";
import { buildExecutionEnrichmentFromQuery } from "./execution-enrichment.server";
import type { IntelligenceQuery, IntelligenceQueryInput } from "./query-orchestrator.types";

export type IntelligenceExecutionStatus = "success" | "partial" | "failed";

export interface ExecuteIntelligenceQueryInput extends IntelligenceQueryInput {
  /** Pre-orchestrated query — skips rebuild when provided (Research Preview handoff). */
  intelligenceQuery?: IntelligenceQuery;
  /** Entity hints and ranking overrides for provider execution. */
  executionInput?: ProviderExecutionEnrichment;
}

export interface ExecuteIntelligenceQueryResult {
  executionStatus: IntelligenceExecutionStatus;
  intelligenceQuery: IntelligenceQuery;
  providerResults: IntelligenceResearchResult[];
  canonicalResearchBundle?: CanonicalResearchBundle;
  assembledContext: AssembledContext;
  /** Built from AssembledContext — diagnostics/dev output only; prompts unchanged. */
  knowledgeGraph: KnowledgeGraph;
  /** Primary script prompt source when construction succeeds. */
  graphContext?: GraphContext;
  diagnostics: ProviderDiagnosticEntry[];
}

function hasManualNotesOnly(assembledContext: AssembledContext): boolean {
  return Boolean(assembledContext.manualNotes?.trim());
}

function resolveIntelligenceExecutionStatus(input: {
  intelligenceQuery: IntelligenceQuery;
  providerResults: IntelligenceResearchResult[];
  canonicalResearchBundle: CanonicalResearchBundle;
  assembledContext: AssembledContext;
  diagnostics: ProviderDiagnosticEntry[];
}): IntelligenceExecutionStatus {
  const combined = mergeIntelligenceResearchResults(
    input.intelligenceQuery,
    input.providerResults,
    input.diagnostics,
  );
  const hasStructuredPayload = hasUsableStructuredPayload(input.canonicalResearchBundle);

  if (combined.status === "success" && hasStructuredPayload) {
    return "success";
  }

  if (
    combined.status === "partial" ||
    hasStructuredPayload ||
    hasManualNotesOnly(input.assembledContext)
  ) {
    return "partial";
  }

  return "failed";
}

function buildValidationFailureResult(input: {
  topic: string;
  selectedMode: ExecuteIntelligenceQueryInput["selectedMode"];
  manualNotes?: string;
  warnings: string[];
  reason: string;
  queryId: string;
}): ExecuteIntelligenceQueryResult {
  const mode = resolveFootballResearchMode(input.selectedMode);
  const assembledContext = buildEmptyAssembledContext({
    topic: input.topic,
    mode,
    manualContext: input.manualNotes,
    warnings: input.warnings,
    queryId: input.queryId,
  });
  const intelligenceQuery = buildFailedIntelligenceQuery({
    id: input.queryId,
    topic: input.topic,
    selectedMode: input.selectedMode,
    manualContext: input.manualNotes,
    warnings: input.warnings,
    reason: input.reason,
  });
  const knowledgeGraph = buildKnowledgeGraphFromAssembledContext(assembledContext);

  return {
    executionStatus: "failed",
    intelligenceQuery,
    providerResults: [],
    assembledContext,
    knowledgeGraph,
    graphContext: tryBuildGraphContext(knowledgeGraph, assembledContext),
    diagnostics: [],
  };
}

/** Input validation failures — same shape as execution, no throw. */
export function buildIntelligenceExecutionValidationFailure(input: {
  topic: string;
  selectedMode: ExecuteIntelligenceQueryInput["selectedMode"];
  manualNotes?: string;
  warnings: string[];
  reason: string;
  queryId: string;
}): ExecuteIntelligenceQueryResult {
  return buildValidationFailureResult(input);
}

/**
 * High-level intelligence execution: orchestrate → research → merge → assemble.
 *
 * Never throws — returns `success`, `partial`, or `failed` with assembled context.
 * Primary path for Research Preview and script-only research generation.
 */
export async function executeIntelligenceQuery(
  input: ExecuteIntelligenceQueryInput,
): Promise<ExecuteIntelligenceQueryResult> {
  const topic = input.topic.trim();
  const manualNotes = input.manualNotes?.trim() || undefined;

  if (!topic) {
    return buildValidationFailureResult({
      topic: "",
      selectedMode: input.selectedMode,
      manualNotes,
      warnings: ["Topic is required for intelligence research."],
      reason: "Topic is required.",
      queryId: "missing-topic",
    });
  }

  try {
    const intelligenceQuery =
      input.intelligenceQuery ??
      (await buildIntelligenceQueryWithProviderRouting({
        topic,
        selectedMode: input.selectedMode,
        manualNotes,
        enableResearch: input.enableResearch !== false,
        ...(input.targetDuration != null ? { targetDuration: input.targetDuration } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      }));

    const executionEnrichment = buildExecutionEnrichmentFromQuery(
      intelligenceQuery,
      input.executionInput,
    );

    const planOutcome = await providerRegistry.executeResearchPlan(
      intelligenceQuery,
      executionEnrichment,
    );

    const canonicalResearchBundle: CanonicalResearchBundle = {
      ...mergeProviderResults(intelligenceQuery, planOutcome.results),
      diagnostics: planOutcome.diagnostics,
    };

    const assembledContext = assembleContextFromBundle(canonicalResearchBundle);
    const knowledgeGraph = buildKnowledgeGraphFromAssembledContext(assembledContext);
    const graphContext = tryBuildGraphContext(knowledgeGraph, assembledContext);

    return {
      executionStatus: resolveIntelligenceExecutionStatus({
        intelligenceQuery,
        providerResults: planOutcome.results,
        canonicalResearchBundle,
        assembledContext,
        diagnostics: planOutcome.diagnostics,
      }),
      intelligenceQuery,
      providerResults: planOutcome.results,
      canonicalResearchBundle,
      assembledContext,
      knowledgeGraph,
      graphContext,
      diagnostics: planOutcome.diagnostics,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[executeIntelligenceQuery] intelligence execution failed", error);
    }

    const mode = resolveFootballResearchMode(input.selectedMode);
    const failure = buildCautiousIntelligenceExecutionFailure({
      topic,
      mode,
      selectedMode: input.selectedMode,
      manualContext: manualNotes,
      error,
    });
    const knowledgeGraph = buildKnowledgeGraphFromAssembledContext(failure.assembledContext);

    return {
      executionStatus: "failed",
      intelligenceQuery: failure.intelligenceQuery,
      providerResults: [],
      assembledContext: failure.assembledContext,
      knowledgeGraph,
      graphContext: tryBuildGraphContext(
        knowledgeGraph,
        failure.assembledContext,
      ),
      diagnostics: [],
    };
  }
}
