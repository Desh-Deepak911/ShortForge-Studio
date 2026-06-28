import type { EntityResearchHints } from "@/features/intelligence/entities/entity-research-hints.types";
import type { RankingIntent, RankingSeasonStatus } from "@/features/research/types/ranking-intent.types";

import { SEASON_REQUIRED_WARNING } from "@/features/intelligence/competitions";

export const RANKING_SEASON_REQUIRED_WARNING = SEASON_REQUIRED_WARNING;

export function topicHasExplicitYear(text: string): boolean {
  return /\b(19|20)\d{2}\b/.test(text);
}

export function rankingRequiresSeasonEndpoint(intent: RankingIntent): boolean {
  return intent.timeScope === "season";
}

export function attachRankingSeasonStatus(intent: RankingIntent): RankingIntent {
  if (intent.timeScope === "all_time") {
    return { ...intent, seasonStatus: "not_applicable" };
  }

  if (intent.season != null) {
    return { ...intent, seasonStatus: "explicit" };
  }

  if (rankingRequiresSeasonEndpoint(intent)) {
    return { ...intent, seasonStatus: "missing_required" };
  }

  return { ...intent, seasonStatus: "not_applicable" };
}

export function resolveExplicitRankingSeason(
  intent: RankingIntent,
  hints?: EntityResearchHints,
): number | undefined {
  if (intent.timeScope === "all_time") {
    return undefined;
  }

  if (hints?.season != null) {
    return hints.season;
  }

  if (intent.season != null) {
    return intent.season;
  }

  return undefined;
}

export function isMissingRequiredRankingSeason(intent: RankingIntent): boolean {
  return attachRankingSeasonStatus(intent).seasonStatus === "missing_required";
}

export function seasonStatusLabel(status?: RankingSeasonStatus): string | undefined {
  switch (status) {
    case "explicit":
      return "explicit";
    case "missing_required":
      return "missing_required";
    case "not_applicable":
      return "not_applicable";
    default:
      return undefined;
  }
}
