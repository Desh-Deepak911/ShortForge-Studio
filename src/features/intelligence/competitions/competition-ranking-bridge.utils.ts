import type { RankingCompetition } from "@/features/research/types/ranking-intent.types";

import type { CompetitionScope } from "./types";

const RANKING_SCOPES = new Set<RankingCompetition>([
  "premier_league",
  "la_liga",
  "serie_a",
  "bundesliga",
  "ligue_1",
  "champions_league",
  "europa_league",
  "fifa_world_cup",
  "unknown",
]);

/** Maps intelligence competition scope to research ranking competition keys. */
export function mapCompetitionScopeToRanking(scope: CompetitionScope): RankingCompetition {
  if (scope === "unknown") {
    return "unknown";
  }

  return RANKING_SCOPES.has(scope as RankingCompetition)
    ? (scope as RankingCompetition)
    : "unknown";
}

export function isRankingCompetitionScope(scope: CompetitionScope): scope is RankingCompetition {
  return scope !== "unknown" && RANKING_SCOPES.has(scope as RankingCompetition);
}
