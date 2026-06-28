import { buildIntelligenceAnalysis } from "../analysis/build-intelligence-analysis.utils";
import { resolveCompetitionFromTopic } from "../competitions";
import { resolveEntities } from "../entities/entity-resolver";
import type { EntityResolution } from "../entities/entity-types";
import { createEntityConfidence } from "../entities/entity-utils";
import { analyzeIntent } from "../intent/intent-engine";
import type { IntentAnalysis } from "../intent/intent-types";
import type { IntelligenceEvent } from "../observability/types";
import type { ConfidenceScore, IntelligenceConfidenceReport } from "../shared/confidence.types";
import type {
  IntelligenceQuery,
  IntelligenceQueryInput,
  QueryOrchestratorDiagnostics,
} from "./query-orchestrator.types";
import { buildResearchPlan } from "./query-orchestrator-research-plan.utils";

function createQueryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `iq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function confidenceTierFromPercent(percent: number): ConfidenceScore["tier"] {
  if (percent >= 88) {
    return "high";
  }

  if (percent >= 68) {
    return "medium";
  }

  return "low";
}

function buildEntityConfidence(extraction: EntityResolution): ConfidenceScore {
  if (extraction.candidates.length === 0) {
    return createEntityConfidence({
      tier: "low",
      percent: 0,
      reasoning: "No entities detected in brief.",
    });
  }

  const percent = Math.round(
    extraction.candidates.reduce((sum, candidate) => sum + candidate.confidence.percent, 0) /
      extraction.candidates.length,
  );

  return createEntityConfidence({
    tier: confidenceTierFromPercent(percent),
    percent,
    reasoning: `Average confidence across ${extraction.candidates.length} extracted candidate(s).`,
  });
}

function buildIntentConfidence(intent: IntentAnalysis): ConfidenceScore {
  return {
    tier: intent.confidence,
    percent: intent.confidencePercent,
    reasoning: intent.reasoning,
  };
}

function buildOverallConfidence(
  intent: IntentAnalysis,
  entityConfidence: ConfidenceScore,
): ConfidenceScore {
  const percent = Math.round((intent.confidencePercent + entityConfidence.percent) / 2);

  return {
    tier: confidenceTierFromPercent(percent),
    percent,
    reasoning: `Blended intent (${intent.confidencePercent}%) and entity (${entityConfidence.percent}%) confidence.`,
  };
}

function recordStage(
  events: IntelligenceEvent[],
  stage: IntelligenceEvent["stage"],
  name: string,
  startedAt: number,
  metadata?: IntelligenceEvent["metadata"],
): void {
  events.push({
    stage,
    name,
    durationMs: Math.max(0, Date.now() - startedAt),
    ...(metadata ? { metadata } : {}),
  });
}

/**
 * Orchestrates intent, entity, and competition resolution into a normalized query plan.
 * Does not execute research provider calls — planning only.
 */
export async function buildIntelligenceQuery(
  input: IntelligenceQueryInput,
): Promise<IntelligenceQuery> {
  const events: IntelligenceEvent[] = [];
  const orchestratedAt = new Date().toISOString();

  const intentStartedAt = Date.now();
  const intent = analyzeIntent({
    topic: input.topic,
    context: input.manualNotes,
  });
  recordStage(events, "intent", "analyzeIntent", intentStartedAt, {
    intent: intent.intent,
    confidencePercent: intent.confidencePercent,
  });

  const entityStartedAt = Date.now();
  const extraction = resolveEntities({
    topic: input.topic,
    manualContext: input.manualNotes,
    mode: input.selectedMode,
  });
  recordStage(events, "entities", "resolveEntities", entityStartedAt, {
    candidateCount: extraction.candidates.length,
    ambiguityCount: extraction.ambiguities.length,
  });

  const competitionStartedAt = Date.now();
  const competitionResolution = resolveCompetitionFromTopic({ topic: input.topic });
  recordStage(events, "competitions", "resolveCompetitionFromTopic", competitionStartedAt, {
    scope: competitionResolution.scope,
    season: competitionResolution.season ?? 0,
  });

  const analysis = buildIntelligenceAnalysis({
    topic: input.topic,
    manualContext: input.manualNotes,
    mode: input.selectedMode,
    extraction,
    competitionResolution,
  });

  const entityConfidence = buildEntityConfidence(extraction);
  const intentConfidence = buildIntentConfidence(intent);
  const confidence = buildOverallConfidence(intent, entityConfidence);

  const planStartedAt = Date.now();
  const researchPlan = buildResearchPlan({
    queryInput: input,
    intent,
    extraction,
    competitionResolution,
    entities: analysis.entities,
    competition: analysis.competition,
    season: analysis.season,
  });

  recordStage(events, "research", "buildResearchPlan", planStartedAt, {
    canProceed: researchPlan.canProceed ? 1 : 0,
    callCount: researchPlan.requiredCalls.length,
  });

  const confidenceReport: IntelligenceConfidenceReport = {
    overall: confidence,
    intent: intentConfidence,
    entities: entityConfidence,
  };

  const diagnostics: QueryOrchestratorDiagnostics = {
    orchestratedAt,
    events,
    confidenceReport,
  };

  return {
    id: createQueryId(),
    input,
    intent,
    entities: analysis.entities,
    ...(analysis.competition ? { competition: analysis.competition } : {}),
    ...(analysis.season != null ? { season: analysis.season } : {}),
    warnings: analysis.warnings,
    confidence,
    researchPlan,
    diagnostics,
  };
}
