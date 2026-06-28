export { INTELLIGENCE_SCHEMA_VERSION } from "./types";
export type { IntelligenceModuleMeta } from "./types";

export type {
  EntityKind,
  EntityResolutionResult,
  EntityResolutionStatus,
  IntelligenceEntity,
  MatchupEntities,
} from "./entity.types";

export type {
  CompetitionResolutionResult,
  CompetitionScope,
  CompetitionTimeScope,
  IntelligenceCompetition,
} from "./competition.types";

export type {
  IntelligenceProvider,
  IntelligenceProviderId,
  ProviderCapabilities,
  ProviderFetchStatus,
  ProviderInvocationMeta,
  ProviderRegistryEntry,
} from "./provider.types";

export type {
  ConfidenceScore,
  ConfidenceTier,
  ConfidenceThresholds,
  IntelligenceConfidenceReport,
} from "./confidence.types";
export { DEFAULT_CONFIDENCE_THRESHOLDS } from "./confidence.types";

export type {
  FactProvenance,
  IntelligenceFact,
  KnowledgeEdge,
  KnowledgeGraph,
  KnowledgeNode,
} from "./knowledge.types";

export type {
  IntelligenceAnalysisDiagnostics,
  IntelligenceAnalysis,
} from "./intelligence-analysis.types";
export {
  intelligenceQueryToAnalysis,
  legacyIntelligenceAnalysisToPartial,
} from "./intelligence-analysis.utils";

export type {
  EnrichedIntelligenceQuery,
  IntelligenceContentMode,
  IntelligenceQuery,
  ParsedTopicSignals,
} from "./query.types";

export type {
  IntelligenceResearchRanking,
  IntelligenceResearchResult,
  IntelligenceResearchResultSeed,
  IntelligenceResearchResultStatus,
  ResearchResultProvenance,
} from "../providers/provider-result.types";

export type { ResolvedResearchContext } from "./research.types";
