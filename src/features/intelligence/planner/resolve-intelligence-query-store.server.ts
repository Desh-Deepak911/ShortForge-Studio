import "server-only";

import { executeAndCacheIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query-api.server";
import {
  getIntelligenceQueryCache,
  type IntelligenceQueryCacheEntry,
} from "@/features/intelligence/planner/intelligence-query-store.server";
import type { ScriptMode } from "@/types/footiebitz";

export interface ResolveIntelligenceQueryStoreInput {
  queryId: string;
  topic: string;
  selectedMode: ScriptMode;
  manualNotes?: string;
}

export interface ResolveIntelligenceQueryStoreResult {
  entry: IntelligenceQueryCacheEntry;
  fromCache: boolean;
}

function matchesCachedEntry(
  entry: IntelligenceQueryCacheEntry,
  input: ResolveIntelligenceQueryStoreInput,
): boolean {
  const trimmedTopic = input.topic.trim();

  return (
    entry.queryId === input.queryId &&
    entry.topic.trim() === trimmedTopic &&
    entry.selectedMode === input.selectedMode
  );
}

/**
 * Resolves queryId → IntelligenceQuery → CanonicalResearchBundle → AssembledContext.
 * Rebuilds once through `executeAndCacheIntelligenceQuery()` when the in-memory cache misses.
 */
export async function resolveIntelligenceQueryFromStore(
  input: ResolveIntelligenceQueryStoreInput,
): Promise<ResolveIntelligenceQueryStoreResult> {
  const cached = getIntelligenceQueryCache(input.queryId);
  if (cached && matchesCachedEntry(cached, input)) {
    return { entry: cached, fromCache: true };
  }

  const execution = await executeAndCacheIntelligenceQuery({
    topic: input.topic.trim(),
    selectedMode: input.selectedMode,
    manualNotes: input.manualNotes?.trim() || undefined,
    enableResearch: true,
  });

  const entry = getIntelligenceQueryCache(execution.intelligenceQuery.id);
  if (!entry) {
    throw new Error("Intelligence query cache entry missing after execution.");
  }

  return { entry, fromCache: false };
}
