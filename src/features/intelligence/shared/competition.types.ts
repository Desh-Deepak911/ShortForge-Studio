/** Canonical competition scope identifiers. */
export type CompetitionScope =
  | "premier_league"
  | "la_liga"
  | "serie_a"
  | "bundesliga"
  | "ligue_1"
  | "champions_league"
  | "europa_league"
  | "fa_cup"
  | "fifa_world_cup"
  | "unknown";

export type CompetitionTimeScope = "season" | "all_time" | "matchday" | "unknown";

/**
 * A competition reference attached to a brief or research query.
 * Canonical model — migrate from `competition-resolver.utils` in later phases.
 */
export interface IntelligenceCompetition {
  scope: CompetitionScope;
  label: string;
  leagueId?: number | null;
  season?: number;
  timeScope?: CompetitionTimeScope;
}

export interface CompetitionResolutionResult {
  competition?: IntelligenceCompetition;
  seasonYear?: number;
  detectedPhrases?: string[];
}
