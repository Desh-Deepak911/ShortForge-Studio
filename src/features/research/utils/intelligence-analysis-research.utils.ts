import type { IntelligenceAnalysis } from "@/features/intelligence/shared/intelligence-analysis.types";
import type { CompetitionScope } from "@/features/intelligence/shared/competition.types";
import { mapCompetitionScopeToRanking } from "@/features/intelligence/competitions";
import type { CompetitionScope as CatalogCompetitionScope } from "@/features/intelligence/competitions/types";
import type { FootballResearchMode } from "@/features/research/types/football-research.types";
import type {
  ParsedPlayerAnalysisTopic,
  PlayerAnalysisCompetitionKey,
} from "@/features/research/types/player-analysis.types";
import type { RankingIntent, RankingType } from "@/features/research/types/ranking-intent.types";
import {
  buildRankingIntentFromTopic,
  detectRankingLimit,
  detectRankingType,
} from "@/features/research/utils/ranking-intent.utils";
import { parsePlayerAnalysisTopic } from "@/features/research/utils/player-topic-parser.utils";
import type { FootballTopicKind } from "@/features/research/utils/topic-inference.utils";
import {
  inferFootballTopicKind,
  splitMatchTopic,
} from "@/features/research/utils/topic-inference.utils";
import { attachRankingSeasonStatus } from "@/features/research/utils/season-resolution.utils";
import { normalizeTop5ScorersIntent } from "@/features/research/utils/top-scorers-research.utils";

const SCOPE_TO_PLAYER_COMPETITION_KEY: Partial<
  Record<CompetitionScope, PlayerAnalysisCompetitionKey>
> = {
  fifa_world_cup: "fifa_world_cup",
  premier_league: "premier_league",
  la_liga: "la_liga",
  serie_a: "serie_a",
  bundesliga: "bundesliga",
  ligue_1: "ligue_1",
  champions_league: "champions_league",
};

function playerCompetitionKeyFromAnalysis(
  competition: IntelligenceAnalysis["competition"],
  season: number | undefined,
): PlayerAnalysisCompetitionKey | undefined {
  if (!competition || competition.scope === "unknown") {
    return undefined;
  }

  if (competition.scope === "fifa_world_cup" && season === 2026) {
    return "fifa_world_cup_2026";
  }

  return SCOPE_TO_PLAYER_COMPETITION_KEY[competition.scope];
}

function resolveRankingTypeFromAnalysis(
  analysis: IntelligenceAnalysis,
  topic: string,
): RankingType {
  if (analysis.intent.subIntent === "top_scorers") {
    return "top_scorers";
  }

  return detectRankingType(topic);
}

function resolveTimeScopeFromAnalysis(analysis: IntelligenceAnalysis): RankingIntent["timeScope"] {
  if (analysis.competition?.timeScope === "all_time") {
    return "all_time";
  }

  if (analysis.competition?.timeScope === "season" || analysis.season != null) {
    return "season";
  }

  if (analysis.competition?.scope === "fifa_world_cup") {
    return "all_time";
  }

  return "season";
}

/** Maps canonical intelligence analysis to research topic routing. */
export function resolveTopicKindFromAnalysis(
  analysis: IntelligenceAnalysis,
  mode?: FootballResearchMode,
): FootballTopicKind {
  const effectiveMode = mode ?? analysis.selectedMode;
  const primaryIntent = analysis.intent.intent;

  if (effectiveMode === "top_5" || primaryIntent === "ranked_list") {
    return "top_list";
  }

  if (effectiveMode === "player_analysis" || primaryIntent === "player_profile") {
    return "player";
  }

  const teamCount = analysis.entities.filter(
    (entity) => entity.kind === "club" || entity.kind === "national_team",
  ).length;
  const hasMatchEntity = analysis.entities.some((entity) => entity.kind === "match");

  if (
    effectiveMode === "match_preview" ||
    effectiveMode === "match_recap" ||
    effectiveMode === "tactical_review" ||
    primaryIntent === "match_preview" ||
    primaryIntent === "match_recap" ||
    primaryIntent === "tactical_breakdown" ||
    hasMatchEntity ||
    teamCount >= 2
  ) {
    return "match";
  }

  return "team";
}

