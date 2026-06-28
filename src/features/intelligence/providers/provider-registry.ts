import type { IntelligenceQuery } from "../planner/query-orchestrator.types";

import type { ResearchProvider } from "./provider.interface";
import { ProviderNotFoundError } from "./provider-errors";
import {
  executeResearchPlan as executeResearchPlanImpl,
  type ExecuteResearchPlanOutcome,
} from "./provider-execute-research-plan.server";
import { sortProvidersByPriority, supportsProviderQuery } from "./provider-utils";
import {
  shouldIncludeStaticKnowledgeFallback,
} from "./provider-fallback-chain.utils";
import type {
  ProviderQuery,
  ProviderRegistrySnapshot,
  ResearchProviderId,
} from "./provider.types";
import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
import type { ProviderResearchInput } from "./provider-research.types";

export type ProviderExecutionEnrichment = Pick<
  ProviderResearchInput,
  "resolvedEntities" | "entityHints" | "rankingIntent"
>;

export class ProviderRegistry {
  private readonly providers = new Map<ResearchProviderId, ResearchProvider>();

  register(provider: ResearchProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: ResearchProviderId): boolean {
    return this.providers.delete(providerId);
  }

  /** Returns a provider by id. */
  getProvider(providerId: ResearchProviderId): ResearchProvider | undefined {
    return this.providers.get(providerId);
  }

  getOrThrow(providerId: ResearchProviderId): ResearchProvider {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }

    return provider;
  }

  /** All registered providers sorted by priority (lower number = higher priority). */
  getProviders(): ResearchProvider[] {
    return sortProvidersByPriority([...this.providers.values()]);
  }

  /**
   * Selects providers for a query.
   * Rules: highest priority first, supports query, healthy, and `canHandle()`.
   */
  async selectProviders(
    query: ProviderQuery,
    diagnosticsSink?: ProviderDiagnosticEntry[],
  ): Promise<ResearchProvider[]> {
    const selected: ResearchProvider[] = [];

    for (const [index, provider] of this.getProviders().entries()) {
      const startedAt = Date.now();
      const supports = supportsProviderQuery(provider, query);
      const handleDecision = provider.canHandle(query);
      const health = await provider.health();
      const latencyMs = Date.now() - startedAt;
      const isSelected =
        supports && handleDecision.canHandle && health.status !== "unavailable";

      if (diagnosticsSink) {
        diagnosticsSink.push({
          provider: provider.id,
          providerName: provider.name,
          executionOrder: index + 1,
          latencyMs,
          cacheHit: null,
          success: false,
          failure: false,
          fallback: false,
          confidence: handleDecision.confidence,
          health: health.status,
          ...(health.message ? { healthMessage: health.message } : {}),
          reason: !supports
            ? "Does not support this query type."
            : !handleDecision.canHandle
              ? handleDecision.reason
              : health.status === "unavailable"
                ? health.message ?? "Provider unavailable."
                : handleDecision.reason,
          selected: isSelected,
          executed: false,
        });
      }

      if (!supports) {
        continue;
      }

      if (!handleDecision.canHandle) {
        continue;
      }

      if (health.status === "unavailable") {
        continue;
      }

      selected.push(provider);
    }

    if (shouldIncludeStaticKnowledgeFallback(query)) {
      const staticProvider = this.getProvider("static-fallback");
      if (staticProvider && !selected.some((entry) => entry.id === "static-fallback")) {
        selected.push(staticProvider);
      }
    }

    return selected;
  }

  /**
   * Executes the orchestrator research plan: plan → execute per required call,
   * normalizes to canonical results, and collects diagnostics.
   */
  async executeResearchPlan(
    intelligenceQuery: IntelligenceQuery,
    executionEnrichment?: ProviderExecutionEnrichment,
  ): Promise<ExecuteResearchPlanOutcome> {
    return executeResearchPlanImpl(this, intelligenceQuery, executionEnrichment);
  }

  /** @deprecated Use `getProvider`. */
  get(providerId: ResearchProviderId): ResearchProvider | undefined {
    return this.getProvider(providerId);
  }

  /** @deprecated Use `getProviders`. */
  list(): ResearchProvider[] {
    return this.getProviders();
  }

  /** @deprecated Use `selectProviders`. */
  findHandlers(query: ProviderQuery): ResearchProvider[] {
    return this.getProviders().filter((provider) => provider.canHandle(query).canHandle);
  }

  snapshot(): ProviderRegistrySnapshot {
    const providers = this.getProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      version: provider.version,
      priority: provider.priority,
      capabilities: { ...provider.capabilities },
    }));

    return {
      providerCount: providers.length,
      providers,
    };
  }

  clear(): void {
    this.providers.clear();
  }
}

/** Shared registry instance — providers self-register via bootstrap import. */
export const providerRegistry = new ProviderRegistry();

export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}
