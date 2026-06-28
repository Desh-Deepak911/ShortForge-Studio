import type { RankingIntent } from "@/features/research/types/ranking-intent.types";
import type { FootballResearchMode } from "@/features/research/types/football-research.types";
import {
  getCompetitionLabel,
  getCompetitionLeagueId,
} from "@/features/research/utils/competition-resolver.utils";
import { FIFA_WORLD_CUP_LEAGUE_ID } from "@/features/research/utils/world-cup-all-time-scorers.utils";

export const FIFA_WORLD_CUP_2026_NO_SCORERS_WARNING =
  "No top scorer data available yet for FIFA World Cup 2026.";

export function isAllTimeWorldCupTopScorersIntent(intent: RankingIntent): boolean {
  return (
    intent.rankingType === "top_scorers" &&
    intent.competition === "fifa_world_cup" &&
    intent.timeScope === "all_time"
  );
}

export function isFifaWorldCup2026SeasonIntent(intent: RankingIntent): boolean {
  return intent.competition === "fifa_world_cup" && intent.season === 2026;
}

/** top_5 mode with a known competition defaults to top-scorers ranking research. */
export function normalizeTop5ScorersIntent(
  intent: RankingIntent,
  mode?: FootballResearchMode,
): RankingIntent {
  if (mode !== "top_5" || intent.competition === "unknown") {
    return intent;
  }

  if (intent.rankingType === "unknown") {
    return {
      ...intent,
      rankingType: "top_scorers",
    };
  }

  return intent;
}

export function shouldResearchTopScorers(
  intent: RankingIntent,
  mode?: FootballResearchMode,
): boolean {
  const normalized = normalizeTop5ScorersIntent(intent, mode);
  return normalized.rankingType === "top_scorers" && normalized.competition !== "unknown";
}

export function resolveTopScorersLeagueId(intent: RankingIntent): number | null {
  if (intent.competition === "fifa_world_cup") {
    return FIFA_WORLD_CUP_LEAGUE_ID;
  }

  return getCompetitionLeagueId(intent.competition);
}

export function buildTopScorersUnavailableWarning(
  intent: RankingIntent,
): string {
  if (isFifaWorldCup2026SeasonIntent(intent)) {
    return FIFA_WORLD_CUP_2026_NO_SCORERS_WARNING;
  }

  const label = getCompetitionLabel(intent.competition);
  const season = intent.season;
  return season != null
    ? `No topscorers data available for ${label} ${season}.`
    : `No topscorers data available for ${label}.`;
}

export function buildTopScorersSeasonUnavailableWarning(intent: RankingIntent): string {
  void intent;
  return "Choose a season to fetch ranking data.";
}
