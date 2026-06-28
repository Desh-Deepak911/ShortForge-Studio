import type { EntityKind } from "../shared/entity.types";

import type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderQuery,
  ResearchProviderCapabilities,
  ResearchProviderId,
  ResearchType,
} from "./provider.types";

/**
 * Canonical contract for pluggable football research providers.
 * Implementations return normalized results only — no raw provider payloads.
 */
export interface ResearchProvider {
  readonly id: ResearchProviderId;
  readonly name: string;
  readonly version: string;
  readonly priority: number;
  readonly supportedEntityTypes: readonly EntityKind[];
  readonly supportedResearchTypes: readonly ResearchType[];
  readonly capabilities: ResearchProviderCapabilities;

  /** Whether this provider can contribute to the given orchestrated query. */
  canHandle(query: ProviderQuery): ProviderHandleDecision;

  /** Build a provider-local execution plan without calling external APIs. */
  plan(query: ProviderQuery): ProviderExecutionPlan;

  /** Execute the plan and return a normalized research result. */
  execute(query: ProviderQuery, plan: ProviderExecutionPlan): Promise<ProviderExecutionResult>;

  /** Lightweight availability / connectivity probe. */
  health(): Promise<ProviderHealthCheck>;
}
