import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { IntelligenceExecutionStatus } from "@/features/intelligence/planner/execute-intelligence-query";
import type { IntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator.types";
import type { CanonicalResearchBundle } from "@/features/intelligence/context";
import type { KnowledgeGraphDevSnapshot } from "@/features/intelligence/knowledge";
import type { GraphContextDevSnapshot } from "@/features/intelligence/graph-context";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";
import type { ProviderResearchExecutionSummary } from "@/features/intelligence/providers/provider-plan-outcome.utils";
import type { IntelligenceResearchResult } from "@/features/intelligence/providers/provider-result.types";
import type { ScriptMode } from "@/types/footiebitz";

export interface IntelligenceResearchRequest {
  topic: string;
  mode: ScriptMode;
  manualContext?: string;
}

export interface IntelligenceResearchResponse {
  executionStatus: IntelligenceExecutionStatus;
  intelligenceQuery: IntelligenceQuery;
  assembledContext: AssembledContext;
  providerResults?: IntelligenceResearchResult[];
  providerDiagnostics?: ProviderDiagnosticEntry[];
  providerExecutionSummary?: ProviderResearchExecutionSummary;
  canonicalResearchBundle?: CanonicalResearchBundle;
  /** Dev-only — omitted in production responses. */
  knowledgeGraph?: KnowledgeGraphDevSnapshot;
  /** Dev-only — omitted in production responses. */
  graphContext?: GraphContextDevSnapshot;
}

/**
 * Single client entry for intelligence research — POST `/api/research-football`
 * (server calls `executeIntelligenceQuery()` only).
 */
export async function fetchIntelligenceResearch(
  input: IntelligenceResearchRequest,
): Promise<{ ok: boolean; status: number; payload: IntelligenceResearchResponse }> {
  const response = await fetch("/api/research-football", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.topic.trim(),
      mode: input.mode,
      manualContext: input.manualContext?.trim() || undefined,
    }),
  });

  let payload: IntelligenceResearchResponse;
  try {
    payload = (await response.json()) as IntelligenceResearchResponse;
  } catch {
    throw new Error("Invalid response from research service.");
  }

  return { ok: response.ok, status: response.status, payload };
}
