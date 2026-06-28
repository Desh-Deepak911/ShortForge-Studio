import { resolveCompetitionFromTopic } from "../competitions";
import type { CompetitionResolution } from "../competitions/types";
import type { ResolvedEntitiesPayload } from "../entities/entity-research-hints.types";
import {
  createOwnedEntity,
  createOwnedEntityId,
} from "../entities/entity-ownership.utils";
import type { EntityResolution } from "../entities/entity-types";
import { analyzeIntent } from "../intent/intent-engine";
import type { ScriptMode } from "@/types/footiebitz";
import type { IntelligenceCompetition } from "../shared/competition.types";
import type { EntityKind, IntelligenceEntity } from "../shared/entity.types";
import type { LegacyIntelligenceAnalysis } from "./intelligence-analysis.types";

export interface BuildIntelligenceAnalysisInput {
  topic: string;
  manualContext?: string;
  mode?: ScriptMode;
  extraction: EntityResolution;
  resolvedEntities?: ResolvedEntitiesPayload;
  competitionResolution?: CompetitionResolution;
}

const CANDIDATE_KIND_MAP: Record<string, EntityKind> = {
  player: "player",
  club: "club",
  national_team: "national_team",
  competition: "competition",
  season: "season",
  fixture: "match",
  manager: "manager",
  venue: "venue",
  formation: "formation",
};

function toIntelligenceCompetition(
  resolution: CompetitionResolution,
): IntelligenceCompetition {
  return {
    scope: resolution.scope,
    label: resolution.canonicalName,
    leagueId: resolution.providerIds.apiFootballLeagueId,
    ...(resolution.season != null ? { season: resolution.season } : {}),
    timeScope: resolution.timeScope,
  };
}

function entityStatusFromField(input: {
  ambiguous?: boolean;
  usedForResearch?: boolean;
  externalId?: number;
}): IntelligenceEntity["status"] {
  if (input.ambiguous) {
    return "ambiguous";
  }

  if (input.usedForResearch && input.externalId != null) {
    return "resolved";
  }

  if (input.externalId != null) {
    return "resolved";
  }

  return "unresolved";
}

function pushEntity(
  entities: IntelligenceEntity[],
  seen: Set<string>,
  entity: IntelligenceEntity,
): void {
  if (seen.has(entity.id)) {
    return;
  }

  seen.add(entity.id);
  entities.push(entity);
}

function findCandidate(
  extraction: EntityResolution,
  type: string,
): EntityResolution["candidates"][number] | undefined {
  return extraction.candidates.find((candidate) => candidate.type === type);
}

