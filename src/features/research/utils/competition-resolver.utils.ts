/**
 * @deprecated Legacy research competition parser — delegates to
 * `@/features/intelligence/competitions`. Prefer `resolveCompetitionFromTopic` there.
 */
import {
  COMPETITION_CATALOG,
  detectCompetitionScopeFromTopic,
  detectCompetitionTimeScopeFromTopic,
  detectSeasonYearFromTopic,
  getApiFootballLeagueId,
  getCanonicalCompetitionName,
  mapCompetitionScopeToRanking,
  resolveCompetitionFromTopic as resolveCanonicalCompetition,
} from "@/features/intelligence/competitions";

import type { RankingCompetition, RankingIntent, RankingTimeScope } from "@/features/research/types/ranking-intent.types";

/** @deprecated Use `CompetitionCatalogEntry` from `@/features/intelligence/competitions`. */
export interface CompetitionDefinition {
  competition: RankingCompetition;
  leagueId: number;
  label: string;
  patterns: RegExp[];
}

/**
 * @deprecated Use `COMPETITION_CATALOG` from `@/features/intelligence/competitions`.
 * Retained for legacy callers (entity phrase rules, player-topic-parser).
 */
export const RANKING_COMPETITIONS: CompetitionDefinition[] = COMPETITION_CATALOG.map(
  (entry) => ({
    competition: mapCompetitionScopeToRanking(entry.scope),
    leagueId: entry.apiFootballLeagueId,
    label: entry.canonicalName,
    patterns: [...entry.patterns],
  }),
);

/** @deprecated Use `CompetitionResolution` from `@/features/intelligence/competitions`. */
export interface ResolvedCompetition {
  competition: RankingCompetition;
  leagueId: number | null;
  label: string;
}

const KNOWN_LEAGUE_COMPETITIONS = new Set<RankingCompetition>(
  RANKING_COMPETITIONS.filter((entry) => entry.competition !== "fifa_world_cup").map(
    (entry) => entry.competition,
  ),
);

/** @deprecated Use `detectCompetitionScopeFromTopic` from `@/features/intelligence/competitions`. */
export function detectCompetitionFromTopic(topic: string): RankingCompetition {
  return mapCompetitionScopeToRanking(detectCompetitionScopeFromTopic(topic));
}

/** @deprecated Use `resolveCompetitionFromTopic` from `@/features/intelligence/competitions`. */
export function resolveCompetitionFromTopic(topic: string): ResolvedCompetition {
  const resolved = resolveCanonicalCompetition(topic);

  return {
    competition: mapCompetitionScopeToRanking(resolved.scope),
    leagueId: resolved.providerIds.apiFootballLeagueId,
    label: resolved.canonicalName,
  };
}

/** @deprecated Use `getCanonicalCompetitionName` from `@/features/intelligence/competitions`. */
export function getCompetitionLabel(competition: RankingCompetition): string {
  return getCanonicalCompetitionName(competition);
}

/** @deprecated Use `getApiFootballLeagueId` from `@/features/intelligence/competitions`. */
export function getCompetitionLeagueId(competition: RankingCompetition): number | null {
  return getApiFootballLeagueId(competition);
}

/** @deprecated Use `isSeasonScopedCompetition` from `@/features/intelligence/competitions`. */
export function isKnownLeagueCompetition(competition: RankingCompetition): boolean {
  return KNOWN_LEAGUE_COMPETITIONS.has(competition);
}

/** @deprecated Use `detectSeasonYearFromTopic` from `@/features/intelligence/competitions`. */
export function detectRankingSeasonFromTopic(topic: string): number | undefined {
  return detectSeasonYearFromTopic(topic);
}

/**
 * Resolves the API-Football season for ranking research.
 * Only returns a season when explicitly present on the intent (from topic year or hints).
 */
export function resolveRankingSeason(intent: RankingIntent): number | undefined {
  if (intent.timeScope === "all_time") {
    return undefined;
  }

  return intent.season;
}

/** @deprecated Use `detectCompetitionTimeScopeFromTopic` from `@/features/intelligence/competitions`. */
export function detectRankingTimeScope(
  topic: string,
  competition: RankingCompetition,
  season?: number,
): RankingTimeScope {
  void competition;
  void season;
  return detectCompetitionTimeScopeFromTopic(topic);
}
