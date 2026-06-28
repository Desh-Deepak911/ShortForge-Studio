import "server-only";

import { applyProviderEnrichmentToOwners } from "../entities/entity-ownership.utils";
import { isApiFootballConfigured } from "@/lib/football";
import { executeApiFootballResearch } from "./api-football-research.engine";
import {
  isApiFootballExecutionContextOperation,
  normalizeApiFootballOperationName,
} from "./api-football-operation-names.utils";
import {
  executeApiFootballOperation,
  mergeApiFootballOperationOutputs,
  type ApiFootballExecutionState,
} from "./api-football-operations.engine";
import { peekProviderExecutionContext } from "./provider-execution-context.server";
import type { ResearchProvider } from "./provider.interface";
import { providerRegistry } from "./provider-registry";
import {
  createIntelligenceResearchResult,
  type IntelligenceResearchResultStatus,
} from "./provider-result.types";
import type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderOperation,
  ProviderQuery,
  ResearchProviderCapabilities,
} from "./provider.types";
import { createEmptyProviderResult, resolveResearchTypeFromQuery, supportsResearchType } from "./provider-utils";

const SUPPORTED_ENTITY_TYPES = [
  "player",
  "club",
  "national_team",
  "competition",
  "season",
  "match",
] as const;

const SUPPORTED_RESEARCH_TYPES = [
  "player_profile",
  "ranked_list",
  "match_preview",
  "match_recap",
  "tactical_breakdown",
  "competition_context",
  "general",
] as const;

const CAPABILITIES: ResearchProviderCapabilities = {
  players: true,
  teams: true,
  fixtures: true,
  competitions: true,
  rankings: true,
  statistics: true,
  history: false,
  tactical: true,
};

function mapOrchestratorCallsToOperations(query: ProviderQuery): ProviderOperation[] {
  return query.researchPlan.requiredCalls
    .filter((call) => call.provider === "api-football")
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
    .filter((operation) => !isApiFootballExecutionContextOperation(operation.operation))
    .sort((left, right) => left.priority - right.priority);
}

export class ApiFootballProvider implements ResearchProvider {
  readonly id = "api-football" as const;
  readonly name = "API-Football";
  readonly version = "1.0.0";
  readonly priority = 10;
  readonly supportedEntityTypes = SUPPORTED_ENTITY_TYPES;
  readonly supportedResearchTypes = SUPPORTED_RESEARCH_TYPES;
  readonly capabilities = CAPABILITIES;

  canHandle(query: ProviderQuery): ProviderHandleDecision {
    if (!isApiFootballConfigured()) {
      return {
        canHandle: false,
        confidence: 0,
        reason: "API_FOOTBALL_KEY is not configured.",
      };
    }

    if (!query.input.enableResearch) {
      return {
        canHandle: false,
        confidence: 0,
        reason: "Smart Research is disabled for this brief.",
      };
    }

    const researchType = resolveResearchTypeFromQuery(query);
    if (researchType === "optional_research") {
      return {
        canHandle: false,
        confidence: 25,
        reason: "Optional research brief — API-Football not required.",
      };
    }

    const hasApiFootballPlan = query.researchPlan.requiredProviders.includes("api-football");
    const supportedType = supportsResearchType(this, researchType);

    return {
      canHandle: hasApiFootballPlan && supportedType,
      confidence: hasApiFootballPlan ? 90 : 40,
      reason: hasApiFootballPlan
        ? `API-Football scheduled for ${researchType}.`
        : "No API-Football calls in orchestrator plan.",
    };
  }

  plan(query: ProviderQuery): ProviderExecutionPlan {
    const operations = mapOrchestratorCallsToOperations(query);

    return {
      providerId: this.id,
      operations,
      reason: operations.length
        ? "Mapped orchestrator API-Football calls."
        : "No API-Football operations planned for this query.",
      canExecute:
        isApiFootballConfigured() &&
        query.researchPlan.requiredProviders.includes("api-football"),
      missingInputs: query.researchPlan.missingInputs,
    };
  }

  async execute(
    query: ProviderQuery,
    plan: ProviderExecutionPlan,
  ): Promise<ProviderExecutionResult> {
    const startedAt = Date.now();
    const input = peekProviderExecutionContext(query.id);

    if (!input) {
      return {
        providerId: this.id,
        status: "error",
        result: createEmptyProviderResult({
          providerId: this.id,
          query,
          warnings: ["Missing API-Football execution context."],
        }),
        durationMs: Date.now() - startedAt,
        errorMessage: "Missing API-Football execution context.",
      };
    }

    if (!plan.canExecute) {
      return {
        providerId: this.id,
        status: "unavailable",
        result: createEmptyProviderResult({
          providerId: this.id,
          query,
          warnings: plan.missingInputs.length
            ? [`Missing inputs: ${plan.missingInputs.join(", ")}`]
            : ["API-Football plan cannot execute."],
        }),
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const researchOperations = buildResearchOperations(plan);

      if (researchOperations.length === 0) {
        // Fallback-only: plan had no normalized operations — legacy monolithic engine.
        // TODO(phase-5): remove once every research call emits provider operations.
        const result = await executeApiFootballResearch(input, query);

        return {
          providerId: this.id,
          status: mapResultStatusToExecutionStatus(result.status),
          result,
          durationMs: Date.now() - startedAt,
        };
      }

      const state: ApiFootballExecutionState = { teams: [] };
      const operationOutputs = [];
      const executedOperations: string[] = [];
      const devRaw: Record<string, unknown> = {};

      for (const operation of researchOperations) {
        const normalizedOperation = normalizeApiFootballOperationName(operation.operation);
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
            warnings: [`Unsupported API-Football operation: ${operation.operation}.`],
          });
          continue;
        }

        const output = await executeApiFootballOperation(
          normalizedOperation,
          operation.params,
          query,
          state,
        );
        operationOutputs.push(output);
        executedOperations.push(normalizedOperation);

        if (process.env.NODE_ENV === "development" && output.raw !== undefined) {
          devRaw[normalizedOperation] = output.raw;
        }
      }

      const merged = mergeApiFootballOperationOutputs(operationOutputs);
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
      const message = error instanceof Error ? error.message : "API-Football research failed.";

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
    const checkedAt = new Date().toISOString();

    if (!isApiFootballConfigured()) {
      return {
        providerId: this.id,
        status: "unavailable",
        checkedAt,
        message: "API_FOOTBALL_KEY is not configured.",
      };
    }

    return {
      providerId: this.id,
      status: "healthy",
      checkedAt,
      message: "API-Football credentials present.",
    };
  }
}

export const apiFootballProvider = new ApiFootballProvider();

if (!providerRegistry.getProvider("api-football")) {
  providerRegistry.register(apiFootballProvider);
}
