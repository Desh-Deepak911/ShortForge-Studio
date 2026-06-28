import "server-only";

import {
  getPlayerSearch,
  isApiFootballConfigured,
  resolveConfiguredSeason,
  searchLeagues,
  searchTeams,
} from "@/lib/football";
import type { ApiFootballLeagueItem, ApiFootballPlayerSearchItem } from "@/lib/football";
import { resolveCompetitionFromTopic as resolveCanonicalCompetition } from "@/features/intelligence/competitions";
import { mapCompetitionScopeToRanking } from "@/features/intelligence/competitions";

import {
  buildProviderResolution,
  confidenceFromRawScore,
  scoreCountryMatch,
  scoreNameMatch,
} from "./entity-api-scoring.utils";
import type {
  EntityProviderResolution,
  EntityResolveOptions,
  ScoredResolvedEntity,
} from "./entity-provider.types";
import { createEntityConfidence, createResolvedEntity, normalizeEntityName } from "./entity-utils";
import {
  cacheScopeFromOptions,
  resolveWithEntityCache,
} from "./entity-cache-resolver.utils";

function resolveOptions(options?: EntityResolveOptions) {
  return {
    minResolvePercent: options?.minResolvePercent,
    ambiguityGap: options?.ambiguityGap,
    entityType: options?.entityType,
    seasonYear: options?.seasonYear,
    inferConfiguredSeason: options?.inferConfiguredSeason,
    skipCache: options?.skipCache,
    cache: options?.cache,
    cacheTtlMs: options?.cacheTtlMs,
  };
}

function scorePlayerEntry(
  query: string,
  entry: ApiFootballPlayerSearchItem,
): number {
  let score = scoreNameMatch(query, entry.player.name);

  const nationality = entry.player.nationality;
  if (nationality && normalizeEntityName(query).includes(normalizeEntityName(nationality))) {
    score += 5;
  }

  const latestStats = entry.statistics?.[0];
  if (latestStats?.team?.name) {
    score += Math.min(8, scoreNameMatch(query, latestStats.team.name) * 0.1);
  }

  return score;
}

function mapPlayerToResolved(
  entry: ApiFootballPlayerSearchItem,
  score: number,
): ScoredResolvedEntity {
  const latestStats = entry.statistics?.[0];

  return {
    score,
    entity: createResolvedEntity({
      id: `player:${entry.player.id}`,
      name: entry.player.name,
      displayName: entry.player.name,
      type: "player",
      provider: "api-football",
      externalId: entry.player.id,
      confidence: confidenceFromRawScore(score),
      aliases: [],
      metadata: {
        nationality: entry.player.nationality ?? null,
        age: entry.player.age ?? null,
        team: latestStats?.team?.name ?? null,
        league: latestStats?.league?.name ?? null,
        season: latestStats?.league?.season ?? null,
      },
    }),
  };
}

function mapTeamToResolved(
  entry: { team: { id: number; name: string; country?: string } },
  score: number,
  entityType: "club" | "national_team" = "club",
): ScoredResolvedEntity {
  return {
    score,
    entity: createResolvedEntity({
      id: `${entityType}:${entry.team.id}`,
      name: entry.team.name,
      displayName: entry.team.name,
      type: entityType,
      provider: "api-football",
      externalId: entry.team.id,
      confidence: confidenceFromRawScore(score),
      aliases: [],
      metadata: {
        country: entry.team.country ?? null,
      },
    }),
  };
}

function mapLeagueToResolved(
  entry: ApiFootballLeagueItem,
  score: number,
): ScoredResolvedEntity {
  const type = entry.league.type?.toLowerCase() === "cup" ? "competition" : "league";

  return {
    score,
    entity: createResolvedEntity({
      id: `${type}:${entry.league.id}`,
      name: entry.league.name,
      displayName: entry.league.name,
      type,
      provider: "api-football",
      externalId: entry.league.id,
      confidence: confidenceFromRawScore(score),
      aliases: [],
      metadata: {
        country: entry.country?.name ?? null,
        countryCode: entry.country?.code ?? null,
        leagueType: entry.league.type ?? null,
      },
    }),
  };
}

function mapCountryToResolved(
  countryName: string,
  score: number,
  teamId?: number,
): ScoredResolvedEntity {
  const normalized = normalizeEntityName(countryName);

  return {
    score,
    entity: createResolvedEntity({
      id: `country:${normalized}`,
      name: countryName,
      displayName: countryName,
      type: "country",
      provider: "api-football",
      confidence: confidenceFromRawScore(score),
      aliases: [],
      ...(teamId != null ? { externalId: teamId } : {}),
      metadata: {
        inferredFromTeam: teamId ?? null,
      },
    }),
  };
}

function dedupeCountriesByName(scored: ScoredResolvedEntity[]): ScoredResolvedEntity[] {
  const byName = new Map<string, ScoredResolvedEntity>();

  for (const entry of scored) {
    const key = normalizeEntityName(entry.entity.displayName);
    const existing = byName.get(key);
    if (!existing || entry.score > existing.score) {
      byName.set(key, entry);
    }
  }

  return [...byName.values()];
}

