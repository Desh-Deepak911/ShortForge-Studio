/** @deprecated Legacy provider registry adapters — test/legacy only. Do not use in production path. */
export {
  buildProviderQueryFromResearchInput,
  resolveNoProviderWarnings,
  runRegistryResearch,
  runRegistryResearchDetailed,
  type RegistryResearchOutcome,
} from "./provider-research.legacy.server";
export { mergeProviderResults } from "../provider-utils";
export {
  executionResultToFootballContext,
  footballContextToResearchResult,
  researchResultToFootballContext,
} from "./football-research-to-result.legacy.utils";
export {
  denormalizeFootballResearchContext,
  normalizeFootballResearchContext,
} from "../api-football-normalizer.utils";
export { executeApiFootballResearch } from "../api-football-research.engine";
export { executeStaticKnowledgeResearch } from "../static-knowledge/static-knowledge-research.engine";
export {
  providerPlanOutcomeToFootballContext,
  buildRegistryFallbackExecutionSummary,
} from "./provider-plan-outcome.legacy";
