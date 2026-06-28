/** Supported competition scope for intelligence queries. */
export type CompetitionScope =
  | "premier_league"
  | "la_liga"
  | "serie_a"
  | "bundesliga"
  | "ligue_1"
  | "champions_league"
  | "europa_league"
  | "fifa_world_cup"
  | "unknown";

export type CompetitionTimeScope = "season" | "all_time";

export interface CompetitionConfidence {
  tier: "high" | "medium" | "low";
  percent: number;
  reasoning?: string;
}

export interface CompetitionProviderIds {
  apiFootballLeagueId: number | null;
}

/** Canonical competition resolution output for briefs and research preview. */
export interface CompetitionResolution {
  scope: CompetitionScope;
  canonicalName: string;
  aliases: string[];
  providerIds: CompetitionProviderIds;
  season?: number;
  timeScope: CompetitionTimeScope;
  confidence: CompetitionConfidence;
  warnings: string[];
  matchedPhrase?: string;
}

export interface ResolveCompetitionInput {
  topic: string;
}

export interface CompetitionCatalogEntry {
  scope: CompetitionScope;
  canonicalName: string;
  aliases: readonly string[];
  patterns: readonly RegExp[];
  apiFootballLeagueId: number;
}

/** @deprecated Prefer `CompetitionResolution`. */
export interface CompetitionReference {
  scope: CompetitionScope;
  label: string;
  leagueId?: number | null;
  season?: number;
}

/** @deprecated Prefer `CompetitionResolution`. */
export interface CompetitionResolutionResult {
  competition?: CompetitionReference;
  seasonYear?: number;
}
