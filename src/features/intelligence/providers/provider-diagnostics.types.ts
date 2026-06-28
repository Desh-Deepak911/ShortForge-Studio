import type { IntelligenceProviderId } from "../shared/provider.types";
import type { ProviderHealthStatus } from "./provider.types";

/** Dev-only per-provider research execution telemetry. */
export interface ProviderDiagnosticEntry {
  provider: IntelligenceProviderId;
  providerName: string;
  executionOrder: number;
  latencyMs: number;
  cacheHit: boolean | null;
  success: boolean;
  failure: boolean;
  fallback: boolean;
  confidence: number;
  health: ProviderHealthStatus;
  healthMessage?: string;
  reason?: string;
  selected: boolean;
  executed: boolean;
}
