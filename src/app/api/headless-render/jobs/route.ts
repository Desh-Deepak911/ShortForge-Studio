/**
 * POST /api/headless-render/jobs
 * Compact transport only. Phase 2A: auth gate + configuration-blocked (no durable providers).
 */
import "server-only";

import {
  evaluateHeadlessRouteAuth,
  jsonFromHeadlessRouteGate,
} from "../_lib/respond-headless-route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await evaluateHeadlessRouteAuth();
  return jsonFromHeadlessRouteGate(gate);
}
