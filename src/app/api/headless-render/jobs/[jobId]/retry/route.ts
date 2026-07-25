/**
 * POST /api/headless-render/jobs/[jobId]/retry
 * Retry is intentionally disabled until a durable new-attempt service owns
 * the operation. The route remains authenticated and owner-bound so it cannot
 * be mistaken for a public existence oracle.
 */
import "server-only";

import { NextResponse } from "next/server";

import {
  evaluateHeadlessRouteAuth,
  jsonFromHeadlessRouteGate,
} from "../../../_lib/respond-headless-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const gate = await evaluateHeadlessRouteAuth(request);
  if (gate.kind !== "authenticated") return jsonFromHeadlessRouteGate(gate);
  const store = gate.composition.jobStore;
  if (store == null) {
    return NextResponse.json(
      { success: false, code: "CONFIGURATION_UNAVAILABLE", error: "Retry is unavailable." },
      { status: 503 },
    );
  }
  const { jobId } = await context.params;
  const loaded = await store.getByJobIdAndOwner(jobId, gate.principal.ownerId);
  if (!loaded.ok) {
    return NextResponse.json(
      { success: false, code: "JOB_NOT_FOUND", error: "Export not found." },
      { status: 404 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      code: "NOT_RETRYABLE",
      error: "Start a new server export from the current draft.",
    },
    { status: 409 },
  );
}
