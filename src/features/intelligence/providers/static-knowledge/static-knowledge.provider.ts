import "server-only";

import { applyProviderEnrichmentToOwners } from "../../entities/entity-ownership.utils";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "../provider-result.types";
import { peekProviderExecutionContext } from "../provider-execution-context.server";
import type { ResearchProvider } from "../provider.interface";
import { providerRegistry } from "../provider-registry";
import type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderOperation,
  ProviderQuery,
  ResearchProviderCapabilities,
} from "../provider.types";
import { createEmptyProviderResult, resolveResearchTypeFromQuery } from "../provider-utils";

import { listStaticKnowledgeDatasetIds } from "./static-knowledge-catalog.utils";
import {
  isStaticKnowledgeExecutionContextOperation,
  normalizeStaticKnowledgeOperationName,
  resolveHistoricWinnersDatasetId,
} from "./static-knowledge-operation-names.utils";
import {
  executeStaticKnowledgeOperation,
  mergeStaticKnowledgeOperationOutputs,
} from "./static-knowledge-operations.engine";
import { executeStaticKnowledgeResearch } from "./static-knowledge-research.engine";
import { type StaticKnowledgeResearchInput } from "./static-knowledge-research.types";
import { resolveStaticKnowledgeMatch } from "./static-knowledge-matching.utils";

const SUPPORTED_ENTITY_TYPES = [
  "player",
  "club",
  "national_team",
  "competition",
  "season",
  "match",
] as const;

const SUPPORTED_RESEARCH_TYPES = [
  "ranked_list",
  "historical_explainer",
  "competition_context",
  "optional_research",
  "general",
] as const;

const CAPABILITIES: ResearchProviderCapabilities = {
  players: true,
  teams: false,
  fixtures: false,
  competitions: true,
  rankings: true,
  statistics: false,
  history: true,
  tactical: false,
};

function mapOrchestratorCallsToOperations(query: ProviderQuery): ProviderOperation[] {
  return query.researchPlan.requiredCalls
    .filter((call) => call.provider === "static-fallback")
    .map((call) => ({
      operation: call.operation,
      params: call.params,
      reason: call.reason,
      priority: call.priority,
    }));
}

function mapResultStatusToExecutionStatus(
  status: IntelligenceResearchResultStatus,
): ProviderExecutionResult["status"] {
  switch (status) {
    case "success":
      return "success";
    case "partial":
      return "partial";
    case "unsupported":
      return "unavailable";
    case "failed":
      return "error";
  }
}

function buildResearchOperations(plan: ProviderExecutionPlan): ProviderOperation[] {
  return [...plan.operations]
    .filter((operation) => !isStaticKnowledgeExecutionContextOperation(operation.operation))
    .sort((left, right) => left.priority - right.priority);
}

export class StaticKnowledgeProvider implements ResearchProvider {
  readonly id = "static-fallback" as const;
  readonly name = "Static Knowledge";
  readonly version = "1.0.0";
  /** Lower priority than live providers — used as fallback reference. */
  readonly priority = 100;
  readonly supportedEntityTypes = SUPPORTED_ENTITY_TYPES;
  readonly supportedResearchTypes = SUPPORTED_RESEARCH_TYPES;
  readonly capabilities = CAPABILITIES;

  canHandle(query: ProviderQuery): ProviderHandleDecision {
    const input = this.toResearchInput(query);
    const match = resolveStaticKnowledgeMatch(input);
    const hasStaticPlan = query.researchPlan.requiredProviders.includes("static-fallback");
    const hasStaticCall = query.researchPlan.requiredCalls.some(
      (call) => call.provider === "static-fallback",
    );

    if (match || hasStaticPlan || hasStaticCall) {
      return {
        canHandle: true,
        confidence: match ? 88 : 70,
        reason: match?.reason ?? "Static fallback scheduled in research plan.",
      };
    }

    const researchType = resolveResearchTypeFromQuery(query);
    if (researchType === "historical_explainer") {
      return {
        canHandle: true,
        confidence: 55,
        reason: "Historical brief may use curated static knowledge.",
      };
    }

    return {
      canHandle: false,
      confidence: 0,
      reason: "No curated static knowledge dataset matched this brief.",
    };
  }

  plan(query: ProviderQuery): ProviderExecutionPlan {
    const input = this.toResearchInput(query);
    const match = resolveStaticKnowledgeMatch(input);
    const operations = mapOrchestratorCallsToOperations(query);

    if (match) {
      operations.push({
        operation: `staticKnowledge:${match.datasetId}`,
        params: {
          datasetId: match.datasetId,
          ...(match.limit != null ? { limit: match.limit } : {}),
        },
        reason: match.reason,
        priority: 1,
      });
    }

    return {
      providerId: this.id,
      operations,
      reason: match
        ? `Static knowledge plan — ${match.datasetId}.`
        : operations.length
          ? "Mapped orchestrator static-fallback calls."
          : "No static knowledge operations planned.",
      canExecute: Boolean(match) || operations.length > 0,
      missingInputs: [],
    };
  }

