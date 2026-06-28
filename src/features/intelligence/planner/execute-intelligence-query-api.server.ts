import "server-only";

import "@/features/intelligence/providers/bootstrap-providers";
import { resolveScriptMode } from "@/types/footiebitz";

import {
  executeIntelligenceQuery,
  type ExecuteIntelligenceQueryInput,
  type ExecuteIntelligenceQueryResult,
} from "./execute-intelligence-query";
import { cacheExecutionResult } from "./intelligence-query-store.server";

export type ExecuteAndCacheIntelligenceQueryInput = Omit<
  ExecuteIntelligenceQueryInput,
  "enableResearch"
> & {
  enableResearch?: boolean;
};

/**
 * Canonical intelligence execution + in-memory cache.
 *
 * 1. `executeIntelligenceQuery()`
 * 2. cache IntelligenceQuery, CanonicalResearchBundle, AssembledContext
 * 3. return full execution result
 */
export async function executeAndCacheIntelligenceQuery(
  input: ExecuteAndCacheIntelligenceQueryInput,
): Promise<ExecuteIntelligenceQueryResult> {
  const topic = input.topic.trim();
  const selectedMode = resolveScriptMode(input.selectedMode);
  const manualNotes = input.manualNotes?.trim() || undefined;

  const execution = await executeIntelligenceQuery({
    ...input,
    topic,
    selectedMode,
    manualNotes,
    enableResearch: input.enableResearch !== false,
  });

  cacheExecutionResult(execution, {
    topic,
    selectedMode,
    manualNotes,
  });

  return execution;
}
