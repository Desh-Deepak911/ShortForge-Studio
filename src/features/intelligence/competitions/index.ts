export {
  COMPETITION_CATALOG,
  SEASON_REQUIRED_WARNING,
  getCompetitionCatalogEntry,
  isSeasonScopedCompetition,
} from "./competition-catalog";
export {
  detectCompetitionScopeFromTopic,
  detectCompetitionTimeScopeFromTopic,
  detectSeasonYearFromTopic,
  getApiFootballLeagueId,
  getCanonicalCompetitionName,
  resolveCompetitionFromTopic,
} from "./competition-resolver";
export {
  isRankingCompetitionScope,
  mapCompetitionScopeToRanking,
} from "./competition-ranking-bridge.utils";
export type {
  CompetitionCatalogEntry,
  CompetitionConfidence,
  CompetitionProviderIds,
  CompetitionReference,
  CompetitionResolution,
  CompetitionResolutionResult,
  CompetitionScope,
  CompetitionTimeScope,
  ResolveCompetitionInput,
} from "./types";
