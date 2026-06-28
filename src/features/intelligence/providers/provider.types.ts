import type { IntelligenceQuery } from "../planner/query-orchestrator.types";

import type { IntelligenceResearchResult } from "./provider-result.types";

/** Canonical research provider identifiers for the provider engine. */
export type ResearchProviderId =
  | "api-football"
  | "static-fallback"
  | "statsbomb"
  | "manual"
  | "fallback";

/** Research domains a provider can satisfy. */
export type ResearchType =
  | "player_profile"
  | "ranked_list"
  | "match_preview"
  | "match_recap"
  | "tactical_breakdown"
  | "competition_context"
  | "historical_explainer"
  | "optional_research"
  | "general";

/** Capability flags exposed by a research provider. */
export interface ResearchProviderCapabilities {
  players: boolean;
  teams: boolean;
  fixtures: boolean;
  competitions: boolean;
  rankings: boolean;
  statistics: boolean;
  history: boolean;
  tactical: boolean;
}

export type ResearchCapability = keyof ResearchProviderCapabilities;

/** Orchestrated query passed into provider planning and execution. */
export type ProviderQuery = IntelligenceQuery;

/** Decision from `canHandle` — whether a provider should participate. */
export interface ProviderHandleDecision {
  canHandle: boolean;
  confidence: number;
  reason: string;
}

/** Single planned operation within a provider execution plan. */
export interface ProviderOperation {
  operation: string;
  params: Record<string, string | number | boolean | null | undefined>;
  reason: string;
  priority: number;
}

/** Provider-local execution plan produced by `plan()`. */
export interface ProviderExecutionPlan {
  providerId: ResearchProviderId;
  operations: ProviderOperation[];
  reason: string;
  canExecute: boolean;
  missingInputs: string[];
}

/** Normalized provider output — always maps to canonical research shape. */
export interface ProviderExecutionResult {
  providerId: ResearchProviderId;
  status: "success" | "partial" | "unavailable" | "error";
  result: IntelligenceResearchResult;
  durationMs?: number;
  errorMessage?: string;
}

export type ProviderHealthStatus = "healthy" | "degraded" | "unavailable";

/** Result of a provider health probe. */
export interface ProviderHealthCheck {
  providerId: ResearchProviderId;
  status: ProviderHealthStatus;
  checkedAt: string;
  message?: string;
  latencyMs?: number;
}

/** Registry snapshot for diagnostics and dev tooling. */
export interface ProviderRegistrySnapshot {
  providerCount: number;
  providers: Array<{
    id: ResearchProviderId;
    name: string;
    version: string;
    priority: number;
    capabilities: ResearchProviderCapabilities;
  }>;
}
