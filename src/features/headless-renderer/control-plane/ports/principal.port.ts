/**
 * Server-only authentication principal — never derived from client JSON ownerId.
 * Project ownership is a separate port (HeadlessProjectAuthorizationPort).
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";

/**
 * Bounded canonical authentication identity only.
 * Must not carry projectIds, draftIds, roles, org claims, or Clerk token objects.
 */
export interface HeadlessAuthenticatedPrincipal {
  readonly ownerId: string;
  readonly sessionId: string | null;
}

/** @deprecated Use HeadlessAuthenticatedPrincipal — alias retained for transitional imports. */
export type HeadlessTrustedPrincipal = HeadlessAuthenticatedPrincipal;

export interface HeadlessPrincipalPort {
  /**
   * Resolve the authenticated principal for the current request context.
   * Authentication only — never implies project access.
   */
  resolvePrincipal(
    context: unknown,
  ): Promise<HeadlessControlPlaneResult<HeadlessAuthenticatedPrincipal>>;
}
