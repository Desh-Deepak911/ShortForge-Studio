import type { IntentAnalysis } from "../intent/intent-types";
import type {
  QueryOrchestratorDiagnostics,
  ResearchPlan,
} from "../planner/query-orchestrator.types";
import type { ScriptMode } from "@/types/footiebitz";
import type { ConfidenceScore } from "./confidence.types";
import type { IntelligenceCompetition } from "./competition.types";
import type { IntelligenceEntity } from "./entity.types";

/**
 * Canonical intelligence output for orchestration, research preview, and research routing.
 * Single object replacing separate intent / entity / competition payloads.
 */
export interface IntelligenceAnalysis {
  queryId: string;
  topic: string;
  selectedMode: ScriptMode;
  intent: IntentAnalysis;
  entities: IntelligenceEntity[];
  competition?: IntelligenceCompetition;
  season?: number;
  researchPlan: ResearchPlan;
  confidence: ConfidenceScore;
  warnings: string[];
  diagnostics: QueryOrchestratorDiagnostics;
}

/** @deprecated Alias for orchestrator diagnostics during migration. */
export type IntelligenceAnalysisDiagnostics = QueryOrchestratorDiagnostics;