export function buildRankingIntentFromAnalysis(
  analysis: IntelligenceAnalysis,
  topic: string,
  mode?: FootballResearchMode,
): RankingIntent {
  const competition = analysis.competition
    ? mapCompetitionScopeToRanking(analysis.competition.scope as CatalogCompetitionScope)
    : "unknown";

  const intent: RankingIntent = {
    kind: "ranking",
    rankingType: resolveRankingTypeFromAnalysis(analysis, topic),
    competition,
    timeScope: resolveTimeScopeFromAnalysis(analysis),
    ...(analysis.season != null ? { season: analysis.season } : {}),
    limit: detectRankingLimit(topic, 5),
  };

  return attachRankingSeasonStatus(
    normalizeTop5ScorersIntent(intent, mode ?? analysis.selectedMode),
  );
}

export function resolveResearchTopicKind(input: {
  topic: string;
  mode: FootballResearchMode;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): FootballTopicKind {
  if (input.intelligenceAnalysis) {
    return resolveTopicKindFromAnalysis(input.intelligenceAnalysis, input.mode);
  }

  /** Legacy fallback — mode/topic heuristics when no canonical analysis. */
  return inferFootballTopicKind(input.topic, input.mode);
}

export function resolveResearchRankingIntent(input: {
  topic: string;
  mode: FootballResearchMode;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): RankingIntent | undefined {
  if (input.intelligenceAnalysis) {
    return buildRankingIntentFromAnalysis(
      input.intelligenceAnalysis,
      input.topic,
      input.mode,
    );
  }

  if (input.mode === "top_5") {
    /** Legacy fallback — topic text ranking parser when no canonical analysis. */
    return buildRankingIntentFromTopic(input.topic, 5, input.mode);
  }

  return undefined;
}

export function resolveResearchSeason(input: {
  topic: string;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): number | undefined {
  if (input.intelligenceAnalysis?.season != null) {
    return input.intelligenceAnalysis.season;
  }

  return undefined;
}

/** Player brief fields — prefers canonical analysis; legacy topic parser fills gaps only. */
export function resolvePlayerAnalysisTopic(input: {
  topic: string;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): ParsedPlayerAnalysisTopic {
  const legacy = parsePlayerAnalysisTopic(input.topic);

  if (!input.intelligenceAnalysis) {
    return legacy;
  }

  const analysis = input.intelligenceAnalysis;
  const playerEntity = analysis.entities.find((entity) => entity.kind === "player");
  const season =
    analysis.season ?? analysis.competition?.season ?? legacy.year;

  return {
    playerName: playerEntity?.label?.trim() || legacy.playerName,
    competitionLabel: analysis.competition?.label ?? legacy.competitionLabel,
    competitionKey:
      playerCompetitionKeyFromAnalysis(analysis.competition, season) ??
      legacy.competitionKey,
    year: season,
  };
}

/** Match side labels — prefers analysis entities; legacy topic split is fallback only. */
export function resolveMatchTeamQueries(input: {
  topic: string;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): string[] {
  if (input.intelligenceAnalysis) {
    const matchEntity = input.intelligenceAnalysis.entities.find(
      (entity) => entity.kind === "match",
    );
    const homeTeam = matchEntity?.metadata?.homeTeam;
    const awayTeam = matchEntity?.metadata?.awayTeam;

    if (
      typeof homeTeam === "string" &&
      typeof awayTeam === "string" &&
      homeTeam.trim() &&
      awayTeam.trim()
    ) {
      return [homeTeam.trim(), awayTeam.trim()];
    }

    const teamLabels = input.intelligenceAnalysis.entities
      .filter(
        (entity) => entity.kind === "club" || entity.kind === "national_team",
      )
      .map((entity) => entity.label.trim())
      .filter(Boolean);

    if (teamLabels.length >= 2) {
      return teamLabels.slice(0, 2);
    }
  }

  /** Legacy fallback — splits "Team A vs Team B" from raw topic text. */
  return splitMatchTopic(input.topic);
}

/** Player stats season — prefers analysis season; legacy topic year extraction is fallback. */
export function resolvePlayerStatsSeason(input: {
  topic: string;
  intelligenceAnalysis?: IntelligenceAnalysis;
}): number | undefined {
  const analysisSeason = resolveResearchSeason(input);
  if (analysisSeason != null) {
    return analysisSeason;
  }

  /** Legacy fallback — year extraction from topic text. */
  return parsePlayerAnalysisTopic(input.topic).year;
}
