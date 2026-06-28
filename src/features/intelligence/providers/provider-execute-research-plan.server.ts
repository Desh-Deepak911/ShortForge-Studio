import "server-only";

import type { IntelligenceQuery, ResearchCall } from "../planner/query-orchestrator.types";
import { intelligenceQueryToAnalysis } from "../shared/intelligence-analysis.utils";

import {
  clearProviderExecutionContext,
  registerProviderExecutionContext,
} from "./provider-execution-context.server";
import { mergeIntelligenceResearchResults } from "./merge-intelligence-research-results.utils";
import {
  createEmptyResearchResultForCall,
  normalizeProviderExecutionToResearchResult,
} from "./normalize-provider-result.utils";
import {
  recordProviderAttemptDiagnostic,
  resolveCallProviderChain,
} from "./provider-fallback-chain.server";
import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
import type { ProviderRegistry } from "./provider-registry";
import type { ProviderResearchInput } from "./provider-research.types";
import type { IntelligenceResearchResult } from "./provider-result.types";
import type { ResearchProvider } from "./provider.interface";
import type { ProviderExecutionPlan, ResearchProviderId } from "./provider.types";
import { shouldAcceptProviderExecution } from "./provider-execution.utils";

export interface ExecuteResearchPlanOutcome {
  queryId: string;
  results: IntelligenceResearchResult[];
  combined: IntelligenceResearchResult;
  diagnostics: ProviderDiagnosticEntry[];
}

function buildExecutionInputFromQuery(
  query: IntelligenceQuery,
  enrichment?: Pick<
    ProviderResearchInput,
    "resolvedEntities" | "entityHints" | "rankingIntent"
  >,
): ProviderResearchInput {
  const base: ProviderResearchInput = {
    topic: query.input.topic,
    mode: query.input.selectedMode,
    manualContext: query.input.manualNotes,
    intelligenceAnalysis: intelligenceQueryToAnalysis(query),
  };

  if (!enrichment) {
    return base;
  }

  return {
    ...base,
    ...(enrichment.resolvedEntities ? { resolvedEntities: enrichment.resolvedEntities } : {}),
    ...(enrichment.entityHints ? { entityHints: enrichment.entityHints } : {}),
    ...(enrichment.rankingIntent ? { rankingIntent: enrichment.rankingIntent } : {}),
  };
}

function buildCallExecutionPlan(
  call: ResearchCall,
  provider: ResearchProvider,
  query: IntelligenceQuery,
): ProviderExecutionPlan {
  const fullPlan = provider.plan(query);
  const matchingOperation = fullPlan.operations.find(
    (operation) => operation.operation === call.operation,
  );

  return {
    providerId: call.provider as ResearchProviderId,
    operations: matchingOperation
      ? [matchingOperation]
      : [
          {
            operation: call.operation,
            params: call.params,
            reason: call.reason,
            priority: call.priority,
          },
        ],
    reason: call.reason,
    canExecute: fullPlan.canExecute,
    missingInputs: fullPlan.missingInputs,
  };
}

async function executeCallWithFallback(
  registry: ProviderRegistry,
  query: IntelligenceQuery,
  call: ResearchCall,
  diagnostics: ProviderDiagnosticEntry[],
  executionOrder: number,
): Promise<IntelligenceResearchResult> {
  const providerChain = resolveCallProviderChain(registry, call, query);
  let attempt = 0;

  for (const provider of providerChain) {
    attempt += 1;
    const startedAt = Date.now();
    const diagnostic: ProviderDiagnosticEntry = {
      provider: provider.id,
      providerName: provider.name,
      executionOrder,
      latencyMs: 0,
      cacheHit: null,
      success: false,
      failure: false,
      fallback: attempt > 1,
      confidence: 0,
      health: "unavailable",
      selected: attempt === 1,
      executed: false,
      reason: call.reason,
    };
    diagnostics.push(diagnostic);

    try {
      const health = await provider.health();
      diagnostic.health = health.status;
      diagnostic.latencyMs = Date.now() - startedAt;

      if (health.status === "unavailable") {
        recordProviderAttemptDiagnostic(
          diagnostic,
          startedAt,
          attempt,
          false,
          health.message ?? "Provider unavailable.",
        );
        continue;
      }

      const handleDecision = provider.canHandle(query);
      diagnostic.confidence = handleDecision.confidence;

      if (!handleDecision.canHandle) {
        recordProviderAttemptDiagnostic(
          diagnostic,
          startedAt,
          attempt,
          false,
          handleDecision.reason,
        );
        continue;
      }

      const callPlan = buildCallExecutionPlan(call, provider, query);
      const executionStartedAt = Date.now();
      const execution = await provider.execute(query, callPlan);

      if (shouldAcceptProviderExecution(execution)) {
        recordProviderAttemptDiagnostic(diagnostic, executionStartedAt, attempt, true);
        return normalizeProviderExecutionToResearchResult(
          query,
          { ...call, provider: provider.id },
          execution,
          diagnostic,
        );
      }

      recordProviderAttemptDiagnostic(
        diagnostic,
        executionStartedAt,
        attempt,
        false,
        execution.errorMessage ??
          execution.result.warnings[0] ??
          `${provider.name} returned ${execution.result.status}.`,
      );
    } catch (error) {
      recordProviderAttemptDiagnostic(
        diagnostic,
        startedAt,
        attempt,
        false,
        error instanceof Error ? error.message : "Provider execution failed.",
      );
    }
  }

  const primaryProvider = call.provider as ResearchProviderId;
  const fallbackDiagnostic = diagnostics[diagnostics.length - 1];
  return createEmptyResearchResultForCall(
    query,
    call,
    "failed",
    [`All providers failed for ${call.operation} (primary: ${primaryProvider}).`],
    fallbackDiagnostic,
  );
}

export async function executeResearchPlan(
  registry: ProviderRegistry,
  query: IntelligenceQuery,
  executionEnrichment?: Pick<
    ProviderResearchInput,
    "resolvedEntities" | "entityHints" | "rankingIntent"
  >,
): Promise<ExecuteResearchPlanOutcome> {
  const diagnostics: ProviderDiagnosticEntry[] = [];
  const results: IntelligenceResearchResult[] = [];
  const calls = [...query.researchPlan.requiredCalls].sort(
    (left, right) => left.priority - right.priority,
  );

  registerProviderExecutionContext(
    query.id,
    buildExecutionInputFromQuery(query, executionEnrichment),
  );

  try {
    let executionOrder = 0;

    for (const call of calls) {
      executionOrder += 1;
      results.push(
        await executeCallWithFallback(registry, query, call, diagnostics, executionOrder),
      );
    }

    return {
      queryId: query.id,
      results,
      combined: mergeIntelligenceResearchResults(query, results, diagnostics),
      diagnostics,
    };
  } finally {
    clearProviderExecutionContext(query.id);
  }
}
