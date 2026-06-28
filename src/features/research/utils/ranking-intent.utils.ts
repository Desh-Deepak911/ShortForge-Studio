import type {
  RankingIntent,
  RankingType,
} from "@/features/research/types/ranking-intent.types";
import type { FootballResearchMode } from "@/features/research/types/football-research.types";

import {
  mapCompetitionScopeToRanking,
  resolveCompetitionFromTopic as resolveCanonicalCompetition,
} from "@/features/intelligence/competitions";
import { attachRankingSeasonStatus } from "./season-resolution.utils";
import { normalizeTop5ScorersIntent } from "./top-scorers-research.utils";

const TOP_SCORERS_PATTERNS: RegExp[] = [
  /\btop scorers\b/i,
  /\bhighest goal scorers\b/i,
  /\bgoal scorers\b/i,
  /\bgoal scorer\b/i,
  /\bgolden boot\b/i,
  /\bmost goals\b/i,
];

const DEFAULT_RANKING_LIMIT = 5;
const MAX_RANKING_LIMIT = 10;

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

/** Legacy topic parser — ranking metric detection only. */
export function detectRankingType(topic: string): RankingType {
  const normalizedTopic = normalizeTopic(topic);
  if (TOP_SCORERS_PATTERNS.some((pattern) => pattern.test(normalizedTopic))) {
    return "top_scorers";
  }

  if (/\bscorers?\b/i.test(normalizedTopic) && /\btop\b|\bhighest\b|\bmost\b/i.test(normalizedTopic)) {
    return "top_scorers";
  }

  return "unknown";
}

/** Legacy topic parser — list size detection only. */
export function detectRankingLimit(topic: string, defaultLimit = DEFAULT_RANKING_LIMIT): number {
  const topNumberMatch = topic.match(/\btop\s+(\d{1,2})\b/i);
  if (topNumberMatch) {
    const parsed = Number(topNumberMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(MAX_RANKING_LIMIT, Math.round(parsed));
    }
  }

  if (/\btop five\b/i.test(topic)) {
    return 5;
  }

  return defaultLimit;
}

/**
 * Parses a top_5 brief into structured ranking intent (competition, metric, time scope).
 * @deprecated Fallback only — prefer `buildRankingIntentFromAnalysis` when `IntelligenceAnalysis` is available.
 */
export function parseRankingIntent(
  topic: string,
  defaultLimit = DEFAULT_RANKING_LIMIT,
  mode?: FootballResearchMode,
): RankingIntent {
  const normalizedTopic = normalizeTopic(topic);
  const competitionResolution = resolveCanonicalCompetition(normalizedTopic);
  const competition = mapCompetitionScopeToRanking(competitionResolution.scope);
  const season = competitionResolution.season;
  const timeScope = competitionResolution.timeScope;

  const intent: RankingIntent = {
    kind: "ranking",
    rankingType: detectRankingType(normalizedTopic),
    competition,
    timeScope,
    ...(season != null ? { season } : {}),
    limit: detectRankingLimit(normalizedTopic, defaultLimit),
  };

  return attachRankingSeasonStatus(normalizeTop5ScorersIntent(intent, mode));
}

/** @deprecated Prefer `buildRankingIntentFromAnalysis` when `IntelligenceAnalysis` is available. */
export const buildRankingIntentFromTopic = parseRankingIntent;

export function isTopScorersWorldCupIntent(intent: RankingIntent): boolean {
  return intent.rankingType === "top_scorers" && intent.competition === "fifa_world_cup";
}

export function isTopScorersRankingIntent(
  intent: RankingIntent,
  mode?: FootballResearchMode,
): boolean {
  const normalized = normalizeTop5ScorersIntent(intent, mode);
  return normalized.rankingType === "top_scorers" && normalized.competition !== "unknown";
}
