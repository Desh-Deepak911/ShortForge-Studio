/**
 * Staging export maintenance scheduling authority.
 *
 * Maintenance runs from the existing verify worker loop — no additional Machine
 * or process group. Production remains fail-closed until an explicit retention
 * policy is approved.
 */

import { assertHeadlessCleanupStagingEnvironment } from "./headless-export-retention-authority";

export const HEADLESS_EXPORT_MAINTENANCE_DEFAULT_INTERVAL_MS = 900_000 as const;
export const HEADLESS_EXPORT_MAINTENANCE_MAX_RUNTIME_MS = 120_000 as const;
export const HEADLESS_EXPORT_MAINTENANCE_ENABLE_ENV =
  "HEADLESS_EXPORT_MAINTENANCE_ENABLED" as const;

export type HeadlessExportMaintenanceEnablement =
  | { readonly ok: true; readonly intervalMs: number; readonly jitterMs: number }
  | {
      readonly ok: false;
      readonly reason:
        | "non_staging_environment"
        | "maintenance_disabled"
        | "invalid_configuration";
    };

/**
 * Determines whether scheduled maintenance may run. When disabled, callers must
 * not open database, object storage, or queue connections for maintenance work.
 */
export function evaluateHeadlessExportMaintenanceEnablement(input: {
  readonly envName: string | null | undefined;
  readonly maintenanceEnabledFlag: string | null | undefined;
  readonly intervalMs?: number;
}): HeadlessExportMaintenanceEnablement {
  const staging = assertHeadlessCleanupStagingEnvironment(input.envName);
  if (!staging.ok) {
    return { ok: false, reason: "non_staging_environment" };
  }
  if (input.maintenanceEnabledFlag !== "1") {
    return { ok: false, reason: "maintenance_disabled" };
  }
  const intervalMs =
    input.intervalMs ?? HEADLESS_EXPORT_MAINTENANCE_DEFAULT_INTERVAL_MS;
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
    return { ok: false, reason: "invalid_configuration" };
  }
  const jitterMs = Math.min(120_000, Math.floor(intervalMs / 10));
  return { ok: true, intervalMs, jitterMs };
}
