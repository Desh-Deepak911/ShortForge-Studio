import "server-only";

import {
  resolveCompetition,
  resolvePlayer,
  resolveSeason,
  resolveTeam,
} from "./entity-api-football.resolver";
import { getEntityCache } from "./entity-cache";
import { buildResolvedEntitiesPayload } from "./entity-resolved-payload.utils";
import { buildIntelligenceAnalysis } from "@/features/intelligence/analysis/build-intelligence-analysis.utils";
import type { LegacyIntelligenceAnalysis } from "@/features/intelligence/analysis/intelligence-analysis.types";
import type { ResolvedEntitiesPayload } from "./entity-research-hints.types";
import { buildEntityResolutionPlan } from "./entity-routing.utils";
import { isAmbiguousPlayerTerm } from "./entity-catalog.utils";
import { resolveEntities } from "./entity-resolver";
import type { ScriptMode } from "@/types/footiebitz";
import type { EntityCandidate } from "./entity-types";
import type { EntityProviderResolution } from "./entity-provider.types";
import {
  buildEntityPreviewFromProviderResults,
  type ProviderEntityPreviewInput,
} from "@/features/create/utils/entity-preview.utils";
import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type {
  EntityResolverDevDebug,
  EntityResolverDevLookup,
} from "@/features/create/types/research-preview-dev.types";

export interface ResolveEntitiesForPreviewInput {
  topic: string;
  manualContext?: string;
  mode?: ScriptMode;
}

export interface ResolveEntitiesForPreviewResult {
  entityPreview: EntityPreviewDisplay;
  resolvedEntities: ResolvedEntitiesPayload;
  /** @deprecated Slim heuristic analysis — prefer canonical orchestrator output on the client. */
  intelligenceAnalysis: LegacyIntelligenceAnalysis;
  researchHints?: ResolvedEntitiesPayload["researchHints"];
  devDebug: EntityResolverDevDebug;
}

function mapLookup(
  kind: string,
  resolution: EntityProviderResolution,
): EntityResolverDevLookup {
  const cache: EntityResolverDevLookup["cache"] = resolution.reasoning.includes(
    "in-memory entity cache",
  )
    ? "hit"
    : resolution.providerAvailable
      ? "miss"
      : "n/a";

  return {
    kind,
    query: resolution.query,
    provider: resolution.resolved?.provider ?? resolution.candidates[0]?.provider ?? "inferred",
    cache,
    resolvedId: resolution.resolved?.id,
    externalId: resolution.resolved?.externalId,
    confidencePercent: resolution.confidence.percent,
    ambiguous: resolution.ambiguous,
  };
}

async function resolveTeamCandidate(
  candidate: EntityCandidate,
): Promise<{
  candidate: EntityCandidate;
  resolution: EntityProviderResolution;
  lookup: EntityResolverDevLookup;
}> {
  const entityType = candidate.type === "national_team" ? "national_team" : "club";
  const resolution = await resolveTeam(candidate.displayName, { entityType });
  return {
    candidate,
    resolution,
    lookup: mapLookup(`team (${entityType})`, resolution),
  };
}

/** @deprecated test/legacy only — do not use in production path. */
export async function resolveEntitiesForPreview(
  input: ResolveEntitiesForPreviewInput,
): Promise<EntityPreviewDisplay> {
  const result = await resolveEntitiesForPreviewWithDebug(input);
  return result.entityPreview;
}

/** @deprecated test/legacy only — do not use in production path. */
export async function resolveEntitiesForPreviewWithDebug(
  input: ResolveEntitiesForPreviewInput,
): Promise<ResolveEntitiesForPreviewResult> {
  const extraction = resolveEntities({
    topic: input.topic,
    manualContext: input.manualContext,
    mode: input.mode,
  });

  const plan = buildEntityResolutionPlan(extraction, input.mode);
  const lookups: EntityResolverDevLookup[] = [];

  const player = plan.player
    ? await resolvePlayer(plan.player.displayName, {
        minResolvePercent: isAmbiguousPlayerTerm(plan.player.displayName) ? 85 : undefined,
      })
    : null;
  if (player) {
    lookups.push(mapLookup("player", player));
  }

  const competition = plan.competition
    ? await resolveCompetition(plan.competition.displayName)
    : null;
  if (competition) {
    lookups.push(mapLookup("competition", competition));
  }

  const season = plan.season
    ? await resolveSeason(plan.season.displayName, {
        seasonYear: Number(plan.season.displayName),
      })
    : null;
  if (season) {
    lookups.push(mapLookup("season", season));
  }

  const teams = await Promise.all(plan.teams.map(resolveTeamCandidate));
  lookups.push(...teams.map((entry) => entry.lookup));

  const providerInput: ProviderEntityPreviewInput = {
    extraction,
    mode: input.mode,
    player,
    competition,
    season,
    teams,
  };

  const resolvedEntities = buildResolvedEntitiesPayload({
    topic: input.topic,
    extraction,
    player,
    competition,
    season,
    teams,
  });

  const entityPreview = buildEntityPreviewFromProviderResults(providerInput);
  entityPreview.warnings = resolvedEntities.warnings;

  const intelligenceAnalysis = buildIntelligenceAnalysis({
    topic: input.topic,
    manualContext: input.manualContext,
    mode: input.mode,
    extraction,
    resolvedEntities,
  });

  return {
    entityPreview,
    resolvedEntities,
    intelligenceAnalysis,
    researchHints: resolvedEntities.researchHints,
    devDebug: {
      extractionCandidates: extraction.candidates.map(
        (candidate) => `${candidate.type}:${candidate.displayName}`,
      ),
      lookups,
      cacheEntryCount: getEntityCache().size(),
    },
  };
}
