/**
 * POST /api/headless-render/jobs/[jobId]/cancel
 * Owner-bound cancellation for provisional and canonical staging jobs.
 */
import "server-only";

import { NextResponse } from "next/server";

import { applyHeadlessJobTransition } from "@/features/headless-renderer/domain";
import { cancelProvisionalRecord } from "@/features/headless-renderer/control-plane/services/provisional-job-lifecycle";
import { toHeadlessProductJobViewFromStore } from "@/features/headless-renderer/control-plane/services/safe-job-view";
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
  if (store == null) return jsonFromHeadlessRouteGate({
    kind: "authenticated_providers_unavailable",
    code: "CONFIGURATION_UNAVAILABLE",
    principal: gate.principal,
    httpStatus: 503,
  });
  const { jobId } = await context.params;
  const loaded = await store.getByJobIdAndOwner(jobId, gate.principal.ownerId);
  if (!loaded.ok) {
    return NextResponse.json(
      { success: false, code: "JOB_NOT_FOUND", error: "Export not found." },
      { status: 404 },
    );
  }
  const nowMs = Math.max(Date.now(), loaded.value.updatedAtMs + 1);
  if (loaded.value.stage === "provisional") {
    const cancelled = cancelProvisionalRecord(loaded.value, nowMs);
    if (!cancelled.ok) {
      return NextResponse.json(
        { success: false, code: "CANCEL_REJECTED", error: "Export cannot be cancelled." },
        { status: 409 },
      );
    }
    const cas = await store.compareAndSetProvisional({
      jobId,
      ownerId: gate.principal.ownerId,
      expectedStoreVersion: loaded.value.storeVersion,
      next: cancelled.record,
    });
    if (!cas.ok || cas.value.kind !== "updated") {
      return NextResponse.json(
        { success: false, code: "CANCEL_REJECTED", error: "Export cannot be cancelled." },
        { status: 409 },
      );
    }
    return NextResponse.json(toHeadlessProductJobViewFromStore(cas.value.record));
  }
  const transitioned = applyHeadlessJobTransition({
    jobValue: loaded.value.canonicalJob,
    requestValue: loaded.value.canonicalRequest,
    toState: "cancelled",
    attempt: loaded.value.canonicalJob.attempt,
    updatedAtMs: nowMs,
    terminalReason: { reasonId: "CANCELLED_BY_USER", retryable: false },
  });
  if (!transitioned.ok) {
    return NextResponse.json(
      { success: false, code: "CANCEL_REJECTED", error: "Export cannot be cancelled." },
      { status: 409 },
    );
  }
  const cas = await store.compareAndSetTransition({
    jobId,
    ownerId: gate.principal.ownerId,
    expectedStoreVersion: loaded.value.storeVersion,
    next: {
      job: transitioned.job,
      request: loaded.value.canonicalRequest,
      idempotencyAuthorityKey: loaded.value.idempotencyAuthorityKey,
      operationId: loaded.value.operationId,
      claimToken: null,
      claimedAtMs: null,
      artifactObjectBinding: null,
    },
  });
  if (!cas.ok || cas.value.kind !== "updated") {
    return NextResponse.json(
      { success: false, code: "CANCEL_REJECTED", error: "Export cannot be cancelled." },
      { status: 409 },
    );
  }
  return NextResponse.json(toHeadlessProductJobViewFromStore(cas.value.record));
}
