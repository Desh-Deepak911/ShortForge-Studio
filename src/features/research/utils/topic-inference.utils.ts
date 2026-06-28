import type { FootballResearchMode } from "@/features/research/types/football-research.types";

const MATCH_TOPIC_PATTERN = /\s+vs\.?\s+|\s+v\.?\s+/i;

export type FootballTopicKind = "match" | "team" | "player" | "top_list";

/**
 * Legacy topic/mode heuristic for research routing.
 * @deprecated Fallback only — prefer `resolveTopicKindFromAnalysis` when `IntelligenceAnalysis` is available.
 */
export function inferFootballTopicKind(
  topic: string,
  mode: FootballResearchMode,
): FootballTopicKind {
  if (mode === "top_5") {
    return "top_list";
  }

  if (mode === "player_analysis") {
    return "player";
  }

  if (MATCH_TOPIC_PATTERN.test(topic)) {
    return "match";
  }

  return "team";
}

/**
 * Legacy match topic splitter ("Team A vs Team B").
 * @deprecated Fallback only — prefer `resolveMatchTeamQueries` when `IntelligenceAnalysis` is available.
 */
export function splitMatchTopic(topic: string): string[] {
  return topic
    .split(/\s+vs\.?\s+|\s+v\.?\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseManualFacts(manualContext?: string): string[] {
  const trimmed = manualContext?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}
