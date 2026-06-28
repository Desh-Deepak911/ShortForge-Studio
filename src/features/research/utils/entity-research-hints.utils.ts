import type { RankingCompetition, RankingIntent } from "@/features/research/types/ranking-intent.types";
import type { EntityResearchHints } from "@/features/intelligence/entities/entity-research-hints.types";
import { getCompetitionLeagueId } from "@/features/research/utils/competition-resolver.utils";
import { attachRankingSeasonStatus } from "@/features/research/utils/season-resolution.utils";
import { FIFA_WORLD_CUP_LEAGUE_ID } from "@/features/research/utils/world-cup-all-time-scorers.utils";

export function applyEntityHintsToRankingIntent(
  intent: RankingIntent,
  hints?: EntityResearchHints,
): RankingIntent {
  if (!hints) {
    return intent;
  }

  const next: RankingIntent = { ...intent };

  if (hints.competition?.competitionKey) {
    next.competition = hints.competition.competitionKey as RankingCompetition;
  }

  if (hints.season != null) {
    next.season = hints.season;
    next.timeScope = "season";
  }

  return attachRankingSeasonStatus(next);
}

export function resolveLeagueIdFromHintsOrIntent(
  intent: RankingIntent,
  hints?: EntityResearchHints,
): number | null {
  if (hints?.competition?.leagueId != null) {
    return hints.competition.leagueId;
  }

  if (intent.competition === "fifa_world_cup") {
    return FIFA_WORLD_CUP_LEAGUE_ID;
  }

  return getCompetitionLeagueId(intent.competition);
}

export { resolveExplicitRankingSeason as resolveRankingSeasonFromHintsOrIntent } from "@/features/research/utils/season-resolution.utils";
