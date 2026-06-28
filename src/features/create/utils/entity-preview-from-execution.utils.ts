import type { EntityPreviewDisplay, EntityPreviewField } from "@/features/create/types/entity-preview.types";
import type { LegacyIntelligenceAnalysis } from "@/features/intelligence/analysis/intelligence-analysis.types";
import type { ExecuteIntelligenceQueryResult } from "@/features/intelligence/planner/execute-intelligence-query";
import type {
  EntityResearchHints,
  ResolvedEntitiesPayload,
  ResolvedEntityPreviewField,
} from "@/features/intelligence/entities/entity-research-hints.types";
import { createEntityConfidence } from "@/features/intelligence/entities/entity-utils";
import type { IntelligenceEntity } from "@/features/intelligence/shared/entity.types";
import { intelligenceQueryToAnalysis } from "@/features/intelligence/shared/intelligence-analysis.utils";

function confidenceFromEntity(entity: IntelligenceEntity) {
  const percent =
    entity.confidencePercent ??
    (entity.status === "resolved" ? 85 : entity.status === "ambiguous" ? 55 : 35);
  const tier = percent >= 85 ? "high" : percent >= 65 ? "medium" : "low";

  return createEntityConfidence({
    tier,
    percent,
    reasoning:
      entity.status === "ambiguous"
        ? "Ambiguous entity match."
        : entity.status === "unresolved"
          ? "Entity inferred from brief."
          : "Resolved from intelligence query.",
  });
}

function fieldFromIntelligenceEntity(entity: IntelligenceEntity): EntityPreviewField {
  const confidence = confidenceFromEntity(entity);
  const externalId =
    typeof entity.externalId === "number"
      ? entity.externalId
      : typeof entity.externalId === "string" && /^\d+$/.test(entity.externalId)
        ? Number(entity.externalId)
        : undefined;

  return {
    value: entity.label,
    confidence,
    source: externalId != null ? "api-football" : "inferred",
    ...(externalId != null ? { externalId } : {}),
    ...(entity.status === "ambiguous" ? { ambiguous: true } : {}),
    usedForResearch: entity.status === "resolved" && confidence.percent >= 72,
  };
}

function averageConfidence(fields: EntityPreviewField[]) {
  if (fields.length === 0) {
    return createEntityConfidence({ tier: "low", percent: 0 });
  }

  const percent = Math.round(
    fields.reduce((sum, field) => sum + field.confidence.percent, 0) / fields.length,
  );
  const tier = percent >= 85 ? "high" : percent >= 65 ? "medium" : "low";

  return createEntityConfidence({ tier, percent });
}

function collectEntities(
  execution: Pick<ExecuteIntelligenceQueryResult, "intelligenceQuery" | "assembledContext">,
): IntelligenceEntity[] {
  return execution.assembledContext.entities.length > 0
    ? execution.assembledContext.entities
    : execution.intelligenceQuery.entities;
}

function mapResolvedField(field: EntityPreviewField): ResolvedEntityPreviewField {
  const source = field.source === "api-football" ? "api-football" : "inferred";

  return {
    value: field.value,
    confidence: field.confidence,
    source,
    usedForResearch: field.usedForResearch === true,
    ...(field.externalId != null ? { externalId: field.externalId } : {}),
    ...(field.ambiguous ? { ambiguous: true } : {}),
    ...(field.reasoning ? { reasoning: field.reasoning } : {}),
  };
}

