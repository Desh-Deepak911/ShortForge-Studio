/**
 * Explicit fixture project authorization — testing only.
 * Requires ownerId + allowedProjectIds. Never imported by production composition.
 *
 * Testing-only: may use explicit fixture project IDs (including non-UUID).
 * Production first-claim uses validateHeadlessClaimableProjectId (UUID only).
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";

export class TestHeadlessProjectAuthorizationAdapter
  implements HeadlessProjectAuthorizationPort
{
  private readonly ownerId: string;
  private readonly allowedProjectIds: readonly string[];
  private readonly allowMutate: boolean;

  constructor(config: {
    readonly ownerId: string;
    readonly allowedProjectIds: readonly string[];
    /** When false, all project access is forbidden (e.g. viewer fixture). */
    readonly allowMutate?: boolean;
  }) {
    if (
      typeof config.ownerId !== "string" ||
      config.ownerId.trim().length === 0 ||
      config.ownerId !== config.ownerId.trim()
    ) {
      throw new Error(
        "TestHeadlessProjectAuthorizationAdapter requires a non-empty ownerId.",
      );
    }
    if (!Array.isArray(config.allowedProjectIds)) {
      throw new Error(
        "TestHeadlessProjectAuthorizationAdapter requires explicit allowedProjectIds.",
      );
    }
    const frozen = deepFreezeHeadlessValue({
      ownerId: config.ownerId,
      allowedProjectIds: [...config.allowedProjectIds],
      allowMutate: config.allowMutate !== false,
    });
    this.ownerId = frozen.ownerId;
    this.allowedProjectIds = frozen.allowedProjectIds;
    this.allowMutate = frozen.allowMutate;
  }

  /**
   * Fixture claim seam: projects in allowedProjectIds are treated as owned by
   * the fixture ownerId (pre-bound for local/QA stacks). Claiming a non-allowed
   * projectId is FORBIDDEN. Does not create a render job.
   */
  async claimUnownedProject(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ) {
    if (this.allowMutate === false) {
      return cpFail("FORBIDDEN", "Fixture principal cannot mutate projects.");
    }
    if (principal.ownerId !== this.ownerId) {
      return cpFail("FORBIDDEN", "Principal lacks project access.");
    }
    if (!this.allowedProjectIds.includes(projectId)) {
      return cpFail("FORBIDDEN", "Project is not claimable by this fixture.");
    }
    return cpOk(true as const);
  }

  async assertProjectAccess(
    principal: HeadlessAuthenticatedPrincipal,
    projectId: string,
  ) {
    if (this.allowMutate === false) {
      return cpFail("FORBIDDEN", "Fixture principal cannot mutate projects.");
    }
    if (principal.ownerId !== this.ownerId) {
      return cpFail("FORBIDDEN", "Principal lacks project access.");
    }
    if (!this.allowedProjectIds.includes(projectId)) {
      return cpFail("FORBIDDEN", "Principal lacks project access.");
    }
    return cpOk(true as const);
  }
}
