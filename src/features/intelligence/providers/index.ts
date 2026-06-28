import "./bootstrap-providers";

export type { ResearchProvider } from "./provider.interface";
export {
  ProviderError,
  ProviderExecutionError,
  ProviderNotFoundError,
  ProviderPlanError,
  ProviderUnavailableError,
} from "./provider-errors";
export {
  ProviderRegistry,
  createProviderRegistry,
  providerRegistry,
} from "./provider-registry";
export type {
  ProviderExecutionPlan,
  ProviderExecutionResult,
  ProviderHandleDecision,
  ProviderHealthCheck,
  ProviderOperation,
  ProviderQuery,
  ProviderRegistrySnapshot,
  ProviderHealthStatus,
  ResearchCapability,
  ResearchProviderCapabilities,
  ResearchProviderId,
  ResearchType,
} from "./provider.types";
export {
  createEmptyProviderResult,
  hasCapability,
  resolveResearchTypeFromQuery,
  sortProvidersByPriority,
  supportsEntityType,
  supportsProviderQuery,
  supportsResearchType,
} from "./provider-utils";
export type { ProviderDiagnosticEntry } from "./provider-diagnostics.types";
export type {
  IntelligenceResearchRanking,
  IntelligenceResearchResult,
  IntelligenceResearchResultSeed,
  IntelligenceResearchResultStatus,
  ResearchResultProvenance,
} from "./provider-result.types";
export {
  canAttachRawResearchPayload,
  createIntelligenceResearchResult,
} from "./provider-result.types";
export type { ExecuteResearchPlanOutcome } from "./provider-execute-research-plan.server";
export type {
  ProviderResearchExecutionSummary,
  ProviderResultStatusEntry,
} from "./provider-plan-outcome.utils";
export {
  buildProviderResearchExecutionSummary,
  shouldAcceptProviderPlanOutcome,
} from "./provider-plan-outcome.utils";
export {
  createEmptyResearchResultForCall,
  normalizeProviderExecutionToResearchResult,
} from "./normalize-provider-result.utils";
export { mergeIntelligenceResearchResults } from "./merge-intelligence-research-results.utils";
export {
  isProviderResearchResultEmpty,
  shouldAcceptProviderExecution,
} from "./provider-execution.utils";
export type { ProviderResearchInput } from "./provider-research.types";

/** @deprecated Import from `./provider.types` instead. */
export type { ResearchProviderContext } from "./types";

export { ApiFootballProvider, apiFootballProvider } from "./api-football.provider";
export type { ApiFootballResearchInput } from "./api-football-research.types";

export {
  StaticKnowledgeProvider,
  staticKnowledgeProvider,
} from "./static-knowledge/static-knowledge.provider";
export {
  FIFA_WORLD_CUP_LEAGUE_ID,
  getWorldCupAllTimeTopScorersPlayers,
  listStaticKnowledgeDatasetIds,
} from "./static-knowledge/static-knowledge-catalog.utils";

export { StatsBombProvider, statsBombProvider } from "./stats-bomb.provider";
export {
  STATSBOMB_FUTURE_OPERATIONS,
  STATSBOMB_INTEGRATION_MISSING_INPUT,
  STATSBOMB_UNSUPPORTED,
} from "./stats-bomb.provider.types";
export type { StatsBombFutureOperation } from "./stats-bomb.provider.types";
