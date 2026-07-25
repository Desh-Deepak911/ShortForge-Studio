/**
 * Project ownership authorization — separate from authentication principal.
 *
 * Security assumption: existing projects are local-only and have no prior
 * server owner, so the first authenticated claimUnownedProject binds the
 * localStorage projectId to ownerId as the initial server authority.
 * Production first-claim requires an unguessable UUID project identity
 * (`crypto.randomUUID()`). Ownership cannot be reassigned through this port.
 * Client JSON never supplies ownerId.
 *
 * Future migration seam: already-owned legacy (non-UUID) project IDs require
 * an explicit ownership migration — not handled by first-claim.
 *
 * Production remains unavailable until Neon ownership adapter (Phase 2B.2).
 * Both methods are asynchronous so a Neon adapter can use interactive SQL.
 */

import type { HeadlessControlPlaneResult } from "../types/control-plane.types";
import type { HeadlessAuthenticatedPrincipal } from "./principal.port";

export interface HeadlessProjectAuthorizationPort {
  /**
   * First-authenticated-claim seam: bind an unowned projectId to principal.ownerId.
   * Same-owner claim is idempotent. Different-owner claim is FORBIDDEN.
   * Does not create a render job.
   */
  claimUnownedProject(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ): Promise<HeadlessControlPlaneResult<true>>;

  /**
   * Assert the authenticated principal may access the given projectId.
   * Authentication success must never imply project access.
   * Claiming ownership is separate from this check.
   */
  assertProjectAccess(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ): Promise<HeadlessControlPlaneResult<true>>;
}
