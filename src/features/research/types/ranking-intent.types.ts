export type RankingIntentKind = "ranking";

export type RankingType = "top_scorers" | "unknown";

export type RankingCompetition =
  | "premier_league"
  | "la_liga"
  | "serie_a"
  | "bundesliga"
  | "ligue_1"
  | "champions_league"
  | "europa_league"
  | "fifa_world_cup"
  | "unknown";

export type RankingTimeScope = "all_time" | "season";

export type RankingSeasonStatus = "explicit" | "missing_required" | "not_applicable";

export interface RankingIntent {
  kind: RankingIntentKind;
  rankingType: RankingType;
  competition: RankingCompetition;
  timeScope: RankingTimeScope;
  season?: number;
  seasonStatus?: RankingSeasonStatus;
  limit: number;
}
