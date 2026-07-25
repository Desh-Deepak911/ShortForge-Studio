/**
 * Narrow mapper for headless_project_ownership rows.
 * Every scalar is untrusted; never return raw database rows.
 */

import { deepFreezeHeadlessValue } from "../../domain/headless-deep-freeze";
import { isNonEmptyId } from "../../domain/headless-field-validators";
import { guardHeadlessStructure } from "../../domain/headless-hostile-guard";
import { parseHeadlessPgSafeInteger } from "./parse-headless-pg-safe-integer";
import { isHeadlessClaimableProjectId } from "./validate-claimable-project-id";

export const HEADLESS_OWNERSHIP_SELECT_COLUMNS = [
  "project_id",
  "owner_id",
  "created_at_ms",
] as const;

export type HeadlessProjectOwnershipRow = {
  readonly projectId: string;
  readonly ownerId: string;
  readonly createdAtMs: number;
};

export function mapHeadlessOwnershipSqlRow(
  row: unknown,
):
  | { readonly ok: true; readonly ownership: HeadlessProjectOwnershipRow }
  | { readonly ok: false; readonly message: string } {
  try {
    if (guardHeadlessStructure(row)) {
      return { ok: false, message: "Hostile ownership row rejected." };
    }
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, message: "Ownership row must be an object." };
    }
    const r = row as Record<string, unknown>;
    const projectId = r.project_id;
    const ownerId = r.owner_id;

    if (typeof projectId !== "string" || !isHeadlessClaimableProjectId(projectId)) {
      return { ok: false, message: "Malformed ownership project_id." };
    }
    if (typeof ownerId !== "string" || !isNonEmptyId(ownerId)) {
      return { ok: false, message: "Malformed ownership owner_id." };
    }
    const createdAtMs = parseHeadlessPgSafeInteger(r.created_at_ms, { min: 0 });
    if (!createdAtMs.ok) {
      return { ok: false, message: "Malformed ownership created_at_ms." };
    }

    return {
      ok: true,
      ownership: deepFreezeHeadlessValue({
        projectId,
        ownerId,
        createdAtMs: createdAtMs.value,
      }),
    };
  } catch {
    return { ok: false, message: "Hostile ownership row rejected." };
  }
}
