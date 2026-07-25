/**
 * POST /api/headless-render/jobs/[jobId]/download
 * Issues a short-lived download capability when wired.
 * Phase 2A: auth gate + configuration-blocked.
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
  const { jobId } = await context.params;
  const stored =
    gate.composition.jobStore == null
      ? null
      : await gate.composition.jobStore.getByJobIdAndOwner(
          jobId,
          gate.principal.ownerId,
        );
  if (stored == null || !stored.ok) {
    return NextResponse.json(
      { success: false, code: "JOB_NOT_FOUND", error: "Download is not available." },
      { status: 404 },
    );
  }
  const result = await gate.composition.downloadCapability.issueArtifactGetCapability({
    ownerId: gate.principal.ownerId,
    jobId,
    nowMs: Date.now(),
  });
  if (!result.ok) {
    const code = result.issues[0]?.code ?? "INTERNAL_ERROR";
    return NextResponse.json(
      { success: false, code, error: "Download is not available." },
      {
        status:
          code === "JOB_NOT_FOUND" ? 404 :
          code === "FORBIDDEN" ? 409 :
          code === "CONFIGURATION_UNAVAILABLE" ? 503 : 500,
      },
    );
  }
  const format =
    stored.value.stage === "canonical"
      ? stored.value.canonicalJob.rendererProfile.format
      : stored.value.requestedRendererProfile.format;
  return NextResponse.json({
    version: 1,
    jobId,
    url: result.value.getUrl,
    expiresAtMs: result.value.expiresAtMs,
    filename: `shortforge-export.${format}`,
  });
}
