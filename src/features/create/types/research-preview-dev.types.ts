import type { IntentAnalysis } from "@/features/intelligence/intent/intent-types";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";

export interface EntityResolverDevLookup {
  kind: string;
  query: string;
  provider: string;
  cache: "hit" | "miss" | "n/a";
  resolvedId?: string;
  externalId?: string | number;
  confidencePercent: number;
  ambiguous: boolean;
}

export interface EntityResolverDevDebug {
  extractionCandidates: string[];
  lookups: EntityResolverDevLookup[];
  cacheEntryCount: number;
}

export interface ResearchPreviewDevCall {
  endpoint: string;
  status: number;
  ok: boolean;
  durationMs: number;
}

export type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";

/** Dev-only snapshot for Research Preview developer panel. */
export interface ResearchPreviewDevSnapshot {
  intent: IntentAnalysis;
  entityDebug?: EntityResolverDevDebug;
  researchCalls: ResearchPreviewDevCall[];
  researchSource?: string;
  researchConfidence?: string;
  providerDiagnostics?: ProviderDiagnosticEntry[];
  providerExecutionSummary?: import("@/features/intelligence/providers/provider-plan-outcome.utils").ProviderResearchExecutionSummary;
  canonicalResearchBundle?: import("@/features/intelligence/context").CanonicalResearchBundle;
  orchestratorDiagnostics?: import("@/features/intelligence/planner/query-orchestrator.types").QueryOrchestratorDiagnostics;
  researchPlan?: import("@/features/intelligence/planner/query-orchestrator.types").ResearchPlan;
  orchestratorConfidence?: string;
  intelligenceQuery?: import("@/features/intelligence/planner/query-orchestrator.types").IntelligenceQuery;
  assembledContext?: import("@/features/intelligence/context/assembled-context.types").AssembledContext;
  providerResults?: import("@/features/intelligence/providers/provider-result.types").IntelligenceResearchResult[];
  executionStatus?: import("@/features/intelligence/planner/execute-intelligence-query").IntelligenceExecutionStatus;
  knowledgeGraph?: import("@/features/intelligence/knowledge").KnowledgeGraphDevSnapshot;
  graphContext?: import("@/features/intelligence/graph-context").GraphContextDevSnapshot;
  promptIntelligenceSummary?: import("@/features/intelligence/prompts/prompt-intelligence-dev.utils").PromptIntelligenceDevSummary;
}

export const isResearchPreviewDevEnabled =
  process.env.NODE_ENV === "development";
