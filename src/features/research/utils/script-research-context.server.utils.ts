import "server-only";

import { executeAndCacheIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query-api.server";
import { resolveIntelligenceQueryFromStore } from "@/features/intelligence/planner/resolve-intelligence-query-store.server";
import {
  formatScriptPromptSourceForDev,
} from "@/features/intelligence/context/resolve-research-prompt-text";
import {
  applyAssembledResearchContext,
  isReusableResearchPreview,
  type ResolveScriptResearchContextInput,
  type ResolvedScriptResearchContext,
} from "@/features/research/utils/script-research-context.utils";

function logDevScriptPromptSource(resolved: ResolvedScriptResearchContext): void {
  if (process.env.NODE_ENV !== "development" || !resolved.promptSource) {
    return;
  }

  console.info(
    `[script-research] Prompt Source: ${formatScriptPromptSourceForDev(resolved.promptSource)}`,
  );
}

/** Primary script-only research path via `executeAndCacheIntelligenceQuery`. */
async function resolveOrchestratedResearchPayload(
  input: ResolveScriptResearchContextInput,
): Promise<ResolvedScriptResearchContext & { usedResearchPreview: false }> {
  const execution = await executeAndCacheIntelligenceQuery({
    topic: input.topic,
    selectedMode: input.scriptMode,
    manualNotes: input.manualContext?.trim() || undefined,
    enableResearch: true,
  });

  const resolved = {
    ...applyAssembledResearchContext({
      scriptMode: input.scriptMode,
      manualContext: input.manualContext,
      assembled: execution.assembledContext,
      graphContext: execution.graphContext,
      usedResearchPreview: false,
    }),
    usedResearchPreview: false as const,
  };
  logDevScriptPromptSource(resolved);
  return resolved;
}

async function resolveStoredResearchPreview(
  input: ResolveScriptResearchContextInput,
): Promise<ResolvedScriptResearchContext & { usedResearchPreview: boolean }> {
  const preview = input.researchPreview!;

  const { entry, fromCache } = await resolveIntelligenceQueryFromStore({
    queryId: preview.queryId,
    topic: input.topic,
    selectedMode: input.scriptMode,
    manualNotes: input.manualContext,
  });

  const resolved = {
    ...applyAssembledResearchContext({
      scriptMode: input.scriptMode,
      manualContext: input.manualContext,
      assembled: entry.assembledContext,
      graphContext: entry.graphContext,
      usedResearchPreview: fromCache,
    }),
    usedResearchPreview: fromCache,
  };
  logDevScriptPromptSource(resolved);
  return resolved;
}

async function resolveResearchPayload(
  input: ResolveScriptResearchContextInput,
): Promise<ResolvedScriptResearchContext & { usedResearchPreview: boolean }> {
  if (
    isReusableResearchPreview(input.researchPreview, {
      topic: input.topic,
      scriptMode: input.scriptMode,
    })
  ) {
    return resolveStoredResearchPreview(input);
  }

  return resolveOrchestratedResearchPayload(input);
}

/** Resolves merged manual + researched context for script-only generation. */
export async function resolveScriptResearchContext(
  input: ResolveScriptResearchContextInput,
): Promise<ResolvedScriptResearchContext> {
  const manualContext = input.manualContext?.trim() || undefined;

  if (!input.enableResearch) {
    return {
      context: manualContext,
      researchApplied: false,
      top5RankedDataAvailable: false,
    };
  }

  return resolveResearchPayload(input);
}
