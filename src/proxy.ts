/**
 * Next.js 16 network boundary (proxy) — Clerk session attachment for headless APIs only.
 *
 * Matcher is limited to `/api/headless-render/:path*`.
 * Unconfigured/invalid Clerk env and Clerk load/handler failures pass through to
 * the route auth gate (authoritative JSON). Never redirects. Never broadens matcher.
 */

import type { NextRequest } from "next/server";

import { runHeadlessClerkProxy } from "@/features/headless-renderer/control-plane/runtime/headless-clerk-proxy";

export const config = {
  matcher: ["/api/headless-render/:path*"],
};

export default async function proxy(req: NextRequest, event: unknown) {
  return runHeadlessClerkProxy(req, event);
}
