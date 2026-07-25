/**
 * GET /api/headless-render/jobs/[jobId]
 * Owner-bound browser product status view.
 */
import "server-only";

import { NextResponse } from "next/server";

import { toHeadlessProductJobViewFromStore } from "@/features/headless-renderer/control-plane/services/safe-job-view";
import {
  evaluateHeadlessRouteAuth,
  jsonFromHeadlessRouteGate,
} from "../../_lib/respond-headless-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const gate = await evaluateHeadlessRouteAuth(request);
  if (gate.kind !== "authenticated") return jsonFromHeadlessRouteGate(gate);
  const store = gate.composition.jobStore;
  if (store == null) return jsonFromHeadlessRouteGate({
    kind: "authenticated_providers_unavailable",
    code: "CONFIGURATION_UNAVAILABLE",
    principal: gate.principal,
    httpStatus: 503,
  });
  const { jobId } = await context.params;
  const result = await store.getByJobIdAndOwner(jobId, gate.principal.ownerId);
  if (!result.ok) {
    const code = result.issues[0]?.code ?? "INTERNAL_ERROR";
    return NextResponse.json(
      { success: false, code, error: "Could not load export status." },
      { status: code === "JOB_NOT_FOUND" ? 404 : 503 },
    );
  }
  return NextResponse.json(toHeadlessProductJobViewFromStore(result.value));
}
