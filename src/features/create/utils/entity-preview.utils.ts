import type { EntityCandidate, EntityConfidence, EntityResolution } from "@/features/intelligence/entities/entity-types";
import type { EntityProviderResolution } from "@/features/intelligence/entities/entity-provider.types";
import { buildEntityResolutionPlan } from "@/features/intelligence/entities/entity-routing.utils";
import { createEntityConfidence } from "@/features/intelligence/entities/entity-utils";
import type { ScriptMode } from "@/types/footiebitz";
import type { ResearchPreviewConfidence } from "@/features/create/types/research-preview.types";
import type {
  EntityPreviewDisplay,
  EntityPreviewField,
  EntityPreviewStatus,
} from "@/features/create/types/entity-preview.types";

function fieldFromCandidate(candidate: EntityCandidate): EntityPreviewField {
  return {
    value: candidate.displayName,
    confidence: candidate.confidence,
    source: candidate.provider === "api-football" ? "api-football" : "inferred",
    usedForResearch: false,
    ...(typeof candidate.externalId === "number" ? { externalId: candidate.externalId } : {}),
    ...(candidate.confidence.reasoning ? { reasoning: candidate.confidence.reasoning } : {}),
  };
}

function fieldFromProviderResolution(
  resolution: EntityProviderResolution,
  fallback?: EntityCandidate,
): EntityPreviewField | undefined {
  if (resolution.ambiguous && !resolution.resolved) {
    return fallback
      ? {
          ...fieldFromCandidate(fallback),
          ambiguous: true,
          usedForResearch: false,
          reasoning: resolution.reasoning,
        }
      : undefined;
  }

  const entity = resolution.resolved ?? resolution.candidates[0];
  if (!entity) {
    return fallback ? fieldFromCandidate(fallback) : undefined;
  }

  const usedForResearch = Boolean(
    resolution.resolved && !resolution.ambiguous && resolution.confidence.percent >= 72,
  );

  return {
    value: entity.displayName,
    confidence: resolution.confidence,
    source: entity.provider === "api-football" ? "api-football" : "inferred",
    ...(typeof entity.externalId === "number" ? { externalId: entity.externalId } : {}),
    ...(resolution.ambiguous ? { ambiguous: true } : {}),
    usedForResearch,
    reasoning: resolution.reasoning,
  };
}

function averageConfidence(fields: EntityPreviewField[]): EntityConfidence {
  if (fields.length === 0) {
    return createEntityConfidence({ tier: "low", percent: 0 });
  }

  const percent = Math.round(
    fields.reduce((sum, field) => sum + field.confidence.percent, 0) / fields.length,
  );
  const tier = percent >= 85 ? "high" : percent >= 65 ? "medium" : "low";

  return createEntityConfidence({ tier, percent });
}

function collectPreviewFields(preview: EntityPreviewDisplay): EntityPreviewField[] {
  return [
    preview.player,
    preview.competition,
    preview.season,
    ...preview.teams,
  ].filter((field): field is EntityPreviewField => field != null);
}

export function entityPreviewConfidenceLabel(
  confidence: EntityConfidence,
): ResearchPreviewConfidence {
  if (confidence.percent >= 85 || confidence.tier === "high") {
    return "High";
  }

  if (confidence.percent >= 65 || confidence.tier === "medium") {
    return "Medium";
  }

  return "Low";
}

export function formatEntityPreviewValue(field?: EntityPreviewField): string {
  return field?.value?.trim() || "Not detected";
}

export function formatEntityPreviewConfidence(field?: EntityPreviewField): string {
  if (!field) {
    return "—";
  }

  return `${field.confidence.percent}%`;
}

export function formatEntityPreviewId(field?: EntityPreviewField): string {
  if (field?.externalId != null) {
    return String(field.externalId);
  }

  return "—";
}

/** @deprecated Test/dev heuristic preview only — product UI uses `buildEntityPreviewFromExecution`. */
export function buildEntityPreviewFromExtraction(
  extraction: EntityResolution,
  status: EntityPreviewStatus = "ready",
  mode?: ScriptMode,
): EntityPreviewDisplay {
  const plan = buildEntityResolutionPlan(extraction, mode);

  const preview: EntityPreviewDisplay = {
    status,
    teams: plan.teams.map(fieldFromCandidate),
    ambiguities: extraction.ambiguities,
    overallConfidence: createEntityConfidence({ tier: "low", percent: 0 }),
  };

  if (plan.player) {
    preview.player = fieldFromCandidate(plan.player);
  }

  if (plan.competition) {
    preview.competition = fieldFromCandidate(plan.competition);
  }

  if (plan.season) {
    preview.season = fieldFromCandidate(plan.season);
  }

  preview.overallConfidence = averageConfidence(collectPreviewFields(preview));
  return preview;
}

export interface ProviderEntityPreviewInput {
  extraction: EntityResolution;
  mode?: ScriptMode;
  player?: EntityProviderResolution | null;
  competition?: EntityProviderResolution | null;
  season?: EntityProviderResolution | null;
  teams?: Array<{ candidate: EntityCandidate; resolution: EntityProviderResolution }>;
}

export function buildEntityPreviewFromProviderResults(
  input: ProviderEntityPreviewInput,
): EntityPreviewDisplay {
  const plan = buildEntityResolutionPlan(input.extraction, input.mode);
  const playerCandidate = plan.player;
  const competitionCandidate = plan.competition;
  const seasonCandidate = plan.season;

  const player = input.player
    ? fieldFromProviderResolution(input.player, playerCandidate)
    : playerCandidate
      ? fieldFromCandidate(playerCandidate)
      : undefined;

  const competition = input.competition
    ? fieldFromProviderResolution(input.competition, competitionCandidate)
    : competitionCandidate
      ? fieldFromCandidate(competitionCandidate)
      : undefined;

  const season = input.season
    ? fieldFromProviderResolution(input.season, seasonCandidate)
    : seasonCandidate
      ? fieldFromCandidate(seasonCandidate)
      : undefined;

  const teams =
    input.teams?.map(({ candidate, resolution }) =>
      fieldFromProviderResolution(resolution, candidate),
    ).filter((field): field is EntityPreviewField => field != null) ??
    plan.teams.map(fieldFromCandidate);

  const preview: EntityPreviewDisplay = {
    status: "ready",
    player,
    competition,
    season,
    teams,
    ambiguities: input.extraction.ambiguities,
    overallConfidence: createEntityConfidence({ tier: "low", percent: 0 }),
  };

  preview.overallConfidence = averageConfidence(collectPreviewFields(preview));
  return preview;
}
