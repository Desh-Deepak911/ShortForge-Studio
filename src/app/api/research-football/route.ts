import "server-only";

import { NextResponse } from "next/server";

import type { AssembledContext } from "@/features/intelligence/context/assembled-context.types";
import type { CanonicalResearchBundle } from "@/features/intelligence/context";
import { serializeCanonicalResearchBundleForDev } from "@/features/intelligence/context";
import {
  serializeKnowledgeGraphForDev,
  type KnowledgeGraphDevSnapshot,
} from "@/features/intelligence/knowledge";
import {
  serializeGraphContextForDev,
  type GraphContextDevSnapshot,
} from "@/features/intelligence/graph-context";
import {
  buildIntelligenceExecutionValidationFailure,
  type ExecuteIntelligenceQueryResult,
  type IntelligenceExecutionStatus,
} from "@/features/intelligence/planner/execute-intelligence-query";
import { executeAndCacheIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query-api.server";
import type { IntelligenceQuery } from "@/features/intelligence/planner/query-orchestrator.types";
import type { EntityResearchHints, ResolvedEntitiesPayload } from "@/features/intelligence/entities/entity-research-hints.types";
import { mergeIntelligenceResearchResults } from "@/features/intelligence/providers/merge-intelligence-research-results.utils";
import { buildProviderResearchExecutionSummary } from "@/features/intelligence/providers/provider-plan-outcome.utils";
import type { IntelligenceResearchResult } from "@/features/intelligence/providers/provider-result.types";
import type { ProviderDiagnosticEntry } from "@/features/intelligence/providers/provider-diagnostics.types";
import { resolveFootballResearchMode } from "@/features/research/types/football-research.types";
import { resolveScriptMode } from "@/types/footiebitz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ResearchFootballRequest {
  topic?: string;
  mode?: unknown;
  manualContext?: string;
  resolvedEntities?: ResolvedEntitiesPayload;
  /** @deprecated Prefer `resolvedEntities.researchHints`. */
  entityHints?: EntityResearchHints;
}

interface ResearchFootballResponse {
  executionStatus: IntelligenceExecutionStatus;
  intelligenceQuery: IntelligenceQuery;
  assembledContext: AssembledContext;
  providerResults?: IntelligenceResearchResult[];
  providerDiagnostics?: ProviderDiagnosticEntry[];
  providerExecutionSummary?: import("@/features/intelligence/providers/provider-plan-outcome.utils").ProviderResearchExecutionSummary;
  canonicalResearchBundle?: CanonicalResearchBundle;
  /** Dev-only knowledge graph snapshot from executeIntelligenceQuery. */
  knowledgeGraph?: KnowledgeGraphDevSnapshot;
  /** Dev-only graph context snapshot from executeIntelligenceQuery. */
  graphContext?: GraphContextDevSnapshot;
}

function stripRawFromProviderResult(result: IntelligenceResearchResult): IntelligenceResearchResult {
  const sanitized = { ...result };
  delete sanitized.raw;
  return sanitized;
}

function buildResponse(
  input: {
    executionStatus: IntelligenceExecutionStatus;
    intelligenceQuery: IntelligenceQuery;
    assembledContext: AssembledContext;
    providerResults?: IntelligenceResearchResult[];
    providerDiagnostics?: ProviderDiagnosticEntry[];
    providerExecutionSummary?: ResearchFootballResponse["providerExecutionSummary"];
    canonicalResearchBundle?: CanonicalResearchBundle;
    knowledgeGraph?: KnowledgeGraphDevSnapshot;
    graphContext?: GraphContextDevSnapshot;
  },
): ResearchFootballResponse {
  const isDev = process.env.NODE_ENV === "development";

  return {
    executionStatus: input.executionStatus,
    intelligenceQuery: input.intelligenceQuery,
    assembledContext: input.assembledContext,
    ...(isDev && input.providerResults
      ? { providerResults: input.providerResults.map(stripRawFromProviderResult) }
      : {}),
    ...(isDev && input.providerDiagnostics
      ? { providerDiagnostics: input.providerDiagnostics }
      : {}),
    ...(isDev && input.providerExecutionSummary
      ? { providerExecutionSummary: input.providerExecutionSummary }
      : {}),
    ...(isDev && input.canonicalResearchBundle
      ? {
          canonicalResearchBundle: serializeCanonicalResearchBundleForDev(
            input.canonicalResearchBundle,
          ),
        }
      : {}),
    ...(isDev && input.knowledgeGraph ? { knowledgeGraph: input.knowledgeGraph } : {}),
    ...(isDev && input.graphContext ? { graphContext: input.graphContext } : {}),
  };
}

