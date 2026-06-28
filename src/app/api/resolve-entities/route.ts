import "server-only";

import { NextResponse } from "next/server";

import type { EntityPreviewDisplay } from "@/features/create/types/entity-preview.types";
import type { EntityResolverDevDebug } from "@/features/create/types/research-preview-dev.types";
import {
  buildEntityPreviewFromExecution,
  buildLegacyIntelligenceAnalysisFromExecution,
  buildResolvedEntitiesPayloadFromExecution,
} from "@/features/create/utils/entity-preview-from-execution.utils";
import { executeAndCacheIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query-api.server";
import { resolveScriptMode } from "@/types/footiebitz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResolveEntitiesRequest {
  topic?: string;
  manualContext?: string;
  mode?: unknown;
}

interface ResolveEntitiesResponse {
  queryId: string;
  entityPreview: EntityPreviewDisplay;
  resolvedEntities?: import("@/features/intelligence/entities/entity-research-hints.types").ResolvedEntitiesPayload;
  intelligenceAnalysis?: import("@/features/intelligence/analysis/intelligence-analysis.types").LegacyIntelligenceAnalysis;
  researchHints?: import("@/features/intelligence/entities/entity-research-hints.types").EntityResearchHints;
  devDebug?: EntityResolverDevDebug;
}

export async function POST(request: Request) {
  let body: ResolveEntitiesRequest;

  try {
    body = (await request.json()) as ResolveEntitiesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const topic = body.topic?.trim();
  const manualContext = body.manualContext?.trim() || undefined;

  if (!topic) {
    return NextResponse.json({ error: "Topic is required." }, { status: 400 });
  }

  const execution = await executeAndCacheIntelligenceQuery({
    topic,
    selectedMode: resolveScriptMode(body.mode),
    manualNotes: manualContext,
    enableResearch: false,
  });

  const entityPreview = buildEntityPreviewFromExecution(execution);
  const resolvedEntities = buildResolvedEntitiesPayloadFromExecution(execution, entityPreview);
  const intelligenceAnalysis = buildLegacyIntelligenceAnalysisFromExecution(execution);

  const isDev = process.env.NODE_ENV === "development";
  const devDebug: EntityResolverDevDebug | undefined = isDev
    ? {
        extractionCandidates: execution.intelligenceQuery.entities.map(
          (entity) => `${entity.kind}:${entity.label}`,
        ),
        lookups: [],
        cacheEntryCount: 0,
      }
    : undefined;

  return NextResponse.json({
    queryId: execution.intelligenceQuery.id,
    entityPreview,
    resolvedEntities,
    intelligenceAnalysis,
    researchHints: resolvedEntities.researchHints,
    ...(devDebug ? { devDebug } : {}),
  } satisfies ResolveEntitiesResponse);
}