function buildEntitiesFromResolved(
  extraction: EntityResolution,
  resolvedEntities?: ResolvedEntitiesPayload,
): IntelligenceEntity[] {
  const entities: IntelligenceEntity[] = [];
  const seen = new Set<string>();

  if (resolvedEntities?.player) {
    const candidate = findCandidate(extraction, "player");
    const label = candidate?.displayName ?? resolvedEntities.player.value;
    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate?.id ?? createOwnedEntityId("player", label),
        kind: "player",
        label,
        status: entityStatusFromField(resolvedEntities.player),
        confidencePercent: resolvedEntities.player.confidence.percent,
        ...(resolvedEntities.player.externalId != null
          ? { externalId: resolvedEntities.player.externalId }
          : {}),
        ...(resolvedEntities.player.value !== label
          ? { metadata: { canonicalLabel: resolvedEntities.player.value } }
          : {}),
      }),
    );
  }

  if (resolvedEntities?.competition) {
    const candidate = findCandidate(extraction, "competition");
    const label = candidate?.displayName ?? resolvedEntities.competition.value;
    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate?.id ?? createOwnedEntityId("competition", label),
        kind: "competition",
        label,
        status: entityStatusFromField(resolvedEntities.competition),
        confidencePercent: resolvedEntities.competition.confidence.percent,
        ...(resolvedEntities.competition.leagueId != null
          ? { externalId: resolvedEntities.competition.leagueId }
          : resolvedEntities.competition.externalId != null
            ? { externalId: resolvedEntities.competition.externalId }
            : {}),
        ...(resolvedEntities.competition.value !== label
          ? { metadata: { canonicalLabel: resolvedEntities.competition.value } }
          : {}),
      }),
    );
  }

  if (resolvedEntities?.season) {
    const candidate = findCandidate(extraction, "season");
    const label = candidate?.displayName ?? resolvedEntities.season.value;
    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate?.id ?? createOwnedEntityId("season", label),
        kind: "season",
        label,
        status: entityStatusFromField(resolvedEntities.season),
        confidencePercent: resolvedEntities.season.confidence.percent,
        ...(resolvedEntities.season.year != null
          ? { externalId: resolvedEntities.season.year }
          : {}),
      }),
    );
  }

  for (const team of resolvedEntities?.teams ?? []) {
    const candidate = extraction.candidates.find(
      (entry) =>
        entry.type === team.type ||
        (team.type === "club" && entry.type === "club") ||
        (team.type === "national_team" && entry.type === "national_team"),
    );
    const label = candidate?.displayName ?? team.value;
    const kind = team.type === "national_team" ? "national_team" : "club";
    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate?.id ?? createOwnedEntityId(kind, label),
        kind,
        label,
        status: entityStatusFromField(team),
        confidencePercent: team.confidence.percent,
        ...(team.externalId != null ? { externalId: team.externalId } : {}),
        ...(team.value !== label ? { metadata: { canonicalLabel: team.value } } : {}),
      }),
    );
  }

  if (resolvedEntities?.fixture) {
    const candidate = findCandidate(extraction, "fixture");
    const label = candidate?.displayName ?? resolvedEntities.fixture.label;
    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate?.id ?? createOwnedEntityId("match", label),
        kind: "match",
        label,
        status: "unresolved",
        metadata: {
          homeTeam: resolvedEntities.fixture.homeTeam,
          awayTeam: resolvedEntities.fixture.awayTeam,
          ...(resolvedEntities.fixture.homeTeamId != null
            ? { homeTeamId: resolvedEntities.fixture.homeTeamId }
            : {}),
          ...(resolvedEntities.fixture.awayTeamId != null
            ? { awayTeamId: resolvedEntities.fixture.awayTeamId }
            : {}),
        },
      }),
    );
  }

  for (const candidate of extraction.candidates) {
    const kind = CANDIDATE_KIND_MAP[candidate.type];
    if (!kind) {
      continue;
    }

    pushEntity(
      entities,
      seen,
      createOwnedEntity({
        id: candidate.id,
        kind,
        label: candidate.displayName,
        status: "unresolved",
        ...(typeof candidate.externalId === "number"
          ? { externalId: candidate.externalId }
          : {}),
        confidencePercent: candidate.confidence.percent,
      }),
    );
  }

  return entities;
}

function dedupeWarnings(warnings: string[]): string[] {
  return warnings.filter((entry, index, list) => list.indexOf(entry) === index);
}

export function buildIntelligenceAnalysis(
  input: BuildIntelligenceAnalysisInput,
): LegacyIntelligenceAnalysis {
  const intentAnalysis = analyzeIntent({
    topic: input.topic,
    context: input.manualContext,
  });

  const competitionResolution =
    input.competitionResolution ?? resolveCompetitionFromTopic({ topic: input.topic });

  const competition = toIntelligenceCompetition(competitionResolution);

  const season =
    input.resolvedEntities?.season?.year ??
    (input.resolvedEntities?.season?.value != null
      ? Number(input.resolvedEntities.season.value)
      : undefined) ??
    competitionResolution.season ??
    intentAnalysis.topic.seasonYear;

  const normalizedSeason =
    season != null && Number.isFinite(season) ? Math.round(season) : undefined;

  const warnings = dedupeWarnings([
    ...competitionResolution.warnings,
    ...input.extraction.ambiguities,
    ...(input.resolvedEntities?.warnings ?? []),
    ...(input.resolvedEntities?.ambiguities ?? []),
  ]);

  return {
    topic: input.topic,
    intent: intentAnalysis.intent,
    ...(intentAnalysis.subIntent ? { subIntent: intentAnalysis.subIntent } : {}),
    entities: buildEntitiesFromResolved(input.extraction, input.resolvedEntities),
    ...(competition.scope !== "unknown" ? { competition } : {}),
    ...(normalizedSeason != null ? { season: normalizedSeason } : {}),
    warnings,
  };
}
