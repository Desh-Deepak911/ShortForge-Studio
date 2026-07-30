/**
 * POST /api/headless-render/jobs/[jobId]/delete
 * Staging-only authenticated delete-now for terminal succeeded exports.
 */
import "server-only";

import { NextResponse } from "next/server";

import { NeonHeadlessArtifactCleanupAdapter } from "@/features/headless-renderer/control-plane/adapters/neon-artifact-cleanup.adapter";
import { createNeonSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/neon-sql-executor";
import { readConfiguredHeadlessDatabaseUrl } from "@/features/headless-renderer/control-plane/runtime/neon-environment";
import { scheduleHeadlessExportDeleteNow } from "@/features/headless-renderer/control-plane/services/schedule-export-delete-now";
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
  if (!gate.composition.stagingSessionConfigured) {
    return NextResponse.json(
      { success: false, code: "FORBIDDEN", error: "Not available." },
      { status: 403 },
    );
  }
  const store = gate.composition.jobStore;
  const databaseUrl = readConfiguredHeadlessDatabaseUrl();
  if (store == null || databaseUrl == null) {
    return jsonFromHeadlessRouteGate({
      kind: "authenticated_providers_unavailable",
      code: "CONFIGURATION_UNAVAILABLE",
      principal: gate.principal,
      httpStatus: 503,
    });
  }
  const cleanup = new NeonHeadlessArtifactCleanupAdapter(
    createNeonSqlExecutor({ connectionString: databaseUrl }),
  );
  const { jobId } = await context.params;
  const scheduled = await scheduleHeadlessExportDeleteNow({
    envName: "staging",
    ownerId: gate.principal.ownerId,
    jobId,
    jobStore: store,
    cleanup,
    nowMs: Date.now(),
  });
  if (!scheduled.ok) {
    const code = scheduled.issues[0]?.code ?? "FORBIDDEN";
    const status = code === "JOB_NOT_FOUND" ? 404 : 403;
    return NextResponse.json(
      { success: false, code, error: "Export delete unavailable." },
      { status },
    );
  }
  return NextResponse.json(
    Object.freeze({
      success: true,
      cleanupPending: true,
    }),
  );
}
