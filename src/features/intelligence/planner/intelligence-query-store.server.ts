import "server-only";

import type { AssembledContext } from "../context/assembled-context.types";
import type { CanonicalResearchBundle } from "../context/canonical-research.types";
import type { KnowledgeGraph } from "../knowledge/knowledge-graph.types";
import type { GraphContext } from "../context/graph-context.types";
import type {
  ExecuteIntelligenceQueryResult,
  IntelligenceExecutionStatus,
} from "./execute-intelligence-query";
import type { IntelligenceQuery } from "./query-orchestrator.types";
import type { ScriptMode } from "@/types/footiebitz";

export interface IntelligenceQueryCacheEntry {
  queryId: string;
  intelligenceQuery: IntelligenceQuery;
  canonicalResearchBundle?: CanonicalResearchBundle;
  assembledContext: AssembledContext;
  knowledgeGraph: KnowledgeGraph;
  graphContext?: GraphContext;
  executionStatus: IntelligenceExecutionStatus;
  topic: string;
  selectedMode: ScriptMode;
  manualNotes?: string;
}

const intelligenceQueryStore = new Map<string, IntelligenceQueryCacheEntry>();

export function getIntelligenceQueryCache(
  queryId: string,
): IntelligenceQueryCacheEntry | undefined {
  return intelligenceQueryStore.get(queryId);
}

export function setIntelligenceQueryCache(entry: IntelligenceQueryCacheEntry): void {
  intelligenceQueryStore.set(entry.queryId, entry);
}

export function clearIntelligenceQueryStore(): void {
  intelligenceQueryStore.clear();
}

export function cacheExecutionResult(
  execution: ExecuteIntelligenceQueryResult,
  input: {
    topic: string;
    selectedMode: ScriptMode;
    manualNotes?: string;
  },
): IntelligenceQueryCacheEntry {
  const entry: IntelligenceQueryCacheEntry = {
    queryId: execution.intelligenceQuery.id,
    intelligenceQuery: execution.intelligenceQuery,
    canonicalResearchBundle: execution.canonicalResearchBundle,
    assembledContext: execution.assembledContext,
    knowledgeGraph: execution.knowledgeGraph,
    graphContext: execution.graphContext,
    executionStatus: execution.executionStatus,
    topic: input.topic.trim(),
    selectedMode: input.selectedMode,
    ...(input.manualNotes?.trim() ? { manualNotes: input.manualNotes.trim() } : {}),
  };

  setIntelligenceQueryCache(entry);
  return entry;
}
