/**
 * Neon-backed maintenance sweep lease.
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
  scope, lease_token, holder_class, claimed_at_ms, expires_at_ms
) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (scope) DO UPDATE
SET lease_token = EXCLUDED.lease_token,
    holder_class = EXCLUDED.holder_class,
    claimed_at_ms = EXCLUDED.claimed_at_ms,
    expires_at_ms = EXCLUDED.expires_at_ms
WHERE public.headless_export_maintenance_leases.expires_at_ms <= $4
RETURNING scope
`;

const RELEASE_SQL = `
DELETE FROM public.headless_export_maintenance_leases
WHERE scope = $1 AND lease_token = $2
RETURNING scope
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

  async release(input: {
    readonly scope: HeadlessMaintenanceLeaseScope;
    readonly leaseToken: string;
    readonly nowMs: number;
  }) {
    try {
      await this.sql.withClient(async (client) => {
        await client.query(RELEASE_SQL, [input.scope, input.leaseToken]);
      });
      return cpOk({ kind: "released" as const });
    } catch (error) {
      return mapHeadlessDatabaseFailure(error);
    }
  }
}
