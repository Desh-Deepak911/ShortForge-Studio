import "server-only";

import type { ResearchProvider } from "./provider.interface";
import { providerRegistry } from "./provider-registry";
import type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderQuery,
  ResearchProviderCapabilities,
} from "./provider.types";
import { createEmptyProviderResult } from "./provider-utils";
import {
  STATSBOMB_FUTURE_OPERATIONS,
  STATSBOMB_INTEGRATION_MISSING_INPUT,
  STATSBOMB_UNSUPPORTED,
} from "./stats-bomb.provider.types";

const SUPPORTED_ENTITY_TYPES = ["player", "club", "national_team", "match"] as const;

const SUPPORTED_RESEARCH_TYPES = [
  "tactical_breakdown",
  "match_recap",
  "match_preview",
] as const;

/** Current capabilities — all false until StatsBomb APIs are connected. */
const CAPABILITIES: ResearchProviderCapabilities = {
  players: false,
  teams: false,
  fixtures: false,
  competitions: false,
  rankings: false,
  statistics: false,
  history: false,
  tactical: false,
};

const FUTURE_SUPPORT_DOC = STATSBOMB_FUTURE_OPERATIONS.join(", ");

/**
 * StatsBomb research provider — scaffold only.
 *
 * Does not call StatsBomb APIs. Every operation returns {@link STATSBOMB_UNSUPPORTED}.
 *
 * **Future support:** events, lineups, xG, passes, pressures, shots, 360.
 */
export class StatsBombProvider implements ResearchProvider {
  readonly id = "statsbomb" as const;
  readonly name = "StatsBomb";
  readonly version = "0.1.0";
  /** Optional enrichment — lower priority than API-Football until implemented. */
  readonly priority = 50;
  readonly supportedEntityTypes = SUPPORTED_ENTITY_TYPES;
  readonly supportedResearchTypes = SUPPORTED_RESEARCH_TYPES;
  readonly capabilities = CAPABILITIES;

  canHandle(query: ProviderQuery): ProviderHandleDecision {
    void query;
    return {
      canHandle: false,
      confidence: 0,
      reason: `${STATSBOMB_UNSUPPORTED} — StatsBomb API integration is not enabled. Future: ${FUTURE_SUPPORT_DOC}.`,
    };
  }

  plan(query: ProviderQuery): ProviderExecutionPlan {
    void query;
    return {
      providerId: this.id,
      operations: [],
      reason: `${STATSBOMB_UNSUPPORTED} — StatsBomb provider is registered but not connected.`,
      canExecute: false,
      missingInputs: [STATSBOMB_INTEGRATION_MISSING_INPUT],
    };
  }

  async execute(query: ProviderQuery, plan: ProviderExecutionPlan): Promise<ProviderExecutionResult> {
    const startedAt = Date.now();
    const operationSummary =
      plan.operations.length > 0
        ? plan.operations.map((entry) => entry.operation).join(", ")
        : "all";

    return {
      providerId: this.id,
      status: "unavailable",
      result: createEmptyProviderResult({
        providerId: this.id,
        query,
        warnings: [
          `${STATSBOMB_UNSUPPORTED}: StatsBomb ${operationSummary} — future support for ${FUTURE_SUPPORT_DOC}.`,
        ],
      }),
      durationMs: Date.now() - startedAt,
      errorMessage: STATSBOMB_UNSUPPORTED,
    };
  }

  async health(): Promise<ProviderHealthCheck> {
    return {
      providerId: this.id,
      status: "unavailable",
      checkedAt: new Date().toISOString(),
      message: `${STATSBOMB_UNSUPPORTED} — StatsBomb not connected. Planned: ${FUTURE_SUPPORT_DOC}.`,
    };
  }
}

export const statsBombProvider = new StatsBombProvider();

if (!providerRegistry.getProvider("statsbomb")) {
  providerRegistry.register(statsBombProvider);
}
