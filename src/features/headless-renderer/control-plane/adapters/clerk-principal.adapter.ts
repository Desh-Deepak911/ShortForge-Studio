/**
 * Clerk → HeadlessAuthenticatedPrincipal adapter (production/server composition only).
 * Inject a narrow auth reader for deterministic tests (no live Clerk / env keys).
 */

import { cpFail } from "../types/control-plane.types";
import type { HeadlessPrincipalPort } from "../ports/principal.port";
import {
  classifyClerkEnvironment,
  type ClerkEnvironmentStatus,
} from "../runtime/clerk-environment";
import {
  validateClerkAuthSnapshot,
  type ClerkAuthSnapshot,
} from "../services/validate-clerk-auth-snapshot";
import { validateHeadlessAuthenticatedPrincipal } from "../services/validate-authenticated-principal";

export type { ClerkAuthSnapshot };

export type ClerkAuthReader = () => Promise<unknown>;

/**
 * Production reader using Clerk `auth({ acceptsToken: "session_token" })`.
 * No `currentUser()` Backend API call. Never returns the full Clerk object.
 */
export function createProductionClerkAuthReader(): ClerkAuthReader {
  return async () => {
    const { auth } = await import("@clerk/nextjs/server");
    const result = await auth({ acceptsToken: "session_token" });
    const userId = typeof result.userId === "string" ? result.userId : null;
    const sessionId =
      typeof result.sessionId === "string" ? result.sessionId : null;
    const statusRaw = result.sessionStatus;
    const sessionStatus =
      statusRaw === "pending" || statusRaw === "active" || statusRaw === null
        ? statusRaw
        : typeof statusRaw === "string"
          ? statusRaw
          : statusRaw === undefined
            ? null
            : statusRaw;
    return {
      userId,
      sessionId,
      sessionStatus,
    };
  };
}

export class ClerkHeadlessPrincipalAdapter implements HeadlessPrincipalPort {
  constructor(
    private readonly readAuth: ClerkAuthReader,
    private readonly classifyEnv: () => ClerkEnvironmentStatus = () =>
      classifyClerkEnvironment(),
  ) {}

  async resolvePrincipal(context: unknown) {
    void context;
    const envStatus = this.classifyEnv();
    if (envStatus === "unconfigured" || envStatus === "invalid") {
      return cpFail(
        "CONFIGURATION_UNAVAILABLE",
        "Authentication is not available.",
      );
    }

    let raw: unknown;
    try {
      raw = await this.readAuth();
    } catch {
      return cpFail(
        "AUTHENTICATION_FAILED",
        "Authentication is temporarily unavailable.",
      );
    }

    const validated = validateClerkAuthSnapshot(raw);
    if (!validated.ok) {
      return cpFail(
        "AUTHENTICATION_FAILED",
        "Authentication is temporarily unavailable.",
      );
    }

    const snapshot = validated.snapshot;

    if (snapshot.sessionStatus === "pending") {
      return cpFail("UNAUTHENTICATED", "Authentication required.");
    }

    if (snapshot.userId == null) {
      return cpFail("UNAUTHENTICATED", "Authentication required.");
    }

    return validateHeadlessAuthenticatedPrincipal({
      ownerId: snapshot.userId,
      sessionId: snapshot.sessionId,
    });
  }
}
