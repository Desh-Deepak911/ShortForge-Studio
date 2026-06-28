import {
  COMPETITION_CATALOG,
  SEASON_REQUIRED_WARNING,
  getCompetitionCatalogEntry,
  isSeasonScopedCompetition,
} from "./competition-catalog";
import type {
  CompetitionConfidence,
  CompetitionResolution,
  CompetitionScope,
  CompetitionTimeScope,
  ResolveCompetitionInput,
} from "./types";

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

function detectSeasonYear(topic: string): number | undefined {
  const match = topic.match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return undefined;
  }

  const season = Number(match[0]);
  return Number.isFinite(season) ? season : undefined;
}

function detectTimeScope(
  topic: string,
  scope: CompetitionScope,
  season?: number,
): CompetitionTimeScope {
  const normalizedTopic = topic.toLowerCase();

  if (/\ball[- ]time\b|\bever\b|\bhistory\b/i.test(normalizedTopic)) {
    return "all_time";
  }

  if (season != null) {
    return "season";
  }

  if (scope === "fifa_world_cup") {
    return "all_time";
  }

  if (isSeasonScopedCompetition(scope)) {
    return "season";
  }

  return "all_time";
}

function buildWarnings(
  scope: CompetitionScope,
  timeScope: CompetitionTimeScope,
  season?: number,
): string[] {
  const warnings: string[] = [];

  if (timeScope === "season" && season == null && isSeasonScopedCompetition(scope)) {
    warnings.push(SEASON_REQUIRED_WARNING);
  }

  return warnings;
}

function buildConfidence(scope: CompetitionScope, matchedPhrase?: string): CompetitionConfidence {
  if (scope === "unknown") {
    return {
      tier: "low",
      percent: 0,
      reasoning: "No known competition phrase detected.",
    };
  }

  return {
    tier: "high",
    percent: matchedPhrase ? 88 : 84,
    reasoning: matchedPhrase
      ? `Matched competition phrase "${matchedPhrase}".`
      : "Matched known competition catalog entry.",
  };
}

function matchCatalogEntry(topic: string): {
  scope: CompetitionScope;
  canonicalName: string;
  aliases: string[];
  apiFootballLeagueId: number;
  matchedPhrase?: string;
} | null {
  for (const entry of COMPETITION_CATALOG) {
    for (const pattern of entry.patterns) {
      if (
        entry.scope === "fifa_world_cup" &&
        pattern.source.includes("world cup") &&
        !pattern.source.includes("fifa") &&
        /\bfifa world cup\b/i.test(topic)
      ) {
        continue;
      }

      const match = topic.match(pattern);
      if (match) {
        return {
          scope: entry.scope,
          canonicalName: entry.canonicalName,
          aliases: [...entry.aliases],
          apiFootballLeagueId: entry.apiFootballLeagueId,
          matchedPhrase: match[0],
        };
      }
    }
  }

  return null;
}

function buildUnknownResolution(): CompetitionResolution {
  return {
    scope: "unknown",
    canonicalName: "Unknown competition",
    aliases: [],
    providerIds: { apiFootballLeagueId: null },
    timeScope: "all_time",
    confidence: buildConfidence("unknown"),
    warnings: [],
  };
}

/**
 * Canonical competition resolver — single source of truth for brief competition parsing.
 */
export function resolveCompetitionFromTopic(
  input: ResolveCompetitionInput | string,
): CompetitionResolution {
  const topic = normalizeTopic(typeof input === "string" ? input : input.topic);
  if (!topic) {
    return buildUnknownResolution();
  }

  const match = matchCatalogEntry(topic);
  if (!match) {
    return buildUnknownResolution();
  }

  const season = detectSeasonYear(topic);
  const timeScope = detectTimeScope(topic, match.scope, season);

  return {
    scope: match.scope,
    canonicalName: match.canonicalName,
    aliases: match.aliases,
    providerIds: { apiFootballLeagueId: match.apiFootballLeagueId },
    ...(season != null ? { season } : {}),
    timeScope,
    confidence: buildConfidence(match.scope, match.matchedPhrase),
    warnings: buildWarnings(match.scope, timeScope, season),
    ...(match.matchedPhrase ? { matchedPhrase: match.matchedPhrase } : {}),
  };
}

export function detectCompetitionScopeFromTopic(topic: string): CompetitionScope {
  return resolveCompetitionFromTopic(topic).scope;
}

export function detectSeasonYearFromTopic(topic: string): number | undefined {
  return resolveCompetitionFromTopic(topic).season;
}

export function detectCompetitionTimeScopeFromTopic(topic: string): CompetitionTimeScope {
  return resolveCompetitionFromTopic(topic).timeScope;
}

export function getCanonicalCompetitionName(scope: CompetitionScope): string {
  if (scope === "unknown") {
    return "Unknown competition";
  }

  return COMPETITION_CATALOG.find((entry) => entry.scope === scope)?.canonicalName ?? scope;
}

export function getApiFootballLeagueId(scope: CompetitionScope): number | null {
  if (scope === "unknown") {
    return null;
  }

  return getCompetitionCatalogEntry(scope)?.apiFootballLeagueId ?? null;
}
