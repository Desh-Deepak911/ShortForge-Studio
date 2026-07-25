/**
 * Headless API Clerk proxy runner — failure-contained.
 * Used by src/proxy.ts. Injectable loader for verification only (not a production bypass).
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  classifyClerkEnvironment,
  type ClerkEnvironmentStatus,
} from "./clerk-environment";

export type HeadlessProxyHandler = (
  req: NextRequest,
  event: unknown,
) => Response | Promise<Response | undefined> | undefined;

export type HeadlessClerkProxyDeps = {
  readonly classifyEnv?: () => ClerkEnvironmentStatus;
  readonly loadClerkMiddleware?: () => Promise<HeadlessProxyHandler>;
};

async function defaultLoadClerkMiddleware(): Promise<HeadlessProxyHandler> {
  const mod = await import("@clerk/nextjs/server");
  return mod.clerkMiddleware() as HeadlessProxyHandler;
}

/**
 * Run Clerk middleware for a headless API request, or pass through safely.
 * Never redirects. Never throws. Never logs exceptions or secrets.
 */
export async function runHeadlessClerkProxy(
  req: NextRequest,
  event: unknown,
  deps: HeadlessClerkProxyDeps = {},
): Promise<Response> {
  try {
    const classify = deps.classifyEnv ?? (() => classifyClerkEnvironment());
    const status = classify();
    if (status !== "configured") {
      return NextResponse.next();
    }

    let handler: HeadlessProxyHandler;
    try {
      const load = deps.loadClerkMiddleware ?? defaultLoadClerkMiddleware;
      handler = await load();
    } catch {
      return NextResponse.next();
    }

    try {
      const result = await handler(req, event);
      return result ?? NextResponse.next();
    } catch {
      return NextResponse.next();
    }
  } catch {
    return NextResponse.next();
  }
}
