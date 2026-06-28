import "server-only";

import type { IntelligenceQuery, ResearchCall } from "../planner/query-orchestrator.types";

import type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
import { shouldAcceptProviderExecution } from "./provider-execution.utils";
import {
  shouldIncludeStaticKnowledgeFallback,
  shouldOfferStaticFallbackForCall,
} from "./provider-fallback-chain.utils";
import type { ResearchProvider } from "./provider.interface";
import type { ProviderRegistry } from "./provider-registry";
import type { ProviderExecutionResult, ProviderQuery, ResearchProviderId } from "./provider.types";

function addProviderToChain(
  chain: ResearchProvider[],
  seen: Set<ResearchProviderId>,
  provider: ResearchProvider | undefined,
): void {
  if (!provider || seen.has(provider.id)) {
    return;
  }

  chain.push(provider);
  seen.add(provider.id);
}

/** Ordered provider chain for full-plan registry research. */
export function resolveProviderFallbackChain(
  registry: ProviderRegistry,
  query: ProviderQuery,
  selectedProviders: ResearchProvider[],
): ResearchProvider[] {
  const chain: ResearchProvider[] = [];
  const seen = new Set<ResearchProviderId>();

  for (const providerId of query.researchPlan.requiredProviders) {
    addProviderToChain(chain, seen, registry.getProvider(providerId));
  }

  for (const provider of selectedProviders) {
    addProviderToChain(chain, seen, provider);
  }

  for (const providerId of query.researchPlan.providerRouting?.fallbackProviders ?? []) {
    addProviderToChain(chain, seen, registry.getProvider(providerId));
  }

  if (shouldIncludeStaticKnowledgeFallback(query)) {
    addProviderToChain(chain, seen, registry.getProvider("static-fallback"));
  }

  return chain;
}

/** Ordered provider chain for a single planned research call. */
export function resolveCallProviderChain(
  registry: ProviderRegistry,
  call: ResearchCall,
  query: IntelligenceQuery,
): ResearchProvider[] {
  const chain: ResearchProvider[] = [];
  const seen = new Set<ResearchProviderId>();
  const primaryId = call.provider as ResearchProviderId;

  addProviderToChain(chain, seen, registry.getProvider(primaryId));

  if (primaryId === "statsbomb") {
    addProviderToChain(chain, seen, registry.getProvider("api-football"));
    addProviderToChain(chain, seen, registry.getProvider("static-fallback"));
    return chain;
  }

  if (primaryId === "api-football" && shouldOfferStaticFallbackForCall(call, query)) {
    addProviderToChain(chain, seen, registry.getProvider("static-fallback"));
  }

  for (const providerId of query.researchPlan.providerRouting?.fallbackProviders ?? []) {
    addProviderToChain(chain, seen, registry.getProvider(providerId));
  }

  return chain;
}

export function ensureProviderDiagnosticEntry(
  diagnostics: ProviderDiagnosticEntry[],
  provider: ResearchProvider,
  executionOrder: number,
  existing?: ProviderDiagnosticEntry,
): ProviderDiagnosticEntry {
  if (existing) {
    existing.executionOrder = executionOrder;
    return existing;
  }

  const matched = diagnostics.find((entry) => entry.provider === provider.id);
  if (matched) {
    matched.executionOrder = executionOrder;
    return matched;
  }

  const entry: ProviderDiagnosticEntry = {
    provider: provider.id,
    providerName: provider.name,
    executionOrder,
    latencyMs: 0,
    cacheHit: null,
    success: false,
    failure: false,
    fallback: executionOrder > 1,
    confidence: 0,
    health: "healthy",
    selected: executionOrder === 1,
    executed: false,
  };

  diagnostics.push(entry);
  return entry;
}

export function recordProviderAttemptDiagnostic(
  diagnosticEntry: ProviderDiagnosticEntry | undefined,
  executionStartedAt: number,
  executionAttempt: number,
  accepted: boolean,
  reason?: string,
): void {
  if (!diagnosticEntry) {
    return;
  }

  diagnosticEntry.executed = true;
  diagnosticEntry.latencyMs += Date.now() - executionStartedAt;
  diagnosticEntry.fallback = executionAttempt > 1;
  diagnosticEntry.success = accepted;
  diagnosticEntry.failure = !accepted;

  if (reason) {
    diagnosticEntry.reason = reason;
  }
}

export interface ProviderChainExecutionResult {
  execution: ProviderExecutionResult;
  provider: ResearchProvider;
  attempt: number;
}

/** Executes providers in order until one returns acceptable research. Never throws. */
export async function executeProviderFallbackChain(
  query: ProviderQuery,
  providers: ResearchProvider[],
  options?: {
    collectDiagnostics?: boolean;
    diagnostics?: ProviderDiagnosticEntry[];
    initialAttempt?: number;
    findExistingDiagnostic?: (providerId: ResearchProviderId) => ProviderDiagnosticEntry | undefined;
  },
): Promise<ProviderChainExecutionResult | null> {
  let attempt = options?.initialAttempt ?? 0;

  for (const provider of providers) {
    attempt += 1;
    const executionStartedAt = Date.now();
    const diagnosticEntry =
      options?.collectDiagnostics && options.diagnostics
        ? ensureProviderDiagnosticEntry(
            options.diagnostics,
            provider,
            attempt,
            options.findExistingDiagnostic?.(provider.id),
          )
        : undefined;

    if (diagnosticEntry) {
      diagnosticEntry.fallback = attempt > 1;
      if (attempt > 1) {
        diagnosticEntry.selected = true;
      }
    }

    try {
      const health = await provider.health();
      if (diagnosticEntry) {
        diagnosticEntry.health = health.status;
        if (health.message) {
          diagnosticEntry.healthMessage = health.message;
        }
      }

      if (health.status === "unavailable") {
        recordProviderAttemptDiagnostic(
          diagnosticEntry,
          executionStartedAt,
          attempt,
          false,
          health.message ?? `${provider.name} unavailable.`,
        );
        continue;
      }

      const handleDecision = provider.canHandle(query);
      if (diagnosticEntry) {
        diagnosticEntry.confidence = handleDecision.confidence;
      }

      if (!handleDecision.canHandle) {
        recordProviderAttemptDiagnostic(
          diagnosticEntry,
          executionStartedAt,
          attempt,
          false,
          handleDecision.reason,
        );
        continue;
      }

      const plan = provider.plan(query);
      const execution = await provider.execute(query, plan);

      if (shouldAcceptProviderExecution(execution)) {
        recordProviderAttemptDiagnostic(diagnosticEntry, executionStartedAt, attempt, true);
        return { execution, provider, attempt };
      }

      recordProviderAttemptDiagnostic(
        diagnosticEntry,
        executionStartedAt,
        attempt,
        false,
        execution.errorMessage ??
          execution.result.warnings[0] ??
          `${provider.name} returned ${execution.result.status}.`,
      );
    } catch (error) {
      recordProviderAttemptDiagnostic(
        diagnosticEntry,
        executionStartedAt,
        attempt,
        false,
        error instanceof Error ? error.message : "Provider execution failed.",
      );
    }
  }

  return null;
}
