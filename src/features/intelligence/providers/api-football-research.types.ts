import type { IntelligenceAnalysis } from "../shared/intelligence-analysis.types";
import type { EntityResearchHints } from "../entities/entity-research-hints.types";
import type { ResolvedEntitiesPayload } from "../entities/entity-research-hints.types";
import type { FootballResearchMode } from "@/features/research/types/football-research.types";

/** Input for API-Football research execution behind the provider engine. */
export interface ApiFootballResearchInput {
  topic: string;
  mode: FootballResearchMode;
  manualContext?: string;
  intelligenceAnalysis?: IntelligenceAnalysis;
  resolvedEntities?: ResolvedEntitiesPayload;
  /** @deprecated Prefer `resolvedEntities`. */
  entityHints?: EntityResearchHints;
}

/** Embedded in provider plans so `execute()` can run legacy research paths. */
export const API_FOOTBALL_EXECUTION_CONTEXT_OP = "__executionContext";
