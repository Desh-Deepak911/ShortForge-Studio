/**
 * Shared JSON responses for headless route auth gate outcomes.
 */

import { NextResponse } from "next/server";

import {
  gateHeadlessRouteAuth,
  headlessRouteErrorBody,
  type HeadlessRouteAuthGateResult,
} from "@/features/headless-renderer/control-plane/runtime/headless-route-auth-gate";
import {
  HEADLESS_AUTHENTICATION_REQUIRED,
  HEADLESS_AUTH_TEMPORARILY_UNAVAILABLE,
  HEADLESS_STAGING_AVAILABLE,
  PRODUCTION_HEADLESS_UNAVAILABLE,
  type HeadlessAvailabilityV1,
} from "@/features/headless-renderer/product/availability/availability.types";

export async function evaluateHeadlessRouteAuth(
  requestContext?: unknown,
): Promise<HeadlessRouteAuthGateResult> {
  return gateHeadlessRouteAuth({ requestContext });
}

/**
 * Test-injectable evaluation — production routes call evaluateHeadlessRouteAuth only.
 * Not exported from the control-plane production barrel.
 */
export async function evaluateHeadlessRouteAuthWithGate(
  gateFn: typeof gateHeadlessRouteAuth,
  requestContext?: unknown,
): Promise<HeadlessRouteAuthGateResult> {
  return gateFn({ requestContext });
}

export function availabilityFromGate(
  gate: HeadlessRouteAuthGateResult,
): HeadlessAvailabilityV1 {
  if (gate.kind === "authenticated") {
    return HEADLESS_STAGING_AVAILABLE;
  }
  if (gate.kind === "unauthenticated" || gate.code === "UNAUTHENTICATED") {
    return HEADLESS_AUTHENTICATION_REQUIRED;
  }
  if (
    gate.kind === "authentication_failed" ||
    gate.code === "AUTHENTICATION_FAILED"
  ) {
    return HEADLESS_AUTH_TEMPORARILY_UNAVAILABLE;
  }
  return PRODUCTION_HEADLESS_UNAVAILABLE;
}

export function jsonFromHeadlessRouteGate(
  gate: HeadlessRouteAuthGateResult,
): NextResponse {
  if (gate.kind === "authenticated") {
    return NextResponse.json(
      { success: false, error: "Route handler is not implemented.", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
  return NextResponse.json(headlessRouteErrorBody(gate.code), {
    status: gate.httpStatus,
  });
}

/** Shared behavioral handler for route families — used by verification. */
export async function handleHeadlessRouteAuthResponse(input?: {
  readonly kind: "availability" | "mutation";
  readonly gateFn?: typeof gateHeadlessRouteAuth;
  readonly requestContext?: unknown;
}): Promise<NextResponse> {
  const gate = await (input?.gateFn ?? gateHeadlessRouteAuth)({
    requestContext: input?.requestContext,
  });
  if (input?.kind === "availability") {
    return NextResponse.json(availabilityFromGate(gate), { status: 200 });
  }
  return jsonFromHeadlessRouteGate(gate);
}
