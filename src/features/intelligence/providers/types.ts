/** @deprecated Import from `./provider.types` instead. */
export type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderOperation,
  ProviderQuery,
  ProviderRegistrySnapshot,
  ResearchCapability,
  ResearchProviderCapabilities,
  ResearchProviderId,
  ResearchType,
} from "./provider.types";

/** @deprecated Use `ProviderQuery` from `./provider.types` instead. */
export interface ResearchProviderContext {
  topic: string;
  manualContext?: string;
}

/** @deprecated Import `ResearchProvider` from `./provider.interface` instead. */
export type { ResearchProvider } from "./provider.interface";