  async execute(
    query: ProviderQuery,
    plan: ProviderExecutionPlan,
  ): Promise<ProviderExecutionResult> {
    const startedAt = Date.now();
    const input = this.toResearchInput(query);

    if (!plan.canExecute) {
      return {
        providerId: this.id,
        status: "unavailable",
        result: createEmptyProviderResult({
          providerId: this.id,
          query,
          warnings: ["Static knowledge plan cannot execute."],
        }),
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const researchOperations = buildResearchOperations(plan);

      if (researchOperations.length === 0) {
        const result = executeStaticKnowledgeResearch(input, query);
        if (!result) {
          return {
            providerId: this.id,
            status: "unavailable",
            result: createEmptyProviderResult({
              providerId: this.id,
              query,
              warnings: ["No static knowledge dataset matched this brief."],
            }),
            durationMs: Date.now() - startedAt,
          };
        }

        return {
          providerId: this.id,
          status: mapResultStatusToExecutionStatus(result.status),
          result,
          durationMs: Date.now() - startedAt,
        };
      }

      const operationOutputs = [];
      const executedOperations: string[] = [];
      const devRaw: Record<string, unknown> = {};
      const seenOperations = new Set<string>();

      for (const operation of researchOperations) {
        const normalizedOperation = normalizeStaticKnowledgeOperationName(operation.operation);
        if (!normalizedOperation) {
          operationOutputs.push({
            status: "partial" as const,
            facts: [],
            entities: [],
            rankings: [],
            fixtures: [],
            statistics: [],
            events: [],
            lineups: [],
            warnings: [`Unsupported static knowledge operation: ${operation.operation}.`],
          });
          continue;
        }

        if (seenOperations.has(normalizedOperation)) {
          continue;
        }

        seenOperations.add(normalizedOperation);
        const output = executeStaticKnowledgeOperation(
          normalizedOperation,
          operation.params,
          query,
          input,
          resolveHistoricWinnersDatasetId(operation.operation, operation.params),
        );
        operationOutputs.push(output);
        executedOperations.push(normalizedOperation);

        if (process.env.NODE_ENV === "development" && output.raw !== undefined) {
          devRaw[normalizedOperation] = output.raw;
        }
      }

      const merged = mergeStaticKnowledgeOperationOutputs(operationOutputs);
      const result = createIntelligenceResearchResult({
        queryId: query.id,
        providerId: this.id,
        status: merged.status,
        facts: merged.facts,
        entities: applyProviderEnrichmentToOwners(query.entities, merged.entities),
        rankings: merged.rankings,
        fixtures: merged.fixtures,
        statistics: merged.statistics,
        events: merged.events,
        lineups: merged.lineups,
        warnings: merged.warnings,
        confidence: query.confidence,
        provenance: {
          source: this.id,
          fetchedAt: new Date().toISOString(),
          operations: executedOperations,
          facts: merged.facts.map((fact) => fact.provenance),
        },
        raw: process.env.NODE_ENV === "development" ? devRaw : undefined,
      });

      return {
        providerId: this.id,
        status: mapResultStatusToExecutionStatus(result.status),
        result,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Static knowledge research failed.";

      return {
        providerId: this.id,
        status: "error",
        result: createEmptyProviderResult({
          providerId: this.id,
          query,
          warnings: [message],
        }),
        durationMs: Date.now() - startedAt,
        errorMessage: message,
      };
    }
  }

  async health(): Promise<ProviderHealthCheck> {
    const datasetCount = listStaticKnowledgeDatasetIds().length;

    return {
      providerId: this.id,
      status: "healthy",
      checkedAt: new Date().toISOString(),
      message: `${datasetCount} curated static knowledge dataset(s) loaded.`,
    };
  }

  private toResearchInput(query: ProviderQuery): StaticKnowledgeResearchInput {
    const stored = peekProviderExecutionContext(query.id);
    if (stored) {
      return {
        topic: stored.topic,
        mode: stored.mode,
        manualContext: stored.manualContext,
        intelligenceAnalysis: stored.intelligenceAnalysis,
        resolvedEntities: stored.resolvedEntities,
        entityHints: stored.entityHints,
        ...(stored.rankingIntent ? { rankingIntent: stored.rankingIntent } : {}),
      };
    }

    return {
      topic: query.input.topic,
      mode: query.input.selectedMode,
      manualContext: query.input.manualNotes,
    };
  }
}

export const staticKnowledgeProvider = new StaticKnowledgeProvider();

if (!providerRegistry.getProvider("static-fallback")) {
  providerRegistry.register(staticKnowledgeProvider);
}
