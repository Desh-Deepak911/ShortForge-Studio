import type { EntityProviderResolution } from "./entity-provider.types";
import type { EntityCandidate, EntityResolution, ResolvedEntity } from "./entity-types";
import type { EntityResearchHints } from "./entity-research-hints.types";

function resolvedEntity(
  resolution?: EntityProviderResolution | null,
): ResolvedEntity | undefined {
  return resolution?.resolved;
}

function externalIdFrom(resolution?: EntityProviderResolution | null): number | undefined {
  const entity = resolvedEntity(resolution);
  const externalId = entity?.externalId;
  return typeof externalId === "number" && Number.isFinite(externalId) ? externalId : undefined;
}

export function buildEntityResearchHints(input: {
  extraction: EntityResolution;
  player?: EntityProviderResolution | null;
  competition?: EntityProviderResolution | null;
  season?: EntityProviderResolution | null;
  teams?: Array<{ candidate: EntityCandidate; resolution: EntityProviderResolution }>;
}): EntityResearchHints | undefined {
  const hints: EntityResearchHints = {};

  const playerEntity = resolvedEntity(input.player);
  const playerId = externalIdFrom(input.player);
  if (playerEntity && playerId != null) {
    hints.player = {
      id: playerId,
      name: playerEntity.displayName,
    };
  }

  const competitionEntity = resolvedEntity(input.competition);
  const leagueId = externalIdFrom(input.competition);
  if (competitionEntity && leagueId != null) {
    hints.competition = {
      leagueId,
      label: competitionEntity.displayName,
      ...(typeof competitionEntity.metadata?.competitionKey === "string"
        ? { competitionKey: competitionEntity.metadata.competitionKey }
        : {}),
    };
  }

  const seasonEntity = resolvedEntity(input.season);
  if (seasonEntity) {
    const year = Number(seasonEntity.displayName);
    if (Number.isFinite(year)) {
      hints.season = year;
    }
  }

  const teamHints =
    input.teams
      ?.map(({ candidate, resolution }) => {
        const entity = resolvedEntity(resolution);
        const teamId = externalIdFrom(resolution);
        if (!entity || teamId == null) {
          return null;
        }

        return {
          id: teamId,
          name: entity.displayName,
          type: candidate.type === "national_team" ? ("national_team" as const) : ("club" as const),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null) ?? [];

  if (teamHints.length > 0) {
    hints.teams = teamHints;
  }

  const fixture = input.extraction.candidates.find((candidate) => candidate.type === "fixture");
  if (fixture?.metadata?.homeSide && fixture.metadata?.awaySide) {
    const homeTeam = String(fixture.metadata.homeSide);
    const awayTeam = String(fixture.metadata.awaySide);
    hints.fixture = {
      label: fixture.displayName,
      homeTeam,
      awayTeam,
      homeTeamId: teamHints.find(
        (team) => team.name.toLowerCase() === homeTeam.toLowerCase(),
      )?.id,
      awayTeamId: teamHints.find(
        (team) => team.name.toLowerCase() === awayTeam.toLowerCase(),
      )?.id,
    };
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}
