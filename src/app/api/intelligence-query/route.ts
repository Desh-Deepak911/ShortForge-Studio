import "server-only";

import { NextResponse } from "next/server";

import type { ExecuteIntelligenceQueryResult } from "@/features/intelligence/planner/execute-intelligence-query";
import { executeAndCacheIntelligenceQuery } from "@/features/intelligence/planner/execute-intelligence-query-api.server";
import { resolveScriptMode } from "@/types/footiebitz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface IntelligenceQueryRequest {
  topic?: string;
  selectedMode?: unknown;
  manualNotes?: string;
  enableResearch?: boolean;
}

interface IntelligenceQueryResponse {
  queryId: string;
  intelligenceQuery: ExecuteIntelligenceQueryResult["intelligenceQuery"];
  executionStatus: ExecuteIntelligenceQueryResult["executionStatus"];
  assembledContext: ExecuteIntelligenceQueryResult["assembledContext"];
}

export async function POST(request: Request) {
  let body: IntelligenceQueryRequest;

  try {
    body = (await request.json()) as IntelligenceQueryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ error: "Topic is required." }, { status: 400 });
  }

  const execution = await executeAndCacheIntelligenceQuery({
    topic,
    selectedMode: resolveScriptMode(body.selectedMode),
    manualNotes: body.manualNotes,
    enableResearch: body.enableResearch,
  });

  const response: IntelligenceQueryResponse = {
    queryId: execution.intelligenceQuery.id,
    intelligenceQuery: execution.intelligenceQuery,
    executionStatus: execution.executionStatus,
    assembledContext: execution.assembledContext,
  };

  return NextResponse.json(response);
}
