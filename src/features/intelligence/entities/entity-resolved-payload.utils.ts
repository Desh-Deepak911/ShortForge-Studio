import type { EntityProviderResolution } from "./entity-provider.types";
import { DEFAULT_MIN_RESOLVE_PERCENT } from "./entity-provider.types";
import type { EntityCandidate, EntityResolution } from "./entity-types";
import type {
  EntityResearchHints,
  ResolvedEntitiesPayload,
  ResolvedEntityPreviewField,
} from "./entity-research-hints.types";
import { buildEntityResearchHints } from "./entity-research-hints.utils";

export const LOW_CONFIDENCE_ENTITY_WARNING =
  "Some resolved entities were below confidence threshold — research will use search fallback.";

function isUsableProviderResolution(
  resolution?: EntityProviderResolution | null,
  minPercent = DEFAULT_MIN_RESOLVE_PERCENT,
): boolean {
  if (!resolution?.resolved || resolution.ambiguous) {
    return false;
  }

  return resolution.confidence.percent >= minPercent;
}

function fieldFromProviderResolution(
  resolution?: EntityProviderResolution | null,
  fallback?: EntityCandidate,
): ResolvedEntityPreviewField | undefined {
  if (!resolution && !fallback) {
    return undefined;
  }

  const entity = resolution?.resolved ?? resolution?.candidates[0];
  const value = entity?.displayName ?? fallback?.displayName;
  if (!value) {
    return undefined;
  }

  const confidence = resolution?.confidence ?? fallback?.confidence ?? {
    tier: "low" as const,
    percent: 0,
  };

  const externalId =
    typeof entity?.externalId === "number" && Number.isFinite(entity.externalId)
      ? entity.externalId
      : undefined;

  return {
    value,
    ...(externalId != null ? { externalId } : {}),
    confidence,
    source: entity?.provider === "api-football" ? "api-football" : "inferred",
    ...(resolution?.ambiguous ? { ambiguous: true } : {}),
    usedForResearch: isUsableProviderResolution(resolution),
    ...(resolution?.reasoning ? { reasoning: resolution.reasoning } : {}),
  };
}

function filterHintsFromUsableResolutions(input: {
  extraction: EntityResolution;
  player?: EntityProviderResolution | null;
  competition?: EntityProviderResolution | null;
  season?: EntityProviderResolution | null;
  teams?: Array<{ candidate: EntityCandidate; resolution: EntityProviderResolution }>;
}): EntityResearchHints | undefined {
  return buildEntityResearchHints({
    extraction: input.extraction,
    player: isUsableProviderResolution(input.player) ? input.player : null,
    competition: isUsableProviderResolution(input.competition) ? input.competition : null,
    season: isUsableProviderResolution(input.season) ? input.season : null,
    teams:
      input.teams?.filter(({ resolution }) => isUsableProviderResolution(resolution)) ?? [],
  });
}

export function buildResolvedEntitiesPayload(input: {
  topic: string;
  extraction: EntityResolution;
  player?: EntityProviderResolution | null;
  competition?: EntityProviderResolution | null;
  season?: EntityProviderResolution | null;
  teams?: Array<{ candidate: EntityCandidate; resolution: EntityProviderResolution }>;
}): ResolvedEntitiesPayload {
  const player = fieldFromProviderResolution(input.player);
  const competitionResolution = fieldFromProviderResolution(input.competition);
  const competition =
    competitionResolution && input.competition?.resolved?.externalId != null
      ? {
          ...competitionResolution,
          leagueId: Number(input.competition.resolved.externalId),
        }
      : competitionResolution;

  const seasonField = fieldFromProviderResolution(input.season);
  const seasonYear = seasonField ? Number(seasonField.value) : undefined;
  const season =
    seasonField && Number.isFinite(seasonYear)
      ? { ...seasonField, year: seasonYear }
      : seasonField;

  const teams =
    input.teams
      ?.map(({ candidate, resolution }) => {
        const field = fieldFromProviderResolution(resolution, candidate);
        if (!field) {
          return null;
        }

        return {
          ...field,
          type: candidate.type === "national_team" ? ("national_team" as const) : ("club" as const),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry != null) ?? [];

  const fixtureCandidate = input.extraction.candidates.find(
    (candidate) => candidate.type === "fixture",
  );
  const fixture =
    fixtureCandidate?.metadata?.homeSide && fixtureCandidate.metadata?.awaySide
      ? {
          label: fixtureCandidate.displayName,
          homeTeam: String(fixtureCandidate.metadata.homeSide),
          awayTeam: String(fixtureCandidate.metadata.awaySide),
          homeTeamId: teams.find(
            (team) => team.value.toLowerCase() === String(fixtureCandidate.metadata!.homeSide).toLowerCase(),
          )?.externalId,
          awayTeamId: teams.find(
            (team) => team.value.toLowerCase() === String(fixtureCandidate.metadata!.awaySide).toLowerCase(),
          )?.externalId,
        }
      : undefined;

  const warnings: string[] = [];
  const hasDetectedButUnused = [player, competition, season, ...teams].some(
    (field) => field && !field.usedForResearch && field.confidence.percent > 0,
  );
  if (hasDetectedButUnused) {
    warnings.push(LOW_CONFIDENCE_ENTITY_WARNING);
  }

  const researchHints = filterHintsFromUsableResolutions(input);

  return {
    topic: input.topic,
    warnings,
    ambiguities: input.extraction.ambiguities,
    ...(player ? { player } : {}),
    ...(competition ? { competition } : {}),
    ...(season ? { season } : {}),
    teams,
    ...(fixture ? { fixture } : {}),
    ...(researchHints ? { researchHints } : {}),
  };
}

export function extractResearchHintsFromResolvedEntities(
  resolvedEntities?: ResolvedEntitiesPayload,
): EntityResearchHints | undefined {
  return resolvedEntities?.researchHints;
}
