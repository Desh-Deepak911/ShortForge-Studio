/**
 * Shared auth gate for every production headless route.
 * Route/resource-level authentication remains authoritative (not proxy alone).
 */

import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import type { HeadlessControlPlaneErrorCode } from "../types/control-plane.types";
import {
  composeProductionHeadlessControlPlane,
  type ProductionHeadlessControlPlaneComposition,
} from "./compose-production-control-plane";

export type HeadlessRouteAuthGateResult =
  | {
      readonly kind: "configuration_unavailable";
      readonly code: "CONFIGURATION_UNAVAILABLE";
      readonly httpStatus: 503;
    }
  | {
      readonly kind: "unauthenticated";
      readonly code: "UNAUTHENTICATED";
      readonly httpStatus: 401;
    }
  | {
      readonly kind: "authentication_failed";
      readonly code: "AUTHENTICATION_FAILED";
      readonly httpStatus: 503;
    }
  | {
      readonly kind: "authenticated_providers_unavailable";
      readonly code: "CONFIGURATION_UNAVAILABLE";
      readonly principal: HeadlessAuthenticatedPrincipal;
      readonly httpStatus: 503;
    }
  | {
      readonly kind: "auth_failure";
      readonly code: HeadlessControlPlaneErrorCode;
      readonly httpStatus: 401 | 503;
    }
  | {
      readonly kind: "authenticated";
      readonly principal: HeadlessAuthenticatedPrincipal;
      readonly composition: ProductionHeadlessControlPlaneComposition;
      readonly httpStatus: 200;
    };

const SAFE_UNAVAILABLE_MESSAGE =
  "Headless control plane is not production-available: durable providers are not configured.";

const SAFE_AUTH_FAILED_MESSAGE =
  "Authentication is temporarily unavailable.";

/**
 * Evaluate Clerk auth + composition for a headless API request.
 * Inject deps only in tests.
 */
export async function gateHeadlessRouteAuth(input?: {
  readonly compose?: typeof composeProductionHeadlessControlPlane;
  readonly requestContext?: unknown;
}): Promise<HeadlessRouteAuthGateResult> {
  const compose = input?.compose ?? composeProductionHeadlessControlPlane;
  const composed = compose();

  // Missing or invalid Clerk keys — do not invoke SDK auth.
  if (!composed.clerkAuthenticationConfigured) {
    return {
      kind: "configuration_unavailable",
      code: "CONFIGURATION_UNAVAILABLE",
      httpStatus: 503,
    };
  }

  let resolved;
  try {
    resolved = await composed.principal.resolvePrincipal(
      input?.requestContext ?? null,
    );
  } catch {
    return {
      kind: "authentication_failed",
      code: "AUTHENTICATION_FAILED",
      httpStatus: 503,
    };
  }

  if (!resolved.ok) {
    const code = resolved.issues[0]?.code ?? "AUTHENTICATION_FAILED";
    if (code === "CONFIGURATION_UNAVAILABLE") {
      return {
        kind: "configuration_unavailable",
        code: "CONFIGURATION_UNAVAILABLE",
        httpStatus: 503,
      };
    }
    if (code === "UNAUTHENTICATED") {
      return {
        kind: "unauthenticated",
        code: "UNAUTHENTICATED",
        httpStatus: 401,
      };
    }
    if (code === "AUTHENTICATION_FAILED") {
      return {
        kind: "authentication_failed",
        code: "AUTHENTICATION_FAILED",
        httpStatus: 503,
      };
    }
    // Hostile/unknown from principal path → provider failure, not "sign in".
    return {
      kind: "authentication_failed",
      code: "AUTHENTICATION_FAILED",
      httpStatus: 503,
    };
  }

  if (composed.productionAvailable && composed.canCreateJob) {
    return {
      kind: "authenticated",
      principal: resolved.value,
      composition: composed,
      httpStatus: 200,
    };
  }

  return {
    kind: "authenticated_providers_unavailable",
    code: "CONFIGURATION_UNAVAILABLE",
    principal: resolved.value,
    httpStatus: 503,
  };
}

export function headlessRouteErrorBody(code: HeadlessControlPlaneErrorCode): {
  readonly success: false;
  readonly error: string;
  readonly code: HeadlessControlPlaneErrorCode;
} {
  if (code === "UNAUTHENTICATED") {
    return {
      success: false,
      error: "Authentication required.",
      code,
    };
  }
  if (code === "AUTHENTICATION_FAILED") {
    return {
      success: false,
      error: SAFE_AUTH_FAILED_MESSAGE,
      code,
    };
  }
  if (code === "CONFIGURATION_UNAVAILABLE") {
    return {
      success: false,
      error: SAFE_UNAVAILABLE_MESSAGE,
      code,
    };
  }
  return {
    success: false,
    error: SAFE_AUTH_FAILED_MESSAGE,
    code: "AUTHENTICATION_FAILED",
  };
}
