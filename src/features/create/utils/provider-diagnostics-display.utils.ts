import type { EntityResolverDevDebug } from "@/features/create/types/research-preview-dev.types";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";

export function formatProviderDiagnosticCacheHit(cacheHit: boolean | null): string {
  if (cacheHit === true) {
    return "hit";
  }

  if (cacheHit === false) {
    return "miss";
  }

  return "n/a";
}

export function formatProviderDiagnosticLatency(latencyMs: number): string {
  return `${latencyMs}ms`;
}

/** Merges entity resolver cache telemetry into API-Football provider diagnostics. */
export function enrichProviderDiagnosticsWithEntityCache(
  diagnostics: ProviderDiagnosticEntry[] | undefined,
  entityDebug?: EntityResolverDevDebug,
): ProviderDiagnosticEntry[] | undefined {
  if (!diagnostics?.length) {
    return diagnostics;
  }

  const apiFootballLookups = (entityDebug?.lookups ?? []).filter((lookup) =>
    lookup.provider.toLowerCase().includes("api-football"),
  );

  if (apiFootballLookups.length === 0) {
    return diagnostics;
  }

  const cacheHit = apiFootballLookups.some((lookup) => lookup.cache === "hit")
    ? true
    : apiFootballLookups.some((lookup) => lookup.cache === "miss")
      ? false
      : null;

  return diagnostics.map((entry) =>
    entry.provider === "api-football" && entry.cacheHit == null
      ? { ...entry, cacheHit }
      : entry,
  );
}

export function formatProviderDiagnosticsForDevView(
  diagnostics: ProviderDiagnosticEntry[] | undefined,
): string {
  if (!diagnostics?.length) {
    return "No provider diagnostics yet.";
  }

  return diagnostics
    .map((entry) =>
      [
        `Provider: ${entry.providerName} (${entry.provider})`,
        `Execution order: ${entry.executionOrder}`,
        `Latency: ${formatProviderDiagnosticLatency(entry.latencyMs)}`,
        `Cache hit: ${formatProviderDiagnosticCacheHit(entry.cacheHit)}`,
        `Success: ${entry.success ? "yes" : "no"}`,
        `Failure: ${entry.failure ? "yes" : "no"}`,
        `Fallback: ${entry.fallback ? "yes" : "no"}`,
        `Confidence: ${entry.confidence}%`,
        `Health: ${entry.health}`,
        entry.healthMessage ? `Health note: ${entry.healthMessage}` : null,
        `Selected: ${entry.selected ? "yes" : "no"}`,
        `Executed: ${entry.executed ? "yes" : "no"}`,
        entry.reason ? `Reason: ${entry.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function formatProviderExecutionSummaryForDevView(
  summary:
    | import("@/features/intelligence/providers/provider-plan-outcome.utils").ProviderResearchExecutionSummary
    | undefined,
): string {
  if (!summary) {
    return "No provider execution summary yet.";
  }

  const lines = [
    `Path: ${summary.path}`,
    `Combined status: ${summary.combinedStatus}`,
    `Combined provider: ${summary.combinedProviderId}`,
    "Results:",
    ...summary.results.map(
      (entry) =>
        `- ${entry.providerId}: ${entry.status} (facts=${entry.factCount}, rankings=${entry.rankingCount}, fixtures=${entry.fixtureCount}, warnings=${entry.warningCount})`,
    ),
  ];

  return lines.join("\n");
}