function parseSeasonYear(query: string): number | null {
  const match = query.trim().match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

/**
 * Resolves a player via API-Football `/players/profiles` search.
 */
export async function resolvePlayer(
  query: string,
  options?: EntityResolveOptions,
): Promise<EntityProviderResolution> {
  const opts = resolveOptions(options);
  const trimmed = query.trim();
  const providerAvailable = isApiFootballConfigured();

  if (!trimmed) {
    return {
      query,
      kind: "player",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "Empty player query.",
      }),
      reasoning: "Empty player query — no lookup performed.",
    };
  }

  return resolveWithEntityCache({
    kind: "player",
    query: trimmed,
    skipCache: opts.skipCache,
    cache: opts.cache,
    cacheTtlMs: opts.cacheTtlMs,
    resolve: async () => {
      const entries = providerAvailable ? await getPlayerSearch(trimmed) : null;
      const scored = (entries ?? []).map((entry) =>
        mapPlayerToResolved(entry, scorePlayerEntry(trimmed, entry)),
      );

      return buildProviderResolution({
        query: trimmed,
        kind: "player",
        scored,
        providerAvailable,
        baseReasoning: `Player lookup for "${trimmed}".`,
        minResolvePercent: opts.minResolvePercent,
        ambiguityGap: opts.ambiguityGap,
      });
    },
  });
}

/**
 * Resolves a club or national team via API-Football `/teams` search.
 */
export async function resolveTeam(
  query: string,
  options?: EntityResolveOptions,
): Promise<EntityProviderResolution> {
  const opts = resolveOptions(options);
  const trimmed = query.trim();
  const entityType = opts.entityType ?? "club";
  const providerAvailable = isApiFootballConfigured();

  if (!trimmed) {
    return {
      query,
      kind: "team",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "Empty team query.",
      }),
      reasoning: "Empty team query — no lookup performed.",
    };
  }

  return resolveWithEntityCache({
    kind: "team",
    query: trimmed,
    scope: cacheScopeFromOptions("team", options),
    skipCache: opts.skipCache,
    cache: opts.cache,
    cacheTtlMs: opts.cacheTtlMs,
    resolve: async () => {
      const entries = providerAvailable ? await searchTeams(trimmed) : null;
      const scored = (entries ?? []).map((entry) => {
        let score = scoreNameMatch(trimmed, entry.team.name);
        if (entry.team.country) {
          score += Math.min(10, scoreCountryMatch(trimmed, entry.team.country) * 0.15);
        }

        return mapTeamToResolved(entry, score, entityType);
      });

      return buildProviderResolution({
        query: trimmed,
        kind: "team",
        scored,
        providerAvailable,
        baseReasoning: `Team lookup for "${trimmed}" (${entityType}).`,
        minResolvePercent: opts.minResolvePercent,
        ambiguityGap: opts.ambiguityGap,
      });
    },
  });
}

/**
 * Resolves a competition or league — catalog match first, then API-Football `/leagues` search.
 */
export async function resolveCompetition(
  query: string,
  options?: EntityResolveOptions,
): Promise<EntityProviderResolution> {
  const opts = resolveOptions(options);
  const trimmed = query.trim();
  const providerAvailable = isApiFootballConfigured();

  if (!trimmed) {
    return {
      query,
      kind: "competition",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "Empty competition query.",
      }),
      reasoning: "Empty competition query — no lookup performed.",
    };
  }

  return resolveWithEntityCache({
    kind: "competition",
    query: trimmed,
    skipCache: opts.skipCache,
    cache: opts.cache,
    cacheTtlMs: opts.cacheTtlMs,
    resolve: async () => {
      const catalogMatch = resolveCanonicalCompetition(trimmed);
      if (
        catalogMatch.providerIds.apiFootballLeagueId != null &&
        catalogMatch.scope !== "unknown"
      ) {
        const catalogScore = 96;
        const competitionKey = mapCompetitionScopeToRanking(catalogMatch.scope);
        const scored: ScoredResolvedEntity[] = [
          {
            score: catalogScore,
            entity: createResolvedEntity({
              id: `competition:${catalogMatch.providerIds.apiFootballLeagueId}`,
              name: catalogMatch.canonicalName,
              displayName: catalogMatch.canonicalName,
              type: "competition",
              provider: "api-football",
              externalId: catalogMatch.providerIds.apiFootballLeagueId,
              confidence: confidenceFromRawScore(catalogScore),
              aliases: catalogMatch.aliases,
              metadata: {
                competitionKey,
                source: "catalog",
                timeScope: catalogMatch.timeScope,
                ...(catalogMatch.season != null ? { season: catalogMatch.season } : {}),
              },
            }),
          },
        ];

        return buildProviderResolution({
          query: trimmed,
          kind: "competition",
          scored,
          providerAvailable,
          baseReasoning: `Competition matched from canonical catalog: "${catalogMatch.canonicalName}".`,
          minResolvePercent: opts.minResolvePercent,
          ambiguityGap: opts.ambiguityGap,
        });
      }

      const entries = providerAvailable ? await searchLeagues(trimmed) : null;
      const scored = (entries ?? []).map((entry) => {
        let score = scoreNameMatch(trimmed, entry.league.name);
        if (entry.country?.name) {
          score += Math.min(8, scoreCountryMatch(trimmed, entry.country.name) * 0.12);
        }

        return mapLeagueToResolved(entry, score);
      });

      return buildProviderResolution({
        query: trimmed,
        kind: "competition",
        scored,
        providerAvailable,
        baseReasoning: `Competition lookup for "${trimmed}" via API-Football leagues search.`,
        minResolvePercent: opts.minResolvePercent,
        ambiguityGap: opts.ambiguityGap,
      });
    },
  });
}

