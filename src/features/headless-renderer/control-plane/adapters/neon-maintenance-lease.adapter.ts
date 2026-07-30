/**
 * Neon-backed maintenance sweep lease with atomic claim, renew, release and fencing.
 */

import { mapHeadlessDatabaseFailure } from "../runtime/map-database-failure";
import type { HeadlessSqlExecutor } from "../runtime/sql-client";
import type {
  HeadlessMaintenanceLeasePort,
  HeadlessMaintenanceLeaseScope,
} from "../ports/maintenance-lease.port";
import { cpOk } from "../types/control-plane.types";

const CLAIM_SQL = `
INSERT INTO public.headless_export_maintenance_leases (
  scope, lease_token, holder_class, claimed_at_ms, expires_at_ms, renewed_at_ms, release_state
) VALUES ($1, $2, $3, $4, $5, NULL, 'active')
ON CONFLICT (scope) DO UPDATE
SET lease_token = EXCLUDED.lease_token,
    holder_class = EXCLUDED.holder_class,
    claimed_at_ms = EXCLUDED.claimed_at_ms,
    expires_at_ms = EXCLUDED.expires_at_ms,
    renewed_at_ms = NULL,
    release_state = 'active'
WHERE public.headless_export_maintenance_leases.expires_at_ms <= $4
   OR public.headless_export_maintenance_leases.release_state = 'released'
RETURNING scope
`;

const RENEW_SQL = `
UPDATE public.headless_export_maintenance_leases
SET expires_at_ms = $3,
    renewed_at_ms = $4,
    release_state = 'active'
WHERE scope = $1
  AND lease_token = $2
  AND release_state = 'active'
  AND expires_at_ms > $4
RETURNING scope
`;

const RELEASE_SQL = `
UPDATE public.headless_export_maintenance_leases
SET release_state = 'released',
    expires_at_ms = $3
WHERE scope = $1
  AND lease_token = $2
  AND release_state = 'active'
RETURNING scope
`;

const ASSERT_ACTIVE_SQL = `
SELECT scope
FROM public.headless_export_maintenance_leases
WHERE scope = $1
  AND lease_token = $2
  AND release_state = 'active'
  AND expires_at_ms > $3
LIMIT 1
`;

export class NeonHeadlessMaintenanceLeaseAdapter
  implements HeadlessMaintenanceLeasePort
{
  constructor(private readonly sql: HeadlessSqlExecutor) {}

  async claim(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
    readonly holderClass: string;
  }) {
    try {
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(CLAIM_SQL, [
          input.scope,
          input.leaseToken,
          input.holderClass,
          input.nowMs,
          input.nowMs + input.leaseMs,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "lease_rejected" as const });
      }
      return cpOk({ kind: "claimed" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async renew(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
    readonly leaseMs: number;
  }) {
    try {
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(RENEW_SQL, [
          input.scope,
          input.leaseToken,
          input.nowMs + input.leaseMs,
          input.nowMs,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "stale_token" as const });
      }
      return cpOk({ kind: "renewed" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    try {
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(RELEASE_SQL, [
          input.scope,
          input.leaseToken,
          input.nowMs,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "stale_token" as const });
      }
      return cpOk({ kind: "released" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }

  async assertActiveLease(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    try {
      const rows = await this.sql.withClient(async (client) => {
        const result = await client.query<{ scope: string }>(ASSERT_ACTIVE_SQL, [
          input.scope,
          input.leaseToken,
          input.nowMs,
        ]);
        return result.rows;
      });
      if (rows.length === 0) {
        return cpOk({ kind: "stale" as const });
      }
      return cpOk({ kind: "valid" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
