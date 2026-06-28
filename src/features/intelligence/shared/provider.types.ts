/** Canonical research provider identifiers. */
export type IntelligenceProviderId =
  | "api-football"
  | "static-fallback"
  | "statsbomb"
  | "manual"
  | "fallback";

/** Capability flags for a research provider. */
export interface ProviderCapabilities {
  teams: boolean;
  players: boolean;
  fixtures: boolean;
  standings: boolean;
  topScorers: boolean;
  lineups: boolean;
  events: boolean;
  statistics: boolean;
}

export type ProviderFetchStatus = "success" | "partial" | "unavailable" | "error";

/**
 * Metadata for a single provider invocation.
 * Canonical model — migrate from `football-research.service` in later phases.
 */
export interface ProviderInvocationMeta {
  providerId: IntelligenceProviderId;
  status: ProviderFetchStatus;
  durationMs?: number;
  errorMessage?: string;
}

/** Contract shape for pluggable research providers (implementation in later phases). */
export interface IntelligenceProvider {
  id: IntelligenceProviderId;
  capabilities: ProviderCapabilities;
  isAvailable(): boolean;
}

export interface ProviderRegistryEntry {
  provider: IntelligenceProvider;
  priority: number;
}
