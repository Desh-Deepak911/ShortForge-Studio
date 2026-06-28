import type { CompetitionCatalogEntry, CompetitionScope } from "./types";

export const SEASON_REQUIRED_WARNING = "Choose a season to fetch ranking data.";

export const COMPETITION_CATALOG: CompetitionCatalogEntry[] = [
  {
    scope: "fifa_world_cup",
    canonicalName: "FIFA World Cup",
    aliases: ["FIFA World Cup", "World Cup", "WC"],
    patterns: [/\bfifa world cup\b/i, /\bworld cup\b/i],
    apiFootballLeagueId: 1,
  },
  {
    scope: "premier_league",
    canonicalName: "Premier League",
    aliases: ["Premier League", "EPL", "English Premier League"],
    patterns: [/\bpremier league\b/i, /\bepl\b/i],
    apiFootballLeagueId: 39,
  },
  {
    scope: "la_liga",
    canonicalName: "La Liga",
    aliases: ["La Liga", "Spanish La Liga"],
    patterns: [/\bla liga\b/i],
    apiFootballLeagueId: 140,
  },
  {
    scope: "serie_a",
    canonicalName: "Serie A",
    aliases: ["Serie A", "Italian Serie A"],
    patterns: [/\bserie a\b/i],
    apiFootballLeagueId: 135,
  },
  {
    scope: "bundesliga",
    canonicalName: "Bundesliga",
    aliases: ["Bundesliga", "German Bundesliga"],
    patterns: [/\bbundesliga\b/i],
    apiFootballLeagueId: 78,
  },
  {
    scope: "ligue_1",
    canonicalName: "Ligue 1",
    aliases: ["Ligue 1", "French Ligue 1"],
    patterns: [/\bligue 1\b/i],
    apiFootballLeagueId: 61,
  },
  {
    scope: "champions_league",
    canonicalName: "UEFA Champions League",
    aliases: ["UEFA Champions League", "Champions League", "UCL"],
    patterns: [/\bchampions league\b/i, /\bucl\b/i],
    apiFootballLeagueId: 2,
  },
  {
    scope: "europa_league",
    canonicalName: "UEFA Europa League",
    aliases: ["UEFA Europa League", "Europa League", "UEL"],
    patterns: [/\beuropa league\b/i, /\buel\b/i],
    apiFootballLeagueId: 3,
  },
];

const KNOWN_SEASON_SCOPED_COMPETITIONS = new Set<CompetitionScope>(
  COMPETITION_CATALOG.filter((entry) => entry.scope !== "fifa_world_cup").map(
    (entry) => entry.scope,
  ),
);

export function isSeasonScopedCompetition(scope: CompetitionScope): boolean {
  return KNOWN_SEASON_SCOPED_COMPETITIONS.has(scope);
}

export function getCompetitionCatalogEntry(
  scope: CompetitionScope,
): CompetitionCatalogEntry | undefined {
  return COMPETITION_CATALOG.find((entry) => entry.scope === scope);
}