/**
 * Resolves a country by searching API-Football teams and scoring unique country names.
 */
export async function resolveCountry(
  query: string,
  options?: EntityResolveOptions,
): Promise<EntityProviderResolution> {
  const opts = resolveOptions(options);
  const trimmed = query.trim();
  const providerAvailable = isApiFootballConfigured();

  if (!trimmed) {
    return {
      query,
      kind: "country",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "Empty country query.",
      }),
      reasoning: "Empty country query — no lookup performed.",
    };
  }

  return resolveWithEntityCache({
    kind: "country",
    query: trimmed,
    skipCache: opts.skipCache,
    cache: opts.cache,
    cacheTtlMs: opts.cacheTtlMs,
    resolve: async () => {
      const entries = providerAvailable ? await searchTeams(trimmed) : null;
      const scored = dedupeCountriesByName(
        (entries ?? [])
          .filter((entry) => entry.team.country)
          .map((entry) => {
            const country = entry.team.country!;
            const score =
              scoreCountryMatch(trimmed, country) +
              Math.min(12, scoreNameMatch(trimmed, entry.team.name) * 0.2);

            return mapCountryToResolved(country, score, entry.team.id);
          }),
      );

      return buildProviderResolution({
        query: trimmed,
        kind: "country",
        scored,
        providerAvailable,
        baseReasoning: `Country lookup for "${trimmed}" via team search country inference.`,
        minResolvePercent: opts.minResolvePercent,
        ambiguityGap: opts.ambiguityGap,
      });
    },
  });
}

/**
 * Resolves a season year from text — no API search endpoint; validates against configured season.
 */
export async function resolveSeason(
  query: string,
  options?: EntityResolveOptions,
): Promise<EntityProviderResolution> {
  const opts = resolveOptions(options);
  const trimmed = query.trim();
  const providerAvailable = isApiFootballConfigured();
  const configuredSeason = resolveConfiguredSeason();
  const parsedYear = opts.seasonYear ?? parseSeasonYear(trimmed);

  if (!trimmed && parsedYear == null) {
    return {
      query,
      kind: "season",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "No season year found in query.",
      }),
      reasoning: "No season year found — no season resolved.",
    };
  }

  if (parsedYear == null && !opts.inferConfiguredSeason) {
    return {
      query: trimmed,
      kind: "season",
      candidates: [],
      ambiguous: false,
      providerAvailable,
      confidence: createEntityConfidence({
        tier: "low",
        percent: 0,
        reasoning: "No explicit season year in query.",
      }),
      reasoning: "No explicit season year in query — season not inferred.",
    };
  }

  const seasonQuery = trimmed || String(parsedYear ?? configuredSeason);

  return resolveWithEntityCache({
    kind: "season",
    query: seasonQuery,
    scope: cacheScopeFromOptions("season", options),
    skipCache: opts.skipCache,
    cache: opts.cache,
    cacheTtlMs: opts.cacheTtlMs,
    resolve: async () => {
      const year = parsedYear ?? configuredSeason;
      const exactMatch = parsedYear != null && parsedYear === year;
      const nearConfigured = Math.abs(year - configuredSeason) <= 1;

      let score = 70;
      if (exactMatch) {
        score = 95;
      } else if (nearConfigured) {
        score = 82;
      } else if (parsedYear != null) {
        score = 78;
      }

      const scored: ScoredResolvedEntity[] = [
        {
          score,
          entity: createResolvedEntity({
            id: `season:${year}`,
            name: String(year),
            displayName: String(year),
            type: "season",
            provider: "inferred",
            confidence: confidenceFromRawScore(score),
            aliases: [],
            metadata: {
              configuredSeason,
              parsedFromQuery: parsedYear ?? null,
              matchesConfigured: year === configuredSeason,
            },
          }),
        },
      ];

      const baseReasoning =
        parsedYear != null
          ? `Season year ${parsedYear} parsed from "${trimmed}".`
          : `Configured season ${configuredSeason} applied explicitly.`;

      return buildProviderResolution({
        query: seasonQuery,
        kind: "season",
        scored,
        providerAvailable,
        baseReasoning,
        minResolvePercent: opts.minResolvePercent,
        ambiguityGap: opts.ambiguityGap,
      });
    },
  });
}
