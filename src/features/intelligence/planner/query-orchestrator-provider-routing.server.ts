import "server-only";

import "@/features/intelligence/providers/bootstrap-providers";

import { providerRegistry } from "../providers/provider-registry";
import type { ResearchProvider } from "../providers/provider.interface";
import { supportsProviderQuery } from "../providers/provider-utils";
import type {
  IntelligenceQuery,
  ResearchPlanProviderRouting,
} from "./query-orchestrator.types";

async function buildUnavailableReasoning(query: IntelligenceQuery): Promise<string> {
  const reasons: string[] = [];

  for (const provider of providerRegistry.getProviders()) {
    if (!supportsProviderQuery(provider, query)) {
      reasons.push(`${provider.name} does not support this query type.`);
      continue;
    }

    const handleDecision = provider.canHandle(query);
    if (!handleDecision.canHandle) {
      reasons.push(`${handleDecision.reason} (${provider.name}).`);
      continue;
    }

    const health = await provider.health();
    if (health.status === "unavailable") {
      reasons.push(health.message ?? `${provider.name} is unavailable.`);
    }
  }

  return reasons.length > 0
    ? reasons.join(" ")
    : "No registered providers can handle this query.";
}

function buildSelectedReasoning(
  selected: ResearchProvider[],
  fallbackProviders: ResearchPlanProviderRouting["fallbackProviders"],
  query: IntelligenceQuery,
): string {
  const primary = selected[0];
  if (!primary) {
    return "No provider selected.";
  }

  const handleDecision = primary.canHandle(query);
  let reasoning = `${primary.name} selected (priority ${primary.priority}) — ${handleDecision.reason}`;

  if (fallbackProviders.length > 0) {
    const fallbackNames = fallbackProviders
      .map((providerId) => providerRegistry.getProvider(providerId)?.name ?? providerId)
      .join(", ");
    reasoning += ` Fallback chain: ${fallbackNames}.`;
  }

  return reasoning;
}

/** Resolves provider routing for a planned intelligence query via the registry. */
export async function resolveResearchPlanProviderRouting(
  query: IntelligenceQuery,
): Promise<ResearchPlanProviderRouting> {
  const orderedProviders = providerRegistry.getProviders().map((provider) => provider.id);
  const selected = await providerRegistry.selectProviders(query);
  const selectedIds = selected.map((provider) => provider.id);
  const selectedProvider = selectedIds[0] ?? null;
  const fallbackProviders = selectedIds.slice(1);
  const reasoning =
    selected.length > 0
      ? buildSelectedReasoning(selected, fallbackProviders, query)
      : await buildUnavailableReasoning(query);

  return {
    selectedProvider,
    orderedProviders,
    fallbackProviders,
    reasoning,
  };
}

/** Attaches registry provider routing to an orchestrated query plan. */
export async function enrichQueryWithProviderRouting(
  query: IntelligenceQuery,
): Promise<IntelligenceQuery> {
  const providerRouting = await resolveResearchPlanProviderRouting(query);

  return {
    ...query,
    researchPlan: {
      ...query.researchPlan,
      providerRouting,
    },
  };
}
