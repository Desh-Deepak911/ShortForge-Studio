/**
 * GET /api/headless-render/availability
 * Provider-neutral capability probe. Auth-aware; create remains blocked in Phase 2A.
 * Never returns provider names, credentials, locators, or queue topology.
 */
import "server-only";

import { NextResponse } from "next/server";

import {
  availabilityFromGate,
  evaluateHeadlessRouteAuth,
} from "../_lib/respond-headless-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await evaluateHeadlessRouteAuth();
  return NextResponse.json(availabilityFromGate(gate), { status: 200 });
}
