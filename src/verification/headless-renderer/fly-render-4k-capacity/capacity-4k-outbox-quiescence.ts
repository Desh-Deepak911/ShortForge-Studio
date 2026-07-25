/**
 * Sprint 11E Phase 2E.2D.8K.1 — global outbox quiescence precondition.
 *
 * Before any 4K capacity job is created, the shared production render-dispatch
 * outbox and job claim surface must be fully quiescent: no pending/claimed
 * outbox rows and no active claims on queued/rendering jobs, for *any* job —
 * not just this run's own jobs. A non-quiescent broker means a concurrent
 * live/execution-probe run could interleave with the bounded 4K smoke.
 */

import type { HeadlessSqlExecutor } from "@/features/headless-renderer/control-plane/runtime/sql-client";

export type Capacity4kOutboxQuiescenceFailClass =
  | "outbox_rows_pending_or_claimed"
  | "active_job_claims_present"
  | "outbox_quiescence_query_failed";

export type Capacity4kOutboxQuiescenceResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failClass: Capacity4kOutboxQuiescenceFailClass;
      readonly pendingOrClaimedOutboxCount?: number;
      readonly activeJobClaimCount?: number;
    };

export async function assertGlobalOutboxQuiescence(
  sql: HeadlessSqlExecutor,
): Promise<Capacity4kOutboxQuiescenceResult> {
  try {
    const counts = await sql.withClient(async (client) => {
      await client.query(
        "SELECT set_config('search_path', 'public, pg_temp', true)",
      );
      const outbox = await client.query<{ n: string }>(`
SELECT COUNT(*)::text AS n
FROM public.headless_render_dispatch_outbox
WHERE state IN ('pending', 'claimed')
`);
      const claims = await client.query<{ n: string }>(`
SELECT COUNT(*)::text AS n
FROM public.headless_jobs
WHERE state IN ('queued', 'rendering', 'encoding', 'validating', 'uploading')
  AND claim_token IS NOT NULL
`);
      return {
        pendingOrClaimedOutboxCount: Number(outbox.rows[0]?.n ?? "0"),
        activeJobClaimCount: Number(claims.rows[0]?.n ?? "0"),
      };
    });

    if (counts.pendingOrClaimedOutboxCount > 0) {
      return {
        ok: false,
        failClass: "outbox_rows_pending_or_claimed",
        pendingOrClaimedOutboxCount: counts.pendingOrClaimedOutboxCount,
      };
    }
    if (counts.activeJobClaimCount > 0) {
      return {
        ok: false,
        failClass: "active_job_claims_present",
        activeJobClaimCount: counts.activeJobClaimCount,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, failClass: "outbox_quiescence_query_failed" };
  }
}