function responseFromExecution(
  execution: ExecuteIntelligenceQueryResult,
  collectProviderDiagnostics: boolean,
): ResearchFootballResponse {
  return buildResponse({
    executionStatus: execution.executionStatus,
    intelligenceQuery: execution.intelligenceQuery,
    assembledContext: execution.assembledContext,
    providerResults: execution.providerResults,
    providerDiagnostics: execution.diagnostics,
    providerExecutionSummary: collectProviderDiagnostics
      ? buildProviderResearchExecutionSummary("executeResearchPlan", {
          queryId: execution.intelligenceQuery.id,
          results: execution.providerResults,
          combined: mergeIntelligenceResearchResults(
            execution.intelligenceQuery,
            execution.providerResults,
            execution.diagnostics,
          ),
          diagnostics: execution.diagnostics,
        })
      : undefined,
    canonicalResearchBundle: execution.canonicalResearchBundle,
    knowledgeGraph: serializeKnowledgeGraphForDev(execution.knowledgeGraph),
    graphContext: execution.graphContext
      ? serializeGraphContextForDev(execution.graphContext)
      : undefined,
  });
}

/**
 * POST /api/research-football
 *
 * Single intelligence path: executeIntelligenceQuery → AssembledContext → KnowledgeGraph → GraphContext (dev).
 */
export async function POST(request: Request) {
  let body: ResearchFootballRequest;

  try {
    body = (await request.json()) as ResearchFootballRequest;
  } catch {
    const mode = resolveFootballResearchMode(undefined);
    const selectedMode = resolveScriptMode(mode);
    const failure = buildIntelligenceExecutionValidationFailure({
      topic: "",
      selectedMode,
      warnings: ["Invalid request body."],
      reason: "Invalid request.",
      queryId: "invalid",
    });

    return NextResponse.json(
      buildResponse({
        executionStatus: failure.executionStatus,
        intelligenceQuery: failure.intelligenceQuery,
        assembledContext: failure.assembledContext,
      }),
      { status: 400 },
    );
  }

  const topic = body.topic?.trim();
  const mode = resolveFootballResearchMode(body.mode);
  const selectedMode = resolveScriptMode(body.mode ?? mode);
  const manualContext = body.manualContext?.trim() || undefined;
  const collectProviderDiagnostics = process.env.NODE_ENV === "development";

  if (!topic) {
    const failure = buildIntelligenceExecutionValidationFailure({
      topic: "",
      selectedMode,
      manualNotes: manualContext,
      warnings: ["Topic is required."],
      reason: "Topic is required.",
      queryId: "missing-topic",
    });

    return NextResponse.json(
      buildResponse({
        executionStatus: failure.executionStatus,
        intelligenceQuery: failure.intelligenceQuery,
        assembledContext: failure.assembledContext,
      }),
      { status: 400 },
    );
  }

  const execution = await executeAndCacheIntelligenceQuery({
    topic,
    selectedMode,
    manualNotes: manualContext,
    enableResearch: true,
    executionInput: {
      ...(body.resolvedEntities ? { resolvedEntities: body.resolvedEntities } : {}),
      ...(body.entityHints ? { entityHints: body.entityHints } : {}),
    },
  });

  return NextResponse.json(responseFromExecution(execution, collectProviderDiagnostics));
}
