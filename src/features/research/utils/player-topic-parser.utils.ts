/** @deprecated Use `COMPETITION_CATALOG` from `@/features/intelligence/competitions`. */
import { RANKING_COMPETITIONS } from "@/features/research/utils/competition-resolver.utils";
import type {
  ParsedPlayerAnalysisTopic,
  PlayerAnalysisCompetitionKey,
} from "@/features/research/types/player-analysis.types";

const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;

const FIFA_WORLD_CUP_2026_PATTERNS: RegExp[] = [
  /\bfifa world cup 2026\b/i,
  /\bworld cup 2026\b/i,
  /\bwc 2026\b/i,
];

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function detectYear(topic: string): number | undefined {
  const matches = [...topic.matchAll(YEAR_PATTERN)].map((match) => Number(match[0]));
  const valid = matches.filter((year) => Number.isFinite(year));

  if (valid.length === 0) {
    return undefined;
  }

  return valid[valid.length - 1];
}

function detectFifaWorldCup2026(topic: string): boolean {
  return FIFA_WORLD_CUP_2026_PATTERNS.some((pattern) => pattern.test(topic));
}

function detectCompetition(
  topic: string,
  year?: number,
): { competitionKey?: PlayerAnalysisCompetitionKey; competitionLabel?: string } {
  if (detectFifaWorldCup2026(topic) || (/\bworld cup\b/i.test(topic) && year === 2026)) {
    return {
      competitionKey: "fifa_world_cup_2026",
      competitionLabel: "FIFA World Cup 2026",
    };
  }

  for (const entry of RANKING_COMPETITIONS) {
    if (entry.patterns.some((pattern) => pattern.test(topic))) {
      const competitionKey = entry.competition as PlayerAnalysisCompetitionKey;
      if (entry.competition === "fifa_world_cup" && year != null) {
        return {
          competitionKey: year === 2026 ? "fifa_world_cup_2026" : "fifa_world_cup",
          competitionLabel: `FIFA World Cup ${year}`,
        };
      }

      return {
        competitionKey,
        competitionLabel: entry.label,
      };
    }
  }

  return {};
}

function stripCompetitionPhrases(value: string): string {
  let remainder = value;

  for (const pattern of FIFA_WORLD_CUP_2026_PATTERNS) {
    remainder = remainder.replace(pattern, " ");
  }

  for (const entry of RANKING_COMPETITIONS) {
    for (const pattern of entry.patterns) {
      remainder = remainder.replace(pattern, " ");
    }
  }

  remainder = remainder.replace(/\bfifa\b/gi, " ");
  remainder = remainder.replace(/\bworld cup\b/gi, " ");
  remainder = remainder.replace(/\bin the\b/gi, " ");
  remainder = remainder.replace(/\bat the\b/gi, " ");
  remainder = remainder.replace(/\bfor the\b/gi, " ");

  return normalizeWhitespace(remainder);
}

function stripYears(value: string): string {
  return normalizeWhitespace(value.replace(YEAR_PATTERN, " "));
}

/**
 * Extracts player name, competition, and year from a player-analysis topic string.
 */
/**
 * Legacy player-analysis topic parser (name, competition, season from raw text).
 * @deprecated Fallback only — prefer `resolvePlayerAnalysisTopic` when `IntelligenceAnalysis` is available.
 */
export function parsePlayerAnalysisTopic(topic: string): ParsedPlayerAnalysisTopic {
  const normalizedTopic = normalizeWhitespace(topic);
  const year = detectYear(normalizedTopic);
  const competition = detectCompetition(normalizedTopic, year);

  let playerName = stripCompetitionPhrases(normalizedTopic);
  playerName = stripYears(playerName);
  playerName = playerName.replace(/^[-–—,:;\s]+|[-–—,:;\s]+$/g, "").trim();

  return {
    playerName,
    competitionLabel: competition.competitionLabel,
    competitionKey: competition.competitionKey,
    year,
  };
}

export function buildPlayerSearchQueries(playerName: string): string[] {
  const trimmed = normalizeWhitespace(playerName);
  if (!trimmed) {
    return [];
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const queries = [trimmed];

  if (parts.length > 1) {
    queries.push(parts[parts.length - 1]!);
  }

  return [...new Set(queries)];
}