function buildResearchHints(preview: EntityPreviewDisplay): EntityResearchHints | undefined {
  const hints: EntityResearchHints = {};

  if (preview.player?.usedForResearch && preview.player.externalId != null) {
    hints.player = { id: preview.player.externalId, name: preview.player.value };
  }

  const resolvedTeams = preview.teams
    .filter((team) => team.usedForResearch && team.externalId != null)
    .map((team) => ({
      id: team.externalId!,
      name: team.value,
      type: "club" as const,
    }));

  if (resolvedTeams.length > 0) {
    hints.teams = resolvedTeams;
  }

  if (preview.competition?.usedForResearch && preview.competition.externalId != null) {
    hints.competition = {
      leagueId: preview.competition.externalId,
      label: preview.competition.value,
    };
  }

  if (preview.season?.usedForResearch) {
    const year = Number(preview.season.value);
    if (Number.isFinite(year)) {
      hints.season = year;
    }
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}

/** Maps canonical intelligence execution output to Research Preview entity UI. */
export function buildEntityPreviewFromExecution(
  execution: Pick<ExecuteIntelligenceQueryResult, "intelligenceQuery" | "assembledContext">,
): EntityPreviewDisplay {
  const entities = collectEntities(execution);
  const ambiguities = [
    ...new Set(
      entities
        .filter((entity) => entity.status === "ambiguous")
        .map((entity) => `Ambiguous ${entity.kind}: ${entity.label}`),
    ),
  ];

  const preview: EntityPreviewDisplay = {
    status: "ready",
    teams: [],
    ambiguities,
    warnings: execution.intelligenceQuery.warnings,
    overallConfidence: createEntityConfidence({ tier: "low", percent: 0 }),
  };

  for (const entity of entities) {
    const field = fieldFromIntelligenceEntity(entity);

    switch (entity.kind) {
      case "player":
      case "manager":
        if (!preview.player) {
          preview.player = field;
        }
        break;
      case "competition":
        if (!preview.competition) {
          preview.competition = field;
        }
        break;
      case "season":
        if (!preview.season) {
          preview.season = field;
        }
        break;
      case "club":
      case "national_team":
        preview.teams.push(field);
        break;
      case "match": {
        const homeTeam = entity.metadata?.homeTeam;
        const awayTeam = entity.metadata?.awayTeam;
        if (typeof homeTeam === "string" && typeof awayTeam === "string") {
          preview.teams.push(
            fieldFromIntelligenceEntity({
              ...entity,
              kind: "club",
              label: homeTeam,
            }),
            fieldFromIntelligenceEntity({
              ...entity,
              kind: "club",
              label: awayTeam,
            }),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  const fields = [
    preview.player,
    preview.competition,
    preview.season,
    ...preview.teams,
  ].filter((field): field is EntityPreviewField => field != null);

  preview.overallConfidence = averageConfidence(fields);

  return preview;
}

export function buildLegacyIntelligenceAnalysisFromExecution(
  execution: Pick<ExecuteIntelligenceQueryResult, "intelligenceQuery">,
): LegacyIntelligenceAnalysis {
  const analysis = intelligenceQueryToAnalysis(execution.intelligenceQuery);

  return {
    topic: analysis.topic,
    intent: analysis.intent.intent,
    ...(analysis.intent.subIntent ? { subIntent: analysis.intent.subIntent } : {}),
    entities: analysis.entities,
    ...(analysis.competition ? { competition: analysis.competition } : {}),
    ...(analysis.season != null ? { season: analysis.season } : {}),
    warnings: analysis.warnings,
  };
}

export function buildResolvedEntitiesPayloadFromExecution(
  execution: Pick<ExecuteIntelligenceQueryResult, "intelligenceQuery" | "assembledContext">,
  preview: EntityPreviewDisplay,
): ResolvedEntitiesPayload {
  const researchHints = buildResearchHints(preview);

  return {
    topic: execution.intelligenceQuery.input.topic,
    warnings: preview.warnings ?? execution.intelligenceQuery.warnings,
    ambiguities: preview.ambiguities,
    ...(preview.player
      ? {
          player: mapResolvedField(preview.player),
        }
      : {}),
    ...(preview.competition
      ? {
          competition: {
            ...mapResolvedField(preview.competition),
            ...(preview.competition.externalId != null
              ? { leagueId: preview.competition.externalId }
              : {}),
          },
        }
      : {}),
    ...(preview.season
      ? {
          season: {
            ...mapResolvedField(preview.season),
            ...(Number.isFinite(Number(preview.season.value))
              ? { year: Number(preview.season.value) }
              : {}),
          },
        }
      : {}),
    teams: preview.teams.map((team) => mapResolvedField(team)),
    ...(researchHints ? { researchHints } : {}),
  };
}
