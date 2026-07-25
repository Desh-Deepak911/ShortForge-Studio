/**
 * In-memory project ownership — first-claim semantics for verification only.
 * Never imported by production composition.
 *
 * Production-claimable project IDs must be unguessable UUIDs
 * (`crypto.randomUUID()` form). Testing-only adapters may use fixture IDs.
 *
 * Future migration seam: already-owned legacy (non-UUID) project IDs require
 * an explicit ownership migration — not handled here.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { isNonEmptyId } from "../../domain/headless-field-validators";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";
import { validateHeadlessClaimableProjectId } from "../services/validate-claimable-project-id";

export type HeadlessProjectOwnershipSnapshotEntry = {
  readonly projectId: string;
  readonly ownerId: string;
};

/**
 * Provider-neutral memory ownership map.
 * First authenticated claim binds an unowned projectId to ownerId.
 */
export class MemoryHeadlessProjectOwnershipAdapter
  implements HeadlessProjectAuthorizationPort
{
  private readonly ownership = new Map<string, string>(); // projectId → ownerId

  async claimUnownedProject(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ) {
    const project = validateHeadlessClaimableProjectId(projectId);
    if (!project.ok) {
      return cpFail("INVALID_TRANSPORT", project.message);
    }
    if (
      typeof principal.ownerId !== "string" ||
      !isNonEmptyId(principal.ownerId)
    ) {
      return cpFail("UNAUTHENTICATED", "Principal ownerId is invalid.");
    }

    const existing = this.ownership.get(project.projectId);
    if (existing == null) {
      this.ownership.set(project.projectId, principal.ownerId);
      return cpOk(true as const);
    }
    if (existing === principal.ownerId) {
      return cpOk(true as const);
    }
    return cpFail("FORBIDDEN", "Project is owned by a different principal.");
  }

  async assertProjectAccess(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ) {
    const project = validateHeadlessClaimableProjectId(projectId);
    if (!project.ok) {
      return cpFail("INVALID_TRANSPORT", project.message);
    }
    const ownerId = this.ownership.get(project.projectId);
    if (ownerId == null || ownerId !== principal.ownerId) {
      return cpFail("FORBIDDEN", "Principal lacks project access.");
    }
    return cpOk(true as const);
  }

  /** Test-only inspection. */
  testingGetOwner(projectId: string): string | null {
    return this.ownership.get(projectId) ?? null;
  }

  /**
   * Test-only detached immutable snapshot (array of entries).
   * Do not use Object.freeze(Map) — Map contents remain mutable.
   */
  testingSnapshot(): readonly HeadlessProjectOwnershipSnapshotEntry[] {
    const entries: HeadlessProjectOwnershipSnapshotEntry[] = [];
    for (const [projectId, ownerId] of this.ownership) {
      entries.push({ projectId, ownerId });
    }
    entries.sort((a, b) => a.projectId.localeCompare(b.projectId));
    return deepFreezeHeadlessValue(entries);
  }
}
