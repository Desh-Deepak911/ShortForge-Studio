import type { IntentAnalysis } from "../intent/intent-types";
import type { ConfidenceScore, IntelligenceConfidenceReport } from "../shared/confidence.types";
import type { IntelligenceCompetition } from "../shared/competition.types";
import type { IntelligenceEntity } from "../shared/entity.types";
import type { IntelligenceProviderId } from "../shared/provider.types";
import type { IntelligenceEvent } from "../observability/types";
import type { ScriptMode } from "@/types/footiebitz";

/** Creator brief and session options submitted to the query orchestrator. */
export interface IntelligenceQueryInput {
  topic: string;
  selectedMode: ScriptMode;
  manualNotes?: string;
  enableResearch: boolean;
  targetDuration?: number;
  locale?: string;
  createdAt?: string;
}

/** Planned provider invocation for the research stage. */
export interface ResearchCall {
  provider: IntelligenceProviderId;
  operation: string;
  params: Record<string, string | number | boolean | null | undefined>;
  reason: string;
  priority: number;
}

/** How research should proceed when inputs or provider coverage are incomplete. */
export type ResearchFallbackStrategy =
  | "full_provider"
  | "legacy_parser"
  | "manual_only"
  | "static_fallback"
  | "heuristic_entities"
  | "skip_research";

/** Research execution plan derived from intent, entities, and competition resolution. */
export interface ResearchPlan {
  requiredProviders: IntelligenceProviderId[];
  requiredCalls: ResearchCall[];
  reason: string;
  canProceed: boolean;
  missingInputs: string[];
  fallbackStrategy: ResearchFallbackStrategy;
  /** Provider registry routing — populated after the base plan is built. */
  providerRouting?: ResearchPlanProviderRouting;
}

/** Provider selection output from the registry for a planned query. */
export interface ResearchPlanProviderRouting {
  /** Primary provider the registry would execute first. */
  selectedProvider: IntelligenceProviderId | null;
  /** All registered providers in priority order. */
  orderedProviders: IntelligenceProviderId[];
  /** Remaining selected handlers after the primary. */
  fallbackProviders: IntelligenceProviderId[];
  /** Why the registry chose this routing. */
  reasoning: string;
}

/** Pipeline diagnostics attached to an orchestrated query (observability / dev tooling). */
export interface QueryOrchestratorDiagnostics {
  orchestratedAt: string;
  events: IntelligenceEvent[];
  confidenceReport?: IntelligenceConfidenceReport;
}

/**
 * Fully orchestrated intelligence query — output of the query orchestrator.
 *
 * Distinct from the request envelope in `shared/query.types.ts` (same name, pre-Phase-3).
 * Import this type from `planner/query-orchestrator.types` during migration.
 */
export interface IntelligenceQuery {
  id: string;
  input: IntelligenceQueryInput;
  intent: IntentAnalysis;
  entities: IntelligenceEntity[];
  competition?: IntelligenceCompetition;
  season?: number;
  warnings: string[];
  confidence: ConfidenceScore;
  researchPlan: ResearchPlan;
  diagnostics: QueryOrchestratorDiagnostics;
}
