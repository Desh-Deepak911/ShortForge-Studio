import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type {
  EntityResolverDevDebug,
  ResearchPreviewDevCall,
} from "@/features/create/types/research-preview-dev.types";
import type { ScriptMode } from "@/types/footiebitz";

export type ResearchPreviewStatus = "idle" | "loading" | "success" | "fallback" | "error";

export type ResearchPreviewEntity =
  | "player"
  | "team"
  | "match"
  | "competition"
  | "ranking"
  | "year_season"
  | "unknown";

export type ResearchPreviewDisplayStatus =
  | "Idle"
  | "Searching"
  | "Ready"
  | "Limited"
  | "Unavailable";

export type ResearchPreviewConfidence = "High" | "Medium" | "Low";

export type ResearchPreviewSourceDisplay =
  | "Smart Research"
  | "API-Football"
  | "Static fallback"
  | "Manual notes"
  | "Prompt only";

export interface ResearchPreviewState {
  status: ResearchPreviewStatus;
  topic?: string;
  mode?: ScriptMode;
  entityPreview?: EntityPreviewDisplay;
  resolvedEntities?: import("@/features/intelligence/entities/entity-research-hints.types").ResolvedEntitiesPayload;
  intelligenceAnalysis?: import("@/features/intelligence/shared/intelligence-analysis.types").IntelligenceAnalysis;
  /** @deprecated Legacy slim analysis from `/api/resolve-entities`. */
  legacyIntelligenceAnalysis?: import("@/features/intelligence/analysis/intelligence-analysis.types").LegacyIntelligenceAnalysis;
  /** @deprecated Orchestrator wrapper — prefer `intelligenceAnalysis`. */
  intelligenceQuery?: import("@/features/intelligence/planner/query-orchestrator.types").IntelligenceQuery;
  /** Dev-only entity resolver telemetry from `/api/resolve-entities`. */
  entityDevDebug?: EntityResolverDevDebug;
  /** Dev-only HTTP call log for research preview. */
  devCalls?: ResearchPreviewDevCall[];
  /** Dev-only provider registry execution telemetry from `/api/research-football`. */
  providerDiagnostics?: import("@/features/intelligence/providers/provider-diagnostics.types").ProviderDiagnosticEntry[];
  /** Dev-only provider plan execution summary from `/api/research-football`. */
  providerExecutionSummary?: import("@/features/intelligence/providers/provider-plan-outcome.utils").ProviderResearchExecutionSummary;
  /** Dev-only canonical provider bundle from `/api/research-football`. */
  canonicalResearchBundle?: import("@/features/intelligence/context").CanonicalResearchBundle;
  /** Structured pipeline output from `/api/research-football`. */
  assembledContext?: import("@/features/intelligence/context/assembled-context.types").AssembledContext;
  /** Intelligence execution outcome from `/api/research-football`. */
  executionStatus?: import("@/features/intelligence/planner/execute-intelligence-query").IntelligenceExecutionStatus;
  /** Dev-only raw provider results from executeIntelligenceQuery. */
  providerResults?: import("@/features/intelligence/providers/provider-result.types").IntelligenceResearchResult[];
  /** Dev-only knowledge graph snapshot from executeIntelligenceQuery. */
  knowledgeGraph?: import("@/features/intelligence/knowledge").KnowledgeGraphDevSnapshot;
  /** Dev-only graph context snapshot from executeIntelligenceQuery. */
  graphContext?: import("@/features/intelligence/graph-context").GraphContextDevSnapshot;
  errorMessage?: string;
}

export const IDLE_RESEARCH_PREVIEW: ResearchPreviewState = { status: "idle" };
