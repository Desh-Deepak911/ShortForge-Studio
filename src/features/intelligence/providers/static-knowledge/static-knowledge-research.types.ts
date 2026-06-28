import type { ApiFootballResearchInput } from "../api-football-research.types";
import type { RankingIntent } from "@/features/research/types/ranking-intent.types";

/** Input for static knowledge research execution. */
export interface StaticKnowledgeResearchInput extends ApiFootballResearchInput {
  rankingIntent?: RankingIntent;
}

/** Embedded in provider plans so `execute()` can run legacy research paths. */
export const STATIC_KNOWLEDGE_EXECUTION_CONTEXT_OP = "__staticExecutionContext";
