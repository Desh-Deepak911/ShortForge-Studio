import "server-only";

import { executeIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query";
import { applyAssembledResearchContext } from "@/features/research/utils/script-research-context.utils";
import type { ScriptMode } from "@/types/footiebitz";

export type FootballResearchResult =
  | { success: true; context: string }
  | { success: false; error: string };

export type ResolveScriptGenerationContextResult = {
  context?: string;
  researchApplied: boolean;
  researchWarning?: string;
};

async function resolveFromExecution(input: {
  topic: string;
  scriptMode: ScriptMode;
  manualContext?: string;
}): Promise<ResolvedScriptResearchContextShape> {
  const manualContext = input.manualContext?.trim() || undefined;

  const execution = await executeIntelligenceQuery({
    topic: input.topic,
    selectedMode: input.scriptMode,
    manualNotes: manualContext,
    enableResearch: true,
  });

  return applyAssembledResearchContext({
    scriptMode: input.scriptMode,
    manualContext,
    assembled: execution.assembledContext,
    graphContext: execution.graphContext,
  });
}

type ResolvedScriptResearchContextShape = Awaited<
  ReturnType<typeof applyAssembledResearchContext>
>;

/** @deprecated test/legacy only — do not use in production path. */
export async function researchFootballContext(input: {
  topic: string;
  scriptMode: ScriptMode;
  manualContext?: string;
}): Promise<FootballResearchResult> {
  const resolved = await resolveFromExecution(input);

  if (resolved.researchApplied && resolved.context) {
    return { success: true, context: resolved.context };
  }

  const warning = resolved.researchWarning ?? "Football research unavailable.";
  return { success: false, error: warning };
}

/** @deprecated test/legacy only — do not use in production path. */
export async function resolveScriptGenerationContext(input: {
  topic: string;
  scriptMode: ScriptMode;
  manualContext?: string;
  footballResearch?: boolean;
}): Promise<ResolveScriptGenerationContextResult> {
  const manualContext = input.manualContext?.trim() || undefined;

  if (!input.footballResearch) {
    return {
      context: manualContext,
      researchApplied: false,
    };
  }

  const resolved = await resolveFromExecution({
    topic: input.topic,
    scriptMode: input.scriptMode,
    manualContext,
  });

  return {
    context: resolved.context,
    researchApplied: resolved.researchApplied,
    researchWarning: resolved.researchWarning,
  };
}

export { mergeFootballContext } from "../utils/football-research.utils";
