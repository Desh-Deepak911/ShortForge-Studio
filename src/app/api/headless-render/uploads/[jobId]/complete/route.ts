import "server-only";

import { NextResponse } from "next/server";

import { completeStagingOwnedUpload } from "@/features/headless-renderer/control-plane/services/staging-owned-upload.service";
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
  if (gate.kind !== "authenticated") {
    return jsonFromHeadlessRouteGate(gate);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_TRANSPORT", error: "Request rejected." },
      { status: 400 },
    );
  }
  const { jobId } = await context.params;
  const result = await completeStagingOwnedUpload({
    composition: gate.composition,
    principal: gate.principal,
    jobId,
    body,
  });
  if (!result.ok) {
    const code = result.issues[0]?.code ?? "INTERNAL_ERROR";
    const status =
      code === "FORBIDDEN" ? 403 :
      code === "JOB_NOT_FOUND" ? 404 :
      code === "CONFIGURATION_UNAVAILABLE" || code === "DATABASE_UNAVAILABLE" ? 503 :
      code === "INTERNAL_ERROR" ? 500 : 400;
    return NextResponse.json(
      { success: false, code, error: "Could not complete server upload." },
      { status },
    );
  }
  return NextResponse.json(result.value, { status: 200 });
}
