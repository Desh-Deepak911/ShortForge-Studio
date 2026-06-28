import "server-only";

import { assembleResearchContextFromBundle } from "@/features/intelligence/context/assemble-research-context";

import type {
  FootballResearchContext,
  FootballResearchMode,
  FootballResearchSource,
} from "@/features/research/types/football-research.types";
import { parseManualFacts } from "@/features/research/utils/topic-inference.utils";

import {
  researchFootballContextDetailed,
  type ResearchFootballContextInput,
} from "./football-research-detailed.legacy.server";

function createEmptyContext(input: {
  topic: string;
  mode: FootballResearchMode;
  manualContext?: string;
  source: FootballResearchSource;
  warnings?: string[];
  summary?: string;
}): FootballResearchContext {
  const facts = parseManualFacts(input.manualContext);

  return {
    mode: input.mode,
    topic: input.topic.trim(),
    summary: input.summary ?? `Research brief: ${input.topic.trim()}`,
    facts,
    warnings: input.warnings ?? [],
    source: input.source,
  };
}

/**
 * @deprecated Legacy adapter — builds FootballResearchContext from AssembledContext at the boundary.
 * @deprecated test/legacy only — do not use in production path.
 */
export async function researchFootballContext(
  input: ResearchFootballContextInput,
): Promise<FootballResearchContext> {
  const result = await researchFootballContextDetailed(input);

  if (result.canonicalResearchBundle) {
    return assembleResearchContextFromBundle({
      bundle: result.canonicalResearchBundle,
    }).context;
  }

  return createEmptyContext({
    topic: result.assembledContext.topic,
    mode: result.assembledContext.selectedMode,
    manualContext: result.assembledContext.manualNotes,
    source: result.assembledContext.provenance.source === "user" ? "manual" : "fallback",
    warnings: result.assembledContext.warnings,
  });
}

export type { ResearchFootballContextInput, ResearchFootballContextResult } from "./football-research-detailed.legacy.server";
export { researchFootballContextDetailed } from "./football-research-detailed.legacy.server";
