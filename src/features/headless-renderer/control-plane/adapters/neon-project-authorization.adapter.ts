/**
 * Neon-backed project ownership authorization.
 * Configuration-gated; inject HeadlessSqlExecutor for fixture tests.
 */

import { isNonEmptyId } from "../../domain/headless-field-validators";
import { mapHeadlessDatabaseFailure } from "../runtime/map-database-failure";
import type { HeadlessSqlExecutor } from "../runtime/sql-client";
import { mapHeadlessOwnershipSqlRow } from "../services/map-headless-ownership-sql-row";
import { validateHeadlessClaimableProjectId } from "../services/validate-claimable-project-id";
import { cpFail, cpOk } from "../types/control-plane.types";
import type { HeadlessAuthenticatedPrincipal } from "../ports/principal.port";
import type { HeadlessProjectAuthorizationPort } from "../ports/project-authorization.port";

const SELECT_OWNERSHIP = `
SELECT project_id, owner_id, created_at_ms
FROM headless_project_ownership
WHERE project_id = $1
`;

const SELECT_OWNERSHIP_FOR_SHARE = `${SELECT_OWNERSHIP} FOR SHARE`;

const INSERT_OWNERSHIP = `
INSERT INTO headless_project_ownership (project_id, owner_id, created_at_ms)
VALUES ($1, $2, $3)
ON CONFLICT (project_id) DO NOTHING
`;

export class NeonHeadlessProjectAuthorizationAdapter
  implements HeadlessProjectAuthorizationPort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

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

    const ownerId = principal.ownerId;
    const createdAtMs = Date.now();

    try {
      return await this.sql.withTransaction(async (client) => {
        await client.query(INSERT_OWNERSHIP, [
          project.projectId,
          ownerId,
          createdAtMs,
        ]);

        const selected = await client.query(SELECT_OWNERSHIP_FOR_SHARE, [
          project.projectId,
        ]);
        if (selected.rows.length === 0) {
          return cpFail(
            "INTERNAL_ERROR",
            "Ownership row missing after claim.",
          );
        }
        const mapped = mapHeadlessOwnershipSqlRow(selected.rows[0]);
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        if (mapped.ownership.ownerId === ownerId) {
          return cpOk(true as const);
        }
        return cpFail(
          "FORBIDDEN",
          "Project is owned by a different principal.",
        );
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async assertProjectAccess(
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

    try {
      return await this.sql.withClient(async (client) => {
        const selected = await client.query(SELECT_OWNERSHIP, [
          project.projectId,
        ]);
        if (selected.rows.length === 0) {
          return cpFail("FORBIDDEN", "Principal lacks project access.");
        }
        const mapped = mapHeadlessOwnershipSqlRow(selected.rows[0]);
        if (!mapped.ok) {
          return cpFail("JOB_STORE_COHERENCE_REJECTED", mapped.message);
        }
        if (mapped.ownership.ownerId !== principal.ownerId) {
          return cpFail("FORBIDDEN", "Principal lacks project access.");
        }
        return cpOk(true as const);
      });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
