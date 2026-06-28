import "server-only";

import type {
  ApiFootballEnvelope,
  ApiFootballFixtureEventsResponse,
  ApiFootballFixtureItem,
  ApiFootballFixtureLineup,
  ApiFootballFixturePlayersResponse,
  ApiFootballFixtureStatistics,
  ApiFootballLeagueItem,
  ApiFootballPlayerSearchItem,
  ApiFootballStandingsResponse,
  ApiFootballTeam,
  ApiFootballTopScorerItem,
  ApiFootballTopScorerRanking,
  GetTopScorersParams,
  SearchFixturesByTeamOptions,
} from "./types";
import { resolveConfiguredSeason } from "./season.utils";

const DEFAULT_BASE_URL = "https://v3.football.api-sports.io";
const DEFAULT_TIMEOUT_MS = 10_000;
const PLACEHOLDER_KEYS = new Set(["your_key_here", ""]);

type QueryParams = Record<string, string | number | undefined>;

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

function logDevError(message: string): void {
  if (isDevelopment()) {
    console.error(`[api-football] ${message}`);
  }
}

function resolveBaseUrl(): string {
  const configured = process.env.API_FOOTBALL_BASE_URL?.trim();
  return configured || DEFAULT_BASE_URL;
}

export function isApiFootballConfigured(): boolean {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  return Boolean(key && !PLACEHOLDER_KEYS.has(key));
}

function getApiFootballKey(): string | null {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key || PLACEHOLDER_KEYS.has(key)) {
    return null;
  }
  return key;
}

function formatEnvelopeErrors(errors: ApiFootballEnvelope<unknown>["errors"]): string | null {
  if (!errors) {
    return null;
  }

  if (Array.isArray(errors)) {
    const messages = errors.filter(Boolean);
    return messages.length > 0 ? messages.join("; ") : null;
  }

  const messages = Object.values(errors).filter(Boolean);
  return messages.length > 0 ? messages.join("; ") : null;
}

/**
 * Safe API-Football GET wrapper. Returns `null` on transport/config/API errors.
 * Returns an array (possibly empty) when the request succeeds.
 */
async function apiFootballRequest<T>(
  path: string,
  params: QueryParams = {},
): Promise<T[] | null> {
  const apiKey = getApiFootballKey();
  if (!apiKey) {
    logDevError("API_FOOTBALL_KEY is not configured");
    return null;
  }

  const url = new URL(path, resolveBaseUrl());

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      logDevError(`HTTP ${response.status} ${path}`);
      return null;
    }

    const body = (await response.json()) as ApiFootballEnvelope<T>;
    const apiError = formatEnvelopeErrors(body.errors);
    if (apiError) {
      logDevError(apiError);
      return null;
    }

    return body.response ?? [];
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      logDevError(`Timeout ${path}`);
    } else {
      logDevError(error instanceof Error ? error.message : `Request failed ${path}`);
    }
    return null;
  }
}

export async function searchTeams(query: string): Promise<ApiFootballTeam[] | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return apiFootballRequest<ApiFootballTeam>("/teams", { search: trimmed });
}

export async function searchLeagues(query: string): Promise<ApiFootballLeagueItem[] | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return apiFootballRequest<ApiFootballLeagueItem>("/leagues", { search: trimmed });
}

export async function searchFixturesByTeam(
  teamId: number,
  options: SearchFixturesByTeamOptions = {},
): Promise<ApiFootballFixtureItem[] | null> {
  if (!Number.isFinite(teamId) || teamId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballFixtureItem>("/fixtures", {
    team: teamId,
    last: options.last,
    next: options.next,
    season: options.season,
    league: options.league,
  });
}

export async function getFixture(fixtureId: number): Promise<ApiFootballFixtureItem | null> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  const results = await apiFootballRequest<ApiFootballFixtureItem>("/fixtures", {
    id: fixtureId,
  });

  if (results === null) {
    return null;
  }

  return results[0] ?? null;
}

export async function getFixtureStatistics(
  fixtureId: number,
): Promise<ApiFootballFixtureStatistics[] | null> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballFixtureStatistics>("/fixtures/statistics", {
    fixture: fixtureId,
  });
}

export async function getFixtureEvents(
  fixtureId: number,
): Promise<ApiFootballFixtureEventsResponse[] | null> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballFixtureEventsResponse>("/fixtures/events", {
    fixture: fixtureId,
  });
}

export async function getFixtureLineups(
  fixtureId: number,
): Promise<ApiFootballFixtureLineup[] | null> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballFixtureLineup>("/fixtures/lineups", {
    fixture: fixtureId,
  });
}

export async function getFixturePlayers(
  fixtureId: number,
): Promise<ApiFootballFixturePlayersResponse[] | null> {
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballFixturePlayersResponse>("/fixtures/players", {
    fixture: fixtureId,
  });
}

export async function getStandings(
  leagueId: number,
  season: number,
): Promise<ApiFootballStandingsResponse[] | null> {
  if (!Number.isFinite(leagueId) || leagueId <= 0 || !Number.isFinite(season) || season <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballStandingsResponse>("/standings", {
    league: leagueId,
    season,
  });
}

export async function getTopScorers(
  params: GetTopScorersParams,
): Promise<ApiFootballTopScorerRanking[] | null> {
  const { leagueId, season } = params;

  if (!Number.isFinite(leagueId) || leagueId <= 0 || !Number.isFinite(season) || season <= 0) {
    return null;
  }

  const results = await apiFootballRequest<ApiFootballTopScorerItem>("/players/topscorers", {
    league: leagueId,
    season,
  });

  if (results === null) {
    return null;
  }

  return normalizeTopScorerRankings(results);
}

function normalizeTopScorerRankings(entries: ApiFootballTopScorerItem[]): ApiFootballTopScorerRanking[] {
  return entries.map((entry, index) => {
    const stats = entry.statistics?.[0];
    const assists = stats?.goals?.assists;
    const appearances = stats?.games?.appearences;

    return {
      rank: index + 1,
      playerName: entry.player.name,
      teamName: stats?.team?.name ?? "",
      goals: stats?.goals?.total ?? null,
      ...(assists != null ? { assists } : {}),
      ...(appearances != null ? { appearances } : {}),
      raw: entry,
    };
  });
}

export async function getPlayerSearch(query: string): Promise<ApiFootballPlayerSearchItem[] | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  return apiFootballRequest<ApiFootballPlayerSearchItem>("/players", {
    search: trimmed,
    season: resolveConfiguredSeason(),
  });
}

export async function getPlayerStatistics(
  playerId: number,
  season?: number,
): Promise<ApiFootballPlayerSearchItem[] | null> {
  if (!Number.isFinite(playerId) || playerId <= 0) {
    return null;
  }

  return apiFootballRequest<ApiFootballPlayerSearchItem>("/players", {
    id: playerId,
    season: season ?? resolveConfiguredSeason(),
  });
}
